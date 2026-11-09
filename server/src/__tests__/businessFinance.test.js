require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(30000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let adminUser, adminToken, testCategory, testAsset, testExpense

async function login(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: 'testpass123' })
  return res.body.data.accessToken
}

beforeAll(async () => {
  const password_hash = await bcrypt.hash('testpass123', 4)
  adminUser = await prisma.user.create({
    data: {
      username: 'finance_admin_' + Date.now(),
      email: `finance_admin_${Date.now()}@test.com`,
      password_hash,
      full_name: 'Finance Test Admin',
      role: 'ADMIN',
    },
  })
  adminToken = await login(adminUser.username)
})

afterAll(async () => {
  if (testAsset?.id) {
    await prisma.businessAsset.deleteMany({ where: { id: testAsset.id } })
  }
  if (testExpense?.id) {
    await prisma.expense.deleteMany({ where: { id: testExpense.id } })
  }
  if (adminUser?.id) {
    await prisma.ownerTransaction.deleteMany({ where: { user_id: adminUser.id } })
    await prisma.authLog.deleteMany({ where: { user_id: adminUser.id } })
    await prisma.user.deleteMany({ where: { id: adminUser.id } })
  }
  await prisma.$disconnect()
})

describe('Batch 8: Business Finance Management (Expenses, Assets & Owner Equity)', () => {
  it('lists default expense categories, auto-seeding if empty', async () => {
    const res = await request(app)
      .get('/api/finance/categories')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(5)
    testCategory = res.body.data.find((c) => c.name === 'Utilities') || res.body.data[0]
  })

  it('records an operating expense successfully', async () => {
    const res = await request(app)
      .post('/api/finance/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: testCategory.id,
        amount: 350.5,
        payment_method: 'CASH',
        payee: 'Electricity Company of Ghana',
        reference: 'BILL-OCT-9901',
        notes: 'Monthly power consumption',
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(Number(res.body.data.amount)).toBe(350.5)
    expect(res.body.data.payee).toBe('Electricity Company of Ghana')
    testExpense = res.body.data
  })

  it('lists expenses and calculates total expenses amount', async () => {
    const res = await request(app)
      .get('/api/finance/expenses')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
    expect(res.body.meta.total_expenses_amount).toBeGreaterThanOrEqual(350.5)
  })

  it('registers a new business asset', async () => {
    const res = await request(app)
      .post('/api/finance/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Omnidirectional Barcode Scanner & Digital Scale',
        asset_code: 'AST-SCN-' + Date.now(),
        category: 'Equipment',
        acquisition_cost: 1500.0,
        current_value: 1400.0,
        location: 'Checkout Counter 1',
        notes: 'High speed barcode reader',
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(Number(res.body.data.acquisition_cost)).toBe(1500)
    expect(Number(res.body.data.current_value)).toBe(1400)
    testAsset = res.body.data
  })

  it('updates an asset current valuation', async () => {
    const res = await request(app)
      .put(`/api/finance/assets/${testAsset.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        current_value: 1350.0,
        notes: 'Year-end depreciation adjustment',
      })

    expect(res.status).toBe(200)
    expect(Number(res.body.data.current_value)).toBe(1350)
  })

  it('records owner capital contribution and drawings', async () => {
    // 1. Contribution: LKR 10,000
    const contribRes = await request(app)
      .post('/api/finance/owner-transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'CONTRIBUTION',
        amount: 10000,
        payment_method: 'CARD',
        reference: 'TX-CAPITAL-IN',
        notes: 'Initial business seed capital injection',
      })

    expect(contribRes.status).toBe(201)
    expect(Number(contribRes.body.data.amount)).toBe(10000)

    // 2. Withdrawal (Drawings): LKR 1,500
    const withdrRes = await request(app)
      .post('/api/finance/owner-transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'WITHDRAWAL',
        amount: 1500,
        payment_method: 'CASH',
        notes: 'Personal drawing for living expenses',
      })

    expect(withdrRes.status).toBe(201)
    expect(Number(withdrRes.body.data.amount)).toBe(1500)

    // 3. List transactions & verify net owner equity
    const listRes = await request(app)
      .get('/api/finance/owner-transactions')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(listRes.status).toBe(200)
    const { summary } = listRes.body.meta
    expect(summary.total_contributions).toBeGreaterThanOrEqual(10000)
    expect(summary.total_withdrawals).toBeGreaterThanOrEqual(1500)
    expect(summary.net_owner_equity).toBe(Number((summary.total_contributions - summary.total_withdrawals).toFixed(2)))
  })

  it('returns executive financial summary combining all modules', async () => {
    const res = await request(app)
      .get('/api/finance/summary')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const data = res.body.data
    expect(data.total_expenses).toBeGreaterThan(0)
    expect(data.total_asset_value).toBeGreaterThan(0)
    expect(data.total_contributions).toBeGreaterThanOrEqual(10000)
    expect(data.total_withdrawals).toBeGreaterThanOrEqual(1500)
    expect(data.retained_earnings).toBeDefined()
    expect(data.total_equity).toBeDefined()
    expect(data.total_equity).toBe(Number((data.net_capital + data.retained_earnings).toFixed(2)))
  })
})
