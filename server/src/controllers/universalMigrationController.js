'use strict';

const path = require('path');
const fs = require('fs');
const prisma = require('../utils/prismaClient');
const {
  getApprovedTables,
  getRestrictedTables,
} = require('../services/migration/universalSchemaService');
const {
  generateTemplateWorkbook,
  getTableSchemaGuide,
} = require('../services/migration/templateGenerator');
const { parseSingleTableWorkbook } = require('../services/migration/universalExcelParser');
const { validateWorkbookData } = require('../services/migration/universalExcelValidator');
const {
  createImportJob,
  confirmAndExecuteJob,
  getJobStatus,
  cancelJob,
  getJobErrors,
  listImportJobs,
} = require('../services/migration/universalExcelImportEngine');

/**
 * List all approved database tables and restricted tables
 * GET /api/migration/excel/tables
 */
async function listTables(req, res, next) {
  try {
    const approvedTables = getApprovedTables();
    const restrictedTables = getRestrictedTables();

    res.json({
      success: true,
      data: {
        approvedTables,
        restrictedTables,
        totalApproved: approvedTables.length,
        totalRestricted: restrictedTables.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Download an Excel template (.xlsx) for an approved table
 * GET /api/migration/excel/templates/:table
 */
async function downloadTemplate(req, res, _next) {
  try {
    const { table } = req.params;
    const { variant = 'full' } = req.query;

    const template = generateTemplateWorkbook(table, variant);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
    res.setHeader('Content-Length', template.buffer.length);

    res.send(template.buffer);
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_GENERATION_FAILED', message: err.message },
    });
  }
}

/**
 * Get schema specification and guidance for a table
 * GET /api/migration/excel/schema/:table
 */
async function getTableSchema(req, res, next) {
  try {
    const { table } = req.params;
    const guide = getTableSchemaGuide(table);
    if (!guide) {
      return res.status(404).json({
        success: false,
        error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" was not found.` },
      });
    }

    res.json({
      success: true,
      data: guide,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Inspect uploaded Excel file and run automatic table detection
 * POST /api/migration/excel/inspect
 */
async function inspectFile(req, res, _next) {
  let tempFilePath = null;
  try {
    let sourceBuffer = null;
    let filename = 'uploaded.xlsx';

    if (req.file) {
      tempFilePath = req.file.path;
      sourceBuffer = fs.readFileSync(tempFilePath);
      filename = req.file.originalname || path.basename(tempFilePath);
    } else if (req.body && req.body.filePath) {
      tempFilePath = path.resolve(req.body.filePath);
      sourceBuffer = fs.readFileSync(tempFilePath);
      filename = path.basename(tempFilePath);
    } else if (req.body && req.body.fileBase64) {
      sourceBuffer = Buffer.from(req.body.fileBase64, 'base64');
      filename = req.body.filename || 'uploaded.xlsx';
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE_PROVIDED',
          message: 'No Excel file provided. Upload a .xlsx file or provide file data.',
        },
      });
    }

    const { sheetName, overrideTable } = req.body || {};

    const parsed = parseSingleTableWorkbook(sourceBuffer, {
      filename,
      sheetName,
      overrideTable,
    });

    res.json({
      success: true,
      data: {
        filename: parsed.filename,
        fileHash: parsed.fileHash,
        fileSize: parsed.fileSize,
        sheetName: parsed.sheetName,
        sheetNames: parsed.sheetNames,
        hasMultipleSheets: parsed.hasMultipleSheets,
        headers: parsed.headers,
        totalRows: parsed.totalRows,
        detection: parsed.detection,
        previewRows: parsed.previewRows,
        rawRows: parsed.rawRows, // Complete dataset for client validation & staging
      },
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: err.code || 'INSPECTION_FAILED', message: err.message },
    });
  } finally {
    // Clean up temporary upload file safely
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanErr) {
        console.warn('Failed to delete temp upload file:', cleanErr.message);
      }
    }
  }
}

/**
 * Validate parsed rows against database constraints, foreign keys, and mode
 * POST /api/migration/excel/validate
 */
async function validatePlan(req, res, _next) {
  try {
    const { tableName, headers, rawRows, mode = 'INSERT', matchingKey = null } = req.body;

    if (!tableName) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TABLE_NAME', message: 'Target database tableName is required.' },
      });
    }
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_HEADERS', message: 'Column headers are required.' },
      });
    }
    if (!rawRows || !Array.isArray(rawRows)) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATA_ROWS', message: 'rawRows array is required.' },
      });
    }

    const report = await validateWorkbookData({
      tableName,
      headers,
      rawRows,
      mode,
      matchingKey,
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: err.code || 'VALIDATION_FAILED', message: err.message },
    });
  }
}

/**
 * Create an import job
 * POST /api/migration/excel/jobs
 */
async function createJob(req, res, _next) {
  try {
    const { tableName, mode = 'INSERT', matchingKey = null, headers, rawRows, filename, fileHash } = req.body;

    if (!tableName || !headers || !rawRows) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'tableName, headers, and rawRows are required.' },
      });
    }

    const jobResult = await createImportJob({
      tableName,
      mode,
      matchingKey,
      headers,
      rawRows,
      filename: filename || `${tableName}.xlsx`,
      fileHash,
      userId: req.user?.id,
      username: req.user?.username || 'ADMIN',
    });

    res.status(201).json({
      success: true,
      data: jobResult,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: err.code || 'JOB_CREATION_FAILED', message: err.message },
    });
  }
}

/**
 * Confirm and initiate execution of an import job
 * POST /api/migration/excel/jobs/:id/confirm
 */
async function confirmJob(req, res, _next) {
  try {
    const { id } = req.params;
    const result = await confirmAndExecuteJob(id);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: 'CONFIRMATION_FAILED', message: err.message },
    });
  }
}

/**
 * Poll live status of an import job
 * GET /api/migration/excel/jobs/:id
 */
async function getJob(req, res, next) {
  try {
    const { id } = req.params;
    const status = getJobStatus(id);

    if (status) {
      return res.json({
        success: true,
        data: status,
      });
    }

    // Fallback to database lookup
    const dbBatch = await prisma.migrationBatch.findUnique({
      where: { id },
      include: {
        _count: { select: { issues: true } },
      },
    });

    if (!dbBatch) {
      return res.status(404).json({
        success: false,
        error: { code: 'JOB_NOT_FOUND', message: `Import job "${id}" was not found.` },
      });
    }

    let notes = {};
    try {
      if (dbBatch.notes) notes = JSON.parse(dbBatch.notes);
    } catch {
      // ignore
    }

    res.json({
      success: true,
      data: {
        jobId: notes.jobId || dbBatch.id,
        dbBatchId: dbBatch.id,
        tableName: dbBatch.entity_type,
        mode: notes.mode || 'INSERT',
        matchingKey: notes.matchingKey || 'id',
        filename: dbBatch.source_file,
        status: dbBatch.status,
        progress: {
          totalRows: dbBatch.record_count,
          processed: dbBatch.record_count,
          inserted: notes.inserted || dbBatch.success_count,
          updated: notes.updated || 0,
          skipped: notes.skipped || 0,
          failed: dbBatch.error_count,
          percentage: 100,
          startedAt: dbBatch.started_at,
          completedAt: dbBatch.completed_at,
          elapsedMs: notes.elapsedMs || 0,
          throughputRowsPerSec: notes.throughput || 0,
        },
        issueCount: dbBatch._count.issues,
        recentIssues: [],
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List historical import jobs
 * GET /api/migration/excel/jobs
 */
async function listJobs(req, res, next) {
  try {
    const jobs = await listImportJobs(50);
    res.json({
      success: true,
      data: jobs,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Download or retrieve error reports for a job
 * GET /api/migration/excel/jobs/:id/errors
 */
async function getErrors(req, res, next) {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    const errorData = getJobErrors(id);
    let issues = errorData ? errorData.issues : [];

    if (issues.length === 0) {
      // Lookup from database MigrationIssue
      const dbIssues = await prisma.migrationIssue.findMany({
        where: { batch_id: id },
        take: 500,
        orderBy: { created_at: 'asc' },
      });
      issues = dbIssues.map((iss, idx) => ({
        row: idx + 1,
        column: iss.metadata?.column || 'N/A',
        originalValue: iss.legacy_id,
        code: iss.issue_code,
        severity: iss.severity,
        message: iss.description,
        recommendation: iss.metadata?.recommendation || 'Review data format.',
      }));
    }

    if (format === 'csv') {
      const csvHeader = 'Row,Column,Code,Severity,Message,Original Value,Recommendation\n';
      const csvRows = issues.map((iss) => {
        const safe = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        return `${iss.row || ''},${safe(iss.column)},${safe(iss.code)},${safe(iss.severity)},${safe(iss.message)},${safe(iss.originalValue)},${safe(iss.recommendation)}`;
      });

      const csvContent = csvHeader + csvRows.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="import_errors_${id}.csv"`);
      return res.send(csvContent);
    }

    res.json({
      success: true,
      data: {
        jobId: id,
        totalErrors: issues.length,
        issues,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Cancel an active import job
 * POST /api/migration/excel/jobs/:id/cancel
 */
async function cancelImportJob(req, res, _next) {
  try {
    const { id } = req.params;
    const result = cancelJob(id);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { code: 'CANCEL_FAILED', message: err.message },
    });
  }
}

module.exports = {
  listTables,
  downloadTemplate,
  getTableSchema,
  inspectFile,
  validatePlan,
  createJob,
  confirmJob,
  getJob,
  listJobs,
  getErrors,
  cancelImportJob,
};
