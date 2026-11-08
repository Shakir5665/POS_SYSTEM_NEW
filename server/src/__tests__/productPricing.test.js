require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(30000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let adminUser, adminToken, testCategory

async function login(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: 'testpass123' })
  return res.body.data.accessToken
}

beforeAll(async () => {
  const password_hash = await bcrypt.hash('testpass123', 4)
  adminUser = await prisma.user.create({
    data: {
      username: 'pricing_test_admin',
      email: 'pricing_admin@test.com',
      password_hash,
      full_name: 'Pricing Admin',
      role: 'ADMIN',
    },
  })
  adminToken = await login('pricing_test_admin')

  testCategory = await prisma.category.create({
    data: {
      name: 'Pricing_Test_Category_' + Date.now(),
      description: 'Category for testing product pricing architecture',
    },
  })
})

afterAll(async () => {
  // Clean up products created during tests
  if (testCategory?.id) {
    const products = await prisma.product.findMany({
      where: { category_id: testCategory.id },
      select: { id: true },
    })
    const productIds = products.map((p) => p.id)
    if (productIds.length > 0) {
      const saleItems = await prisma.saleItem.findMany({
        where: { product_id: { in: productIds } },
        select: { sale_id: true },
      })
      const saleIds = saleItems.map((si) => si.sale_id)
      if (saleIds.length > 0) {
        await prisma.payment.deleteMany({ where: { sale_id: { in: saleIds } } })
        await prisma.saleItem.deleteMany({ where: { sale_id: { in: saleIds } } })
        await prisma.sale.deleteMany({ where: { id: { in: saleIds } } })
      }
      await prisma.inventoryLog.deleteMany({ where: { product_id: { in: productIds } } })
      await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    }
    await prisma.category.delete({ where: { id: testCategory.id } }).catch(() => {})
  }

  if (adminUser?.id) {
    await prisma.authLog.deleteMany({ where: { user_id: adminUser.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe('Product Pricing Architecture (Batch 1)', () => {
  let createdProductId

  it('creates a product with distinct Cost Price, Usual Price, and Our Price', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Batch1 Sugar 1kg',
        sku: 'SUGAR-B1-' + Date.now(),
        category_id: testCategory.id,
        unit_category: 'COUNT',
        base_unit: 'pcs',
        pricing_unit: 'pcs',
        cost_price: 70.0,
        usual_price: 120.0,
        our_price: 100.0,
        quantity: 50,
      })

    expect(res.status).toBe(201)
    const p = res.body.data
    createdProductId = p.id
    expect(Number(p.cost_price)).toBe(70.0)
    expect(Number(p.usual_price)).toBe(120.0)
    expect(Number(p.our_price)).toBe(100.0)
    expect(Number(p.price)).toBe(100.0) // price synchronized with our_price
  })

  it('rejects product creation when Our Price exceeds Usual Price', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Invalid Price Sugar',
        sku: 'INV-PRICE-' + Date.now(),
        category_id: testCategory.id,
        cost_price: 70.0,
        usual_price: 100.0,
        our_price: 120.0, // Invalid: exceeds usual price
      })

    expect(res.status).toBe(422)
    expect(JSON.stringify(res.body)).toMatch(/cannot exceed usual price/i)
  })

  it('rejects negative prices', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Negative Price Product',
        sku: 'NEG-PRICE-' + Date.now(),
        category_id: testCategory.id,
        cost_price: -10.0,
        usual_price: 100.0,
        our_price: 90.0,
      })

    expect(res.status).toBe(422)
  })

  it('permits NULL cost_price for products with unknown acquisition cost', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'No Cost Product',
        sku: 'NO-COST-' + Date.now(),
        category_id: testCategory.id,
        cost_price: null,
        usual_price: 50.0,
        our_price: 50.0,
        quantity: 10,
      })

    expect(res.status).toBe(201)
    expect(res.body.data.cost_price).toBeNull()
    expect(Number(res.body.data.usual_price)).toBe(50.0)
    expect(Number(res.body.data.our_price)).toBe(50.0)
  })

  it('updates a product pricing with validation', async () => {
    const res = await request(app)
      .put(`/api/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        usual_price: 130.0,
        our_price: 110.0,
        cost_price: 75.0,
      })

    expect(res.status).toBe(200)
    expect(Number(res.body.data.usual_price)).toBe(130.0)
    expect(Number(res.body.data.our_price)).toBe(110.0)
    expect(Number(res.body.data.cost_price)).toBe(75.0)
    expect(Number(res.body.data.price)).toBe(110.0)
  })

  it('preserves historical pricing snapshots on SaleItem and isolates historical sales from future product price changes', async () => {
    // 1. Complete a sale of the product at current prices: usual: 130, our: 110, cost: 75
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            product_id: createdProductId,
            quantity: 2,
            discount: 0,
          },
        ],
        payment_method: 'CASH',
        amount_paid: 220.0, // 2 * 110
      })

    expect(saleRes.status).toBe(201)
    const sale = saleRes.body.data
    expect(Number(sale.total_amount)).toBe(220.0)
    const saleItem = sale.items[0]
    expect(Number(saleItem.unit_price)).toBe(110.0)
    expect(Number(saleItem.usual_price_snapshot)).toBe(130.0)
    expect(Number(saleItem.our_price_snapshot)).toBe(110.0)
    expect(Number(saleItem.cost_price_snapshot)).toBe(75.0)
    expect(saleItem.predefined_discount_applied).toBe(true)
    expect(Number(saleItem.predefined_discount_amount)).toBe(40.0) // (130 - 110) * 2 = 40.0

    // 2. Now alter the product master price drastically
    const updateRes = await request(app)
      .put(`/api/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        usual_price: 200.0,
        our_price: 180.0,
        cost_price: 120.0,
      })
    expect(updateRes.status).toBe(200)

    // 3. Re-fetch the earlier sale and verify that its snapshots and totals are completely unchanged
    const verifySaleRes = await request(app)
      .get(`/api/sales/${sale.id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(verifySaleRes.status).toBe(200)
    const reloadedSale = verifySaleRes.body.data
    expect(Number(reloadedSale.total_amount)).toBe(220.0)
    const reloadedItem = reloadedSale.items[0]
    expect(Number(reloadedItem.unit_price)).toBe(110.0)
    expect(Number(reloadedItem.usual_price_snapshot)).toBe(130.0)
    expect(Number(reloadedItem.our_price_snapshot)).toBe(110.0)
    expect(Number(reloadedItem.cost_price_snapshot)).toBe(75.0)
    expect(Number(reloadedItem.predefined_discount_amount)).toBe(40.0)
  })
})
