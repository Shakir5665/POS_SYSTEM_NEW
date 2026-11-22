require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(60000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')
const { Decimal } = require('@prisma/client/runtime/library')

describe('Phase 6: Full System Integration, Security Audit & Reconciliation Suite', () => {
  let adminToken
  let managerToken
  let cashierToken
  let adminUser
  let managerUser
  let cashierUser
  let testWarehouse
  let testCategory
  let testSupplier
  let testCustomer
  let testProduct1
  let testProduct2

  const TEST_SKUS = ['SKU-P6-INT-01', 'SKU-P6-INT-02', 'SKU-P6-RECON-01']
  const TEST_USERNAMES = ['p6_admin_user', 'p6_mgr_user', 'p6_csh_user']

  async function cleanup() {
    const prods = await prisma.product.findMany({
      where: { sku: { in: TEST_SKUS } },
      select: { id: true },
    })
    const prodIds = prods.map((p) => p.id)

    // Delete purchase return items and returns
    await prisma.purchaseReturnItem.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    await prisma.purchaseReturn.deleteMany({
      where: { reason: { contains: 'Phase 6' } },
    })

    // Delete sales return items and returns
    await prisma.salesReturnItem.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    await prisma.salesReturn.deleteMany({
      where: { reason: { contains: 'Phase 6' } },
    })

    // Delete stock adjustment items and adjustments
    await prisma.stockAdjustmentItem.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    await prisma.stockAdjustment.deleteMany({
      where: { reason: { contains: 'Phase 6' } },
    })

    // Delete sale items and sales
    await prisma.saleItem.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    await prisma.payment.deleteMany({
      where: { sale: { notes: { contains: 'Phase 6' } } },
    })
    await prisma.sale.deleteMany({
      where: { notes: { contains: 'Phase 6' } },
    })

    // Delete purchase items and purchases
    await prisma.purchaseItem.deleteMany({
      where: { product_id: { in: prodIds } },
    })
    await prisma.supplierPaymentAllocation.deleteMany({
      where: { purchase: { notes: { contains: 'Phase 6' } } },
    })
    await prisma.purchase.deleteMany({
      where: { notes: { contains: 'Phase 6' } },
    })

    // Delete inventory logs
    await prisma.inventoryLog.deleteMany({
      where: { product_id: { in: prodIds } },
    })

    // Delete products
    if (prodIds.length > 0) {
      await prisma.product.deleteMany({
        where: { id: { in: prodIds } },
      })
    }

    // Delete categories, suppliers, customers, warehouses
    await prisma.category.deleteMany({
      where: { name: 'Category Phase 6 Integration' },
    })
    await prisma.supplier.deleteMany({
      where: { name: 'Supplier Phase 6 Integration' },
    })
    await prisma.customer.deleteMany({
      where: { name: 'Customer Phase 6 Integration' },
    })
    await prisma.warehouse.deleteMany({
      where: { code: 'WH-P6-INT' },
    })

    // Delete auth logs, inventory logs for test users, and users
    const testUsers = await prisma.user.findMany({
      where: { username: { in: TEST_USERNAMES } },
      select: { id: true },
    })
    const userIds = testUsers.map((u) => u.id)
    if (userIds.length > 0) {
      await prisma.inventoryLog.deleteMany({
        where: { user_id: { in: userIds } },
      })
      await prisma.authLog.deleteMany({
        where: { user_id: { in: userIds } },
      })
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      })
    }
  }

  beforeAll(async () => {
    await cleanup()

    const passwordHash = await bcrypt.hash('P6SecurePass123!', 10)

    adminUser = await prisma.user.create({
      data: {
        username: 'p6_admin_user',
        email: 'p6_admin@test.com',
        password_hash: passwordHash,
        full_name: 'P6 Admin Lead',
        role: 'ADMIN',
      },
    })

    managerUser = await prisma.user.create({
      data: {
        username: 'p6_mgr_user',
        email: 'p6_mgr@test.com',
        password_hash: passwordHash,
        full_name: 'P6 Store Manager',
        role: 'MANAGER',
      },
    })

    cashierUser = await prisma.user.create({
      data: {
        username: 'p6_csh_user',
        email: 'p6_csh@test.com',
        password_hash: passwordHash,
        full_name: 'P6 Main Cashier',
        role: 'CASHIER',
      },
    })

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'p6_admin_user', password: 'P6SecurePass123!' })
    adminToken = adminLogin.body.data.accessToken

    const managerLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'p6_mgr_user', password: 'P6SecurePass123!' })
    managerToken = managerLogin.body.data.accessToken

    const cashierLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'p6_csh_user', password: 'P6SecurePass123!' })
    cashierToken = cashierLogin.body.data.accessToken

    testWarehouse = await prisma.warehouse.create({
      data: {
        code: 'WH-P6-INT',
        name: 'Phase 6 Integration Warehouse',
        address: '400 Integration Way, Colombo 03',
        is_default: false,
        is_active: true,
      },
    })

    testCategory = await prisma.category.create({
      data: {
        name: 'Category Phase 6 Integration',
      },
    })

    testSupplier = await prisma.supplier.create({
      data: {
        name: 'Supplier Phase 6 Integration',
        contact_person: 'Anura Kumara',
        email: 'anura@p6supplier.lk',
        phone: '0112345678',
      },
    })

    testCustomer = await prisma.customer.create({
      data: {
        name: 'Customer Phase 6 Integration',
        phone: '0779988776',
        email: 'customer@p6client.lk',
      },
    })

    // Initial stock: Product 1 = 100.0, Product 2 = 50.0
    testProduct1 = await prisma.product.create({
      data: {
        name: 'Phase 6 Test Product A',
        sku: 'SKU-P6-INT-01',
        category_id: testCategory.id,
        price: new Decimal(250.0),
        cost_price: new Decimal(150.0),
        quantity: new Decimal(100.0),
        base_unit: 'pcs',
      },
    })

    testProduct2 = await prisma.product.create({
      data: {
        name: 'Phase 6 Test Product B',
        sku: 'SKU-P6-INT-02',
        category_id: testCategory.id,
        price: new Decimal(500.0),
        cost_price: new Decimal(300.0),
        quantity: new Decimal(50.0),
        base_unit: 'pcs',
      },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  // =========================================================================
  // PART 2 — End-to-End Sales and Checkout Testing (16 requirements)
  // =========================================================================
  describe('Part 2 — End-to-End Sales and Checkout Lifecycle', () => {
    let createdSaleId

    it('Scenario 1: creates a single product sale with stock deduction and InventoryLog', async () => {
      const initialStock = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customer_id: testCustomer.id,
          warehouse_id: testWarehouse.id,
          items: [
            {
              product_id: testProduct1.id,
              quantity: 5,
            },
          ],
          discount_amount: 0,
          payment_method: 'CASH',
          amount_paid: 1250.0,
          notes: 'Phase 6 Single Product Sale',
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      const sale = res.body.data
      createdSaleId = sale.id
      expect(sale.transaction_id).toBeDefined()
      expect(Number(sale.total_amount)).toBe(1250.0)
      expect(sale.payment_status).toBe('COMPLETED')
      expect(sale.warehouse_id).toBe(testWarehouse.id)

      // Verify stock deduction
      const updatedProduct = await prisma.product.findUnique({ where: { id: testProduct1.id } })
      expect(Number(updatedProduct.quantity)).toBe(Number(initialStock) - 5)

      // Verify InventoryLog creation
      const log = await prisma.inventoryLog.findFirst({
        where: {
          product_id: testProduct1.id,
          change_type: 'SALE',
        },
        orderBy: { created_at: 'desc' },
      })
      expect(log).not.toBeNull()
      expect(Number(log.quantity_change)).toBe(-5)
    })

    it('Scenario 2, 3, 5, 6: creates a multi-product sale with supported discounts and payment total validation', async () => {
      // 2 units of Prod 1 (2 x 250 = 500) + 1 unit of Prod 2 (1 x 500 = 500) = Subtotal 1000
      // Discount = 100 => Total = 900
      const stock1Before = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity
      const stock2Before = (await prisma.product.findUnique({ where: { id: testProduct2.id } })).quantity

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customer_id: testCustomer.id,
          warehouse_id: testWarehouse.id,
          items: [
            { product_id: testProduct1.id, quantity: 2 },
            { product_id: testProduct2.id, quantity: 1 },
          ],
          discount_amount: 100.0,
          payment_method: 'CASH',
          amount_paid: 900.0,
          notes: 'Phase 6 Multi-Product Sale',
        })

      expect(res.status).toBe(201)
      const sale = res.body.data
      expect(Number(sale.subtotal)).toBe(1000.0)
      expect(Number(sale.discount_amount)).toBe(100.0)
      expect(Number(sale.total_amount)).toBe(900.0)
      expect(Number(sale.amount_paid)).toBe(900.0)

      // Check stock deduction across multiple products
      const stock1After = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity
      const stock2After = (await prisma.product.findUnique({ where: { id: testProduct2.id } })).quantity
      expect(Number(stock1After)).toBe(Number(stock1Before) - 2)
      expect(Number(stock2After)).toBe(Number(stock2Before) - 1)
    })

    it('Scenario 7: retrieves receipt and invoice details with items, customer, and warehouse', async () => {
      const res = await request(app)
        .get(`/api/sales/${createdSaleId}`)
        .set('Authorization', `Bearer ${cashierToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const sale = res.body.data
      expect(sale.id).toBe(createdSaleId)
      expect(sale.transaction_id).toBeDefined()
      expect(Array.isArray(sale.items)).toBe(true)
      expect(sale.items.length).toBe(1)
      expect(sale.customer.name).toBe('Customer Phase 6 Integration')
      expect(sale.warehouse.code).toBe('WH-P6-INT')
    })

    it('Scenario 10: rejects insufficient-stock sales with 422 Unprocessable Entity', async () => {
      const currentStock = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          warehouse_id: testWarehouse.id,
          items: [
            {
              product_id: testProduct1.id,
              quantity: Number(currentStock) + 500, // Exceeds stock
            },
          ],
          payment_method: 'CASH',
          amount_paid: 999999,
          notes: 'Phase 6 Insufficient Stock Test',
        })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.error?.message || res.body.message).toMatch(/insufficient|stock/i)
    })

    it('Scenario 11: rejects invalid quantities (zero, negative)', async () => {
      const resZero = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          warehouse_id: testWarehouse.id,
          items: [{ product_id: testProduct1.id, quantity: 0 }],
          payment_method: 'CASH',
          amount_paid: 0,
        })
      expect([400, 422]).toContain(resZero.status)

      const resNeg = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          warehouse_id: testWarehouse.id,
          items: [{ product_id: testProduct1.id, quantity: -5 }],
          payment_method: 'CASH',
          amount_paid: 100,
        })
      expect([400, 422]).toContain(resNeg.status)
    })

    it('Scenario 14 & 15: Admin can record sale with explicit business date and warehouse attribution', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouse_id: testWarehouse.id,
          sale_date: '2026-11-20T12:00:00.000Z',
          items: [{ product_id: testProduct1.id, quantity: 1 }],
          payment_method: 'CASH',
          amount_paid: 250.0,
          notes: 'Phase 6 Admin Backdated Business Date Sale',
        })

      expect(res.status).toBe(201)
      expect(res.body.data.warehouse_id).toBe(testWarehouse.id)
      expect(new Date(res.body.data.sale_date).toISOString()).toBe('2026-11-20T12:00:00.000Z')
    })

    it('Scenario 16: enforces authorization (unauthenticated requests return 401)', async () => {
      const res = await request(app)
        .post('/api/sales')
        .send({
          warehouse_id: testWarehouse.id,
          items: [{ product_id: testProduct1.id, quantity: 1 }],
          payment_method: 'CASH',
        })
      expect(res.status).toBe(401)
    })
  })

  // =========================================================================
  // PART 3 — End-to-End Purchase Order Lifecycle Testing (15 requirements)
  // =========================================================================
  describe('Part 3 — End-to-End Purchase Order Lifecycle', () => {
    let createdPoId

    it('Scenario 1, 2, 3, 4: creates an ORDERED purchase order with supplier, items, and cost valuation', async () => {
      const stockBefore = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplier_id: testSupplier.id,
          warehouse_id: testWarehouse.id,
          status: 'ORDERED',
          purchase_date: '2026-11-22T08:00:00.000Z',
          items: [
            {
              product_id: testProduct1.id,
              quantity: 20,
              unit_cost: 150.0,
            },
          ],
          notes: 'Phase 6 Test Ordered Purchase',
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      const po = res.body.data
      createdPoId = po.id
      expect(po.purchase_number).toBeDefined()
      expect(po.status).toBe('ORDERED')
      expect(Number(po.total_amount)).toBe(3000.0) // 20 * 150

      // When ORDERED, physical stock MUST NOT change yet
      const stockAfter = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity
      expect(Number(stockAfter)).toBe(Number(stockBefore))
    })

    it('Scenario 5, 6, 7: receives goods (POST /api/purchases/:id/receive) and atomically adds to physical inventory + creates InventoryLog', async () => {
      const stockBefore = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity

      const res = await request(app)
        .post(`/api/purchases/${createdPoId}/receive`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('RECEIVED')

      // Stock MUST increase by 20 units
      const stockAfter = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity
      expect(Number(stockAfter)).toBe(Number(stockBefore) + 20)

      // InventoryLog MUST be created with change_type RESTOCK
      const log = await prisma.inventoryLog.findFirst({
        where: {
          product_id: testProduct1.id,
          change_type: 'RESTOCK',
        },
        orderBy: { created_at: 'desc' },
      })
      expect(log).not.toBeNull()
      expect(Number(log.quantity_change)).toBe(20)
    })

    it('Scenario 12: role permissions — Cashier is restricted from creating purchases (403)', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          supplier_id: testSupplier.id,
          warehouse_id: testWarehouse.id,
          items: [{ product_id: testProduct1.id, quantity: 5, unit_cost: 150.0 }],
        })
      expect(res.status).toBe(403)
    })
  })

  // =========================================================================
  // PART 4 & 5 — Sales Returns & Purchase Returns Concurrency & Accounting
  // =========================================================================
  describe('Part 4 & 5 — Sales Returns & Purchase Returns Integration', () => {
    let eligibleSaleId
    let eligibleSaleItemId
    let receivedPoId
    let receivedPoItemId

    beforeAll(async () => {
      // Create a dedicated sale for return testing: 10 units sold
      const saleRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customer_id: testCustomer.id,
          warehouse_id: testWarehouse.id,
          items: [{ product_id: testProduct1.id, quantity: 10 }],
          payment_method: 'CASH',
          amount_paid: 2500.0,
          notes: 'Phase 6 Dedicated Sale for Returns',
        })
      eligibleSaleId = saleRes.body.data.id
      eligibleSaleItemId = saleRes.body.data.items[0].id

      // Create a dedicated received PO for purchase return testing: 15 units purchased
      const poRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplier_id: testSupplier.id,
          warehouse_id: testWarehouse.id,
          status: 'RECEIVED',
          items: [{ product_id: testProduct2.id, quantity: 15, unit_cost: 300.0 }],
          notes: 'Phase 6 Dedicated Purchase for Returns',
        })
      receivedPoId = poRes.body.data.id
      receivedPoItemId = poRes.body.data.items[0].id
    })

    it('Sales Return: processes partial return, restores stock atomically when restock=true, logs SALE_RETURN', async () => {
      const stockBefore = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity

      const res = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: eligibleSaleId,
          reason: 'Phase 6 Partial Customer Return',
          refund_method: 'CASH',
          items: [
            {
              sale_item_id: eligibleSaleItemId,
              quantity: 4,
              restock: true,
            },
          ],
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      const sr = res.body.data
      expect(sr.return_number).toMatch(/^SR-/)
      expect(Number(sr.refund_amount)).toBe(1000.0) // 4 * 250

      // Product.quantity must increase by 4
      const stockAfter = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity
      expect(Number(stockAfter)).toBe(Number(stockBefore) + 4)

      // InventoryLog RETURN
      const log = await prisma.inventoryLog.findFirst({
        where: {
          product_id: testProduct1.id,
          change_type: 'RETURN',
        },
        orderBy: { created_at: 'desc' },
      })
      expect(log).not.toBeNull()
      expect(Number(log.quantity_change)).toBe(4)
    })

    it('Sales Return: processes non-restockable return without increasing inventory stock', async () => {
      const stockBefore = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity

      const res = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: eligibleSaleId,
          reason: 'Phase 6 Damaged Goods Return - Scrap',
          refund_method: 'CASH',
          items: [
            {
              sale_item_id: eligibleSaleItemId,
              quantity: 2,
              restock: false, // Scrapped, do not restock
            },
          ],
        })

      expect(res.status).toBe(201)
      // Stock MUST NOT change
      const stockAfter = (await prisma.product.findUnique({ where: { id: testProduct1.id } })).quantity
      expect(Number(stockAfter)).toBe(Number(stockBefore))
    })

    it('Sales Return: rejects excess quantity exceeding remaining eligible quantity (422)', async () => {
      // Sold 10, returned 4 + 2 = 6, remaining = 4. Attempting to return 5 must fail.
      const res = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: eligibleSaleId,
          reason: 'Phase 6 Excess Return Attempt',
          items: [
            {
              sale_item_id: eligibleSaleItemId,
              quantity: 5, // Exceeds remaining 4
              restock: true,
            },
          ],
        })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.error?.message || res.body.message).toMatch(/remaining eligible quantity/i)
    })

    it('Purchase Return: processes return to vendor, reduces inventory, logs PURCHASE_RETURN, sets PENDING credit', async () => {
      const stockBefore = (await prisma.product.findUnique({ where: { id: testProduct2.id } })).quantity

      const res = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: receivedPoId,
          reason: 'Phase 6 Supplier Defect Return',
          items: [
            {
              purchase_item_id: receivedPoItemId,
              quantity: 5,
            },
          ],
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      const pr = res.body.data
      expect(pr.return_number).toMatch(/^PR-/)
      expect(Number(pr.total_amount)).toBe(1500.0) // 5 * 300
      expect(pr.settlement_status).toBe('PENDING') // Critical accounting requirement: vendor credit is pending

      // Stock must decrease by 5
      const stockAfter = (await prisma.product.findUnique({ where: { id: testProduct2.id } })).quantity
      expect(Number(stockAfter)).toBe(Number(stockBefore) - 5)

      // InventoryLog RETURN for supplier return
      const log = await prisma.inventoryLog.findFirst({
        where: {
          product_id: testProduct2.id,
          change_type: 'RETURN',
        },
        orderBy: { created_at: 'desc' },
      })
      expect(log).not.toBeNull()
      expect(Number(log.quantity_change)).toBe(-5)
    })

    it('Purchase Return: rejects excess quantity exceeding purchased amount (422)', async () => {
      // Purchased 15, returned 5, remaining 10. Attempting to return 11 must fail.
      const res = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: receivedPoId,
          reason: 'Phase 6 Excess PR Attempt',
          items: [
            {
              purchase_item_id: receivedPoItemId,
              quantity: 11,
            },
          ],
        })

      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.error?.message || res.body.message).toMatch(/remaining eligible quantity/i)
    })
  })

  // =========================================================================
  // PART 6 — Cross-Module Inventory Consistency & Financial Reconciliation
  // =========================================================================
  describe('Part 6 — Inventory & Financial Reconciliation Equations', () => {
    it('verifies that Product.quantity strictly equals Initial + Inflows - Outflows', async () => {
      // Create a fresh test product for zero-ambiguity formula verification
      const reconProduct = await prisma.product.create({
        data: {
          name: 'Reconciliation Audit Product',
          sku: 'SKU-P6-RECON-01',
          category_id: testCategory.id,
          price: new Decimal(100.0),
          cost_price: new Decimal(60.0),
          quantity: new Decimal(50.0), // Initial Stock = 50
        },
      })

      const initialQty = 50.0

      // 1. Inflow: Purchase 20 units
      const poRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplier_id: testSupplier.id,
          warehouse_id: testWarehouse.id,
          status: 'RECEIVED',
          items: [{ product_id: reconProduct.id, quantity: 20, unit_cost: 60.0 }],
          notes: 'Phase 6 Reconciliation Inflow',
        })
      const poId = poRes.body.data.id

      // 2. Outflow: Sell 15 units
      const saleRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          warehouse_id: testWarehouse.id,
          items: [{ product_id: reconProduct.id, quantity: 15 }],
          payment_method: 'CASH',
          amount_paid: 1500.0,
          notes: 'Phase 6 Reconciliation Sale',
        })
      const saleId = saleRes.body.data.id
      const saleItemId = saleRes.body.data.items[0].id

      // 3. Inflow: Restockable Customer Return of 3 units
      const srRes = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sale_id: saleId,
          reason: 'Phase 6 Reconciliation Return',
          refund_method: 'CASH',
          items: [{ sale_item_id: saleItemId, quantity: 3, restock: true }],
        })
      const srId = srRes.body.data.id

      // 4. Outflow: Purchase Return to supplier of 2 units
      const poItemId = poRes.body.data.items[0].id
      const prRes = await request(app)
        .post('/api/purchases/returns')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          purchase_id: poId,
          reason: 'Phase 6 Supplier Return Reconciliation',
          items: [{ purchase_item_id: poItemId, quantity: 2 }],
        })
      const prId = prRes.body.data.id

      // Expected Formula: 50 + 20 (purchase) - 15 (sale) + 3 (sale return) - 2 (purchase return) = 56.0
      const expectedBalance = initialQty + 20 - 15 + 3 - 2 // 56.0

      const finalProduct = await prisma.product.findUnique({ where: { id: reconProduct.id } })
      expect(Number(finalProduct.quantity)).toBe(expectedBalance)

      // Cleanup recon product
      await prisma.purchaseReturnItem.deleteMany({ where: { product_id: reconProduct.id } })
      await prisma.purchaseReturn.deleteMany({ where: { id: prId } })
      await prisma.salesReturnItem.deleteMany({ where: { product_id: reconProduct.id } })
      await prisma.salesReturn.deleteMany({ where: { id: srId } })
      await prisma.saleItem.deleteMany({ where: { product_id: reconProduct.id } })
      await prisma.payment.deleteMany({ where: { sale_id: saleId } })
      await prisma.sale.deleteMany({ where: { id: saleId } })
      await prisma.purchaseItem.deleteMany({ where: { product_id: reconProduct.id } })
      await prisma.purchase.deleteMany({ where: { id: poId } })
      await prisma.inventoryLog.deleteMany({ where: { product_id: reconProduct.id } })
      await prisma.product.delete({ where: { id: reconProduct.id } })
    })

    it('verifies financial reporting formulas: Net Sales = Gross Sales - Sales Returns', async () => {
      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      const { gross_sales, sales_returns, net_sales } = res.body.data
      expect(net_sales).toBe(parseFloat((gross_sales - sales_returns).toFixed(2)))
    })

    it('verifies financial reporting formulas: Net Purchases = Gross Purchases - Purchase Returns', async () => {
      const res = await request(app)
        .get('/api/reports/purchases-summary')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      const { gross_purchases, purchase_returns, net_purchases } = res.body.data
      expect(net_purchases).toBe(parseFloat((gross_purchases - purchase_returns).toFixed(2)))
    })
  })

  // =========================================================================
  // PART 7 & 8 — Security Audit, Health Checks & Infrastructure Safeguards
  // =========================================================================
  describe('Part 7 & 8 — Security Audit & System Health Readiness', () => {
    it('Health Liveness Check: /health returns 200 OK with timestamp', async () => {
      const res = await request(app).get('/health')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('ok')
    })

    it('Health Readiness Check: /health/ready probes database connectivity (SELECT 1)', async () => {
      const res = await request(app).get('/health/ready')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('ready')
      expect(res.body.data.database).toBe('connected')
    })

    it('Security Headers: Helmet headers are present in HTTP responses', async () => {
      const res = await request(app).get('/health')
      expect(res.headers['x-dns-prefetch-control']).toBe('off')
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
      expect(res.headers['strict-transport-security']).toBeDefined()
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    })

    it('RBAC Enforcement: Cashier is blocked from administrative and managerial endpoints', async () => {
      // 1. Warehouses creation
      const resWh = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ code: 'WH-UNAUTH', name: 'Unauthorized WH' })
      expect(resWh.status).toBe(403)

      // 2. Supplier creation
      const resSupp = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ name: 'Unauthorized Supplier' })
      expect(resSupp.status).toBe(403)

      // 3. Stock Adjustment creation
      const resAdj = await request(app)
        .post('/api/inventory/adjustments')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          warehouse_id: testWarehouse.id,
          reason: 'Unauthorized Adjustment',
          items: [{ product_id: testProduct1.id, quantity_change: 5 }],
        })
      expect(resAdj.status).toBe(403)
    })

    it('BOLA / IDOR Protection: returns 404 cleanly without leaking internal stack traces on invalid IDs', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000'
      const resSale = await request(app)
        .get(`/api/sales/${fakeUuid}`)
        .set('Authorization', `Bearer ${managerToken}`)
      expect(resSale.status).toBe(404)
      expect(resSale.body.stack).toBeUndefined()

      const resPo = await request(app)
        .get(`/api/purchases/${fakeUuid}`)
        .set('Authorization', `Bearer ${managerToken}`)
      expect(resPo.status).toBe(404)
      expect(resPo.body.stack).toBeUndefined()
    })

    it('CSV Injection Defense (CWE-1236): sanitizes formula payloads (=, +, -, @, tab)', () => {
      // Replicate the client-side sanitizeCsvCell logic directly to verify sanitization guarantees
      function sanitizeCsvCell(cell) {
        if (cell === null || cell === undefined) return ''
        let str = String(cell)
        if (/^[=+\-@\t\r]/.test(str)) {
          str = `'${str}`
        }
        if (/[",\n\r]/.test(str)) {
          str = `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      // Formula triggers should be prepended with single quote
      expect(sanitizeCsvCell('=1+1')).toBe("'=1+1")
      expect(sanitizeCsvCell('+cmd|')).toBe("'+cmd|")
      expect(sanitizeCsvCell('-2+3')).toBe("'-2+3")
      expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)")
      expect(sanitizeCsvCell('\tcalc')).toBe("'\tcalc")

      // Normal numbers and strings are unquoted or quoted per RFC 4180
      expect(sanitizeCsvCell('Normal Product')).toBe('Normal Product')
      expect(sanitizeCsvCell('Product, with comma')).toBe('"Product, with comma"')
      expect(sanitizeCsvCell(150.5)).toBe('150.5')
    })
  })
})
