require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(60000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

describe('Phase 5: Purchase Returns End-to-End Tests', () => {
  let adminToken
  let managerToken
  let cashierToken
  let adminUser
  let managerUser
  let cashierUser
  let testWarehouse
  let testCategory
  let testProduct1
  let testProduct2
  let testSupplier
  let livePurchase
  let orderedPurchase
  let legacyPurchase

  async function cleanup() {
    const prods = await prisma.product.findMany({
      where: { sku: { in: ['SKU-P5-PR-01', 'SKU-P5-PR-02'] } },
      select: { id: true },
    })
    const prodIds = prods.map((p) => p.id)

    await prisma.purchaseReturnItem.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    await prisma.purchaseReturn.deleteMany({
      where: { reason: { contains: 'Phase 5 PR' } },
    })
    await prisma.purchaseItem.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    await prisma.supplierPaymentAllocation.deleteMany({
      where: { purchase: { notes: { in: ['Phase 5 Test Received Purchase', 'Phase 5 Test Ordered Purchase', 'Phase 5 Test Legacy Purchase'] } } },
    })
    await prisma.purchase.deleteMany({
      where: { notes: { in: ['Phase 5 Test Received Purchase', 'Phase 5 Test Ordered Purchase', 'Phase 5 Test Legacy Purchase'] } },
    })
    await prisma.inventoryLog.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    if (prodIds.length > 0) {
      await prisma.product.deleteMany({
        where: { id: { in: prodIds } },
      })
    }
    await prisma.category.deleteMany({
      where: { name: 'Category Phase 5 PR' },
    })
    await prisma.supplier.deleteMany({
      where: { name: 'Supplier Phase 5 PR' },
    })
    await prisma.warehouse.deleteMany({
      where: { code: 'WH-P5-PR' },
    })
    await prisma.authLog.deleteMany({
      where: { user: { username: { in: ['p5_pr_admin', 'p5_pr_manager', 'p5_pr_cashier'] } } },
    })
    await prisma.user.deleteMany({
      where: { username: { in: ['p5_pr_admin', 'p5_pr_manager', 'p5_pr_cashier'] } },
    })
  }

  beforeAll(async () => {
    // 1. Cleanup stale test data
    await cleanup()

    // 2. Setup users
    const hash = await bcrypt.hash('testpass123', 10)
    adminUser = await prisma.user.create({
      data: {
        username: 'p5_pr_admin',
        email: 'p5_pr_admin@test.com',
        password_hash: hash,
        full_name: 'P5 PR Admin',
        role: 'ADMIN',
      },
    })
    managerUser = await prisma.user.create({
      data: {
        username: 'p5_pr_manager',
        email: 'p5_pr_manager@test.com',
        password_hash: hash,
        full_name: 'P5 PR Manager',
        role: 'MANAGER',
      },
    })
    cashierUser = await prisma.user.create({
      data: {
        username: 'p5_pr_cashier',
        email: 'p5_pr_cashier@test.com',
        password_hash: hash,
        full_name: 'P5 PR Cashier',
        role: 'CASHIER',
      },
    })

    // 3. Login
    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'p5_pr_admin', password: 'testpass123' })
    adminToken = adminLogin.body.data.accessToken

    const managerLogin = await request(app).post('/api/auth/login').send({ username: 'p5_pr_manager', password: 'testpass123' })
    managerToken = managerLogin.body.data.accessToken

    const cashierLogin = await request(app).post('/api/auth/login').send({ username: 'p5_pr_cashier', password: 'testpass123' })
    cashierToken = cashierLogin.body.data.accessToken

    // 4. Warehouse & Master Data
    testWarehouse = await prisma.warehouse.create({
      data: {
        code: 'WH-P5-PR',
        name: 'Warehouse Phase 5 PR',
        is_default: false,
        is_active: true,
      },
    })

    testCategory = await prisma.category.create({
      data: { name: 'Category Phase 5 PR' },
    })

    testSupplier = await prisma.supplier.create({
      data: { name: 'Supplier Phase 5 PR', phone: '0200000096' },
    })

    testProduct1 = await prisma.product.create({
      data: {
        name: 'Phase 5 PR Item 1',
        sku: 'SKU-P5-PR-01',
        category_id: testCategory.id,
        price: 80.0,
        cost_price: 50.0,
        quantity: 20, // initial stock 20
        base_unit: 'pcs',
        pricing_unit: 'pcs',
        unit_category: 'COUNT',
      },
    })

    testProduct2 = await prisma.product.create({
      data: {
        name: 'Phase 5 PR Item 2',
        sku: 'SKU-P5-PR-02',
        category_id: testCategory.id,
        price: 30.0,
        cost_price: 20.0,
        quantity: 10, // initial stock 10
        base_unit: 'pcs',
        pricing_unit: 'pcs',
        unit_category: 'COUNT',
      },
    })

    // 5. Create a Received Purchase (10 units of item1 @ 50 = 500, and 5 units of item2 @ 20 = 100)
    // Total = 600.
    const poRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        supplier_id: testSupplier.id,
        warehouse_id: testWarehouse.id,
        status: 'RECEIVED',
        notes: 'Phase 5 Test Received Purchase',
        items: [
          {
            product_id: testProduct1.id,
            quantity: 10,
            unit_cost: 50,
            unit: 'pcs',
          },
          {
            product_id: testProduct2.id,
            quantity: 5,
            unit_cost: 20,
            unit: 'pcs',
          },
        ],
      })

    expect(poRes.status).toBe(201)
    livePurchase = poRes.body.data

    // Stock after receive: product1: 20 + 10 = 30; product2: 10 + 5 = 15
    const p1 = await prisma.product.findUnique({ where: { id: testProduct1.id } })
    expect(Number(p1.quantity)).toBe(30)

    // 6. Create an ORDERED Purchase (not yet received)
    const ordRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        supplier_id: testSupplier.id,
        warehouse_id: testWarehouse.id,
        status: 'ORDERED',
        notes: 'Phase 5 Test Ordered Purchase',
        items: [
          {
            product_id: testProduct1.id,
            quantity: 5,
            unit_cost: 50,
          },
        ],
      })
    orderedPurchase = ordRes.body.data

    // 7. Create a Legacy Purchase
    legacyPurchase = await prisma.purchase.create({
      data: {
        purchase_number: 'PO-LEGACY-P5',
        supplier_id: testSupplier.id,
        user_id: adminUser.id,
        warehouse_id: testWarehouse.id,
        subtotal: 500,
        total_amount: 500,
        amount_paid: 500,
        balance_due: 0,
        status: 'RECEIVED',
        is_legacy_import: true,
        notes: 'Phase 5 Test Legacy Purchase',
        items: {
          create: [
            {
              product_id: testProduct1.id,
              product_name: 'Phase 5 PR Item 1',
              product_sku: 'SKU-P5-PR-01',
              unit: 'pcs',
              quantity: 5,
              unit_cost: 50,
              total_cost: 250,
            },
          ],
        },
      },
      include: { items: true },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('1. Return Eligibility Query', () => {
    it('GET /api/purchases/:id/eligibility should return eligible quantities and purchase costs', async () => {
      const res = await request(app)
        .get(`/api/purchases/${livePurchase.id}/eligibility`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.items).toHaveLength(2)

      const line1 = res.body.data.items.find((i) => i.product_id === testProduct1.id)
      expect(line1.purchased_quantity).toBe('10')
      expect(line1.already_returned).toBe('0')
      expect(line1.remaining_eligible).toBe('10')
      expect(line1.unit_cost).toBe(50)
    })
  })

  describe('2. Partial Purchase Return with Inventory Deduction', () => {
    let prRecord

    it('POST /api/purchases/returns should deduct inventory and record supplier settlement without fake cash', async () => {
      const item1 = livePurchase.items.find((i) => i.product_id === testProduct1.id)
      const stockBefore = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockBefore).toBe(30)

      const res = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: livePurchase.id,
          reason: 'Phase 5 PR - Defective batch',
          settlement_status: 'PENDING',
          settlement_method: 'CASH',
          items: [
            {
              purchase_item_id: item1.id,
              quantity: 4,
            },
          ],
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      prRecord = res.body.data
      expect(prRecord.return_number).toMatch(/^PR-\d{8}-\d{4}$/)
      // 4 units * 50 = 200
      expect(Number(prRecord.total_amount)).toBe(200)
      expect(prRecord.settlement_status).toBe('PENDING')

      // Stock must be decremented by 4 (30 - 4 = 26)
      const stockAfter = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockAfter).toBe(26)

      // Verify InventoryLog
      const log = await prisma.inventoryLog.findFirst({
        where: {
          product_id: testProduct1.id,
          change_type: 'RETURN',
          notes: { contains: prRecord.return_number },
        },
      })
      expect(log).not.toBeNull()
      expect(Number(log.quantity_change)).toBe(-4)
      expect(log.warehouse_id).toBe(testWarehouse.id)
    })

    it('GET /api/purchases/:id/eligibility should reflect reduced remaining returnable quantity', async () => {
      const res = await request(app)
        .get(`/api/purchases/${livePurchase.id}/eligibility`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      const line1 = res.body.data.items.find((i) => i.product_id === testProduct1.id)
      expect(line1.purchased_quantity).toBe('10')
      expect(line1.already_returned).toBe('4')
      expect(line1.remaining_eligible).toBe('6')
    })
  })

  describe('3. Un-Received Purchase Rejection', () => {
    it('should reject return on an ORDERED purchase order that has not been received', async () => {
      const res = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: orderedPurchase.id,
          reason: 'Phase 5 PR Attempt on ORDERED',
          items: [{ purchase_item_id: orderedPurchase.items[0].id, quantity: 1 }],
        })

      expect(res.status).toBe(422)
      expect(res.body.error.message).toContain('Only received goods can be returned')
    })
  })

  describe('4. Excess Quantity Rejection', () => {
    it('should reject return exceeding remaining purchased quantity', async () => {
      const item1 = livePurchase.items.find((i) => i.product_id === testProduct1.id)
      // Already returned: 4. Remaining: 6. Attempting to return 7:
      const res = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: livePurchase.id,
          reason: 'Phase 5 PR Excess',
          items: [{ purchase_item_id: item1.id, quantity: 7 }],
        })

      expect(res.status).toBe(422)
      expect(res.body.error.message).toContain('Remaining eligible quantity is 6')
    })
  })

  describe('5. Insufficient Stock Rejection', () => {
    it('should reject purchase return if current stock is lower than return quantity', async () => {
      const item2 = livePurchase.items.find((i) => i.product_id === testProduct2.id)
      // Current stock of product2 is 15. Let's temporarily reduce product2 stock to 2.
      await prisma.product.update({
        where: { id: testProduct2.id },
        data: { quantity: 2 },
      })

      // Try returning 5 units (which were purchased, but only 2 in stock)
      const res = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: livePurchase.id,
          reason: 'Phase 5 PR Insufficient Stock',
          items: [{ purchase_item_id: item2.id, quantity: 5 }],
        })

      expect(res.status).toBe(422)
      expect(res.body.error.message).toContain('Insufficient current stock')

      // Restore stock
      await prisma.product.update({
        where: { id: testProduct2.id },
        data: { quantity: 15 },
      })
    })
  })

  describe('6. Duplicate Idempotency Key Handling', () => {
    it('should reject duplicate submission with same idempotency key', async () => {
      const item2 = livePurchase.items.find((i) => i.product_id === testProduct2.id)
      const key = `IDEMP-PR-${Date.now()}`

      const res1 = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: livePurchase.id,
          reason: 'Phase 5 PR Idempotency',
          idempotency_key: key,
          items: [{ purchase_item_id: item2.id, quantity: 1 }],
        })
      expect(res1.status).toBe(201)

      const res2 = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: livePurchase.id,
          reason: 'Phase 5 PR Idempotency Duplicate',
          idempotency_key: key,
          items: [{ purchase_item_id: item2.id, quantity: 1 }],
        })
      expect(res2.status).toBe(409)
      expect(res2.body.error.message).toContain('already been processed')
    })
  })

  describe('7. Legacy Imported Purchase Safety', () => {
    it('should block purchase return on unverified historical imported transaction', async () => {
      const res = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: legacyPurchase.id,
          reason: 'Phase 5 PR Legacy Attempt',
          items: [{ purchase_item_id: legacyPurchase.items[0].id, quantity: 1 }],
        })

      expect(res.status).toBe(422)
      expect(res.body.error.message).toContain('Returns cannot be processed on historical imported transactions with unverified data')
    })
  })

  describe('8. Role-Based Permissions', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/purchases/returns')
      expect(res.status).toBe(401)
    })

    it('should reject CASHIER role with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          purchase_id: livePurchase.id,
          reason: 'Cashier attempt',
          items: [{ purchase_item_id: livePurchase.items[0].id, quantity: 1 }],
        })

      expect(res.status).toBe(403)
    })
  })

  describe('9. Purchase Return Listing and Details', () => {
    it('GET /api/purchases/returns should list returns with pagination and filter', async () => {
      const res = await request(app)
        .get(`/api/purchases/returns?purchase_id=${livePurchase.id}`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.length).toBeGreaterThanOrEqual(1)
    })

    it('GET /api/purchases/returns/:id should return complete details', async () => {
      const listRes = await request(app)
        .get(`/api/purchases/returns?purchase_id=${livePurchase.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
      const firstId = listRes.body.data[0].id

      const res = await request(app)
        .get(`/api/purchases/returns/${firstId}`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(firstId)
      expect(res.body.data.items).toBeDefined()
      expect(res.body.data.supplier).toBeDefined()
    })
  })
})
