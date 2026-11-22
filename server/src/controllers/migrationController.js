'use strict';

const path = require('path');
const fs = require('fs');
const prisma = require('../utils/prismaClient');
const { parseWorkbook } = require('../services/migration/excelParser');
const { validateWorkbookData } = require('../services/migration/excelValidator');
const { runExcelImport, rollbackExcelBatch } = require('../services/migration/excelImportEngine');
const { isStagingOrProduction, assertExecutionPermitted } = require('../services/migration/migrationGuard');

const DEFAULT_WORKBOOK_PATH = path.resolve(__dirname, '../../../NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx');

function resolveSourceFile(req) {
  if (req.file && req.file.path) {
    return req.file.path;
  }
  if (req.body && req.body.filePath) {
    return path.resolve(req.body.filePath);
  }
  if (fs.existsSync(DEFAULT_WORKBOOK_PATH)) {
    return DEFAULT_WORKBOOK_PATH;
  }
  throw new Error('No historical Excel workbook file provided or found on server');
}

/**
 * List migration batches
 */
async function listBatches(req, res, next) {
  try {
    const batches = await prisma.migrationBatch.findMany({
      orderBy: { batch_number: 'desc' },
      include: {
        _count: { select: { issues: true, legacy_id_maps: true } },
      },
    });
    res.json({
      success: true,
      data: batches,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get migration batch by ID
 */
async function getBatch(req, res, next) {
  try {
    const { id } = req.params;
    const batch = await prisma.migrationBatch.findUnique({
      where: { id },
      include: {
        issues: {
          orderBy: { created_at: 'desc' },
          take: 100,
        },
        _count: { select: { issues: true, legacy_id_maps: true } },
      },
    });
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Migration batch not found' },
      });
    }
    res.json({
      success: true,
      data: batch,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List migration issues with filters
 */
async function listIssues(req, res, next) {
  try {
    const { batch_id, severity, resolution_status, entity_type } = req.query;
    const where = {};
    if (batch_id) where.batch_id = batch_id;
    if (severity) where.severity = severity;
    if (resolution_status) where.resolution_status = resolution_status;
    if (entity_type) where.entity_type = entity_type;

    const issues = await prisma.migrationIssue.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    res.json({
      success: true,
      data: issues,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get migration readiness & summary info
 */
async function getMigrationStatus(req, res, next) {
  try {
    const [batchCount, totalIssues, unresolvedIssues, mappedRecords] = await Promise.all([
      prisma.migrationBatch.count(),
      prisma.migrationIssue.count(),
      prisma.migrationIssue.count({ where: { resolution_status: { in: ['UNRESOLVED', 'QUARANTINED'] } } }),
      prisma.legacyIdMap.count(),
    ]);

    const isStaging = isStagingOrProduction();

    res.json({
      success: true,
      data: {
        batch_count: batchCount,
        total_issues: totalIssues,
        unresolved_issues: unresolvedIssues,
        mapped_records: mappedRecords,
        provenance: 'AUTHENTIC_HISTORICAL_EXCEL_EXPORT',
        known_original_workbook_sha256: 'e3d837e544b020f68c032575e40cc76fb0de8e4cca464d4fdc9bd64005f697f9',
        known_repaired_workbook_sha256: '6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7',
        excel_import_status: 'PHASE_4B_VERIFIED_DRY_RUN_ONLY',
        staging_locked: isStaging,
        live_execution_permitted: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Inspect uploaded or canonical Excel workbook
 */
async function inspectExcelWorkbook(req, res, next) {
  try {
    const source = resolveSourceFile(req);
    const parsed = parseWorkbook(source);
    res.json({
      success: true,
      data: {
        sha256: parsed.sha256,
        size: parsed.size,
        sheetNames: parsed.sheetNames,
        missingExpectedSheets: parsed.missingExpectedSheets,
        isValidStructure: parsed.isValidStructure,
        provenance: parsed.provenance,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Validate workbook data and compute B/F reconciliation
 */
async function validateExcelWorkbook(req, res, next) {
  try {
    const source = resolveSourceFile(req);
    const parsed = parseWorkbook(source);
    const report = validateWorkbookData(parsed.workbook, parsed.sha256);
    res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Run zero-write Dry Run against the workbook
 */
async function dryRunExcelWorkbook(req, res, next) {
  try {
    const source = resolveSourceFile(req);
    const result = await runExcelImport({ source, dryRun: true });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Execute live import (Strictly rejected on staging/prod)
 */
async function executeExcelImport(req, res, next) {
  try {
    // Assert backend security guard: reject staging or production
    assertExecutionPermitted({ dryRun: false });

    const source = resolveSourceFile(req);
    const result = await runExcelImport({ source, dryRun: false });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.code === 'STAGING_IMPORT_LOCKED' || err.code === 'ISOLATED_IMPORT_GUARD') {
      return res.status(403).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
    }
    next(err);
  }
}

/**
 * Preview rollback of a batch
 */
async function previewRollback(req, res, next) {
  try {
    const { id } = req.params;
    const result = await rollbackExcelBatch(id, { dryRun: true });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Execute rollback of a batch (Guarded)
 */
async function executeRollback(req, res, next) {
  try {
    assertExecutionPermitted({ dryRun: false });
    const { id } = req.params;
    const result = await rollbackExcelBatch(id, { dryRun: false });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.code === 'STAGING_IMPORT_LOCKED' || err.code === 'ISOLATED_IMPORT_GUARD') {
      return res.status(403).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
    }
    next(err);
  }
}

module.exports = {
  listBatches,
  getBatch,
  listIssues,
  getMigrationStatus,
  inspectExcelWorkbook,
  validateExcelWorkbook,
  dryRunExcelWorkbook,
  executeExcelImport,
  previewRollback,
  executeRollback,
};
