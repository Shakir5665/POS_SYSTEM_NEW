'use strict';

const prisma = require('../utils/prismaClient');
const { isStagingOrProduction } = require('../services/migration/migrationGuard');

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

    const latestExcelBatch = await prisma.migrationBatch.findFirst({
      where: { entity_type: 'AUTHENTIC_HISTORICAL_EXCEL_IMPORT' },
      orderBy: { started_at: 'desc' },
    });

    const isStaging = isStagingOrProduction();
    const hasExcelBatch = !!latestExcelBatch;

    res.json({
      success: true,
      data: {
        batch_count: batchCount,
        total_issues: totalIssues,
        unresolved_issues: unresolvedIssues,
        mapped_records: mappedRecords,
        provenance: hasExcelBatch ? 'AUTHENTIC_HISTORICAL_EXCEL_EXPORT' : 'SYNTHETIC_FIXTURE',
        known_original_workbook_sha256: hasExcelBatch
          ? 'e3d837e544b020f68c032575e40cc76fb0de8e4cca464d4fdc9bd64005f697f9'
          : 'b392557f09df3dd191aed9f178f89722d10a44b43294949c670e53f24bac03a4',
        known_repaired_workbook_sha256: '6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7',
        excel_import_status: hasExcelBatch ? 'PHASE_4B_VERIFIED_DRY_RUN_ONLY' : 'NOT_YET_AVAILABLE',
        staging_locked: isStaging,
        live_execution_permitted: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listBatches,
  getBatch,
  listIssues,
  getMigrationStatus,
};
