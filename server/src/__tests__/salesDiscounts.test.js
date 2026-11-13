require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(30000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let adminUser, adminToken, testCategory, testProduct

async function login(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: 'testpass123' })
  return res.body.data.accessToken
}

beforeAll(async () => {
  const password_hash = await bcrypt.hash('testpass123', 4)
  adminUser = await prisma.user.create({
    data: {
      username: 'discount_test_admin_' + Date.now(),
      email: `discount_admin_${Date.now()}@test.com`,
      password_hash,
      full_name: 'Discount Admin',
      role: 'ADMIN',
    },
  })
  adminToken = await login(adminUser.username)

  testCategory = await prisma.category.create({
    data: {
      name: 'Discount_Test_Category_' + Date.now(),
      description: 'Testing predefined and cart discounts',
    },
  })

  // Sugar: Cost = 70, Usual = 120, Our = 100, Qty = 50
  testProduct = await prisma.product.create({
    data: {
      name: 'Discount Test Sugar',
      sku: 'SUGAR-DISC-' + Date.now(),
      category_id: testCategory.id,
      cost_price: 70.0,
      usual_price: 120.0,
      our_price: 100.0,
      price: 100.0,
      quantity: 50,
      unit_category: 'COUNT',
      base_unit: 'pcs',
      pricing_unit: 'pcs',
    },
  })
})

afterAll(async () => {
  if (testProduct?.id) {
    const saleItems = await prisma.saleItem.findMany({
      where: { product_id: testProduct.id },
      select: { sale_id: true },
    })
    const saleIds = saleItems.map((si) => si.sale_id)
    if (saleIds.length > 0) {
      await prisma.payment.deleteMany({ where: { sale_id: { in: saleIds } } })
      await prisma.saleItem.deleteMany({ where: { sale_id: { in: saleIds } } })
      await prisma.sale.deleteMany({ where: { id: { in: saleIds } } })
    }
    await prisma.inventoryLog.deleteMany({ where: { product_id: testProduct.id } })
    await prisma.product.delete({ where: { id: testProduct.id } })
  }
  if (testCategory?.id) {
    await prisma.category.delete({ where: { id: testCategory.id } })
  }
  if (adminUser?.id) {
    await prisma.user.delete({ where: { id: adminUser.id } })
  }
  await prisma.$disconnect()
})

describe('Batch 3: Predefined & Cart Discounts', () => {
  it('completes sale with predefined discount active (Our Price) and additional cart discount', async () => {
    // 2 units at Our Price (100) = 200 subtotal. Predefined discount = 2 × (120 - 100) = 40.
    // Additional cart discount = 15. Total amount = 185.
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            product_id: testProduct.id,
            quantity: 2,
            predefined_discount_applied: true,
          },
        ],
        discount_amount: 15,
        payment_method: 'CASH',
        amount_paid: 200,
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    const sale = res.body.data
    expect(parseFloat(sale.subtotal)).toBe(200.0)
    expect(parseFloat(sale.discount_amount)).toBe(15.0)
    expect(parseFloat(sale.total_amount)).toBe(185.0)

    const item = sale.items[0]
    expect(parseFloat(item.usual_price_snapshot)).toBe(120.0)
    expect(parseFloat(item.our_price_snapshot)).toBe(100.0)
    expect(parseFloat(item.cost_price_snapshot)).toBe(70.0)
    expect(item.predefined_discount_applied).toBe(true)
    expect(parseFloat(item.predefined_discount_amount)).toBe(40.0)
    expect(parseFloat(item.unit_price)).toBe(100.0)
    expect(parseFloat(item.total)).toBe(200.0)
  })

  it('completes sale with predefined discount disabled (Usual Price)', async () => {
    // 2 units at Usual Price (120) = 240 subtotal. Predefined discount = 0.
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            product_id: testProduct.id,
            quantity: 2,
            predefined_discount_applied: false,
          },
        ],
        discount_amount: 0,
        payment_method: 'CASH',
        amount_paid: 240,
      })

    expect(res.status).toBe(201)
    const sale = res.body.data
    expect(parseFloat(sale.subtotal)).toBe(240.0)
    expect(parseFloat(sale.total_amount)).toBe(240.0)

    const item = sale.items[0]
    expect(item.predefined_discount_applied).toBe(false)
    expect(parseFloat(item.predefined_discount_amount)).toBe(0.0)
    expect(parseFloat(item.unit_price)).toBe(120.0)
    expect(parseFloat(item.total)).toBe(240.0)
  })

  it('rejects negative cart discount and discount greater than subtotal', async () => {
    const resNeg = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 1 }],
        discount_amount: -5,
        payment_method: 'CASH',
        amount_paid: 100,
      })
    expect(resNeg.status).toBe(422)

    const resTooLarge = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ product_id: testProduct.id, quantity: 1 }],
        discount_amount: 500,
        payment_method: 'CASH',
        amount_paid: 100,
      })
    expect(resTooLarge.status).toBe(422)
  })

  it('uses a transaction-only our_price override for sale totals without changing the product catalog price', async () => {
    const catalogBefore = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(parseFloat(catalogBefore.our_price)).toBe(100.0)

    // 2 units at overridden our price 90 = 180. Predefined discount = 2 × (120 - 90) = 60.
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            product_id: testProduct.id,
            quantity: 2,
            predefined_discount_applied: true,
            our_price: 90,
          },
        ],
        payment_method: 'CASH',
        amount_paid: 180,
      })

    expect(res.status).toBe(201)
    const sale = res.body.data
    expect(parseFloat(sale.subtotal)).toBe(180.0)
    expect(parseFloat(sale.total_amount)).toBe(180.0)

    const item = sale.items[0]
    expect(parseFloat(item.usual_price_snapshot)).toBe(120.0)
    expect(parseFloat(item.our_price_snapshot)).toBe(90.0)
    expect(parseFloat(item.unit_price)).toBe(90.0)
    expect(parseFloat(item.predefined_discount_amount)).toBe(60.0)
    expect(parseFloat(item.total)).toBe(180.0)

    const catalogAfter = await prisma.product.findUnique({ where: { id: testProduct.id } })
    expect(parseFloat(catalogAfter.our_price)).toBe(100.0)
    expect(parseFloat(catalogAfter.price)).toBe(100.0)
  })
})
