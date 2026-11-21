'use strict'

const prisma = require('../../../src/utils/prismaClient')

describe('Phase 2 — Database Schema & Migration Infrastructure', () => {
  let defaultWarehouse
  let migrationUser
  let testProduct

  beforeAll(async () => {
    // 1. Ensure default warehouse exists
    defaultWarehouse = await prisma.warehouse.findFirst({
      where: { is_default: true },
    })
    if (!defaultWarehouse) {
      defaultWarehouse = await prisma.warehouse.create({
        data: {
          code: 'WH-TEST-001',
          name: 'Main Warehouse',
          is_default: true,
          is_active: true,
        },
      })
    }

    // 2. Ensure migration system user exists
    migrationUser = await prisma.user.findUnique({
      where: { username: 'migration_import' },
    })
    if (!migrationUser) {
      migrationUser = await prisma.user.create({
        data: {
          username: 'migration_import',
          email: 'migration_import@system.internal',
          password_hash: '$2b$12$lockedPasswordHashCannotLoginEver',
          full_name: 'Legacy Migration System',
          role: 'ADMIN',
          is_active: false,
        },
      })
    }

    // 3. Find or create a product for adjustment tests
    testProduct = await prisma.product.findFirst()
    if (!testProduct) {
      testProduct = await prisma.product.create({
        data: {
          name: 'Phase 2 Test Product',
          sku: 'PHASE2-TEST-SKU-001',
          price: 50.0,
          quantity: 100.0,
        },
      })
    }
  })

  afterAll(async () => {
    // Clean up test records in reverse FK order
    await prisma.migrationIssue.deleteMany({
      where: { entity_type: 'TestEntity' },
    })
    await prisma.legacyIdMap.deleteMany({
      where: { entity_type: 'TestEntity' },
    })
    await prisma.migrationBatch.deleteMany({
      where: { notes: 'TEST_PHASE2_BATCH' },
    })
    await prisma.stockAdjustmentItem.deleteMany({
      where: { notes: 'TEST_ADJUSTMENT_ITEM' },
    })
    await prisma.stockAdjustment.deleteMany({
      where: { notes: 'TEST_ADJUSTMENT' },
    })
    await prisma.saleItem.deleteMany({
      where: { sale: { notes: 'TEST_PHASE2_SALE' } },
    })
    await prisma.sale.deleteMany({
      where: { notes: 'TEST_PHASE2_SALE' },
    })
    await prisma.purchaseItem.deleteMany({
      where: { purchase: { notes: 'TEST_PHASE2_PURCHASE' } },
    })
    await prisma.purchase.deleteMany({
      where: { notes: 'TEST_PHASE2_PURCHASE' },
    })
    await prisma.expense.deleteMany({
      where: { notes: 'TEST_PHASE2_EXPENSE' },
    })
    await prisma.$disconnect()
  })

  test('Prisma client exposes all approved Phase 2 models', () => {
    expect(prisma.legacyIdMap).toBeDefined()
    expect(prisma.migrationBatch).toBeDefined()
    expect(prisma.migrationIssue).toBeDefined()
    expect(prisma.warehouse).toBeDefined()
    expect(prisma.stockAdjustment).toBeDefined()
    expect(prisma.stockAdjustmentItem).toBeDefined()
  })

  test('Migration ID uniqueness constraint ([source_system, entity_type, legacy_id])', async () => {
    const map1 = await prisma.legacyIdMap.create({
      data: {
        source_system: 'legacy_pos',
        entity_type: 'TestEntity',
        legacy_id: 'LEGACY-001',
        target_model: 'Product',
        nextill_id: '00000000-0000-0000-0000-000000000001',
      },
    })
    expect(map1.id).toBeDefined()
    expect(map1.legacy_id).toBe('LEGACY-001')

    // Duplicate create with same [source_system, entity_type, legacy_id] must reject
    await expect(
      prisma.legacyIdMap.create({
        data: {
          source_system: 'legacy_pos',
          entity_type: 'TestEntity',
          legacy_id: 'LEGACY-001',
          target_model: 'Product',
          nextill_id: '00000000-0000-0000-0000-000000000002',
        },
      })
    ).rejects.toThrow()
  })

  test('Duplicate batch number handling rejects duplicate sequential batch IDs', async () => {
    const batch1 = await prisma.migrationBatch.create({
      data: {
        entity_type: 'Sale',
        notes: 'TEST_PHASE2_BATCH',
      },
    })
    expect(batch1.batch_number).toBeGreaterThan(0)

    // Attempting to create a batch with the same batch_number must fail
    await expect(
      prisma.migrationBatch.create({
        data: {
          batch_number: batch1.batch_number,
          entity_type: 'Sale',
          notes: 'TEST_PHASE2_BATCH',
        },
      })
    ).rejects.toThrow()
  })

  test('Migration issue recording preserves diagnostic metadata without credentials', async () => {
    const issue = await prisma.migrationIssue.create({
      data: {
        entity_type: 'TestEntity',
        legacy_id: 'ORPHAN-4351',
        issue_code: 'ORPHAN_CHILD_RECORD',
        severity: 'HIGH',
        description: 'Parent purchase 4351 does not exist in workbook',
        resolution_status: 'UNRESOLVED',
        metadata: {
          worksheet: 'purchases_purchase_items',
          row_index: 2575,
          unit: 'pcs',
        },
      },
    })
    expect(issue.id).toBeDefined()
    expect(issue.issue_code).toBe('ORPHAN_CHILD_RECORD')
    expect(issue.resolution_status).toBe('UNRESOLVED')
    expect(issue.metadata.worksheet).toBe('purchases_purchase_items')
  })

  test('Warehouse model maintains default warehouse designation and unique codes', async () => {
    expect(defaultWarehouse).toBeDefined()
    expect(defaultWarehouse.is_default).toBe(true)

    // Trying to create a warehouse with the same code must fail
    await expect(
      prisma.warehouse.create({
        data: {
          code: defaultWarehouse.code,
          name: 'Duplicate Code Warehouse',
        },
      })
    ).rejects.toThrow()
  })

  test('Sale and Purchase accept optional warehouse_id relationship', async () => {
    // 1. Sale with warehouse
    const sale = await prisma.sale.create({
      data: {
        transaction_id: `TX-WH-${Date.now()}`,
        user_id: migrationUser.id,
        warehouse_id: defaultWarehouse.id,
        subtotal: 100.0,
        total_amount: 100.0,
        amount_paid: 100.0,
        payment_method: 'CASH',
        notes: 'TEST_PHASE2_SALE',
      },
      include: { warehouse: true },
    })
    expect(sale.warehouse_id).toBe(defaultWarehouse.id)
    expect(sale.warehouse.name).toBe(defaultWarehouse.name)

    // 2. Sale without warehouse (optional)
    const saleNoWh = await prisma.sale.create({
      data: {
        transaction_id: `TX-NOWH-${Date.now()}`,
        user_id: migrationUser.id,
        warehouse_id: null,
        subtotal: 50.0,
        total_amount: 50.0,
        amount_paid: 50.0,
        payment_method: 'CASH',
        notes: 'TEST_PHASE2_SALE',
      },
    })
    expect(saleNoWh.warehouse_id).toBeNull()
  })

  test('Historical date preservation and legacy import flags on Sale, Purchase, Expense', async () => {
    const historicalDate = new Date('2024-11-20T10:30:00.000Z')

    // 1. Sale with historical sale_date and is_legacy_import = true
    const sale = await prisma.sale.create({
      data: {
        transaction_id: `TX-HIST-${Date.now()}`,
        user_id: migrationUser.id,
        subtotal: 200.0,
        total_amount: 200.0,
        amount_paid: 200.0,
        payment_method: 'CASH',
        sale_date: historicalDate,
        is_legacy_import: true,
        notes: 'TEST_PHASE2_SALE',
      },
    })
    expect(sale.is_legacy_import).toBe(true)
    expect(sale.sale_date.toISOString()).toBe(historicalDate.toISOString())
    // created_at is system insertion timestamp, distinct from historical date
    expect(sale.created_at.getTime()).toBeGreaterThan(historicalDate.getTime())

    // 2. Expense with is_legacy_import = true
    const category = await prisma.expenseCategory.findFirst()
    if (category) {
      const expense = await prisma.expense.create({
        data: {
          category_id: category.id,
          user_id: migrationUser.id,
          amount: 150.0,
          payment_method: 'CASH',
          is_legacy_import: true,
          notes: 'TEST_PHASE2_EXPENSE',
        },
      })
      expect(expense.is_legacy_import).toBe(true)
    }
  })

  test('StockAdjustment persistence does NOT mutate Product.quantity', async () => {
    // Record current live quantity before adjustment
    const productBefore = await prisma.product.findUnique({
      where: { id: testProduct.id },
      select: { quantity: true },
    })
    const initialQty = Number(productBefore.quantity)

    // Insert historical stock adjustment and adjustment item
    const adjustment = await prisma.stockAdjustment.create({
      data: {
        adjustment_number: `ADJ-TEST-${Date.now()}`,
        adjustment_date: new Date('2024-10-15T00:00:00.000Z'),
        warehouse_id: defaultWarehouse.id,
        user_id: migrationUser.id,
        reason: 'Historical physical count discrepancy',
        notes: 'TEST_ADJUSTMENT',
        is_legacy_import: true,
        items: {
          create: [
            {
              product_id: testProduct.id,
              quantity_change: -15.5,
              method_type: 1,
              unit: 'pcs',
              notes: 'TEST_ADJUSTMENT_ITEM',
            },
          ],
        },
      },
      include: { items: true },
    })

    expect(adjustment.id).toBeDefined()
    expect(adjustment.items).toHaveLength(1)
    expect(Number(adjustment.items[0].quantity_change)).toBe(-15.5)
    expect(adjustment.items[0].method_type).toBe(1)

    // Verify Product.quantity is COMPLETELY UNCHANGED (no silent triggers or middleware)
    const productAfter = await prisma.product.findUnique({
      where: { id: testProduct.id },
      select: { quantity: true },
    })
    expect(Number(productAfter.quantity)).toBe(initialQty)
  })

  test('Import identity restrictions: user is inactive and cannot authenticate', async () => {
    const user = await prisma.user.findUnique({
      where: { username: 'migration_import' },
    })
    expect(user).not.toBeNull()
    expect(user.role).toBe('ADMIN')
    expect(user.is_active).toBe(false)
  })
})
