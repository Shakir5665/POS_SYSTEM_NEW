require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let managerToken
let cashierToken
let testCategory
let testProduct
let managerUser
let cashierUser

beforeAll(async () => {
  const hash = await bcrypt.hash('testpass123', 12)
  managerUser = await prisma.user.create({
    data: {
      username: 'inv_test_manager',
      email: 'inv_test_manager@test.com',
      password_hash: hash,
      full_name: 'Inventory Test Manager',
      role: 'MANAGER',
    },
  })
  cashierUser = await prisma.user.create({
    data: {
      username: 'inv_test_cashier',
      email: 'inv_test_cashier@test.com',
      password_hash: hash,
      full_name: 'Inventory Test Cashier',
      role: 'CASHIER',
    },
  })

  const managerLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'inv_test_manager', password: 'testpass123' })
  managerToken = managerLogin.body.data.accessToken

  const cashierLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'inv_test_cashier', password: 'testpass123' })
  cashierToken = cashierLogin.body.data.accessToken

  testCategory = await prisma.category.create({
    data: { name: 'Inv_Test_Category_XYZ' },
  })
  testProduct = await prisma.product.create({
    data: {
      name: 'Inventory Test Product',
      sku: 'INV-TEST-001',
      barcode: '9990000000001',
      category_id: testCategory.id,
      price: 15.0,
      quantity: 50,
      low_stock_threshold: 10,
    },
  })
})

afterAll(async () => {
  await prisma.inventoryLog.deleteMany({ where: { product_id: testProduct.id } })
  await prisma.product.delete({ where: { id: testProduct.id } })
  await prisma.category.delete({ where: { id: testCategory.id } })
  await prisma.authLog.deleteMany({ where: { user_id: { in: [managerUser.id, cashierUser.id] } } })
  await prisma.user.deleteMany({ where: { id: { in: [managerUser.id, cashierUser.id] } } })
  await prisma.$disconnect()
})

describe('GET /api/inventory', () => {
  it('returns paginated inventory list', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${managerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.meta).toHaveProperty('total')
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/inventory')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/inventory/low-stock', () => {
  it('returns products at or below low_stock_threshold', async () => {
    // Set product quantity to exactly low_stock_threshold to ensure it appears
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { quantity: 5, low_stock_threshold: 10 },
    })

    const res = await request(app)
      .get('/api/inventory/low-stock')
      .set('Authorization', `Bearer ${managerToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    const found = res.body.data.find((p) => p.id === testProduct.id)
    expect(found).toBeDefined()
    expect(found.quantity).toBeLessThanOrEqual(found.low_stock_threshold)

    // Restore quantity
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { quantity: 50 },
    })
  })
})

describe('POST /api/inventory/restock', () => {
  it('increases stock and creates RESTOCK inventory log', async () => {
    const before = await prisma.product.findUnique({ where: { id: testProduct.id } })

    const res = await request(app)
      .post('/api/inventory/restock')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: testProduct.id, quantity: 20, notes: 'Test restock' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const after = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(after.quantity).toBe(before.quantity + 20)

    const log = await prisma.inventoryLog.findFirst({
      where: { product_id: testProduct.id, change_type: 'RESTOCK' },
      orderBy: { created_at: 'desc' },
    })
    expect(log).not.toBeNull()
    expect(log.quantity_change).toBe(20)
    expect(log.previous_quantity).toBe(before.quantity)
    expect(log.new_quantity).toBe(before.quantity + 20)
  })

  it('returns 422 for restock quantity <= 0', async () => {
    const res = await request(app)
      .post('/api/inventory/restock')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: testProduct.id, quantity: 0 })

    expect(res.status).toBe(422)
  })

  it('returns 403 when cashier tries to restock', async () => {
    const res = await request(app)
      .post('/api/inventory/restock')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ product_id: testProduct.id, quantity: 10 })

    expect(res.status).toBe(403)
  })

  it('returns 404 for non-existent product', async () => {
    const res = await request(app)
      .post('/api/inventory/restock')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: '00000000-0000-0000-0000-000000000000', quantity: 10 })

    expect(res.status).toBe(404)
  })
})

describe('POST /api/inventory/adjust', () => {
  it('adjusts stock up and creates ADJUSTMENT log', async () => {
    const before = await prisma.product.findUnique({ where: { id: testProduct.id } })

    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: testProduct.id, quantity_change: 5, notes: 'Manual up' })

    expect(res.status).toBe(200)

    const after = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(after.quantity).toBe(before.quantity + 5)
  })

  it('adjusts stock down with negative quantity_change', async () => {
    const before = await prisma.product.findUnique({ where: { id: testProduct.id } })

    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: testProduct.id, quantity_change: -5, notes: 'Manual down' })

    expect(res.status).toBe(200)

    const after = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(after.quantity).toBe(before.quantity - 5)
  })

  it('rejects adjustment that would result in negative stock', async () => {
    const before = await prisma.product.findUnique({ where: { id: testProduct.id } })

    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: testProduct.id, quantity_change: -(before.quantity + 1) })

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/negative stock/i)
  })

  it('returns 422 when quantity_change is 0', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: testProduct.id, quantity_change: 0 })

    expect(res.status).toBe(422)
  })

  it('returns 403 when cashier tries to adjust', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ product_id: testProduct.id, quantity_change: 1 })

    expect(res.status).toBe(403)
  })
})

describe('GET /api/inventory/log/:productId', () => {
  it('returns paginated inventory log for a product', async () => {
    // Ensure there is at least one log entry
    await request(app)
      .post('/api/inventory/restock')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: testProduct.id, quantity: 1, notes: 'Log test restock' })

    const res = await request(app)
      .get(`/api/inventory/log/${testProduct.id}`)
      .set('Authorization', `Bearer ${managerToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
    expect(res.body.data[0]).toHaveProperty('change_type')
    expect(res.body.data[0]).toHaveProperty('quantity_change')
  })

  it('returns 404 for non-existent product', async () => {
    const res = await request(app)
      .get('/api/inventory/log/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${managerToken}`)

    expect(res.status).toBe(404)
  })
})
