require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(60000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')
const stockAdjustmentService = require('../services/stockAdjustmentService')

describe('Phase 3B: Transactional Stock Adjustment & Inventory Safety', () => {
  let adminToken
  let managerToken
  let cashierToken
  let adminUser
  let managerUser
  let cashierUser
  let defaultWarehouse
  let secondaryWarehouse
  let inactiveWarehouse
  let testCategory
  let testProduct1
  let testProduct2
  let inactiveProduct
  let testSupplier

  beforeAll(async () => {
    // 1. Cleanup any stale data
    await prisma.stockAdjustmentItem.deleteMany({})
    await prisma.stockAdjustment.deleteMany({})
    await prisma.inventoryLog.deleteMany({ where: { notes: { contains: 'Adjustment' } } })
    await prisma.inventoryLog.deleteMany({ where: { notes: { contains: 'Phase 3B' } } })
    await prisma.saleItem.deleteMany({ where: { product_name: { in: ['Phase 3B Item 1', 'Phase 3B Item 2'] } } })
    await prisma.purchaseItem.deleteMany({ where: { product_name: { in: ['Phase 3B Item 1', 'Phase 3B Item 2'] } } })
    await prisma.purchase.deleteMany({ where: { notes: { contains: 'Phase 3B' } } })
    await prisma.payment.deleteMany({ where: { reference: { in: ['REF-PHASE3B-SALE', 'REF-PHASE3B-REFUND'] } } })
    await prisma.sale.deleteMany({ where: { notes: { contains: 'Phase 3B' } } })
    await prisma.inventoryLog.deleteMany({ where: { product: { sku: { in: ['SKU-3B-01', 'SKU-3B-02', 'SKU-3B-INACT'] } } } })
    await prisma.product.deleteMany({ where: { sku: { in: ['SKU-3B-01', 'SKU-3B-02', 'SKU-3B-INACT'] } } })
    await prisma.category.deleteMany({ where: { name: 'Category Phase 3B' } })
    await prisma.warehouse.deleteMany({ where: { code: { in: ['WH-3B-SEC', 'WH-3B-INACT'] } } })
    await prisma.supplier.deleteMany({ where: { name: 'Supplier Phase 3B' } })
    await prisma.authLog.deleteMany({ where: { user: { username: { in: ['adj_admin_3b', 'adj_manager_3b', 'adj_cashier_3b'] } } } })
    await prisma.user.deleteMany({ where: { username: { in: ['adj_admin_3b', 'adj_manager_3b', 'adj_cashier_3b'] } } })

    // 2. Ensure default warehouse
    defaultWarehouse = await prisma.warehouse.findFirst({ where: { is_default: true } })
    if (!defaultWarehouse) {
      defaultWarehouse = await prisma.warehouse.create({
        data: {
          code: 'WH-MAIN-001',
          name: 'Main Warehouse',
          is_default: true,
          is_active: true,
        },
      })
    }

    // 3. Create secondary and inactive warehouses
    secondaryWarehouse = await prisma.warehouse.create({
      data: {
        code: 'WH-3B-SEC',
        name: 'Secondary Warehouse 3B',
        is_default: false,
        is_active: true,
      },
    })

    inactiveWarehouse = await prisma.warehouse.create({
      data: {
        code: 'WH-3B-INACT',
        name: 'Inactive Warehouse 3B',
        is_default: false,
        is_active: false,
      },
    })

    // 4. Create users (Admin, Manager, Cashier)
    const hash = await bcrypt.hash('testpass123', 12)
    adminUser = await prisma.user.create({
      data: {
        username: 'adj_admin_3b',
        email: 'adj_admin_3b@test.com',
        password_hash: hash,
        full_name: 'Adjustment Admin',
        role: 'ADMIN',
      },
    })
    managerUser = await prisma.user.create({
      data: {
        username: 'adj_manager_3b',
        email: 'adj_manager_3b@test.com',
        password_hash: hash,
        full_name: 'Adjustment Manager',
        role: 'MANAGER',
      },
    })
    cashierUser = await prisma.user.create({
      data: {
        username: 'adj_cashier_3b',
        email: 'adj_cashier_3b@test.com',
        password_hash: hash,
        full_name: 'Adjustment Cashier',
        role: 'CASHIER',
      },
    })

    // 5. Login tokens
    const aLogin = await request(app).post('/api/auth/login').send({ username: 'adj_admin_3b', password: 'testpass123' })
    adminToken = aLogin.body.data.accessToken

    const mLogin = await request(app).post('/api/auth/login').send({ username: 'adj_manager_3b', password: 'testpass123' })
    managerToken = mLogin.body.data.accessToken

    const cLogin = await request(app).post('/api/auth/login').send({ username: 'adj_cashier_3b', password: 'testpass123' })
    cashierToken = cLogin.body.data.accessToken

    // 6. Test Category, Products, and Supplier
    testCategory = await prisma.category.create({
      data: { name: 'Category Phase 3B' },
    })

    testProduct1 = await prisma.product.create({
      data: {
        name: 'Phase 3B Item 1',
        sku: 'SKU-3B-01',
        category_id: testCategory.id,
        price: 100,
        cost_price: 60,
        quantity: 50.0, // initial stock 50 pcs
        base_unit: 'pcs',
        pricing_unit: 'pcs',
        unit_category: 'COUNT',
      },
    })

    testProduct2 = await prisma.product.create({
      data: {
        name: 'Phase 3B Item 2 (Weight)',
        sku: 'SKU-3B-02',
        category_id: testCategory.id,
        price: 200,
        cost_price: 120,
        quantity: 10.5, // initial stock 10.500 kg
        base_unit: 'kg',
        pricing_unit: 'kg',
        unit_category: 'WEIGHT',
      },
    })

    inactiveProduct = await prisma.product.create({
      data: {
        name: 'Phase 3B Inactive Item',
        sku: 'SKU-3B-INACT',
        category_id: testCategory.id,
        price: 50,
        cost_price: 30,
        quantity: 5,
        is_active: false,
        base_unit: 'pcs',
        pricing_unit: 'pcs',
        unit_category: 'COUNT',
      },
    })

    testSupplier = await prisma.supplier.create({
      data: {
        name: 'Supplier Phase 3B',
        contact_person: 'Supplier Contact',
        phone: '0779999999',
      },
    })
  })

  afterAll(async () => {
    // Cleanup
    await prisma.stockAdjustmentItem.deleteMany({})
    await prisma.stockAdjustment.deleteMany({})
    await prisma.inventoryLog.deleteMany({ where: { notes: { contains: 'Adjustment' } } })
    await prisma.inventoryLog.deleteMany({ where: { notes: { contains: 'Phase 3B' } } })
    await prisma.saleItem.deleteMany({ where: { product_name: { in: ['Phase 3B Item 1', 'Phase 3B Item 2'] } } })
    await prisma.purchaseItem.deleteMany({ where: { product_name: { in: ['Phase 3B Item 1', 'Phase 3B Item 2'] } } })
    await prisma.purchase.deleteMany({ where: { notes: { contains: 'Phase 3B' } } })
    await prisma.payment.deleteMany({ where: { reference: { in: ['REF-PHASE3B-SALE', 'REF-PHASE3B-REFUND'] } } })
    await prisma.sale.deleteMany({ where: { notes: { contains: 'Phase 3B' } } })
    await prisma.inventoryLog.deleteMany({ where: { product: { sku: { in: ['SKU-3B-01', 'SKU-3B-02', 'SKU-3B-INACT'] } } } })
    await prisma.product.deleteMany({ where: { sku: { in: ['SKU-3B-01', 'SKU-3B-02', 'SKU-3B-INACT'] } } })
    if (testCategory) await prisma.category.deleteMany({ where: { id: testCategory.id } })
    if (testSupplier) await prisma.supplier.deleteMany({ where: { id: testSupplier.id } })
    await prisma.warehouse.deleteMany({ where: { code: { in: ['WH-3B-SEC', 'WH-3B-INACT'] } } })
    await prisma.authLog.deleteMany({ where: { user: { username: { in: ['adj_admin_3b', 'adj_manager_3b', 'adj_cashier_3b'] } } } })
    await prisma.user.deleteMany({ where: { username: { in: ['adj_admin_3b', 'adj_manager_3b', 'adj_cashier_3b'] } } })
    await prisma.$disconnect()
  })

  describe('1. Positive Stock Adjustment', () => {
    it('should increase Product.quantity and record StockAdjustment and InventoryLog', async () => {
      const initialStock = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)

      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouse_id: defaultWarehouse.id,
          reason: 'FOUND_INVENTORY',
          notes: 'Audit surplus found on shelf',
          items: [
            {
              product_id: testProduct1.id,
              quantity_change: 10,
              unit: 'pcs',
              notes: 'Found in back store',
            },
          ],
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.adjustment_number).toMatch(/^ADJ-\d{8}-\d{4}$/)
      expect(res.body.data.is_legacy_import).toBe(false)
      expect(res.body.data.items).toHaveLength(1)
      expect(Number(res.body.data.items[0].quantity_change)).toBe(10)

      // Verify Product.quantity increased atomically
      const updatedProduct = await prisma.product.findUnique({ where: { id: testProduct1.id } })
      expect(Number(updatedProduct.quantity)).toBe(initialStock + 10)

      // Verify InventoryLog entry
      const log = await prisma.inventoryLog.findFirst({
        where: { product_id: testProduct1.id, notes: { contains: res.body.data.adjustment_number } },
      })
      expect(log).not.toBeNull()
      expect(log.change_type).toBe('RESTOCK')
      expect(Number(log.quantity_change)).toBe(10)
      expect(Number(log.previous_quantity)).toBe(initialStock)
      expect(Number(log.new_quantity)).toBe(initialStock + 10)
      expect(log.user_id).toBe(adminUser.id)
    })
  })

  describe('2. Negative Stock Adjustment', () => {
    it('should decrease Product.quantity and record DAMAGE/WASTE InventoryLog', async () => {
      const initialStock = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)

      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          warehouse_id: secondaryWarehouse.id,
          reason: 'DAMAGE_IN_TRANSIT',
          notes: 'Broken carton',
          items: [
            {
              product_id: testProduct1.id,
              quantity_change: -4,
              unit: 'pcs',
              notes: 'Dropped during unloading',
            },
          ],
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(Number(res.body.data.items[0].quantity_change)).toBe(-4)

      // Verify Product.quantity decreased atomically
      const updatedProduct = await prisma.product.findUnique({ where: { id: testProduct1.id } })
      expect(Number(updatedProduct.quantity)).toBe(initialStock - 4)

      // Verify InventoryLog entry has ADJUSTMENT type
      const log = await prisma.inventoryLog.findFirst({
        where: { product_id: testProduct1.id, notes: { contains: res.body.data.adjustment_number } },
      })
      expect(log).not.toBeNull()
      expect(log.change_type).toBe('ADJUSTMENT')
      expect(Number(log.quantity_change)).toBe(-4)
      expect(Number(log.previous_quantity)).toBe(initialStock)
      expect(Number(log.new_quantity)).toBe(initialStock - 4)
      expect(log.user_id).toBe(managerUser.id)
    })
  })

  describe('3. Insufficient Stock Rejection', () => {
    it('should reject reduction greater than available stock and roll back completely', async () => {
      const initialStock = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      const requestedReduction = -(initialStock + 50)

      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'SHRINKAGE',
          items: [
            {
              product_id: testProduct1.id,
              quantity_change: requestedReduction,
            },
          ],
        })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.error.message).toMatch(/Insufficient stock/)

      // Verify stock was not changed
      const productAfter = await prisma.product.findUnique({ where: { id: testProduct1.id } })
      expect(Number(productAfter.quantity)).toBe(initialStock)

      // Verify no adjustment was recorded
      const count = await prisma.stockAdjustment.count({ where: { notes: 'SHRINKAGE' } })
      expect(count).toBe(0)
    })
  })

  describe('4. Decimal Fractional Quantities', () => {
    it('should accurately handle Decimal fractional quantities in weight unit (kg/g)', async () => {
      const initialStock = Number((await prisma.product.findUnique({ where: { id: testProduct2.id } })).quantity)

      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'SCALE_CALIBRATION_VARIANCE',
          items: [
            {
              product_id: testProduct2.id,
              quantity_change: -0.250, // -250 grams
              unit: 'kg',
            },
          ],
        })

      expect(res.status).toBe(201)
      const updatedProduct = await prisma.product.findUnique({ where: { id: testProduct2.id } })
      expect(Number(updatedProduct.quantity)).toBe(Number((initialStock - 0.250).toFixed(3)))
    })
  })

  describe('5. Invalid Product Validation', () => {
    it('should reject non-existent product UUID with 404 Not Found', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'AUDIT',
          items: [
            {
              product_id: '00000000-0000-0000-0000-000000000000',
              quantity_change: 5,
            },
          ],
        })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })
  })

  describe('6. Inactive Product Validation', () => {
    it('should reject adjustment on an inactive product with 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'AUDIT',
          items: [
            {
              product_id: inactiveProduct.id,
              quantity_change: 2,
            },
          ],
        })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.error.message).toMatch(/inactive/i)
    })
  })

  describe('7. Invalid Warehouse Validation', () => {
    it('should reject non-existent warehouse UUID with 404 Not Found', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouse_id: '00000000-0000-0000-0000-000000000000',
          reason: 'AUDIT',
          items: [{ product_id: testProduct1.id, quantity_change: 1 }],
        })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })
  })

  describe('8. Inactive Warehouse Validation', () => {
    it('should reject adjustment assigned to an inactive warehouse with 422', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouse_id: inactiveWarehouse.id,
          reason: 'AUDIT',
          items: [{ product_id: testProduct1.id, quantity_change: 1 }],
        })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.error.message).toMatch(/inactive/i)
    })
  })

  describe('9. Role-Based Access Control', () => {
    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .send({ reason: 'AUDIT', items: [{ product_id: testProduct1.id, quantity_change: 1 }] })
      expect(res.status).toBe(401)
    })

    it('should reject CASHIER role with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'AUDIT', items: [{ product_id: testProduct1.id, quantity_change: 1 }] })
      expect(res.status).toBe(403)
    })
  })

  describe('10. Idempotency Key Handling & Replay Prevention', () => {
    it('should accept first submission and reject duplicate idempotency_key with 409 Conflict', async () => {
      const idempotencyKey = 'IDEMP-TEST-KEY-001'
      const initialStock = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)

      // First call: succeeds
      const res1 = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          idempotency_key: idempotencyKey,
          reason: 'IDEMPOTENCY_TEST',
          items: [{ product_id: testProduct1.id, quantity_change: 5 }],
        })

      expect(res1.status).toBe(201)
      expect(res1.body.data.adjustment_number).toBe(idempotencyKey)

      const stockAfterFirst = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockAfterFirst).toBe(initialStock + 5)

      // Second call with same idempotency_key: rejected with 409 Conflict
      const res2 = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          idempotency_key: idempotencyKey,
          reason: 'IDEMPOTENCY_TEST',
          items: [{ product_id: testProduct1.id, quantity_change: 5 }],
        })

      expect(res2.status).toBe(409)
      expect(res2.body.success).toBe(false)

      // Stock MUST remain unchanged (only incremented once)
      const stockAfterSecond = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockAfterSecond).toBe(stockAfterFirst)
    })
  })

  describe('11. Simulated Concurrent Negative Adjustments', () => {
    it('should prevent stock from becoming negative under simultaneous requests', async () => {
      // Set current stock to exactly 10
      await prisma.product.update({ where: { id: testProduct1.id }, data: { quantity: 10 } })

      // Fire two concurrent requests, each asking to deduct 8 items (total 16 > 10)
      const [call1, call2] = await Promise.all([
        request(app)
          .post('/api/inventory/adjustments')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            reason: 'CONCURRENT_1',
            items: [{ product_id: testProduct1.id, quantity_change: -8 }],
          }),
        request(app)
          .post('/api/inventory/adjustments')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            reason: 'CONCURRENT_2',
            items: [{ product_id: testProduct1.id, quantity_change: -8 }],
          }),
      ])

      const statuses = [call1.status, call2.status]
      // Exactly one must succeed (201) and one must fail with insufficient stock (422)
      expect(statuses).toContain(201)
      expect(statuses).toContain(422)

      // Final stock must be exactly 2 (10 - 8), never negative!
      const finalStock = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(finalStock).toBe(2)
      expect(finalStock).toBeGreaterThanOrEqual(0)
    })
  })

  describe('12. Transaction Multi-Item Rollback', () => {
    it('should roll back ALL items if a subsequent item fails in a multi-item adjustment', async () => {
      const stock1Before = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      const stock2Before = Number((await prisma.product.findUnique({ where: { id: testProduct2.id } })).quantity)

      // Multi-item payload: Item 1 is valid (+5), Item 2 demands -99999 kg (insufficient stock)
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'MULTI_ITEM_FAILURE_TEST',
          items: [
            { product_id: testProduct1.id, quantity_change: 5 },
            { product_id: testProduct2.id, quantity_change: -99999 },
          ],
        })

      expect(res.status).toBe(422)

      // Verify BOTH products remain completely untouched
      const stock1After = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      const stock2After = Number((await prisma.product.findUnique({ where: { id: testProduct2.id } })).quantity)
      expect(stock1After).toBe(stock1Before)
      expect(stock2After).toBe(stock2Before)
    })
  })

  describe('13. Audit Trails & Inventory Log Accuracy', () => {
    it('should persist StockAdjustment header, items, and precise InventoryLog', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouse_id: defaultWarehouse.id,
          reason: 'REGULAR_CYCLE_COUNT',
          notes: 'Quarterly count',
          items: [
            { product_id: testProduct1.id, quantity_change: 3, notes: 'Found 3 extra' },
          ],
        })

      expect(res.status).toBe(201)
      const adjId = res.body.data.id

      // Query adjustment details
      const detailRes = await request(app)
        .get(`/api/inventory/adjustments/${adjId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(detailRes.status).toBe(200)
      expect(detailRes.body.data.reason).toBe('REGULAR_CYCLE_COUNT')
      expect(detailRes.body.data.warehouse.id).toBe(defaultWarehouse.id)
      expect(detailRes.body.data.user.id).toBe(adminUser.id)
      expect(detailRes.body.data.items).toHaveLength(1)
      expect(detailRes.body.data.items[0].product.sku).toBe('SKU-3B-01')
    })
  })

  describe('14. Historical Adjustment Isolation', () => {
    it('recordHistoricalAdjustment should create legacy records without mutating Product.quantity or writing InventoryLog', async () => {
      const stockBefore = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      const logCountBefore = await prisma.inventoryLog.count({ where: { product_id: testProduct1.id } })

      const historicalDate = new Date('2021-04-12T00:00:00.000Z')
      const legacyAdjustment = await stockAdjustmentService.recordHistoricalAdjustment({
        adjustment_number: 'LEGACY-ADJ-9999',
        adjustment_date: historicalDate,
        warehouse_id: secondaryWarehouse.id,
        reason: 'Legacy physical audit difference',
        notes: 'Imported from old system archive',
        user_id: adminUser.id,
        items: [
          {
            product_id: testProduct1.id,
            quantity_change: 25.0,
            method_type: 101,
            unit: 'pcs',
            notes: 'Legacy row 42',
          },
        ],
      })

      expect(legacyAdjustment.is_legacy_import).toBe(true)
      expect(legacyAdjustment.adjustment_number).toBe('LEGACY-ADJ-9999')

      // STRICT ISOLATION CHECK: Product.quantity MUST NOT CHANGE
      const stockAfter = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockAfter).toBe(stockBefore)

      // STRICT ISOLATION CHECK: NO InventoryLog created
      const logCountAfter = await prisma.inventoryLog.count({ where: { product_id: testProduct1.id } })
      expect(logCountAfter).toBe(logCountBefore)
    })
  })

  describe('15. Rejected Client-Supplied Legacy Flags', () => {
    it('should reject client is_legacy_import=true on live adjustments', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'ATTEMPT_LEGACY_BYPASS',
          is_legacy_import: true,
          items: [{ product_id: testProduct1.id, quantity_change: 10 }],
        })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(JSON.stringify(res.body.error)).toMatch(/is_legacy_import/i)
    })

    it('should reject client is_legacy_import=true on live sales checkout', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          items: [{ product_id: testProduct1.id, quantity: 1 }],
          payment_method: 'CASH',
          amount_paid: 100,
          is_legacy_import: true,
        })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(JSON.stringify(res.body.error)).toMatch(/is_legacy_import/i)
    })

    it('should reject client is_legacy_import=true on live purchases', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplier_id: testSupplier.id,
          items: [{ product_id: testProduct1.id, quantity: 5, unit_cost: 60 }],
          is_legacy_import: true,
        })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(JSON.stringify(res.body.error)).toMatch(/is_legacy_import/i)
    })
  })

  describe('16. Compatibility with Live Checkout, Purchase Receiving, and Refunds', () => {
    it('should correctly decrement stock on POS sale creation', async () => {
      const stockBefore = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          items: [{ product_id: testProduct1.id, quantity: 2 }],
          payment_method: 'CASH',
          amount_paid: 200,
          notes: 'Phase 3B Live Checkout Test',
        })

      expect(res.status).toBe(201)
      const stockAfter = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockAfter).toBe(stockBefore - 2)
    })

    it('should correctly increment stock on purchase order receiving', async () => {
      // Create purchase in ORDERED status
      const pRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplier_id: testSupplier.id,
          status: 'ORDERED',
          notes: 'Phase 3B Purchase PO',
          items: [{ product_id: testProduct1.id, quantity: 15, unit_cost: 60 }],
        })
      expect(pRes.status).toBe(201)
      const purchaseId = pRes.body.data.id

      const stockBeforeReceive = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)

      // Receive purchase
      const recRes = await request(app)
        .post(`/api/purchases/${purchaseId}/receive`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(recRes.status).toBe(200)

      const stockAfterReceive = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockAfterReceive).toBe(stockBeforeReceive + 15)
    })

    it('should correctly restore stock on cash sale refund', async () => {
      // Create a sale to refund
      const sRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product_id: testProduct1.id, quantity: 3 }],
          payment_method: 'CASH',
          amount_paid: 300,
          notes: 'Phase 3B Sale for Refund',
        })
      expect(sRes.status).toBe(201)
      const saleId = sRes.body.data.id

      const stockBeforeRefund = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)

      // Refund sale
      const refRes = await request(app)
        .post(`/api/sales/${saleId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(refRes.status).toBe(200)

      const stockAfterRefund = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockAfterRefund).toBe(stockBeforeRefund + 3)
    })
  })
})
