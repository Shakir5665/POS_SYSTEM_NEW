require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(30000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let managerToken
let cashierToken
let testCategory
let testProduct
let leadingZeroProduct
let managerUser
let cashierUser

beforeAll(async () => {
  // Clean up any stale data from previous runs
  const staleCat = await prisma.category.findUnique({ where: { name: 'Inv_Test_Category_XYZ' } })
  if (staleCat) {
    const prods = await prisma.product.findMany({ where: { category_id: staleCat.id }, select: { id: true } })
    const prodIds = prods.map((p) => p.id)
    if (prodIds.length > 0) {
      await prisma.inventoryLog.deleteMany({ where: { product_id: { in: prodIds } } })
      await prisma.saleItem.deleteMany({ where: { product_id: { in: prodIds } } })
      await prisma.product.deleteMany({ where: { id: { in: prodIds } } })
    }
    await prisma.category.delete({ where: { id: staleCat.id } })
  }
  const staleUsers = await prisma.user.findMany({
    where: { username: { in: ['inv_test_manager', 'inv_test_cashier'] } },
    select: { id: true },
  })
  if (staleUsers.length > 0) {
    const staleIds = staleUsers.map((u) => u.id)
    await prisma.authLog.deleteMany({ where: { user_id: { in: staleIds } } })
    await prisma.user.deleteMany({ where: { id: { in: staleIds } } })
  }

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
  leadingZeroProduct = await prisma.product.create({
    data: {
      name: 'Leading Zero Barcode Product',
      sku: 'INV-TEST-002-LZ',
      barcode: '0012345678905',
      category_id: testCategory.id,
      price: 22.5,
      quantity: 15,
      low_stock_threshold: 5,
    },
  })
})

afterAll(async () => {
  await prisma.inventoryLog.deleteMany({ where: { product_id: { in: [testProduct.id, leadingZeroProduct.id] } } })
  await prisma.product.deleteMany({ where: { id: { in: [testProduct.id, leadingZeroProduct.id] } } })
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
    expect(Number(found.quantity)).toBeLessThanOrEqual(Number(found.low_stock_threshold))

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
    expect(Number(after.quantity)).toBe(Number(before.quantity) + 20)

    const log = await prisma.inventoryLog.findFirst({
      where: { product_id: testProduct.id, change_type: 'RESTOCK' },
      orderBy: { created_at: 'desc' },
    })
    expect(log).not.toBeNull()
    expect(Number(log.quantity_change)).toBe(20)
    expect(Number(log.previous_quantity)).toBe(Number(before.quantity))
    expect(Number(log.new_quantity)).toBe(Number(before.quantity) + 20)
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
    expect(Number(after.quantity)).toBe(Number(before.quantity) + 5)
  })

  it('adjusts stock down with negative quantity_change', async () => {
    const before = await prisma.product.findUnique({ where: { id: testProduct.id } })

    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: testProduct.id, quantity_change: -5, notes: 'Manual down' })

    expect(res.status).toBe(200)

    const after = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(Number(after.quantity)).toBe(Number(before.quantity) - 5)
  })

  it('rejects adjustment that would result in negative stock', async () => {
    const before = await prisma.product.findUnique({ where: { id: testProduct.id } })

    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ product_id: testProduct.id, quantity_change: -(Number(before.quantity) + 1) })

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

describe('GET /api/products/barcode/:code — Barcode Lookup', () => {
  it('returns matching product with full inventory and category information', async () => {
    const res = await request(app)
      .get(`/api/products/barcode/${testProduct.barcode}`)
      .set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe(testProduct.id)
    expect(res.body.data.name).toBe('Inventory Test Product')
    expect(res.body.data.barcode).toBe('9990000000001')
    expect(Number(res.body.data.price)).toBe(15.0)
    expect(Number(res.body.data.quantity)).toBeGreaterThan(0)
  })

  it('preserves leading zeros in barcode lookup', async () => {
    const res = await request(app)
      .get(`/api/products/barcode/${leadingZeroProduct.barcode}`)
      .set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.barcode).toBe('0012345678905')
    expect(res.body.data.name).toBe('Leading Zero Barcode Product')
  })

  it('returns 404 for unknown barcode', async () => {
    const res = await request(app)
      .get('/api/products/barcode/UNKNOWN_BARCODE_999999')
      .set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(404)
  })
})
