'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../utils/prismaClient');
const { getTableMetadata, findMatchingColumn } = require('./universalSchemaService');
const { validateWorkbookData, isFormulaInjection } = require('./universalExcelValidator');

// In-memory active job tracker for real-time progress polling
const activeJobs = new Map();

const BATCH_SIZE = 50;

/**
 * Create a new import job plan awaiting user confirmation.
 */
async function createImportJob({
  tableName,
  mode = 'INSERT',
  matchingKey = null,
  headers = [],
  rawRows = [],
  filename = 'upload.xlsx',
  fileHash = null,
  userId = null,
  username = 'ADMIN',
}) {
  const tableMeta = getTableMetadata(tableName);
  if (!tableMeta || !tableMeta.isApproved) {
    throw new Error(`Table "${tableName}" is restricted and not approved for universal Excel import.`);
  }

  // Pre-validate the data plan
  const validationReport = await validateWorkbookData({
    tableName,
    headers,
    rawRows,
    mode,
    matchingKey,
  });

  const jobId = uuidv4();
  const calculatedHash =
    fileHash ||
    crypto
      .createHash('sha256')
      .update(JSON.stringify(rawRows))
      .digest('hex');

  // Persist the batch record in database
  const dbBatch = await prisma.migrationBatch.create({
    data: {
      source_file: filename,
      source_sha256: calculatedHash,
      entity_type: tableMeta.tableName,
      record_count: rawRows.length,
      success_count: 0,
      error_count: validationReport.summary.invalidRows,
      status: 'PENDING_CONFIRMATION',
      notes: JSON.stringify({
        jobId,
        mode: validationReport.mode,
        matchingKey: validationReport.matchingKey,
        operator: username,
        userId,
        tableName: tableMeta.tableName,
        modelName: tableMeta.modelName,
        validationSummary: validationReport.summary,
      }),
    },
  });

  const job = {
    jobId,
    dbBatchId: dbBatch.id,
    tableName: tableMeta.tableName,
    modelName: tableMeta.modelName,
    mode: validationReport.mode,
    matchingKey: validationReport.matchingKey,
    filename,
    fileHash: calculatedHash,
    userId,
    username,
    headers,
    rawRows,
    validationReport,
    status: 'PENDING_CONFIRMATION', // PENDING_CONFIRMATION, RUNNING, COMPLETED, FAILED, CANCELLED
    cancelRequested: false,
    progress: {
      totalRows: rawRows.length,
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: validationReport.summary.invalidRows,
      percentage: 0,
      startedAt: null,
      completedAt: null,
      elapsedMs: 0,
      throughputRowsPerSec: 0,
    },
    rowIssues: [...validationReport.rowIssues],
  };

  activeJobs.set(jobId, job);

  return {
    jobId,
    dbBatchId: dbBatch.id,
    tableName: tableMeta.tableName,
    mode: job.mode,
    matchingKey: job.matchingKey,
    validationSummary: validationReport.summary,
    isValidPlan: validationReport.isValidPlan,
    structuralErrors: validationReport.structuralErrors,
    previewRecords: validationReport.previewRecords,
  };
}

/**
 * Confirm and initiate execution of a validated import job.
 */
async function confirmAndExecuteJob(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) {
    throw new Error(`Import job "${jobId}" not found or session expired.`);
  }

  if (job.status === 'RUNNING') {
    throw new Error(`Import job "${jobId}" is already running.`);
  }
  if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
    throw new Error(`Import job "${jobId}" has already ended with status ${job.status}.`);
  }

  job.status = 'RUNNING';
  job.progress.startedAt = new Date().toISOString();

  await prisma.migrationBatch.update({
    where: { id: job.dbBatchId },
    data: {
      status: 'RUNNING',
      started_at: new Date(),
    },
  });

  // Launch asynchronous batch execution in the background
  executeJobBatches(job).catch((err) => {
    console.error(`Import job "${jobId}" execution error:`, err);
    job.status = 'FAILED';
  });

  return getJobStatus(jobId);
}

/**
 * Background batch executor with transaction boundaries, bounded memory, and progress tracking.
 */
async function executeJobBatches(job) {
  const startTime = Date.now();
  const tableMeta = getTableMetadata(job.modelName);
  const matchingKey = job.matchingKey || 'id';
  const matchingKeyField = tableMeta.columnsByName[matchingKey]?.fieldName || matchingKey;

  // Build header-to-column mapping once for the entire job
  const headerToColDef = {};
  for (const h of job.headers) {
    const matched = findMatchingColumn(tableMeta, h);
    if (matched) {
      headerToColDef[h] = matched;
    }
  }
  const colToHeaderMap = {};
  for (const [h, colDef] of Object.entries(headerToColDef)) {
    if (!colToHeaderMap[colDef.columnName]) colToHeaderMap[colDef.columnName] = h;
    if (!colToHeaderMap[colDef.fieldName]) colToHeaderMap[colDef.fieldName] = h;
  }

  const validRows = job.rawRows;
  const totalRows = validRows.length;

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    for (let i = 0; i < totalRows; i += BATCH_SIZE) {
      if (job.cancelRequested) {
        job.status = 'CANCELLED';
        break;
      }

      const batch = validRows.slice(i, i + BATCH_SIZE);

      // Execute current batch in an isolated database transaction with SAVEPOINT per row
      await prisma.$transaction(
        async (tx) => {
          const txModel = tx[tableMeta.modelName.charAt(0).toLowerCase() + tableMeta.modelName.slice(1)];

          for (let b = 0; b < batch.length; b++) {
            const rowIdx = i + b + 1;
            const rawRow = batch[b];

            // Transform raw row using table column definitions and flexible header lookup
            const transformedData = {};
            for (const colDef of tableMeta.columns) {
              const h = colToHeaderMap[colDef.columnName] || colToHeaderMap[colDef.fieldName];
              const cellVal = h ? rawRow[h] : undefined;
              const isBlank =
                cellVal === undefined ||
                cellVal === null ||
                (typeof cellVal === 'string' && cellVal.trim() === '');

              if (isBlank) {
                if (colDef.isNullable) {
                  transformedData[colDef.fieldName] = null;
                } else if (colDef.hasDefault || colDef.isId) {
                  // Handled below by generator or default
                } else {
                  transformedData[colDef.fieldName] = '';
                }
              } else {
                // If string starts with formula marker, sanitize
                if (typeof cellVal === 'string' && isFormulaInjection(cellVal)) {
                  transformedData[colDef.fieldName] = `'${cellVal.trim()}`;
                } else if (colDef.type === 'DateTime') {
                  transformedData[colDef.fieldName] = new Date(cellVal);
                } else if (colDef.type === 'Int' || colDef.type === 'BigInt') {
                  transformedData[colDef.fieldName] = Number(cellVal);
                } else if (colDef.type === 'Decimal' || colDef.type === 'Float') {
                  transformedData[colDef.fieldName] = Number(cellVal);
                } else if (colDef.type === 'Boolean') {
                  transformedData[colDef.fieldName] = Boolean(
                    cellVal === true || String(cellVal).toLowerCase() === 'true' || cellVal === 1
                  );
                } else if (colDef.type === 'String') {
                  const trimmed = String(cellVal).trim();
                  transformedData[colDef.fieldName] = (colDef.isNullable && trimmed === '') ? null : trimmed;
                } else {
                  transformedData[colDef.fieldName] = cellVal;
                }
              }
            }

            // Auto-generate omitted or blank generated fields (Rule B & Rule C)
            for (const colDef of tableMeta.columns) {
              if (colDef.isId && colDef.defaultKind === 'uuid(4)' && !transformedData[colDef.fieldName]) {
                transformedData[colDef.fieldName] = uuidv4();
              } else if (colDef.columnName === 'created_at' && colDef.defaultKind === 'now' && !transformedData[colDef.fieldName]) {
                transformedData[colDef.fieldName] = new Date();
              } else if (colDef.isUpdatedAt && !transformedData[colDef.fieldName]) {
                transformedData[colDef.fieldName] = new Date();
              }
            }

            // Historical transaction safety invariant:
            // For historical Sale or Purchase, enforce is_legacy_import = true
            if (tableMeta.columnsByName['is_legacy_import']) {
              transformedData.is_legacy_import = true;
            }

            // Perform Insert, Update, or Upsert under row-level SAVEPOINT
            const keyValue = transformedData[matchingKeyField];
            const spName = `sp_${b}`;

            await tx.$executeRawUnsafe(`SAVEPOINT ${spName}`);

            try {
              if (job.mode === 'INSERT') {
                await txModel.create({ data: transformedData });
                insertedCount++;
              } else if (job.mode === 'UPDATE') {
                if (!keyValue) {
                  throw new Error(`Matching key "${matchingKeyField}" is missing or empty.`);
                }
                // Exclude primary key from update payload
                const updatePayload = { ...transformedData };
                for (const pkCol of tableMeta.primaryKeys) {
                  const pkField = tableMeta.columnsByName[pkCol]?.fieldName || pkCol;
                  delete updatePayload[pkField];
                }
                await txModel.update({
                  where: { [matchingKeyField]: keyValue },
                  data: updatePayload,
                });
                updatedCount++;
              } else if (job.mode === 'UPSERT') {
                if (!keyValue) {
                  // Missing matching key in upsert: perform standard insert with generated PK
                  await txModel.create({ data: transformedData });
                  insertedCount++;
                } else {
                  const existing = await txModel.findUnique({
                    where: { [matchingKeyField]: keyValue },
                    select: { [matchingKeyField]: true },
                  });

                  if (existing) {
                    const updatePayload = { ...transformedData };
                    for (const pkCol of tableMeta.primaryKeys) {
                      const pkField = tableMeta.columnsByName[pkCol]?.fieldName || pkCol;
                      delete updatePayload[pkField];
                    }
                    await txModel.update({
                      where: { [matchingKeyField]: keyValue },
                      data: updatePayload,
                    });
                    updatedCount++;
                  } else {
                    await txModel.create({ data: transformedData });
                    insertedCount++;
                  }
                }
              }

              // Row succeeded: release savepoint
              await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${spName}`);
            } catch (rowErr) {
              // Row failed: rollback to savepoint to clear transaction error state in PostgreSQL
              await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${spName}`);
              failedCount++;

              let cleanMsg = rowErr.message || 'Database write error';
              if (cleanMsg.includes('Unique constraint failed')) {
                const match = cleanMsg.match(/Unique constraint failed on the fields: \(([^)]+)\)/);
                cleanMsg = match ? `Unique constraint failed on field(s): ${match[1]}` : 'Unique constraint violation in database.';
              } else if (cleanMsg.includes('Foreign key constraint failed')) {
                cleanMsg = 'Foreign key constraint violation in database.';
              }

              job.rowIssues.push({
                row: rowIdx,
                column: matchingKey,
                originalValue: keyValue,
                code: 'DATABASE_WRITE_ERROR',
                severity: 'ERROR',
                message: cleanMsg,
                recommendation: 'Check constraint violations or foreign keys in database.',
              });
            }
          }
        },
        { timeout: 60000, maxWait: 10000 }
      );

      // Update progress metrics
      const elapsed = Date.now() - startTime;
      const processed = Math.min(i + batch.length, totalRows);
      const throughput = elapsed > 0 ? Math.round((processed / (elapsed / 1000)) * 10) / 10 : 0;

      job.progress.processed = processed;
      job.progress.inserted = insertedCount;
      job.progress.updated = updatedCount;
      job.progress.skipped = skippedCount;
      job.progress.failed = failedCount;
      job.progress.percentage = Math.round((processed / totalRows) * 100);
      job.progress.elapsedMs = elapsed;
      job.progress.throughputRowsPerSec = throughput;
    }

    if (job.status !== 'CANCELLED') {
      job.status = failedCount > 0 && insertedCount === 0 && updatedCount === 0 ? 'FAILED' : 'COMPLETED';
    }
  } catch (err) {
    console.error('Batch transaction error:', err);
    job.status = 'FAILED';
  } finally {
    job.progress.completedAt = new Date().toISOString();
    job.progress.elapsedMs = Date.now() - startTime;

    // Update MigrationBatch in database
    await prisma.migrationBatch.update({
      where: { id: job.dbBatchId },
      data: {
        status: job.status,
        completed_at: new Date(),
        success_count: insertedCount + updatedCount,
        error_count: failedCount,
        notes: JSON.stringify({
          jobId: job.jobId,
          mode: job.mode,
          matchingKey: job.matchingKey,
          operator: job.username,
          tableName: job.tableName,
          inserted: insertedCount,
          updated: updatedCount,
          skipped: skippedCount,
          failed: failedCount,
          elapsedMs: job.progress.elapsedMs,
          throughput: job.progress.throughputRowsPerSec,
        }),
      },
    });

    // Record top issues in MigrationIssue table without duplicate row/code
    if (job.rowIssues.length > 0) {
      const seenIssues = new Set();
      const uniqueIssues = [];
      for (const iss of job.rowIssues) {
        const key = `${iss.row}_${iss.code}_${iss.column}`;
        if (!seenIssues.has(key)) {
          seenIssues.add(key);
          uniqueIssues.push(iss);
        }
      }

      const issuesToInsert = uniqueIssues.slice(0, 100).map((iss) => ({
        batch_id: job.dbBatchId,
        entity_type: job.tableName,
        legacy_id: iss.originalValue ? String(iss.originalValue).slice(0, 50) : null,
        issue_code: iss.code || 'VALIDATION_ISSUE',
        severity: iss.severity || 'ERROR',
        description: `Row ${iss.row || 0}: ${iss.message}`,
        resolution_status: 'UNRESOLVED',
        metadata: {
          column: iss.column,
          recommendation: iss.recommendation,
        },
      }));

      await prisma.migrationIssue.createMany({
        data: issuesToInsert,
        skipDuplicates: true,
      });
    }
  }
}

/**
 * Get the live progress and status of an import job.
 */
function getJobStatus(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) {
    return null;
  }

  return {
    jobId: job.jobId,
    dbBatchId: job.dbBatchId,
    tableName: job.tableName,
    mode: job.mode,
    matchingKey: job.matchingKey,
    filename: job.filename,
    status: job.status,
    progress: job.progress,
    issueCount: job.rowIssues.length,
    recentIssues: job.rowIssues.slice(0, 20),
  };
}

/**
 * Request cancellation of an active job at safe checkpoint.
 */
function cancelJob(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) {
    throw new Error(`Import job "${jobId}" not found.`);
  }

  if (job.status === 'RUNNING') {
    job.cancelRequested = true;
    return { success: true, message: 'Cancellation requested. Job will stop after the active batch checkpoint.' };
  }
  return { success: false, message: `Cannot cancel job with status "${job.status}".` };
}

/**
 * Retrieve row-level error reports for a job.
 */
function getJobErrors(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) {
    return null;
  }

  return {
    jobId: job.jobId,
    tableName: job.tableName,
    filename: job.filename,
    mode: job.mode,
    issues: job.rowIssues,
  };
}

/**
 * List recent import jobs from database.
 */
async function listImportJobs(limit = 50) {
  const batches = await prisma.migrationBatch.findMany({
    orderBy: { created_at: 'desc' },
    take: limit,
    include: {
      _count: { select: { issues: true } },
    },
  });

  return batches.map((b) => {
    let parsedNotes = {};
    try {
      if (b.notes) parsedNotes = JSON.parse(b.notes);
    } catch {
      // ignore
    }

    return {
      id: b.id,
      batchNumber: b.batch_number,
      tableName: b.entity_type,
      filename: b.source_file,
      fileHash: b.source_sha256,
      status: b.status,
      recordCount: b.record_count,
      successCount: b.success_count,
      errorCount: b.error_count,
      startedAt: b.started_at,
      completedAt: b.completed_at,
      createdAt: b.created_at,
      mode: parsedNotes.mode || 'INSERT',
      operator: parsedNotes.operator || 'ADMIN',
      inserted: parsedNotes.inserted || 0,
      updated: parsedNotes.updated || 0,
      skipped: parsedNotes.skipped || 0,
      failed: parsedNotes.failed || b.error_count || 0,
      throughput: parsedNotes.throughput || 0,
    };
  });
}

module.exports = {
  createImportJob,
  confirmAndExecuteJob,
  getJobStatus,
  cancelJob,
  getJobErrors,
  listImportJobs,
  BATCH_SIZE,
};
