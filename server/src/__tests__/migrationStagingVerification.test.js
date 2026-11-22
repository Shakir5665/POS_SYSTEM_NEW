'use strict'

/**
 * NexTill POS — Phase 4A Staging Execution Verification Suite
 *
 * Verifies the 10 Staging Execution Test Scenarios using SYNTHETIC FIXTURES
 * in a disposable database:
 * 1.  First import
 * 2.  Repeated import
 * 3.  Interrupted import and retry
 * 4.  Duplicate legacy IDs
 * 5.  Partial record failure
 * 6.  Rollback
 * 7.  Repeated rollback
 * 8.  Preservation of unrelated records
 * 9.  Zero stock drift
 * 10. Zero synthetic payment creation
 *
 * STRICT REQUIREMENT: The real legacy dataset is NOT executed.
 */

const { Decimal } = require('../utils/money')
const prisma = require('../utils/prismaClient')
const {
  executeMigration,
  rollbackBatch,
} = require('../services/migration/migrationEngine')
const { SOURCE_SYSTEM } = require('../services/migration/entityResolvers')

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

// 100% Synthetic Fixtures
function createSyntheticBatch1() {
  return {
    metadata: {
      source_file: 'synthetic_staging_v1.json',
      source_sha256: 'synthetic-hash-staging-11111111111111111111111111111111',
      provenance: 'SYNTHETIC_FIXTURE',
    },
    sales: [
      {
        legacy_id: 88001,
        reference_code: 'SYNTH-SALE-88001',
        sale_date: '2026-10-01T10:00:00.000Z',
        customer_id: 1,
        warehouse_id: 1,
        grand_total: 150.00,
        paid_amount: 150.00,
        due_amount: 0.00,
        tax_amount: 0.00,
        discount: 0.00,
        status: 1,
        items: [
          { legacy_id: 88101, product_id: 9901, product_name: 'Coca-Cola 500ml', quantity: 3.0, unit: 'pcs', unit_price: 50.00, total: 150.00 }
        ]
      }
    ],
    purchases: [
      {
        legacy_id: 77001,
        reference_code: 'SYNTH-PO-77001',
        purchase_date: '2026-09-15T10:00:00.000Z',
        supplier_id: 3,
        warehouse_id: 1,
        grand_total: 700.00,
        paid_amount: 700.00,
        due_amount: 0.00,
        status: 1,
        items: [
          { legacy_id: 77101, product_id: 9901, product_name: 'Coca-Cola 500ml', quantity: 20.0, unit: 'pcs', unit_price: 35.00, total: 700.00 }
        ]
      }
    ],
    adjustments: [
      {
        legacy_id: 66001,
        adjustment_date: '2026-09-20T08:00:00.000Z',
        warehouse_id: 1,
        reason: 'PHYSICAL_COUNT',
        items: [
          { legacy_id: 66101, product_id: 9901, product_name: 'Coca-Cola 500ml', quantity_change: 2.0, method_type: 1, unit: 'pcs' }
        ]
      }
    ],
    expenses: [
      {
        legacy_id: 55001,
        expense_date: '2026-09-25T00:00:00.000Z',
        category_id: 999,
        category_name: 'office_supplies',
        amount: 250.00,
        notes: 'Synthetic staging expense'
      }
    ]
  }
}

describe('Phase 4A: Staging Execution Verification (Synthetic Fixtures Only)', () => {
  let initialStockMap = {}
  let initialInventoryLogCount = 0
  let initialPaymentCount = 0
  let initialCustomerPaymentCount = 0
  let initialSupplierPaymentCount = 0

  let batch1Id = null

  beforeAll(async () => {
    await cleanMigrationRecords()

    // 1. Snapshot baseline stock balances across all products
    const products = await prisma.product.findMany()
    for (const p of products) {
      initialStockMap[p.id] = p.quantity.toString()
    }

    // 2. Snapshot baseline logs and payment rows
    initialInventoryLogCount = await prisma.inventoryLog.count()
    initialPaymentCount = await prisma.payment.count()
    initialCustomerPaymentCount = await prisma.customerPayment.count()
    initialSupplierPaymentCount = await prisma.supplierPayment.count()
  })

  afterAll(async () => {
    await cleanMigrationRecords()
  })

  // ---------------------------------------------------------------------------
  // 1. First Import
  // ---------------------------------------------------------------------------
  it('Scenario 1: First import cleanly ingests synthetic record groups', async () => {
    const fixture = createSyntheticBatch1()
    const result = await executeMigration({
      sourceData: fixture,
      notes: 'Staging Test: Scenario 1 - First Import',
      approvedCategoryMappings: { office_supplies: 'Miscellaneous' },
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.success_count).toBe(4) // 1 sale + 1 purchase + 1 adj + 1 expense
    expect(result.error_count).toBe(0)
    expect(result.batch.id).toBeDefined()
    batch1Id = result.batch.id

    // Verify operational table insertion
    const [sales, purchases, adjs, exps, maps] = await Promise.all([
      prisma.sale.findMany({ where: { is_legacy_import: true } }),
      prisma.purchase.findMany({ where: { is_legacy_import: true } }),
      prisma.stockAdjustment.findMany({ where: { is_legacy_import: true } }),
      prisma.expense.findMany({ where: { is_legacy_import: true } }),
      prisma.legacyIdMap.findMany({ where: { batch_id: batch1Id } }),
    ])

    expect(sales.length).toBe(1)
    expect(sales[0].transaction_id).toBe('LEGACY-SYNTH-SALE-88001')
    expect(purchases.length).toBe(1)
    expect(purchases[0].purchase_number).toBe('LEGACY-SYNTH-PO-77001')
    expect(adjs.length).toBe(1)
    expect(adjs[0].adjustment_number).toBe('LEGACY-ADJ-66001')
    expect(exps.length).toBe(1)
    expect(exps[0].amount.toNumber()).toBe(250.00)

    // Verify LegacyIdMap contains both headers and child line items
    expect(maps.length).toBe(7) // 4 headers + 3 items
  })

  // ---------------------------------------------------------------------------
  // 2. Repeated Import
  // ---------------------------------------------------------------------------
  it('Scenario 2: Repeated import safely skips all already-imported records (Idempotency)', async () => {
    const fixture = createSyntheticBatch1()
    const result = await executeMigration({
      sourceData: fixture,
      notes: 'Staging Test: Scenario 2 - Repeated Import',
      approvedCategoryMappings: { office_supplies: 'Miscellaneous' },
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.success_count).toBe(4) // 4 skipped duplicates counted as resolved
    expect(result.error_count).toBe(0)

    // Verify operational tables still contain exactly 1 of each record (zero duplicates)
    const [saleCount, purchaseCount, adjCount, expCount] = await Promise.all([
      prisma.sale.count({ where: { is_legacy_import: true } }),
      prisma.purchase.count({ where: { is_legacy_import: true } }),
      prisma.stockAdjustment.count({ where: { is_legacy_import: true } }),
      prisma.expense.count({ where: { is_legacy_import: true } }),
    ])

    expect(saleCount).toBe(1)
    expect(purchaseCount).toBe(1)
    expect(adjCount).toBe(1)
    expect(expCount).toBe(1)

    // Clean up second batch record
    await prisma.migrationBatch.delete({ where: { id: result.batch.id } })
  })

  // ---------------------------------------------------------------------------
  // 3. Interrupted Import and Retry
  // ---------------------------------------------------------------------------
  it('Scenario 3: Interrupted import and retry resumes without duplicates', async () => {
    // 1. Ingest first part of a synthetic batch (Sale 88002)
    const partialBatch = {
      metadata: { source_file: 'interrupted_fixture.json', provenance: 'SYNTHETIC_FIXTURE' },
      sales: [
        {
          legacy_id: 88002,
          reference_code: 'SYNTH-SALE-88002',
          grand_total: 200.00,
          paid_amount: 200.00,
          due_amount: 0.00,
          items: [{ legacy_id: 88102, product_id: 9901, product_name: 'Coca-Cola 500ml', quantity: 4.0, unit: 'pcs', unit_price: 50.00, total: 200.00 }]
        }
      ]
    }

    const firstRun = await executeMigration({
      sourceData: partialBatch,
      notes: 'Interrupted batch stage 1',
    })
    expect(firstRun.status).toBe('COMPLETED')
    expect(firstRun.success_count).toBe(1)

    // 2. Now run full batch containing Sale 88002 AND new Sale 88003 (simulating retry of complete batch)
    const fullBatch = {
      metadata: { source_file: 'interrupted_fixture.json', provenance: 'SYNTHETIC_FIXTURE' },
      sales: [
        partialBatch.sales[0],
        {
          legacy_id: 88003,
          reference_code: 'SYNTH-SALE-88003',
          grand_total: 300.00,
          paid_amount: 300.00,
          due_amount: 0.00,
          items: [{ legacy_id: 88103, product_id: 9901, product_name: 'Coca-Cola 500ml', quantity: 6.0, unit: 'pcs', unit_price: 50.00, total: 300.00 }]
        }
      ]
    }

    const retryRun = await executeMigration({
      sourceData: fullBatch,
      notes: 'Interrupted batch retry stage 2',
    })

    expect(retryRun.status).toBe('COMPLETED')
    expect(retryRun.success_count).toBe(2) // 1 skipped duplicate (88002) + 1 newly imported (88003)

    // Verify exactly 3 legacy sales exist in total (88001 from Scenario 1 + 88002 + 88003)
    const totalLegacySales = await prisma.sale.count({ where: { is_legacy_import: true } })
    expect(totalLegacySales).toBe(3)

    // Clean up temporary retry batches
    await rollbackBatch(firstRun.batch.id)
    await rollbackBatch(retryRun.batch.id)
  })

  // ---------------------------------------------------------------------------
  // 4. Duplicate Legacy IDs
  // ---------------------------------------------------------------------------
  it('Scenario 4: Duplicate legacy IDs within the same dataset are deduplicated safely', async () => {
    const duplicateIdFixture = {
      metadata: { source_file: 'duplicate_ids.json', provenance: 'SYNTHETIC_FIXTURE' },
      sales: [
        {
          legacy_id: 88004,
          reference_code: 'SYNTH-SALE-88004-A',
          grand_total: 100.00,
          paid_amount: 100.00,
          items: [{ legacy_id: 88104, product_id: 9901, product_name: 'Coca-Cola 500ml', quantity: 2, unit: 'pcs', unit_price: 50, total: 100 }]
        },
        {
          legacy_id: 88004, // Same legacy_id repeated
          reference_code: 'SYNTH-SALE-88004-B',
          grand_total: 100.00,
          paid_amount: 100.00,
          items: [{ legacy_id: 88105, product_id: 9901, product_name: 'Coca-Cola 500ml', quantity: 2, unit: 'pcs', unit_price: 50, total: 100 }]
        }
      ]
    }

    const result = await executeMigration({
      sourceData: duplicateIdFixture,
      notes: 'Testing duplicate legacy ID handling',
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.success_count).toBe(2) // 1 imported, 1 skipped duplicate
    expect(result.error_count).toBe(0)

    // Only 1 sale with legacy_id 88004 exists in DB
    const matchingMaps = await prisma.legacyIdMap.findMany({
      where: { entity_type: 'Sale', legacy_id: '88004' },
    })
    expect(matchingMaps.length).toBe(1)

    await rollbackBatch(result.batch.id)
  })

  // ---------------------------------------------------------------------------
  // 5. Partial Record Failure
  // ---------------------------------------------------------------------------
  it('Scenario 5: Partial record failure isolates errors and marks batch PARTIAL', async () => {
    const partialFailureFixture = {
      metadata: { source_file: 'partial_fail.json', provenance: 'SYNTHETIC_FIXTURE' },
      sales: [
        {
          legacy_id: 88005,
          reference_code: 'SYNTH-SALE-88005',
          grand_total: 120.00,
          paid_amount: 120.00,
          items: [{ legacy_id: 88106, product_id: 9901, product_name: 'Coca-Cola 500ml', quantity: 2, unit: 'pcs', unit_price: 60, total: 120 }]
        }
      ],
      purchases: [
        {
          legacy_id: 77005,
          reference_code: 'SYNTH-PO-77005',
          supplier_id: null, // Will fail validation if supplier cannot resolve
          grand_total: -500.00, // Invalid negative or broken structure
          // Deliberate failure trigger
          items: [
            { legacy_id: 77105, product_id: null, quantity: 'INVALID_QUANTITY', unit_price: 10 }
          ]
        }
      ]
    }

    const result = await executeMigration({
      sourceData: partialFailureFixture,
      notes: 'Testing partial record failure isolation',
    })

    expect(result.status).toBe('PARTIAL')
    expect(result.success_count).toBe(1) // Sale 88005 succeeded
    expect(result.error_count).toBe(1) // Purchase 77005 failed
    expect(result.issue_count).toBeGreaterThanOrEqual(1)

    // Verify valid sale exists
    const validSale = await prisma.sale.findFirst({
      where: { transaction_id: 'LEGACY-SYNTH-SALE-88005' }
    })
    expect(validSale).not.toBeNull()

    // Verify invalid purchase does not exist
    const invalidPurchase = await prisma.purchase.findFirst({
      where: { purchase_number: 'LEGACY-SYNTH-PO-77005' }
    })
    expect(invalidPurchase).toBeNull()

    await rollbackBatch(result.batch.id)
  })

  // ---------------------------------------------------------------------------
  // 6. Rollback
  // ---------------------------------------------------------------------------
  it('Scenario 6: Rollback cleans all records owned by the batch from operational tables', async () => {
    // We roll back batch1Id from Scenario 1
    const rollbackResult = await rollbackBatch(batch1Id)

    expect(rollbackResult.status).toBe('ROLLED_BACK')
    expect(rollbackResult.deleted.sales).toBe(1)
    expect(rollbackResult.deleted.purchases).toBe(1)
    expect(rollbackResult.deleted.adjustments).toBe(1)
    expect(rollbackResult.deleted.expenses).toBe(1)
    expect(rollbackResult.deleted.legacy_maps).toBe(7)

    // Check batch status
    const batch = await prisma.migrationBatch.findUnique({ where: { id: batch1Id } })
    expect(batch.status).toBe('ROLLED_BACK')
    expect(batch.rollback_at).not.toBeNull()

    // Check zero legacy records remaining
    const [salesRem, purchasesRem, adjsRem, expsRem, mapsRem] = await Promise.all([
      prisma.sale.count({ where: { is_legacy_import: true } }),
      prisma.purchase.count({ where: { is_legacy_import: true } }),
      prisma.stockAdjustment.count({ where: { is_legacy_import: true } }),
      prisma.expense.count({ where: { is_legacy_import: true } }),
      prisma.legacyIdMap.count({ where: { batch_id: batch1Id } }),
    ])

    expect(salesRem).toBe(0)
    expect(purchasesRem).toBe(0)
    expect(adjsRem).toBe(0)
    expect(expsRem).toBe(0)
    expect(mapsRem).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // 7. Repeated Rollback
  // ---------------------------------------------------------------------------
  it('Scenario 7: Repeated rollback is safely rejected without modifying state', async () => {
    await expect(rollbackBatch(batch1Id)).rejects.toThrow(/already been rolled back/)
  })

  // ---------------------------------------------------------------------------
  // 8. Preservation of Unrelated Records
  // ---------------------------------------------------------------------------
  it('Scenario 8: Rollback preserves unrelated operational records', async () => {
    // 1. Create unrelated pre-existing operational records
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    const customer = await prisma.customer.findFirst()
    const warehouse = await prisma.warehouse.findFirst({ where: { is_default: true } })

    const uniqueTxId = `LIVE-NORMAL-POS-${Date.now()}`

    const unrelatedSale = await prisma.sale.create({
      data: {
        transaction_id: uniqueTxId,
        subtotal: 999.00,
        total_amount: 999.00,
        amount_paid: 999.00,
        balance_due: 0.00,
        payment_method: 'CASH',
        payment_status: 'COMPLETED',
        user_id: adminUser.id,
        warehouse_id: warehouse.id,
        customer_id: customer?.id,
        is_legacy_import: false, // Normal operational record
      }
    })

    const miscCategory = await prisma.expenseCategory.findFirst()

    const unrelatedExpense = await prisma.expense.create({
      data: {
        category_id: miscCategory.id,
        amount: 888.00,
        expense_date: new Date(),
        notes: 'Live business expense',
        user_id: adminUser.id,
        is_legacy_import: false, // Normal operational record
      }
    })

    try {
      // 2. Import a synthetic migration batch
      const tempFixture = createSyntheticBatch1()
      const execRes = await executeMigration({
        sourceData: tempFixture,
        notes: 'Batch to test unrelated preservation',
        approvedCategoryMappings: { office_supplies: 'Miscellaneous' },
      })
      expect(execRes.status).toBe('COMPLETED')

      // 3. Rollback the migration batch
      await rollbackBatch(execRes.batch.id)

      // 4. Verify unrelated records are 100% intact!
      const verifiedSale = await prisma.sale.findUnique({ where: { id: unrelatedSale.id } })
      const verifiedExpense = await prisma.expense.findUnique({ where: { id: unrelatedExpense.id } })

      expect(verifiedSale).not.toBeNull()
      expect(verifiedSale.transaction_id).toBe(uniqueTxId)
      expect(verifiedExpense).not.toBeNull()
      expect(verifiedExpense.amount.toNumber()).toBe(888.00)
    } finally {
      // Clean up unrelated test records
      await prisma.sale.deleteMany({ where: { id: unrelatedSale.id } })
      await prisma.expense.deleteMany({ where: { id: unrelatedExpense.id } })
    }
  })

  // ---------------------------------------------------------------------------
  // 9. Zero Stock Drift
  // ---------------------------------------------------------------------------
  it('Scenario 9: Authoritative Product.quantity and InventoryLogs have strictly ZERO drift', async () => {
    // Verify product quantities are identical to baseline
    const currentProducts = await prisma.product.findMany()
    for (const p of currentProducts) {
      expect(p.quantity.toString()).toBe(initialStockMap[p.id])
    }

    // Verify inventory log count is unchanged
    const currentLogCount = await prisma.inventoryLog.count()
    expect(currentLogCount).toBe(initialInventoryLogCount)
  })

  // ---------------------------------------------------------------------------
  // 10. Zero Synthetic Payment Creation
  // ---------------------------------------------------------------------------
  it('Scenario 10: Strictly ZERO synthetic Payment or allocation rows created', async () => {
    const [currentPayments, currentCustPayments, currentSuppPayments] = await Promise.all([
      prisma.payment.count(),
      prisma.customerPayment.count(),
      prisma.supplierPayment.count(),
    ])

    expect(currentPayments).toBe(initialPaymentCount)
    expect(currentCustPayments).toBe(initialCustomerPaymentCount)
    expect(currentSuppPayments).toBe(initialSupplierPaymentCount)
  })
})
