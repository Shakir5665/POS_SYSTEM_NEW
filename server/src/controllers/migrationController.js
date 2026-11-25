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
 * Delete a single migration batch and its associated issues/maps
 * DELETE /api/migration/batches/:id
 */
async function deleteBatch(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.migrationBatch.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Migration batch not found' },
      });
    }

    await prisma.$transaction([
      prisma.migrationIssue.deleteMany({ where: { batch_id: id } }),
      prisma.legacyIdMap.deleteMany({ where: { batch_id: id } }),
      prisma.migrationBatch.delete({ where: { id } }),
    ]);

    res.json({
      success: true,
      message: 'Migration batch and related logs deleted successfully',
      data: { id },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Clear all migration batches and related audit logs
 * DELETE /api/migration/batches
 */
async function clearAllBatches(req, res, next) {
  try {
    await prisma.$transaction([
      prisma.migrationIssue.deleteMany(),
      prisma.legacyIdMap.deleteMany(),
      prisma.migrationBatch.deleteMany(),
    ]);

    res.json({
      success: true,
      message: 'All migration batches and logs cleared successfully',
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
 * Delete a single migration issue
 * DELETE /api/migration/issues/:id
 */
async function deleteIssue(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.migrationIssue.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Migration issue not found' },
      });
    }

    await prisma.migrationIssue.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Migration issue dismissed/deleted successfully',
      data: { id },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Clear all migration issues
 * DELETE /api/migration/issues
 */
async function clearAllIssues(req, res, next) {
  try {
    await prisma.migrationIssue.deleteMany();

    res.json({
      success: true,
      message: 'All migration issues cleared successfully',
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

/**
 * Clear business data while preserving User, SystemControl, and Prisma migrations
 * POST /api/migration/clear-database
 */
async function clearDatabase(req, res, next) {
  try {
    const { confirmation } = req.body || {};
    if (confirmation !== 'Clear Database') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Confirmation text "Clear Database" is required to execute this operation',
        },
      });
    }

    // Keep system owner/access-control state alongside users and Prisma migrations.
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('User', 'SystemControl', '_prisma_migrations')
      ORDER BY table_name;
    `;

    let tableNames = tables.map((t) => t.table_name);

    // Fallback list of known model table names if information_schema query yields nothing
    if (tableNames.length === 0) {
      tableNames = [
        'Category',
        'Product',
        'Customer',
        'Sale',
        'SaleItem',
        'Payment',
        'CustomerPayment',
        'CustomerPaymentAllocation',
        'InventoryLog',
        'AuthLog',
        'Settings',
        'PaystackPayment',
        'Supplier',
        'Purchase',
        'PurchaseItem',
        'SupplierPayment',
        'SupplierPaymentAllocation',
        'ExpenseCategory',
        'Expense',
        'BusinessAsset',
        'OwnerTransaction',
        'LegacyIdMap',
        'MigrationBatch',
        'MigrationIssue',
        'Warehouse',
        'StockAdjustment',
        'StockAdjustmentItem',
        'SalesReturn',
        'SalesReturnItem',
        'PurchaseReturn',
        'PurchaseReturnItem',
        'Brand',
        'Variation',
        'VariationValue',
        'WarehouseStock',
        'StockTransferItem',
        'StockTransfer',
      ];
    }

    if (tableNames.length > 0) {
      // Step 1: Decouple any users linked to a warehouse so User accounts are never cascade-affected
      await prisma.$executeRawUnsafe('UPDATE "User" SET "warehouse_id" = NULL;');

      // Step 2: Separate Warehouse from TRUNCATE CASCADE list.
      // In PostgreSQL, TRUNCATE "Warehouse" CASCADE would cascade to "User" due to foreign key references.
      const tablesToTruncate = tableNames.filter((t) => t !== 'Warehouse');
      if (tablesToTruncate.length > 0) {
        const truncateSql = `TRUNCATE TABLE ${tablesToTruncate.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`;
        await prisma.$executeRawUnsafe(truncateSql);
      }

      // Step 3: Now that child tables are truncated, safely delete all records from Warehouse
      if (tableNames.includes('Warehouse')) {
        await prisma.$executeRawUnsafe('DELETE FROM "Warehouse";');
      }
    }

    const remainingUsers = await prisma.user.count();

    res.json({
      success: true,
      message: 'Business data cleared successfully, preserving user accounts and system access controls',
      data: {
        truncated_tables_count: tableNames.length,
        truncated_tables: tableNames,
        preserved_users_count: remainingUsers,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listBatches,
  getBatch,
  deleteBatch,
  clearAllBatches,
  listIssues,
  deleteIssue,
  clearAllIssues,
  getMigrationStatus,
  clearDatabase,
};
