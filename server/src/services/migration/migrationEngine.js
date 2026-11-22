'use strict'

/**
 * Legacy POS Migration Engine & Dry-Run Validator
 *
 * Orchestrates the migration of historical POS data into NexTill,
 * providing:
 * 1. Dry-run validation with zero database writes and strict safety assertions
 * 2. Staged batch execution with LegacyIdMap tracking and MigrationIssue logging
 * 3. Total rollback capability per MigrationBatch
 * 4. Authoritative stock balance invariance (zero Product.quantity drift, zero InventoryLog drift)
 */

const fs = require('fs')
const path = require('path')
const prisma = require('../../utils/prismaClient')
const {
  SOURCE_SYSTEM,
  resolveMigrationUser,
  resolveWarehouse,
  resolveProduct,
  resolveSupplier,
  resolveCustomer,
  resolveExpenseCategory,
} = require('./entityResolvers')
const { importSale } = require('./importers/salesImporter')
const { importPurchase, recordOrphanPurchaseItems } = require('./importers/purchasesImporter')
const { importAdjustment, recordOrphanAdjustmentItems } = require('./importers/adjustmentsImporter')
const { importExpense } = require('./importers/expensesImporter')

const DEFAULT_DATASET_PATH = path.join(__dirname, '..', '..', '..', 'scripts', 'migration', 'data', 'legacy-dataset.json')

/**
 * Loads and returns the legacy dataset from file or memory.
 */
function loadDataset(source) {
  if (typeof source === 'object' && source !== null) {
    return source
  }
  const filePath = source || DEFAULT_DATASET_PATH
  if (!fs.existsSync(filePath)) {
    throw new Error(`Legacy dataset file not found: ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/**
 * Performs a dry-run validation pass against the legacy dataset.
 * Guarantees ZERO database writes, validates all mappings and relationships,
 * identifies orphan records, and computes validation metrics.
 *
 * @param {Object} [options]
 * @param {Object|string} [options.sourceData] - Dataset or file path
 * @param {Array<string>} [options.entityTypes=['all']] - Entities to validate
 * @returns {Promise<Object>} Structured Dry-Run Validation Report
 */
async function runDryRun(options = {}) {
  const dataset = loadDataset(options.sourceData)
  const entityTypes = options.entityTypes || ['all']
  const shouldRun = (type) => entityTypes.includes('all') || entityTypes.includes(type)

  const startTime = Date.now()
  const issues = []

  // 1. Resolve read-only context
  const migrationUser = await resolveMigrationUser(prisma, { dryRun: true })
  const warehouse = await resolveWarehouse(1, prisma, { dryRun: true })
  const approvedCategoryMappings = options.approvedCategoryMappings || {}

  const context = {
    batchId: null,
    migrationUser,
    warehouse,
    dryRun: true,
    issues,
    approvedCategoryMappings,
  }

  const results = {
    metadata: {
      source_file: dataset.metadata?.source_file || 'POS_Complete_Export_v4.xlsx',
      source_sha256: dataset.metadata?.source_sha256,
      executed_at: new Date().toISOString(),
      mode: 'DRY_RUN',
      dataset_provenance: dataset.metadata?.provenance || 'SYNTHETIC_FIXTURE',
      dataset_classification: dataset.metadata?.dataset_classification || dataset.metadata?.provenance || 'SYNTHETIC_FIXTURE',
      is_synthetic_fixture: (dataset.metadata?.provenance || 'SYNTHETIC_FIXTURE') === 'SYNTHETIC_FIXTURE',
    },
    counts: {
      sales: { total: 0, valid: 0, items: 0 },
      purchases: { total: 0, valid: 0, items: 0, orphans: 0 },
      adjustments: { total: 0, valid: 0, items: 0, orphans: 0 },
      expenses: { total: 0, valid: 0, not_eligible: 0 },
    },
    inventory_impact: {
      product_quantity_mutations: 0,
      inventory_logs_created: 0,
      customer_loyalty_points_awarded: 0,
      synthetic_payments_created: 0,
    },
    issues: [],
    safe_to_execute: true,
  }

  // 2. Validate Sales
  if (shouldRun('sales') && dataset.sales) {
    results.counts.sales.total = dataset.sales.length
    for (const sale of dataset.sales) {
      const res = await importSale(sale, context, prisma)
      if (res.status === 'SIMULATED') {
        results.counts.sales.valid++
        results.counts.sales.items += res.itemCount
      }
    }
  }

  // 3. Validate Purchases & Orphan flattened purchase items
  if (shouldRun('purchases') && dataset.purchases) {
    results.counts.purchases.total = dataset.purchases.length
    for (const purchase of dataset.purchases) {
      const res = await importPurchase(purchase, context, prisma)
      if (res.status === 'SIMULATED') {
        results.counts.purchases.valid++
        results.counts.purchases.items += res.itemCount
      }
    }
    if (dataset.flattened_purchase_items) {
      await recordOrphanPurchaseItems(dataset.flattened_purchase_items, context)
      results.counts.purchases.orphans = dataset.flattened_purchase_items.length
    }
  }

  // 4. Validate Stock Adjustments & Orphan flattened adjustment items
  if (shouldRun('adjustments') && dataset.adjustments) {
    results.counts.adjustments.total = dataset.adjustments.length
    for (const adj of dataset.adjustments) {
      const res = await importAdjustment(adj, context, prisma)
      if (res.status === 'SIMULATED') {
        results.counts.adjustments.valid++
        results.counts.adjustments.items += res.itemCount
      }
    }
    if (dataset.flattened_adjustment_items) {
      await recordOrphanAdjustmentItems(dataset.flattened_adjustment_items, context)
      results.counts.adjustments.orphans = dataset.flattened_adjustment_items.length
    }
  }

  // 5. Validate Expenses
  if (shouldRun('expenses') && dataset.expenses) {
    results.counts.expenses.total = dataset.expenses.length
    for (const exp of dataset.expenses) {
      const res = await importExpense(exp, context, prisma)
      if (res.status === 'SIMULATED') {
        results.counts.expenses.valid++
      } else if (res.status === 'NOT_ELIGIBLE') {
        results.counts.expenses.not_eligible = (results.counts.expenses.not_eligible || 0) + 1
      }
    }
  }

  results.duration_ms = Date.now() - startTime
  results.issues = issues

  // Determine safety to execute: Blocking errors make it unsafe; warnings/info remain safe
  const blockingErrors = issues.filter((i) => i.severity === 'ERROR')
  if (blockingErrors.length > 0) {
    results.safe_to_execute = false
    results.status = 'BLOCKED'
  } else {
    results.safe_to_execute = true
    results.status = 'PASSED'
  }

  return results
}

/**
 * Executes a full migration batch against the database.
 * Creates a MigrationBatch record, imports target entities, records LegacyIdMap rows,
 * and captures MigrationIssue records.
 *
 * @param {Object} [options]
 * @param {Object|string} [options.sourceData] - Dataset or file path
 * @param {Array<string>} [options.entityTypes=['all']] - Entities to import
 * @param {string} [options.notes=''] - Notes for MigrationBatch
 * @returns {Promise<Object>} Execution report
 */
async function executeMigration(options = {}) {
  const dataset = loadDataset(options.sourceData)
  const entityTypes = options.entityTypes || ['all']
  const shouldRun = (type) => entityTypes.includes('all') || entityTypes.includes(type)
  const notes = options.notes || 'Full legacy POS migration batch'

  const startTime = new Date()
  const sourceFile = dataset.metadata?.source_file || 'POS_Complete_Export_v4.xlsx'
  const sourceSha256 = dataset.metadata?.source_sha256 || null

  // Calculate total source record count
  let expectedRecordCount = 0
  if (shouldRun('sales') && dataset.sales) expectedRecordCount += dataset.sales.length
  if (shouldRun('purchases') && dataset.purchases) expectedRecordCount += dataset.purchases.length
  if (shouldRun('adjustments') && dataset.adjustments) expectedRecordCount += dataset.adjustments.length
  if (shouldRun('expenses') && dataset.expenses) expectedRecordCount += dataset.expenses.length

  // 1. Create MigrationBatch record
  const batch = await prisma.migrationBatch.create({
    data: {
      source_file: sourceFile,
      source_sha256: sourceSha256,
      entity_type: entityTypes.join(','),
      record_count: expectedRecordCount,
      status: 'RUNNING',
      started_at: startTime,
      notes,
    },
  })

  const issues = []
  const context = {
    batchId: batch.id,
    migrationUser: null,
    warehouse: null,
    dryRun: false,
    issues,
    approvedCategoryMappings: options.approvedCategoryMappings || {},
  }

  let successCount = 0
  let errorCount = 0

  try {
    // 2. Resolve persistent migration user and warehouse
    context.migrationUser = await resolveMigrationUser(prisma)
    context.warehouse = await resolveWarehouse(1, prisma)

    // 3. Import Sales in transaction
    if (shouldRun('sales') && dataset.sales) {
      for (const sale of dataset.sales) {
        try {
          await prisma.$transaction(async (tx) => {
            const res = await importSale(sale, context, tx)
            if (res.status === 'IMPORTED' || res.status === 'SKIPPED_DUPLICATE') {
              successCount++
            }
          })
        } catch (err) {
          errorCount++
          issues.push({
            batch_id: batch.id,
            entity_type: 'Sale',
            legacy_id: String(sale.legacy_id),
            issue_code: 'IMPORT_ERROR',
            severity: 'ERROR',
            description: `Failed to import Sale #${sale.legacy_id}: ${err.message}`,
            source_data: sale,
          })
        }
      }
    }

    // 4. Import Purchases & record orphan items
    if (shouldRun('purchases') && dataset.purchases) {
      for (const purchase of dataset.purchases) {
        try {
          await prisma.$transaction(async (tx) => {
            const res = await importPurchase(purchase, context, tx)
            if (res.status === 'IMPORTED' || res.status === 'SKIPPED_DUPLICATE') {
              successCount++
            }
          })
        } catch (err) {
          errorCount++
          issues.push({
            batch_id: batch.id,
            entity_type: 'Purchase',
            legacy_id: String(purchase.legacy_id),
            issue_code: 'IMPORT_ERROR',
            severity: 'ERROR',
            description: `Failed to import Purchase #${purchase.legacy_id}: ${err.message}`,
            source_data: purchase,
          })
        }
      }

      if (dataset.flattened_purchase_items) {
        await recordOrphanPurchaseItems(dataset.flattened_purchase_items, context)
      }
    }

    // 5. Import Stock Adjustments & record orphan items
    if (shouldRun('adjustments') && dataset.adjustments) {
      for (const adj of dataset.adjustments) {
        try {
          await prisma.$transaction(async (tx) => {
            const res = await importAdjustment(adj, context, tx)
            if (res.status === 'IMPORTED' || res.status === 'SKIPPED_DUPLICATE') {
              successCount++
            }
          })
        } catch (err) {
          errorCount++
          issues.push({
            batch_id: batch.id,
            entity_type: 'StockAdjustment',
            legacy_id: String(adj.legacy_id),
            issue_code: 'IMPORT_ERROR',
            severity: 'ERROR',
            description: `Failed to import StockAdjustment #${adj.legacy_id}: ${err.message}`,
            source_data: adj,
          })
        }
      }

      if (dataset.flattened_adjustment_items) {
        await recordOrphanAdjustmentItems(dataset.flattened_adjustment_items, context)
      }
    }

    // 6. Import Expenses
    if (shouldRun('expenses') && dataset.expenses) {
      for (const exp of dataset.expenses) {
        try {
          await prisma.$transaction(async (tx) => {
            const res = await importExpense(exp, context, tx)
            if (res.status === 'IMPORTED' || res.status === 'SKIPPED_DUPLICATE') {
              successCount++
            }
          })
        } catch (err) {
          errorCount++
          issues.push({
            batch_id: batch.id,
            entity_type: 'Expense',
            legacy_id: String(exp.legacy_id),
            issue_code: 'IMPORT_ERROR',
            severity: 'ERROR',
            description: `Failed to import Expense #${exp.legacy_id}: ${err.message}`,
            source_data: exp,
          })
        }
      }
    }

    // 7. Persist any unpersisted MigrationIssue records
    for (const issue of issues) {
      if (!issue.id) {
        await prisma.migrationIssue.create({
          data: {
            batch_id: batch.id,
            entity_type: issue.entity_type,
            legacy_id: issue.legacy_id ? String(issue.legacy_id) : null,
            issue_code: issue.issue_code,
            severity: issue.severity,
            description: issue.description,
            resolution_status: issue.resolution_status || 'UNRESOLVED',
            metadata: issue.source_data || issue.metadata || null,
          },
        })
      }
    }

    // 8. Update Batch Status
    const finalStatus = errorCount > 0 ? (successCount > 0 ? 'PARTIAL' : 'FAILED') : 'COMPLETED'
    const updatedBatch = await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: finalStatus,
        success_count: successCount,
        error_count: errorCount,
        completed_at: new Date(),
      },
    })

    return {
      batch: updatedBatch,
      success_count: successCount,
      error_count: errorCount,
      issue_count: issues.length,
      status: finalStatus,
    }
  } catch (fatalError) {
    await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: 'FAILED',
        error_count: errorCount + 1,
        notes: `Fatal migration error: ${fatalError.message}`,
      },
    })
    throw fatalError
  }
}

/**
 * Rolls back all records imported during a specific migration batch.
 *
 * @param {string|number} batchIdentifier - Batch UUID or batch_number
 * @returns {Promise<Object>} Rollback summary
 */
async function rollbackBatch(batchIdentifier) {
  // Find batch by UUID or integer batch_number
  const where = typeof batchIdentifier === 'number' || !isNaN(Number(batchIdentifier))
    ? { batch_number: Number(batchIdentifier) }
    : { id: String(batchIdentifier) }

  const batch = await prisma.migrationBatch.findFirst({
    where,
    include: {
      legacy_id_maps: true,
    },
  })

  if (!batch) {
    throw new Error(`Migration batch not found: ${batchIdentifier}`)
  }

  if (batch.status === 'ROLLED_BACK') {
    throw new Error(`Migration batch #${batch.batch_number} (${batch.id}) has already been rolled back.`)
  }

  const maps = batch.legacy_id_maps
  const salesToDelete = maps.filter((m) => m.target_model === 'Sale').map((m) => m.nextill_id)
  const purchasesToDelete = maps.filter((m) => m.target_model === 'Purchase').map((m) => m.nextill_id)
  const adjustmentsToDelete = maps.filter((m) => m.target_model === 'StockAdjustment').map((m) => m.nextill_id)
  const expensesToDelete = maps.filter((m) => m.target_model === 'Expense').map((m) => m.nextill_id)

  const deletedCounts = {
    sales: 0,
    purchases: 0,
    adjustments: 0,
    expenses: 0,
    legacy_maps: 0,
  }

  await prisma.$transaction(async (tx) => {
    // 1. Delete Sales (cascades to SaleItems via Prisma / foreign keys)
    if (salesToDelete.length > 0) {
      await tx.saleItem.deleteMany({ where: { sale_id: { in: salesToDelete } } })
      const res = await tx.sale.deleteMany({ where: { id: { in: salesToDelete } } })
      deletedCounts.sales = res.count
    }

    // 2. Delete Purchases (cascades to PurchaseItems)
    if (purchasesToDelete.length > 0) {
      await tx.purchaseItem.deleteMany({ where: { purchase_id: { in: purchasesToDelete } } })
      const res = await tx.purchase.deleteMany({ where: { id: { in: purchasesToDelete } } })
      deletedCounts.purchases = res.count
    }

    // 3. Delete StockAdjustments (cascades to StockAdjustmentItems)
    if (adjustmentsToDelete.length > 0) {
      await tx.stockAdjustmentItem.deleteMany({ where: { adjustment_id: { in: adjustmentsToDelete } } })
      const res = await tx.stockAdjustment.deleteMany({ where: { id: { in: adjustmentsToDelete } } })
      deletedCounts.adjustments = res.count
    }

    // 4. Delete Expenses
    if (expensesToDelete.length > 0) {
      const res = await tx.expense.deleteMany({ where: { id: { in: expensesToDelete } } })
      deletedCounts.expenses = res.count
    }

    // 5. Delete all LegacyIdMap records for this batch
    const mapRes = await tx.legacyIdMap.deleteMany({ where: { batch_id: batch.id } })
    deletedCounts.legacy_maps = mapRes.count

    // 6. Update MigrationBatch status
    await tx.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: 'ROLLED_BACK',
        rollback_at: new Date(),
        notes: (batch.notes || '') + ` | Rolled back at ${new Date().toISOString()}`,
      },
    })
  })

  return {
    batch_id: batch.id,
    batch_number: batch.batch_number,
    status: 'ROLLED_BACK',
    deleted: deletedCounts,
  }
}

/**
 * Returns status and issues for a specific batch.
 */
async function getBatchStatus(batchIdentifier) {
  const where = typeof batchIdentifier === 'number' || !isNaN(Number(batchIdentifier))
    ? { batch_number: Number(batchIdentifier) }
    : { id: String(batchIdentifier) }

  return prisma.migrationBatch.findFirst({
    where,
    include: {
      legacy_id_maps: true,
      issues: true,
    },
  })
}

/**
 * Lists all migration batches.
 */
async function listBatches() {
  return prisma.migrationBatch.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      _count: {
        select: { legacy_id_maps: true, issues: true },
      },
    },
  })
}

module.exports = {
  loadDataset,
  runDryRun,
  executeMigration,
  rollbackBatch,
  getBatchStatus,
  listBatches,
}
