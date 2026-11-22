require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(60000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

describe('Phase 5: Sales Returns End-to-End Tests', () => {
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
  let testCustomer
  let liveSale
  let legacySale

  async function cleanup() {
    const prods = await prisma.product.findMany({
      where: { sku: { in: ['SKU-P5-SR-01', 'SKU-P5-SR-02'] } },
      select: { id: true },
    })
    const prodIds = prods.map((p) => p.id)

    await prisma.salesReturnItem.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    await prisma.salesReturn.deleteMany({
      where: { reason: { contains: 'Phase 5' } },
    })
    await prisma.saleItem.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    await prisma.payment.deleteMany({
      where: { sale: { notes: { in: ['Phase 5 Test Live Sale', 'Phase 5 Test Legacy Sale'] } } },
    })
    await prisma.sale.deleteMany({
      where: { notes: { in: ['Phase 5 Test Live Sale', 'Phase 5 Test Legacy Sale'] } },
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
      where: { name: 'Category Phase 5 SR' },
    })
    await prisma.customer.deleteMany({
      where: { name: 'Customer Phase 5 SR' },
    })
    await prisma.warehouse.deleteMany({
      where: { code: 'WH-P5-SR' },
    })
    await prisma.authLog.deleteMany({
      where: { user: { username: { in: ['p5_sr_admin', 'p5_sr_manager', 'p5_sr_cashier'] } } },
    })
    await prisma.user.deleteMany({
      where: { username: { in: ['p5_sr_admin', 'p5_sr_manager', 'p5_sr_cashier'] } },
    })
  }

  beforeAll(async () => {
    // 1. Cleanup stale test data
    await cleanup()

    // 2. Setup users
    const hash = await bcrypt.hash('testpass123', 10)
    adminUser = await prisma.user.create({
      data: {
        username: 'p5_sr_admin',
        email: 'p5_sr_admin@test.com',
        password_hash: hash,
        full_name: 'P5 SR Admin',
        role: 'ADMIN',
      },
    })
    managerUser = await prisma.user.create({
      data: {
        username: 'p5_sr_manager',
        email: 'p5_sr_manager@test.com',
        password_hash: hash,
        full_name: 'P5 SR Manager',
        role: 'MANAGER',
      },
    })
    cashierUser = await prisma.user.create({
      data: {
        username: 'p5_sr_cashier',
        email: 'p5_sr_cashier@test.com',
        password_hash: hash,
        full_name: 'P5 SR Cashier',
        role: 'CASHIER',
      },
    })

    // 3. Login
    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'p5_sr_admin', password: 'testpass123' })
    adminToken = adminLogin.body.data.accessToken

    const managerLogin = await request(app).post('/api/auth/login').send({ username: 'p5_sr_manager', password: 'testpass123' })
    managerToken = managerLogin.body.data.accessToken

    const cashierLogin = await request(app).post('/api/auth/login').send({ username: 'p5_sr_cashier', password: 'testpass123' })
    cashierToken = cashierLogin.body.data.accessToken

    // 4. Warehouse & Master Data
    testWarehouse = await prisma.warehouse.create({
      data: {
        code: 'WH-P5-SR',
        name: 'Warehouse Phase 5 SR',
        is_default: false,
        is_active: true,
      },
    })

    testCategory = await prisma.category.create({
      data: { name: 'Category Phase 5 SR' },
    })

    testCustomer = await prisma.customer.create({
      data: { name: 'Customer Phase 5 SR', phone: '0200000095' },
    })

    testProduct1 = await prisma.product.create({
      data: {
        name: 'Phase 5 Return Item 1',
        sku: 'SKU-P5-SR-01',
        category_id: testCategory.id,
        price: 100.0,
        usual_price: 100.0,
        our_price: 100.0,
        quantity: 50,
        base_unit: 'pcs',
        pricing_unit: 'pcs',
        unit_category: 'COUNT',
      },
    })

    testProduct2 = await prisma.product.create({
      data: {
        name: 'Phase 5 Return Item 2',
        sku: 'SKU-P5-SR-02',
        category_id: testCategory.id,
        price: 40.0,
        usual_price: 40.0,
        our_price: 40.0,
        quantity: 100,
        base_unit: 'pcs',
        pricing_unit: 'pcs',
        unit_category: 'COUNT',
      },
    })

    // 5. Create a Live Sale (10 units of product1 @ 100 with 50 discount, and 5 units of product2 @ 40)
    // Subtotal: 10*100 + 5*40 = 1200. Discount on item1: 50 -> Line1 total = 950 (net unit price: 95.00). Line2 total = 200.
    // Sale total = 1150.
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        customer_id: testCustomer.id,
        warehouse_id: testWarehouse.id,
        payment_method: 'CASH',
        notes: 'Phase 5 Test Live Sale',
        items: [
          {
            product_id: testProduct1.id,
            quantity: 10,
            unit: 'pcs',
            discount: 50,
          },
          {
            product_id: testProduct2.id,
            quantity: 5,
            unit: 'pcs',
          },
        ],
      })

    expect(saleRes.status).toBe(201)
    liveSale = saleRes.body.data

    // Stock after sale: product1: 50 - 10 = 40; product2: 100 - 5 = 95
    const prod1After = await prisma.product.findUnique({ where: { id: testProduct1.id } })
    expect(Number(prod1After.quantity)).toBe(40)

    // 6. Create a Legacy Imported Sale
    legacySale = await prisma.sale.create({
      data: {
        transaction_id: 'LEGACY-TX-P5-SR',
        user_id: adminUser.id,
        customer_id: testCustomer.id,
        warehouse_id: testWarehouse.id,
        subtotal: 500,
        total_amount: 500,
        amount_paid: 500,
        balance_due: 0,
        payment_method: 'CASH',
        payment_status: 'COMPLETED',
        is_legacy_import: true,
        notes: 'Phase 5 Test Legacy Sale',
        sale_items: {
          create: [
            {
              product_id: testProduct1.id,
              product_name: 'Phase 5 Return Item 1',
              product_sku: 'SKU-P5-SR-01',
              unit: 'pcs',
              quantity: 5,
              unit_price: 100,
              total: 500,
            },
          ],
        },
      },
      include: { sale_items: true },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('1. Return Eligibility Query', () => {
    it('GET /api/sales/:id/eligibility should return eligible quantities and original prices', async () => {
      const res = await request(app)
        .get(`/api/sales/${liveSale.id}/eligibility`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.items).toHaveLength(2)

      const line1 = res.body.data.items.find((i) => i.product_id === testProduct1.id)
      expect(line1.sold_quantity).toBe('10')
      expect(line1.already_returned).toBe('0')
      expect(line1.remaining_eligible).toBe('10')
      // Net unit price: 950 / 10 = 95
      expect(line1.net_unit_price).toBe(95)
    })
  })

  describe('2. Partial Return with Stock Restoration', () => {
    let returnRecord

    it('POST /api/sales/returns should process partial return, refund money, and restore inventory', async () => {
      const item1 = liveSale.items.find((i) => i.product_id === testProduct1.id)

      const stockBefore = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockBefore).toBe(40)

      const res = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: liveSale.id,
          reason: 'Phase 5 Partial Return Test - Customer changed mind',
          refund_method: 'CASH',
          items: [
            {
              sale_item_id: item1.id,
              quantity: 3,
              restock: true,
              disposition: 'RESTOCKED',
            },
          ],
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      returnRecord = res.body.data
      expect(returnRecord.return_number).toMatch(/^SR-\d{8}-\d{4}$/)
      // 3 units * 95 net price = 285.00
      expect(Number(returnRecord.refund_amount)).toBe(285)

      // Verify stock was restored by exactly 3 units
      const stockAfter = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockAfter).toBe(43)

      // Verify InventoryLog
      const log = await prisma.inventoryLog.findFirst({
        where: {
          product_id: testProduct1.id,
          change_type: 'RETURN',
          notes: { contains: returnRecord.return_number },
        },
      })
      expect(log).not.toBeNull()
      expect(Number(log.quantity_change)).toBe(3)
      expect(log.warehouse_id).toBe(testWarehouse.id)
    })

    it('GET /api/sales/:id/eligibility should reflect reduced remaining quantity', async () => {
      const res = await request(app)
        .get(`/api/sales/${liveSale.id}/eligibility`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      const line1 = res.body.data.items.find((i) => i.product_id === testProduct1.id)
      expect(line1.sold_quantity).toBe('10')
      expect(line1.already_returned).toBe('3')
      expect(line1.remaining_eligible).toBe('7')
    })
  })

  describe('3. Second Partial Return (Non-Restockable / Damaged)', () => {
    it('should process second return for damaged item without incrementing sellable stock', async () => {
      const item1 = liveSale.items.find((i) => i.product_id === testProduct1.id)
      const stockBefore = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockBefore).toBe(43)

      const res = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: liveSale.id,
          reason: 'Phase 5 Damaged Return Test - Broken seal',
          refund_method: 'CASH',
          items: [
            {
              sale_item_id: item1.id,
              quantity: 2,
              restock: false,
              disposition: 'DAMAGED',
            },
          ],
        })

      expect(res.status).toBe(201)
      const sr = res.body.data
      expect(Number(sr.refund_amount)).toBe(190) // 2 * 95 = 190

      // Stock should NOT change because restock was false
      const stockAfter = Number((await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity)
      expect(stockAfter).toBe(43)

      expect(sr.items[0].restock).toBe(false)
      expect(sr.items[0].disposition).toBe('DAMAGED')
    })
  })

  describe('4. Excess Quantity Rejection', () => {
    it('should reject return request exceeding remaining eligible quantity', async () => {
      const item1 = liveSale.items.find((i) => i.product_id === testProduct1.id)
      // Already returned: 3 + 2 = 5. Remaining: 5.
      // Trying to return 6:
      const res = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: liveSale.id,
          reason: 'Phase 5 Excess Return',
          items: [
            {
              sale_item_id: item1.id,
              quantity: 6,
            },
          ],
        })

      expect(res.status).toBe(422)
      expect(res.body.error.message).toContain('Remaining eligible quantity is 5')
    })
  })

  describe('5. Duplicate Idempotency Key Handling', () => {
    it('should reject duplicate submission with same idempotency key', async () => {
      const item2 = liveSale.items.find((i) => i.product_id === testProduct2.id)
      const key = `IDEMP-SR-${Date.now()}`

      // First submission
      const res1 = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: liveSale.id,
          reason: 'Phase 5 Idempotency Test',
          idempotency_key: key,
          items: [{ sale_item_id: item2.id, quantity: 1 }],
        })
      expect(res1.status).toBe(201)

      // Duplicate submission
      const res2 = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: liveSale.id,
          reason: 'Phase 5 Idempotency Test Duplicate',
          idempotency_key: key,
          items: [{ sale_item_id: item2.id, quantity: 1 }],
        })
      expect(res2.status).toBe(409)
      expect(res2.body.error.message).toContain('already been processed')
    })
  })

  describe('6. Legacy Imported Sale Return Safety', () => {
    it('should block return on historical imported sale with clear message', async () => {
      const legacyItem = legacySale.sale_items[0]

      const res = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: legacySale.id,
          reason: 'Phase 5 Legacy Return Attempt',
          items: [{ sale_item_id: legacyItem.id, quantity: 1 }],
        })

      expect(res.status).toBe(422)
      expect(res.body.error.message).toContain('Returns cannot be processed on historical imported transactions with unverified data')
    })
  })

  describe('7. Role-Based Permissions', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/sales/returns')
      expect(res.status).toBe(401)
    })

    it('should reject CASHIER role with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          sale_id: liveSale.id,
          reason: 'Cashier attempt',
          items: [{ sale_item_id: liveSale.items[0].id, quantity: 1 }],
        })

      expect(res.status).toBe(403)
    })
  })

  describe('8. Sales Return Listing and Details', () => {
    it('GET /api/sales/returns should list returns with pagination and filter', async () => {
      const res = await request(app)
        .get(`/api/sales/returns?sale_id=${liveSale.id}`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.length).toBeGreaterThanOrEqual(2)
    })

    it('GET /api/sales/returns/:id should return full details', async () => {
      const listRes = await request(app)
        .get(`/api/sales/returns?sale_id=${liveSale.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
      const firstId = listRes.body.data[0].id

      const res = await request(app)
        .get(`/api/sales/returns/${firstId}`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(firstId)
      expect(res.body.data.items).toBeDefined()
      expect(res.body.data.user).toBeDefined()
    })
  })
})
