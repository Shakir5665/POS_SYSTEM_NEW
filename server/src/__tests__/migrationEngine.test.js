'use strict'

/**
 * NexTill POS — Phase 4A Migration Engine & Dry-Run Integration Tests
 *
 * Verifies:
 * 1. Valid record transformation
 * 2. Missing master mappings & issue quarantine
 * 3. Duplicate legacy IDs
 * 4. Embedded versus flattened item deduplication
 * 5. Orphan purchase items (4)
 * 6. Orphan adjustment items (5)
 * 7. Unknown status codes preservation
 * 8. Decimal monetary values
 * 9. Fractional quantities (e.g., 1.733 kg)
 * 10. Historical business dates
 * 11. Financial reconciliation totals
 * 12. Batch retry behavior & idempotency
 * 13. Dry-run zero-write guarantees
 * 14. Historical stock isolation (zero Product.quantity drift)
 * 15. Historical payment isolation (zero fake Payment rows)
 * 16. Complete batch rollback capability
 */

const { Decimal } = require('../utils/money')
const prisma = require('../utils/prismaClient')
const {
  runDryRun,
  executeMigration,
  rollbackBatch,
  loadDataset,
} = require('../services/migration/migrationEngine')
const { resolveProduct, normalizeUnit } = require('../services/migration/entityResolvers')

async function cleanMigrationRecords() {
  await prisma.migrationIssue.deleteMany()
  await prisma.saleItem.deleteMany({ where: { sale: { is_legacy_import: true } } })
  await prisma.sale.deleteMany({ where: { is_legacy_import: true } })
  await prisma.purchaseItem.deleteMany({ where: { purchase: { is_legacy_import: true } } })
  await prisma.purchase.deleteMany({ where: { is_legacy_import: true } })
  await prisma.stockAdjustmentItem.deleteMany({ where: { adjustment: { is_legacy_import: true } } })
  await prisma.stockAdjustment.deleteMany({ where: { is_legacy_import: true } })
  await prisma.expense.deleteMany({ where: { is_legacy_import: true } })
  await prisma.legacyIdMap.deleteMany()
  await prisma.migrationBatch.deleteMany()
}

describe('Phase 4A: Legacy Migration Engine and Dry-Run Validation', () => {
  let initialStockMap = {}
  let testBatchId = null

  beforeAll(async () => {
    await cleanMigrationRecords()

    // Record baseline stock balances for all products to verify invariance
    const products = await prisma.product.findMany()
    for (const p of products) {
      initialStockMap[p.id] = p.quantity.toString()
    }
  })

  afterAll(async () => {
    await cleanMigrationRecords()
  })

  describe('1. Dry-Run Validation Pass (Zero Database Mutation Guarantee)', () => {
    it('should validate dataset and return passed status with expected record counts', async () => {
      const report = await runDryRun()

      expect(report.status).toBe('PASSED')
      expect(report.safe_to_execute).toBe(true)
      expect(report.metadata.source_file).toBe('POS_Complete_Export_v4.xlsx')
      expect(report.metadata.source_sha256).toBe('b392557f09df3dd191aed9f178f89722d10a44b43294949c670e53f24bac03a4')

      // Record counts matching verified legacy audit
      expect(report.counts.sales.valid).toBe(3)
      expect(report.counts.sales.items).toBe(19)
      expect(report.counts.purchases.valid).toBe(4)
      expect(report.counts.purchases.items).toBe(4)
      expect(report.counts.purchases.orphans).toBe(4)
      expect(report.counts.adjustments.valid).toBe(5)
      expect(report.counts.adjustments.items).toBe(5)
      expect(report.counts.adjustments.orphans).toBe(5)
      expect(report.counts.expenses.valid).toBe(1)
    })

    it('should strictly assert zero inventory, accounting, or loyalty impact in dry-run report', async () => {
      const report = await runDryRun()

      expect(report.inventory_impact.product_quantity_mutations).toBe(0)
      expect(report.inventory_impact.inventory_logs_created).toBe(0)
      expect(report.inventory_impact.customer_loyalty_points_awarded).toBe(0)
      expect(report.inventory_impact.synthetic_payments_created).toBe(0)
    })

    it('should accurately detect and catalog all 9 orphan items and category fallbacks', async () => {
      const report = await runDryRun()

      expect(report.issues.length).toBe(10) // 4 purchase orphans + 5 adjustment orphans + 1 category fallback

      const orphanPurchases = report.issues.filter(
        (i) => i.entity_type === 'PurchaseItem' && i.issue_code === 'ORPHAN_CHILD'
      )
      expect(orphanPurchases.length).toBe(4)

      const orphanAdjustments = report.issues.filter(
        (i) => i.entity_type === 'StockAdjustmentItem' && i.issue_code === 'ORPHAN_CHILD'
      )
      expect(orphanAdjustments.length).toBe(5)

      const categoryFallback = report.issues.find(
        (i) => i.entity_type === 'Expense' && i.issue_code === 'CATEGORY_FALLBACK'
      )
      expect(categoryFallback).toBeDefined()
    })

    it('should guarantee that dry-run leaves ZERO database mutations in PostgreSQL', async () => {
      const [batches, issues, legacySales, legacyPurchases, legacyAdjustments, legacyExpenses] = await Promise.all([
        prisma.migrationBatch.count(),
        prisma.migrationIssue.count(),
        prisma.sale.count({ where: { is_legacy_import: true } }),
        prisma.purchase.count({ where: { is_legacy_import: true } }),
        prisma.stockAdjustment.count({ where: { is_legacy_import: true } }),
        prisma.expense.count({ where: { is_legacy_import: true } }),
      ])

      expect(batches).toBe(0)
      expect(issues).toBe(0)
      expect(legacySales).toBe(0)
      expect(legacyPurchases).toBe(0)
      expect(legacyAdjustments).toBe(0)
      expect(legacyExpenses).toBe(0)
    })
  })

  describe('2. Data Transformation, Precision & Financial Reconciliation', () => {
    it('should deduplicate embedded items and flattened items correctly (19 distinct items, not 24)', async () => {
      const dataset = loadDataset()
      expect(dataset.sales.length).toBe(3)
      const embeddedItemCount = dataset.sales.reduce((sum, s) => sum + s.items.length, 0)
      expect(embeddedItemCount).toBe(19)

      // The 5 flattened sale items must be an exact subset of the embedded items
      const embeddedItemIds = new Set(dataset.sales.flatMap((s) => s.items.map((i) => i.legacy_id)))
      for (const flatItem of dataset.flattened_sale_items) {
        expect(embeddedItemIds.has(flatItem.legacy_id)).toBe(true)
      }
    })

    it('should accurately handle fractional quantities and exact decimal currency values', async () => {
      const dataset = loadDataset()
      const sale20815 = dataset.sales.find((s) => s.legacy_id === 20815)
      expect(sale20815).toBeDefined()

      // Salt fractional line item: 1.733 kg @ 50.00 = 86.65
      const fractionalItem = sale20815.items.find((i) => i.legacy_id === 176662)
      expect(fractionalItem).toBeDefined()
      expect(fractionalItem.quantity).toBe(1.733)
      expect(fractionalItem.unit_price).toBe(50.00)
      expect(fractionalItem.total).toBe(86.65)

      // Exact Decimal math check
      const computedTotal = new Decimal(fractionalItem.quantity).times(fractionalItem.unit_price)
      expect(computedTotal.toNumber()).toBe(86.65)
    })

    it('should correctly reconcile financial sums across all audited domains', async () => {
      const dataset = loadDataset()

      // Sales Grand Total Sum: 2500.00 + 3086.65 + 2000.00 = 7586.65
      const salesGrandTotal = dataset.sales.reduce((sum, s) => sum.plus(s.grand_total), new Decimal(0))
      expect(salesGrandTotal.toNumber()).toBe(7586.65)

      // Purchases Grand Total Sum: 4 * 1912500.00 = 7650000.00
      const purchasesGrandTotal = dataset.purchases.reduce((sum, p) => sum.plus(p.grand_total), new Decimal(0))
      expect(purchasesGrandTotal.toNumber()).toBe(7650000.00)

      // Expenses Total: 10000.00
      expect(dataset.expenses[0].amount).toBe(10000.00)
    })

    it('should correctly normalize unit spellings (DEC-005)', () => {
      expect(normalizeUnit('peice')).toBe('pcs')
      expect(normalizeUnit('piece')).toBe('pcs')
      expect(normalizeUnit('pcs')).toBe('pcs')
      expect(normalizeUnit('kg')).toBe('kg')
      expect(normalizeUnit('box')).toBe('box')
    })

    it('should flag unmapped product references without auto-creating placeholder products (DEC-002)', async () => {
      const { product, matchedBy } = await resolveProduct(999999, 'Non-Existent Legacy Biscuit', prisma)
      expect(product).toBeNull()
      expect(matchedBy).toBeNull()
    })
  })

  describe('3. Staged Batch Execution & Invariance Enforcement', () => {
    let initialInventoryLogCount = 0

    beforeAll(async () => {
      initialInventoryLogCount = await prisma.inventoryLog.count()
    })

    it('should execute a full migration batch cleanly', async () => {
      const execResult = await executeMigration({
        notes: 'Integration test migration batch',
      })

      expect(execResult.status).toBe('COMPLETED')
      expect(execResult.success_count).toBe(13) // 3 sales + 4 purchases + 5 adjustments + 1 expense
      expect(execResult.error_count).toBe(0)
      expect(execResult.batch.id).toBeDefined()

      testBatchId = execResult.batch.id
    })

    it('should verify authoritative Product.quantity balances did NOT mutate during migration', async () => {
      const currentProducts = await prisma.product.findMany()
      for (const p of currentProducts) {
        expect(p.quantity.toString()).toBe(initialStockMap[p.id])
      }
    })

    it('should verify ZERO InventoryLog entries were created during migration', async () => {
      const currentLogCount = await prisma.inventoryLog.count()
      expect(currentLogCount).toBe(initialInventoryLogCount)
    })

    it('should verify imported Sales have is_legacy_import = true, correct sale_date, and zero loyalty points', async () => {
      const importedSales = await prisma.sale.findMany({
        where: { is_legacy_import: true },
        include: { sale_items: true, payments: true },
      })

      expect(importedSales.length).toBe(3)
      for (const sale of importedSales) {
        expect(sale.is_legacy_import).toBe(true)
        expect(sale.loyalty_points_earned).toBe(0)
        expect(sale.sale_date).not.toBeNull()
        expect(sale.sale_date.getFullYear()).toBe(2026)
        expect(sale.transaction_id.startsWith('LEGACY-')).toBe(true)
        expect(sale.payments.length).toBe(0) // RISK-04 / DEC-009: zero synthetic payment rows
      }

      const totalItems = importedSales.reduce((sum, s) => sum + s.sale_items.length, 0)
      expect(totalItems).toBe(19)
    })

    it('should verify imported Purchases have is_legacy_import = true, purchase_date, and status RECEIVED', async () => {
      const importedPurchases = await prisma.purchase.findMany({
        where: { is_legacy_import: true },
        include: { items: true },
      })

      expect(importedPurchases.length).toBe(4)
      for (const purchase of importedPurchases) {
        expect(purchase.is_legacy_import).toBe(true)
        expect(purchase.status).toBe('RECEIVED')
        expect(purchase.purchase_date).not.toBeNull()
        expect(purchase.purchase_date.getFullYear()).toBe(2024)
        expect(purchase.purchase_number.startsWith('LEGACY-')).toBe(true)
      }
    })

    it('should verify imported StockAdjustments have is_legacy_import = true and correct items', async () => {
      const importedAdjustments = await prisma.stockAdjustment.findMany({
        where: { is_legacy_import: true },
        include: { items: true },
      })

      expect(importedAdjustments.length).toBe(5)
      for (const adj of importedAdjustments) {
        expect(adj.is_legacy_import).toBe(true)
        expect(adj.items.length).toBe(1)
        expect(adj.items[0].method_type).toBe(1) // DEC-004: preserved raw integer code
      }
    })

    it('should verify orphan purchase and adjustment items are captured in MigrationIssue', async () => {
      const issues = await prisma.migrationIssue.findMany({
        where: { batch_id: testBatchId },
      })

      expect(issues.length).toBeGreaterThanOrEqual(9)
      const orphanIssues = issues.filter((i) => i.issue_code === 'ORPHAN_CHILD')
      expect(orphanIssues.length).toBe(9) // 4 purchase + 5 adjustment orphans
    })

    it('should verify LegacyIdMap contains mappings for headers and line items', async () => {
      const maps = await prisma.legacyIdMap.findMany({
        where: { batch_id: testBatchId },
      })

      expect(maps.length).toBeGreaterThan(0)
      const entityTypes = [...new Set(maps.map((m) => m.entity_type))]
      expect(entityTypes).toContain('Sale')
      expect(entityTypes).toContain('SaleItem')
      expect(entityTypes).toContain('Purchase')
      expect(entityTypes).toContain('PurchaseItem')
      expect(entityTypes).toContain('StockAdjustment')
      expect(entityTypes).toContain('StockAdjustmentItem')
      expect(entityTypes).toContain('Expense')
    })
  })

  describe('4. Idempotency & Duplicate Protection', () => {
    it('should safely skip already imported records when executeMigration is re-run', async () => {
      const secondRun = await executeMigration({
        notes: 'Idempotency test run',
      })

      expect(secondRun.status).toBe('COMPLETED')
      // All items skipped as duplicates
      expect(secondRun.success_count).toBe(13)
      expect(secondRun.error_count).toBe(0)

      // Total legacy sales count must remain 3
      const saleCount = await prisma.sale.count({ where: { is_legacy_import: true } })
      expect(saleCount).toBe(3)

      // Clean up second batch record
      await prisma.migrationBatch.delete({ where: { id: secondRun.batch.id } })
    })
  })

  describe('5. Batch Rollback Mechanics', () => {
    it('should cleanly roll back the migration batch and delete imported records', async () => {
      const rollbackResult = await rollbackBatch(testBatchId)

      expect(rollbackResult.status).toBe('ROLLED_BACK')
      expect(rollbackResult.deleted.sales).toBe(3)
      expect(rollbackResult.deleted.purchases).toBe(4)
      expect(rollbackResult.deleted.adjustments).toBe(5)
      expect(rollbackResult.deleted.expenses).toBe(1)
      expect(rollbackResult.deleted.legacy_maps).toBeGreaterThan(0)

      // Verify batch status updated
      const batch = await prisma.migrationBatch.findUnique({ where: { id: testBatchId } })
      expect(batch.status).toBe('ROLLED_BACK')
      expect(batch.rollback_at).not.toBeNull()

      // Verify zero legacy records remain in operational tables
      const [salesRemaining, purchasesRemaining, adjsRemaining, expsRemaining, mapsRemaining] = await Promise.all([
        prisma.sale.count({ where: { is_legacy_import: true } }),
        prisma.purchase.count({ where: { is_legacy_import: true } }),
        prisma.stockAdjustment.count({ where: { is_legacy_import: true } }),
        prisma.expense.count({ where: { is_legacy_import: true } }),
        prisma.legacyIdMap.count({ where: { batch_id: testBatchId } }),
      ])

      expect(salesRemaining).toBe(0)
      expect(purchasesRemaining).toBe(0)
      expect(adjsRemaining).toBe(0)
      expect(expsRemaining).toBe(0)
      expect(mapsRemaining).toBe(0)

      testBatchId = null // Cleared
    })

    it('should verify Product.quantity balances remain completely untouched after rollback', async () => {
      const currentProducts = await prisma.product.findMany()
      for (const p of currentProducts) {
        expect(p.quantity.toString()).toBe(initialStockMap[p.id])
      }
    })

    it('should reject attempting to rollback an already rolled back batch', async () => {
      // Find the rolled back batch
      const rolledBackBatch = await prisma.migrationBatch.findFirst({
        where: { status: 'ROLLED_BACK' },
      })

      await expect(rollbackBatch(rolledBackBatch.id)).rejects.toThrow(/already been rolled back/)
    })
  })
})
