require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(30000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let adminUser, adminToken, testCategory, testProduct, testSupplier

async function login(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: 'testpass123' })
  return res.body.data.accessToken
}

beforeAll(async () => {
  const password_hash = await bcrypt.hash('testpass123', 4)
  adminUser = await prisma.user.create({
    data: {
      username: 'supplier_admin_' + Date.now(),
      email: `supplier_admin_${Date.now()}@test.com`,
      password_hash,
      full_name: 'Supplier Test Admin',
      role: 'ADMIN',
    },
  })
  adminToken = await login(adminUser.username)

  testCategory = await prisma.category.create({
    data: {
      name: 'Supplier_Cat_' + Date.now(),
      description: 'Testing supplier purchases',
    },
  })

  testProduct = await prisma.product.create({
    data: {
      name: 'Purchase Test Product',
      sku: 'PURCH-PROD-' + Date.now(),
      category_id: testCategory.id,
      cost_price: 20.0,
      usual_price: 35.0,
      our_price: 30.0,
      price: 35.0,
      quantity: 10,
      unit_category: 'COUNT',
      base_unit: 'pcs',
      pricing_unit: 'pcs',
    },
  })
})

afterAll(async () => {
  if (testSupplier?.id) {
    const payments = await prisma.supplierPayment.findMany({ where: { supplier_id: testSupplier.id }, select: { id: true } })
    const paymentIds = payments.map((p) => p.id)
    if (paymentIds.length > 0) {
      await prisma.supplierPaymentAllocation.deleteMany({ where: { supplier_payment_id: { in: paymentIds } } })
      await prisma.supplierPayment.deleteMany({ where: { id: { in: paymentIds } } })
    }
    const purchases = await prisma.purchase.findMany({ where: { supplier_id: testSupplier.id }, select: { id: true } })
    const purchaseIds = purchases.map((p) => p.id)
    if (purchaseIds.length > 0) {
      await prisma.purchaseItem.deleteMany({ where: { purchase_id: { in: purchaseIds } } })
      await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } })
    }
    await prisma.supplier.deleteMany({ where: { id: testSupplier.id } })
  }
  if (testProduct?.id) {
    await prisma.inventoryLog.deleteMany({ where: { product_id: testProduct.id } })
    await prisma.product.deleteMany({ where: { id: testProduct.id } })
  }
  if (testCategory?.id) {
    await prisma.category.deleteMany({ where: { id: testCategory.id } })
  }
  if (adminUser?.id) {
    await prisma.authLog.deleteMany({ where: { user_id: adminUser.id } })
    await prisma.user.deleteMany({ where: { id: adminUser.id } })
  }
  await prisma.$disconnect()
})

describe('Batch 7: Supplier and Inventory Purchase Management', () => {
  it('registers a new supplier successfully', async () => {
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Apex Wholesale Goods Ltd',
        phone: '024100' + String(Date.now()).slice(-4),
        email: `apex_${Date.now()}@wholesale.com`,
        contact_person: 'Kwame Mensah',
        address: '12 Harbor Road, Tema',
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe('Apex Wholesale Goods Ltd')
    testSupplier = res.body.data
  })

  it('rejects registering a supplier with duplicate phone', async () => {
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicate Apex',
        phone: testSupplier.phone,
      })

    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
  })

  it('creates an ORDERED purchase on full credit without altering stock yet', async () => {
    const initialQty = Number(testProduct.quantity) // 10

    const res = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier_id: testSupplier.id,
        status: 'ORDERED',
        initial_payment: 0,
        items: [
          {
            product_id: testProduct.id,
            quantity: 50,
            unit_cost: 20.0,
            unit: 'pcs',
          },
        ],
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.purchase_number).toMatch(/^PO-\d{8}-\d{4}$/)
    expect(Number(res.body.data.total_amount)).toBe(1000) // 50 * 20
    expect(Number(res.body.data.amount_paid)).toBe(0)
    expect(Number(res.body.data.balance_due)).toBe(1000)
    expect(res.body.data.status).toBe('ORDERED')
    expect(res.body.data.payment_status).toBe('PENDING')

    // Stock should not change yet
    const prod = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(Number(prod.quantity)).toBe(initialQty)
  })

  it('receives the ordered purchase, restocking inventory and logging change', async () => {
    const purchases = await prisma.purchase.findMany({
      where: { supplier_id: testSupplier.id, status: 'ORDERED' },
    })
    expect(purchases.length).toBe(1)
    const orderId = purchases[0].id

    const res = await request(app)
      .post(`/api/purchases/${orderId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('RECEIVED')
    expect(res.body.data.received_at).not.toBeNull()

    // Stock should now be incremented by 50 (10 + 50 = 60)
    const prod = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(Number(prod.quantity)).toBe(60)

    // Log created
    const log = await prisma.inventoryLog.findFirst({
      where: { product_id: testProduct.id, change_type: 'RESTOCK' },
      orderBy: { created_at: 'desc' },
    })
    expect(log).not.toBeNull()
    expect(Number(log.quantity_change)).toBe(50)
  })

  it('rejects receiving an already received purchase order', async () => {
    const purchase = await prisma.purchase.findFirst({
      where: { supplier_id: testSupplier.id, status: 'RECEIVED' },
    })

    const res = await request(app)
      .post(`/api/purchases/${purchase.id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/already been received/i)
  })

  it('creates an immediately RECEIVED purchase with partial initial payment', async () => {
    const prevQty = (await prisma.product.findUnique({ where: { id: testProduct.id } })).quantity

    const res = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier_id: testSupplier.id,
        status: 'RECEIVED',
        initial_payment: 300,
        payment_method: 'CASH',
        items: [
          {
            product_id: testProduct.id,
            quantity: 20,
            unit_cost: 25.0, // total 500
            unit: 'pcs',
          },
        ],
      })

    expect(res.status).toBe(201)
    expect(Number(res.body.data.total_amount)).toBe(500)
    expect(Number(res.body.data.amount_paid)).toBe(300)
    expect(Number(res.body.data.balance_due)).toBe(200)
    expect(res.body.data.payment_status).toBe('PARTIALLY_PAID')
    expect(res.body.data.status).toBe('RECEIVED')

    // Stock incremented by 20 immediately
    const prod = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(Number(prod.quantity)).toBe(Number(prevQty) + 20)
    // Cost price updated
    expect(Number(prod.cost_price)).toBe(25)
  })

  it('calculates supplier outstanding debt correctly', async () => {
    // We have 2 purchases:
    // 1: total 1000, paid 0, balance 1000
    // 2: total 500, paid 300, balance 200
    // Total debt: 1200
    const res = await request(app)
      .get(`/api/suppliers/${testSupplier.id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.outstanding_debt).toBe(1200)
    expect(res.body.data.total_purchased_amount).toBe(1500)
  })

  it('records debt repayment with FIFO allocation across oldest unpaid purchases', async () => {
    // Pay 1100 to supplier
    // Older purchase balance is 1000 -> fully pays it (balance becomes 0, status COMPLETED)
    // Remaining 100 goes to newer purchase (balance 200 - 100 = 100, status PARTIALLY_PAID)
    const res = await request(app)
      .post(`/api/suppliers/${testSupplier.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 1100,
        payment_method: 'CARD',
        reference: 'CHQ-99881',
        notes: 'Bulk settlement',
      })

    expect(res.status).toBe(201)
    expect(res.body.data.allocations.length).toBe(2)
    expect(Number(res.body.data.allocations[0].amount)).toBe(1000)
    expect(Number(res.body.data.allocations[1].amount)).toBe(100)

    // Check supplier debt after repayment
    const supRes = await request(app)
      .get(`/api/suppliers/${testSupplier.id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(supRes.body.data.outstanding_debt).toBe(100) // 1200 - 1100
  })

  it('rejects debt repayment exceeding total outstanding balance', async () => {
    // Current debt is 100, trying to pay 200 must fail
    const res = await request(app)
      .post(`/api/suppliers/${testSupplier.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 200,
      })

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/exceeds/i)
  })

  it('generates an accurate supplier account statement matching outstanding balance', async () => {
    const res = await request(app)
      .get(`/api/suppliers/${testSupplier.id}/statement`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const { statement, summary } = res.body.data

    expect(statement.length).toBeGreaterThanOrEqual(4)
    expect(summary.total_purchased).toBe(1500)
    expect(summary.total_paid).toBe(1400) // 300 initial + 1100 settlement
    expect(summary.current_balance).toBe(100) // 1500 - 1400

    // Final statement running balance must match summary and supplier debt
    const lastEntry = statement[statement.length - 1]
    expect(lastEntry.running_balance).toBe(100)
  })
})
