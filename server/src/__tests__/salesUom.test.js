const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let cashier, cashierToken, category, riceProduct, soapProduct

beforeAll(async () => {
  cashier = await prisma.user.create({
    data: {
      username: 'uom_cashier_' + Date.now(),
      email: `uom_cashier_${Date.now()}@test.com`,
      password_hash: await bcrypt.hash('cashier123', 4),
      full_name: 'UOM Cashier',
      role: 'CASHIER',
    },
  })

  cashierToken = (
    await request(app).post('/api/auth/login').send({ username: cashier.username, password: 'cashier123' })
  ).body.data.accessToken

  category = await prisma.category.create({
    data: { name: 'UOM_Test_Cat_' + Date.now() },
  })

  // Weight product: Rice (5,000 g in stock, price 20 per kg)
  riceProduct = await prisma.product.create({
    data: {
      name: 'UOM Jasmine Rice',
      sku: 'UOM-RICE-' + Date.now(),
      category_id: category.id,
      unit_category: 'WEIGHT',
      base_unit: 'g',
      pricing_unit: 'kg',
      price: 20.0,
      cost_price: 14.0,
      quantity: 5000,
      low_stock_threshold: 1000,
    },
  })

  // Count product: Soap (10 pcs in stock, price 5 per pcs)
  soapProduct = await prisma.product.create({
    data: {
      name: 'UOM Bar Soap',
      sku: 'UOM-SOAP-' + Date.now(),
      category_id: category.id,
      unit_category: 'COUNT',
      base_unit: 'pcs',
      pricing_unit: 'pcs',
      price: 5.0,
      cost_price: 3.0,
      quantity: 10,
      low_stock_threshold: 2,
    },
  })
})

afterAll(async () => {
  const productIds = [riceProduct?.id, soapProduct?.id].filter(Boolean)
  const sales = await prisma.sale.findMany({
    where: { sale_items: { some: { product_id: { in: productIds } } } },
    select: { id: true },
  })
  const saleIds = sales.map((s) => s.id)

  await prisma.inventoryLog.deleteMany({ where: { product_id: { in: productIds } } })
  await prisma.payment.deleteMany({ where: { sale_id: { in: saleIds } } })
  await prisma.saleItem.deleteMany({ where: { sale_id: { in: saleIds } } })
  await prisma.sale.deleteMany({ where: { id: { in: saleIds } } })
  await prisma.product.deleteMany({ where: { id: { in: productIds } } })
  if (category?.id) await prisma.category.delete({ where: { id: category.id } })
  if (cashier?.id) {
    await prisma.authLog.deleteMany({ where: { user_id: cashier.id } })
    await prisma.user.delete({ where: { id: cashier.id } })
  }
  await prisma.$disconnect()
})

describe('UOM Sales Integration', () => {
  it('sells 500 g of rice at 20.00/kg (line total 10.00) and deducts 500 g', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [
          {
            product_id: riceProduct.id,
            quantity: 500,
            unit: 'g',
          },
        ],
        payment_method: 'CASH',
        amount_paid: 10.0,
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    const sale = res.body.data
    expect(parseFloat(sale.total_amount)).toBe(10.0)

    const item = sale.items[0]
    expect(item.unit).toBe('g')
    expect(parseFloat(item.quantity)).toBe(500)
    expect(parseFloat(item.base_quantity)).toBe(500)
    expect(item.base_unit).toBe('g')
    expect(item.pricing_unit).toBe('kg')
    expect(parseFloat(item.total)).toBe(10.0)

    // Check product stock in DB
    const updatedRice = await prisma.product.findUnique({ where: { id: riceProduct.id } })
    expect(parseFloat(updatedRice.quantity)).toBe(4500)
  })

  it('sells 1.5 kg of rice at 20.00/kg (line total 30.00) and deducts 1500 g', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [
          {
            product_id: riceProduct.id,
            quantity: 1.5,
            unit: 'kg',
          },
        ],
        payment_method: 'CASH',
        amount_paid: 30.0,
      })

    expect(res.status).toBe(201)
    const sale = res.body.data
    expect(parseFloat(sale.total_amount)).toBe(30.0)

    const item = sale.items[0]
    expect(item.unit).toBe('kg')
    expect(parseFloat(item.quantity)).toBe(1.5)
    expect(parseFloat(item.base_quantity)).toBe(1500)

    // Check product stock in DB: was 4500, now 3000
    const updatedRice = await prisma.product.findUnique({ where: { id: riceProduct.id } })
    expect(parseFloat(updatedRice.quantity)).toBe(3000)
  })

  it('rejects selling fractional quantity for COUNT product', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [
          {
            product_id: soapProduct.id,
            quantity: 1.5,
            unit: 'pcs',
          },
        ],
        payment_method: 'CASH',
        amount_paid: 10.0,
      })

    expect(res.status).toBe(422)
  })

  it('rejects selling more stock than available in base units', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [
          {
            product_id: riceProduct.id,
            quantity: 10, // 10 kg = 10,000 g, only 3,000 g remaining
            unit: 'kg',
          },
        ],
        payment_method: 'CASH',
        amount_paid: 200.0,
      })

    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('Insufficient stock')
  })
})
