require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(60000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

describe('Phase 5: Reports Improvements & Migration Read APIs', () => {
  let adminToken
  let managerToken
  let cashierToken
  let testWarehouse

  beforeAll(async () => {
    // Clean up
    await prisma.authLog.deleteMany({
      where: { user: { username: { in: ['p5_rep_admin', 'p5_rep_manager', 'p5_rep_cashier'] } } },
    })
    await prisma.user.deleteMany({
      where: { username: { in: ['p5_rep_admin', 'p5_rep_manager', 'p5_rep_cashier'] } },
    })

    const hash = await bcrypt.hash('testpass123', 10)
    await prisma.user.create({
      data: {
        username: 'p5_rep_admin',
        email: 'p5_rep_admin@test.com',
        password_hash: hash,
        full_name: 'P5 Rep Admin',
        role: 'ADMIN',
      },
    })
    await prisma.user.create({
      data: {
        username: 'p5_rep_manager',
        email: 'p5_rep_manager@test.com',
        password_hash: hash,
        full_name: 'P5 Rep Manager',
        role: 'MANAGER',
      },
    })
    await prisma.user.create({
      data: {
        username: 'p5_rep_cashier',
        email: 'p5_rep_cashier@test.com',
        password_hash: hash,
        full_name: 'P5 Rep Cashier',
        role: 'CASHIER',
      },
    })

    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'p5_rep_admin', password: 'testpass123' })
    adminToken = adminLogin.body.data.accessToken

    const managerLogin = await request(app).post('/api/auth/login').send({ username: 'p5_rep_manager', password: 'testpass123' })
    managerToken = managerLogin.body.data.accessToken

    const cashierLogin = await request(app).post('/api/auth/login').send({ username: 'p5_rep_cashier', password: 'testpass123' })
    cashierToken = cashierLogin.body.data.accessToken

    testWarehouse = await prisma.warehouse.findFirst({ where: { is_default: true } })
  })

  afterAll(async () => {
    await prisma.authLog.deleteMany({
      where: { user: { username: { in: ['p5_rep_admin', 'p5_rep_manager', 'p5_rep_cashier'] } } },
    })
    await prisma.user.deleteMany({
      where: { username: { in: ['p5_rep_admin', 'p5_rep_manager', 'p5_rep_cashier'] } },
    })
  })

  describe('1. Sales and Purchases Return Reporting', () => {
    it('GET /api/reports/sales-summary should return gross_sales, sales_returns, and net_sales', async () => {
      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.gross_sales).toBeDefined()
      expect(data.sales_returns).toBeDefined()
      expect(data.net_sales).toBeDefined()
      expect(data.net_sales).toBe(parseFloat((data.gross_sales - data.sales_returns).toFixed(2)))
      expect(data.total_revenue).toBe(data.gross_sales) // backwards compatibility
    })

    it('GET /api/reports/purchases-summary should return gross_purchases, purchase_returns, and net_purchases', async () => {
      const res = await request(app)
        .get('/api/reports/purchases-summary')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.gross_purchases).toBeDefined()
      expect(data.purchase_returns).toBeDefined()
      expect(data.net_purchases).toBeDefined()
      expect(data.net_purchases).toBe(parseFloat((data.gross_purchases - data.purchase_returns).toFixed(2)))
    })

    it('GET /api/reports/sales-returns should return sales returns breakdown', async () => {
      const res = await request(app)
        .get('/api/reports/sales-returns')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.total_refund_amount).toBeDefined()
      expect(data.total_returns_count).toBeDefined()
      expect(Array.isArray(data.by_reason)).toBe(true)
      expect(Array.isArray(data.by_refund_method)).toBe(true)
    })

    it('GET /api/reports/purchase-returns should return purchase returns breakdown', async () => {
      const res = await request(app)
        .get('/api/reports/purchase-returns')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.total_return_amount).toBeDefined()
      expect(data.total_returns_count).toBeDefined()
      expect(Array.isArray(data.by_reason)).toBe(true)
      expect(Array.isArray(data.by_settlement_status)).toBe(true)
    })

    it('should respect warehouse_id filter on return reports', async () => {
      if (testWarehouse) {
        const res = await request(app)
          .get(`/api/reports/sales-returns?warehouse_id=${testWarehouse.id}`)
          .set('Authorization', `Bearer ${managerToken}`)

        expect(res.status).toBe(200)
      }
    })
  })

  describe('2. Migration Management Read APIs', () => {
    it('GET /api/migration/status should return status summary for ADMIN', async () => {
      const res = await request(app)
        .get('/api/migration/status')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.provenance).toBe('SYNTHETIC_FIXTURE')
      expect(res.body.data.known_original_workbook_sha256).toBe(
        'b392557f09df3dd191aed9f178f89722d10a44b43294949c670e53f24bac03a4'
      )
      expect(res.body.data.excel_import_status).toBe('NOT_YET_AVAILABLE')
    })

    it('GET /api/migration/batches should return list of migration batches for ADMIN', async () => {
      const res = await request(app)
        .get('/api/migration/batches')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('GET /api/migration/issues should return migration issues for ADMIN', async () => {
      const res = await request(app)
        .get('/api/migration/issues')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should reject MANAGER role with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/migration/status')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(403)
    })

    it('should reject CASHIER role with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/migration/status')
        .set('Authorization', `Bearer ${cashierToken}`)

      expect(res.status).toBe(403)
    })

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/migration/status')
      expect(res.status).toBe(401)
    })
  })
})
