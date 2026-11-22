const prisma = require('../utils/prismaClient')

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
    })
    res.json({
      success: true,
      data: batches,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Get migration batch by ID
 */
async function getBatch(req, res, next) {
  try {
    const { id } = req.params
    const batch = await prisma.migrationBatch.findUnique({
      where: { id },
      include: {
        issues: {
          orderBy: { created_at: 'desc' },
          take: 100,
        },
        _count: { select: { issues: true, legacy_id_maps: true } },
      },
    })
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Migration batch not found' },
      })
    }
    res.json({
      success: true,
      data: batch,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * List migration issues with filters
 */
async function listIssues(req, res, next) {
  try {
    const { batch_id, severity, resolution_status, entity_type } = req.query
    const where = {}
    if (batch_id) where.batch_id = batch_id
    if (severity) where.severity = severity
    if (resolution_status) where.resolution_status = resolution_status
    if (entity_type) where.entity_type = entity_type

    const issues = await prisma.migrationIssue.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 200,
    })

    res.json({
      success: true,
      data: issues,
    })
  } catch (err) {
    next(err)
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
      prisma.migrationIssue.count({ where: { resolution_status: 'UNRESOLVED' } }),
      prisma.legacyIdMap.count(),
    ])

    res.json({
      success: true,
      data: {
        batch_count: batchCount,
        total_issues: totalIssues,
        unresolved_issues: unresolvedIssues,
        mapped_records: mappedRecords,
        provenance: 'SYNTHETIC_FIXTURE',
        known_original_workbook_sha256: 'b392557f09df3dd191aed9f178f89722d10a44b43294949c670e53f24bac03a4',
        excel_import_status: 'NOT_YET_AVAILABLE',
      },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listBatches,
  getBatch,
  listIssues,
  getMigrationStatus,
}
