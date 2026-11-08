require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(30000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let adminUser, adminToken, testCategory, testProduct, testCustomer

async function login(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: 'testpass123' })
  return res.body.data.accessToken
}

beforeAll(async () => {
  const password_hash = await bcrypt.hash('testpass123', 4)
  adminUser = await prisma.user.create({
    data: {
      username: 'credit_admin_' + Date.now(),
      email: `credit_admin_${Date.now()}@test.com`,
      password_hash,
      full_name: 'Credit Test Admin',
      role: 'ADMIN',
    },
  })
  adminToken = await login(adminUser.username)

  testCategory = await prisma.category.create({
    data: {
      name: 'Credit_Test_Cat_' + Date.now(),
      description: 'Testing credit sales and repayments',
    },
  })

  testProduct = await prisma.product.create({
    data: {
      name: 'Credit Test Item',
      sku: 'CRED-ITEM-' + Date.now(),
      category_id: testCategory.id,
      cost_price: 30.0,
      usual_price: 50.0,
      our_price: 50.0,
      price: 50.0,
      quantity: 100,
      unit_category: 'COUNT',
      base_unit: 'pcs',
      pricing_unit: 'pcs',
    },
  })
})

afterAll(async () => {
  if (testCustomer?.id) {
    const payments = await prisma.customerPayment.findMany({ where: { customer_id: testCustomer.id }, select: { id: true } })
    const paymentIds = payments.map((p) => p.id)
    if (paymentIds.length > 0) {
      await prisma.customerPaymentAllocation.deleteMany({ where: { customer_payment_id: { in: paymentIds } } })
      await prisma.customerPayment.deleteMany({ where: { id: { in: paymentIds } } })
    }
    const sales = await prisma.sale.findMany({ where: { customer_id: testCustomer.id }, select: { id: true } })
    const saleIds = sales.map((s) => s.id)
    if (saleIds.length > 0) {
      await prisma.payment.deleteMany({ where: { sale_id: { in: saleIds } } })
      await prisma.saleItem.deleteMany({ where: { sale_id: { in: saleIds } } })
      await prisma.sale.deleteMany({ where: { id: { in: saleIds } } })
    }
    await prisma.customer.delete({ where: { id: testCustomer.id } }).catch(() => {})
  }
  if (testProduct?.id) {
    await prisma.inventoryLog.deleteMany({ where: { product_id: testProduct.id } })
    await prisma.product.delete({ where: { id: testProduct.id } }).catch(() => {})
  }
  if (testCategory?.id) {
    await prisma.category.delete({ where: { id: testCategory.id } }).catch(() => {})
  }
  if (adminUser?.id) {
    await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe('Batch 5: Customer Quick Registration, Credit Sales & Debt Repayment', () => {
  it('1. Quick registers a customer via /api/customers', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Kwame Asante',
        phone: '024' + Math.floor(1000000 + Math.random() * 9000000),
        email: `kwame_${Date.now()}@test.com`,
        address: 'Accra Central',
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    testCustomer = res.body.data
    expect(testCustomer.name).toBe('Kwame Asante')
    expect(testCustomer.id).toBeDefined()
  })

  it('2. Rejects credit sale when customer is not provided (walk-in customer)', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 2 }],
        payment_method: 'CREDIT',
        amount_paid: 0,
      })

    expect(res.status).toBe(422)
    expect(res.body.error?.message || res.body.message).toMatch(/registered customer/i)
  })

  it('3. Rejects partial payment when customer is not provided (walk-in customer)', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 2 }],
        payment_method: 'CASH',
        amount_paid: 50, // total is 100
      })

    expect(res.status).toBe(422)
    expect(res.body.error?.message || res.body.message).toMatch(/registered customer/i)
  })

  let creditSale1, creditSale2

  it('4. Creates a full credit sale for registered customer', async () => {
    // 2 units × 50 = 100 total. 0 paid -> balance_due = 100, payment_status = PENDING
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customer_id: testCustomer.id,
        items: [{ product_id: testProduct.id, quantity: 2 }],
        payment_method: 'CREDIT',
        amount_paid: 0,
      })

    expect(res.status).toBe(201)
    creditSale1 = res.body.data
    expect(parseFloat(creditSale1.total_amount)).toBe(100.0)
    expect(parseFloat(creditSale1.amount_paid)).toBe(0.0)
    expect(parseFloat(creditSale1.balance_due)).toBe(100.0)
    expect(creditSale1.payment_status).toBe('PENDING')
  })

  it('5. Creates a partial cash payment sale for registered customer', async () => {
    // 3 units × 50 = 150 total. 50 paid -> balance_due = 100, payment_status = PARTIALLY_PAID
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customer_id: testCustomer.id,
        items: [{ product_id: testProduct.id, quantity: 3 }],
        payment_method: 'CASH',
        amount_paid: 50,
      })

    expect(res.status).toBe(201)
    creditSale2 = res.body.data
    expect(parseFloat(creditSale2.total_amount)).toBe(150.0)
    expect(parseFloat(creditSale2.amount_paid)).toBe(50.0)
    expect(parseFloat(creditSale2.balance_due)).toBe(100.0)
    expect(creditSale2.payment_status).toBe('PARTIALLY_PAID')
  })

  it('6. Calculates customer outstanding debt correctly (100 + 100 = 200)', async () => {
    const res = await request(app)
      .get(`/api/customers/${testCustomer.id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.outstanding_debt).toBe(200.0)
  })

  it('7. Rejects debt repayment exceeding outstanding debt', async () => {
    const res = await request(app)
      .post(`/api/customers/${testCustomer.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 250, // debt is 200
        payment_method: 'CASH',
      })

    expect(res.status).toBe(422)
  })

  it('8. Allocates debt repayment using FIFO (140 payment clears Sale 1 and partially clears Sale 2)', async () => {
    // Debt = 200 (Sale 1: 100, Sale 2: 100).
    // Payment of 140:
    // - Sale 1: allocates 100 -> balance_due = 0, status = COMPLETED
    // - Sale 2: allocates 40 -> balance_due = 60, status = PARTIALLY_PAID
    const res = await request(app)
      .post(`/api/customers/${testCustomer.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 140,
        payment_method: 'CASH',
        notes: 'Partial debt settlement',
      })

    expect(res.status).toBe(201)
    const { payment, allocations } = res.body.data
    expect(parseFloat(payment.amount)).toBe(140.0)
    expect(allocations.length).toBe(2)

    // Check Sale 1 in DB
    const updatedSale1 = await prisma.sale.findUnique({ where: { id: creditSale1.id } })
    expect(parseFloat(updatedSale1.balance_due)).toBe(0.0)
    expect(parseFloat(updatedSale1.amount_paid)).toBe(100.0)
    expect(updatedSale1.payment_status).toBe('COMPLETED')

    // Check Sale 2 in DB
    const updatedSale2 = await prisma.sale.findUnique({ where: { id: creditSale2.id } })
    expect(parseFloat(updatedSale2.balance_due)).toBe(60.0)
    expect(parseFloat(updatedSale2.amount_paid)).toBe(90.0) // 50 initial + 40 repayment
    expect(updatedSale2.payment_status).toBe('PARTIALLY_PAID')

    // Customer remaining debt is now 60
    const custRes = await request(app)
      .get(`/api/customers/${testCustomer.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(custRes.body.data.outstanding_debt).toBe(60.0)
  })

  it('9. Retrieves chronological Customer Account Statement', async () => {
    const res = await request(app)
      .get(`/api/customers/${testCustomer.id}/statement`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const statementData = res.body.data
    expect(statementData.current_balance).toBe(60.0)
    expect(statementData.statement.length).toBeGreaterThanOrEqual(3)
  })
})
