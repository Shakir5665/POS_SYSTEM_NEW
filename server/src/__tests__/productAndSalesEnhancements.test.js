require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(60000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

describe('Product and Sales Management Enhancements', () => {
  let adminToken
  let adminUser
  let testCategory
  let testBrand
  let testProduct

  beforeAll(async () => {
    // 1. Setup Admin user
    const hash = await bcrypt.hash('admin123', 10)
    adminUser = await prisma.user.upsert({
      where: { username: 'test_admin_enhancements' },
      update: { role: 'ADMIN', is_active: true },
      create: {
        username: 'test_admin_enhancements',
        email: 'test_admin_enhancements@example.com',
        password_hash: hash,
        full_name: 'Test Admin Enhancements',
        role: 'ADMIN',
        is_active: true,
      },
    })

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin_enhancements', password: 'admin123' })
    adminToken = loginRes.body.data.accessToken

    // 2. Setup Category
    testCategory = await prisma.category.upsert({
      where: { name: 'Enhancement Category' },
      update: {},
      create: { name: 'Enhancement Category', description: 'Test category' },
    })

    // Clean any previous run leftovers
    await prisma.inventoryLog.deleteMany({ where: { user: { username: 'test_admin_enhancements' } } })
    await prisma.salesReturnItem.deleteMany({ where: { sales_return: { user: { username: 'test_admin_enhancements' } } } })
    await prisma.salesReturn.deleteMany({ where: { user: { username: 'test_admin_enhancements' } } })
    await prisma.payment.deleteMany({ where: { sale: { user: { username: 'test_admin_enhancements' } } } })
    await prisma.saleItem.deleteMany({ where: { sale: { user: { username: 'test_admin_enhancements' } } } })
    await prisma.sale.deleteMany({ where: { user: { username: 'test_admin_enhancements' } } })
    await prisma.product.deleteMany({ where: { sku: 'ENHANCE-PROD-001' } })

    // 3. Setup Brand & Product
    testBrand = await prisma.brand.upsert({
      where: { name: 'Initial Test Brand' },
      update: {},
      create: { name: 'Initial Test Brand', description: 'Initial brand' },
    })

    testProduct = await prisma.product.create({
      data: {
        name: 'Enhancement Test Product',
        sku: 'ENHANCE-PROD-001',
        category_id: testCategory.id,
        brand_id: testBrand.id,
        price: 150,
        usual_price: 150,
        our_price: 150,
        quantity: 500,
      },
      include: { brand: true, category: true },
    })
  })

  afterAll(async () => {
    // Cleanup
    if (adminUser) {
      await prisma.inventoryLog.deleteMany({ where: { user_id: adminUser.id } })
      await prisma.salesReturnItem.deleteMany({
        where: { sales_return: { user_id: adminUser.id } },
      })
      await prisma.salesReturn.deleteMany({ where: { user_id: adminUser.id } })
      await prisma.saleItem.deleteMany({ where: { sale: { user_id: adminUser.id } } })
      await prisma.payment.deleteMany({ where: { sale: { user_id: adminUser.id } } })
      await prisma.sale.deleteMany({ where: { user_id: adminUser.id } })
    }
    if (testProduct) {
      await prisma.product.deleteMany({ where: { id: testProduct.id } })
    }
    if (testBrand) {
      await prisma.brand.deleteMany({ where: { id: testBrand.id } })
    }
    await prisma.brand.deleteMany({ where: { name: { startsWith: 'Test Brand' } } })
    await prisma.variation.deleteMany({ where: { name: { startsWith: 'Test Variation' } } })
    if (testCategory) {
      await prisma.category.deleteMany({ where: { id: testCategory.id } })
    }
    if (adminUser) {
      await prisma.user.deleteMany({ where: { id: adminUser.id } })
    }
  })

  // ----------------------------------------------------
  // BRANDS MANAGEMENT
  // ----------------------------------------------------
  describe('Brands Management (/api/brands)', () => {
    let createdBrandId

    it('creates a new brand', async () => {
      const res = await request(app)
        .post('/api/brands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Brand Alpha', description: 'Alpha quality brand' })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.name).toBe('Test Brand Alpha')
      createdBrandId = res.body.data.id
      testBrand = res.body.data
    })

    it('rejects duplicate brand name', async () => {
      const res = await request(app)
        .post('/api/brands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Brand Alpha' })

      expect(res.status).toBe(409)
      expect(res.body.success).toBe(false)
    })

    it('lists brands with product count', async () => {
      const res = await request(app)
        .get('/api/brands')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      const found = res.body.data.find((b) => b.id === createdBrandId)
      expect(found).toBeDefined()
      expect(found._count).toBeDefined()
    })

    it('updates a brand', async () => {
      const res = await request(app)
        .put(`/api/brands/${createdBrandId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Brand Alpha Updated', description: 'Updated desc' })

      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('Test Brand Alpha Updated')
    })

    it('assigns brand to a product and lists it', async () => {
      const prodRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Branded Test Product',
          sku: 'BRANDED-PROD-001',
          category_id: testCategory.id,
          brand_id: createdBrandId,
          price: 150,
          usual_price: 150,
          our_price: 150,
          quantity: 20,
        })

      expect(prodRes.status).toBe(201)
      expect(prodRes.body.data.brand_id).toBe(createdBrandId)
      expect(prodRes.body.data.brand.name).toBe('Test Brand Alpha Updated')
      testProduct = prodRes.body.data
    })

    it('safely unlinks products when a brand is deleted', async () => {
      // Create temporary brand and product
      const tempBrandRes = await request(app)
        .post('/api/brands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Brand To Delete' })
      const tempBrandId = tempBrandRes.body.data.id

      const tempProd = await prisma.product.create({
        data: {
          name: 'Temp Brand Prod',
          sku: 'TEMP-BRAND-SKU',
          category_id: testCategory.id,
          brand_id: tempBrandId,
          price: 100,
          usual_price: 100,
          our_price: 100,
          quantity: 10,
        },
      })

      const delRes = await request(app)
        .delete(`/api/brands/${tempBrandId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(delRes.status).toBe(200)
      expect(delRes.body.data.affected_products).toBe(1)

      // Verify product is still alive but brand_id is null
      const checkProd = await prisma.product.findUnique({ where: { id: tempProd.id } })
      expect(checkProd).toBeDefined()
      expect(checkProd.brand_id).toBeNull()

      await prisma.product.delete({ where: { id: tempProd.id } })
    })
  })

  // ----------------------------------------------------
  // VARIATIONS MANAGEMENT
  // ----------------------------------------------------
  describe('Variations Management (/api/variations)', () => {
    let createdVarId

    it('creates a variation with multiple values', async () => {
      const res = await request(app)
        .post('/api/variations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Variation Size',
          values: ['Small', 'Medium', 'Large', 'Small'], // Duplicate 'Small' should be deduplicated
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.name).toBe('Test Variation Size')
      expect(res.body.data.values.length).toBe(3)
      createdVarId = res.body.data.id
    })

    it('rejects duplicate variation name', async () => {
      const res = await request(app)
        .post('/api/variations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Variation Size',
          values: ['XL'],
        })

      expect(res.status).toBe(409)
    })

    it('updates variation name and replaces values tags', async () => {
      const res = await request(app)
        .put(`/api/variations/${createdVarId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Variation Apparel Size',
          values: ['S', 'M', 'L', 'XL'],
        })

      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('Test Variation Apparel Size')
      expect(res.body.data.values.length).toBe(4)
      const valuesList = res.body.data.values.map((v) => v.value)
      expect(valuesList).toContain('XL')
    })

    it('lists variations with pagination', async () => {
      const res = await request(app)
        .get('/api/variations?page=1&per_page=10')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.length).toBeGreaterThan(0)
      expect(res.body.meta).toBeDefined()
    })

    it('deletes variation', async () => {
      const res = await request(app)
        .delete(`/api/variations/${createdVarId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)

      const check = await prisma.variation.findUnique({ where: { id: createdVarId } })
      expect(check).toBeNull()
    })
  })

  // ----------------------------------------------------
  // SALES MANAGEMENT ENHANCEMENTS
  // ----------------------------------------------------
  describe('Sales Enhancements (Payments, Edit, Void, Cancel, PDF)', () => {
    let enhancementSale

    beforeEach(async () => {
      await prisma.product.update({
        where: { id: testProduct.id },
        data: { quantity: 100 },
      })

      // Create a sale for testing
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            {
              product_id: testProduct.id,
              quantity: 2,
              unit: 'pcs',
            },
          ],
          payment_method: 'CASH',
          amount_paid: 300,
        })
      expect(res.status).toBe(201)
      enhancementSale = res.body.data
    })

    it('GET /api/sales/:id/payments returns payment history', async () => {
      const res = await request(app)
        .get(`/api/sales/${enhancementSale.id}/payments`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.payments.length).toBeGreaterThan(0)
      expect(res.body.data.payments[0].payment_type).toBe('CHECKOUT')
      expect(res.body.data.payments[0].status).toBe('COMPLETED')
    })

    it('POST /api/sales/:id/payments/:paymentId/void voids payment and recalculates balance without altering stock', async () => {
      // Check initial product stock
      const prodBefore = await prisma.product.findUnique({ where: { id: testProduct.id } })

      const paymentsRes = await request(app)
        .get(`/api/sales/${enhancementSale.id}/payments`)
        .set('Authorization', `Bearer ${adminToken}`)
      const paymentId = paymentsRes.body.data.payments[0].id

      const voidRes = await request(app)
        .post(`/api/sales/${enhancementSale.id}/payments/${paymentId}/void`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Accidental checkout cash entry' })

      expect(voidRes.status).toBe(200)
      expect(voidRes.body.success).toBe(true)

      // Check payment status on sale is now PENDING and balance_due is full
      const saleAfter = await prisma.sale.findUnique({ where: { id: enhancementSale.id } })
      expect(saleAfter.payment_status).toBe('PENDING')
      expect(Number(saleAfter.amount_paid)).toBe(0)
      expect(Number(saleAfter.balance_due)).toBe(Number(saleAfter.total_amount))

      // Critical rule: stock must NOT have changed!
      const prodAfter = await prisma.product.findUnique({ where: { id: testProduct.id } })
      expect(Number(prodAfter.quantity)).toBe(Number(prodBefore.quantity))
    })

    it('PUT /api/sales/:id safely updates sale items and applies net stock difference', async () => {
      const prodBefore = await prisma.product.findUnique({ where: { id: testProduct.id } })
      const currentStock = Number(prodBefore.quantity)

      // Increase quantity from 2 to 4 (net increase of 2, so stock decreases by 2)
      const editRes = await request(app)
        .put(`/api/sales/${enhancementSale.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            {
              id: enhancementSale.items[0].id,
              product_id: testProduct.id,
              quantity: 4,
            },
          ],
          notes: 'Customer wanted 2 more units',
        })

      expect(editRes.status).toBe(200)
      expect(editRes.body.success).toBe(true)

      const prodAfter = await prisma.product.findUnique({ where: { id: testProduct.id } })
      expect(Number(prodAfter.quantity)).toBe(currentStock - 2)

      const saleAfter = await prisma.sale.findUnique({ where: { id: enhancementSale.id } })
      expect(Number(saleAfter.total_amount)).toBe(600)
    })

    it('PUT /api/sales/:id safely updates sale items when sent with sale_item_id key', async () => {
      // Edit using sale_item_id (like frontend forms send)
      const editRes = await request(app)
        .put(`/api/sales/${enhancementSale.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            {
              sale_item_id: enhancementSale.items[0].id,
              quantity: 3,
            },
          ],
          notes: 'Customer changed mind to 3 units',
        })

      expect(editRes.status).toBe(200)
      expect(editRes.body.success).toBe(true)
      const saleAfter = await prisma.sale.findUnique({ where: { id: enhancementSale.id } })
      expect(Number(saleAfter.total_amount)).toBe(450)
    })

    it('DELETE /api/sales/:id safely cancels sale and restores warehouse stock', async () => {
      const prodBefore = await prisma.product.findUnique({ where: { id: testProduct.id } })
      const currentStock = Number(prodBefore.quantity)

      const delRes = await request(app)
        .delete(`/api/sales/${enhancementSale.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Customer cancelled transaction entirely' })

      expect(delRes.status).toBe(200)
      expect(delRes.body.success).toBe(true)

      // Stock must be restored (sale had 2 items restored)
      const prodAfter = await prisma.product.findUnique({ where: { id: testProduct.id } })
      expect(Number(prodAfter.quantity)).toBe(currentStock + 2)

      // Prevent double cancellation
      const delAgain = await request(app)
        .delete(`/api/sales/${enhancementSale.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Repeat cancellation' })
      expect(delAgain.status).toBe(422)
    })

    it('GET /api/sale-pdf-download/:id downloads invoice PDF in A4 and A5 formats', async () => {
      const resA4 = await request(app)
        .get(`/api/sale-pdf-download/${enhancementSale.id}?format=a4`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(resA4.status).toBe(200)
      expect(resA4.headers['content-type']).toBe('application/pdf')
      expect(resA4.headers['content-disposition']).toContain('attachment')
      expect(resA4.body.length).toBeGreaterThan(500)

      const resA5 = await request(app)
        .get(`/api/sale-pdf-download/${enhancementSale.id}?format=a5`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(resA5.status).toBe(200)
      expect(resA5.headers['content-type']).toBe('application/pdf')
    })
  })

  // ----------------------------------------------------
  // SALES RETURN ENHANCEMENTS
  // ----------------------------------------------------
  describe('Sales Return Enhancements (Cancellation and PDF)', () => {
    let returnSale
    let createdReturn

    beforeEach(async () => {
      await prisma.product.update({
        where: { id: testProduct.id },
        data: { quantity: 100 },
      })

      const sRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 5 }],
          payment_method: 'CASH',
          amount_paid: 750,
        })
      returnSale = sRes.body.data

      const retRes = await request(app)
        .post('/api/sales/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sale_id: returnSale.id,
          reason: 'Defective batch replacement',
          items: [
            {
              sale_item_id: returnSale.items[0].id,
              quantity: 2,
              restock: true,
            },
          ],
        })
      expect(retRes.status).toBe(201)
      createdReturn = retRes.body.data
    })

    it('GET /api/sale-return-pdf-download/:id downloads Credit Note PDF', async () => {
      const res = await request(app)
        .get(`/api/sale-return-pdf-download/${createdReturn.id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('application/pdf')
      expect(res.headers['content-disposition']).toContain('Credit-Note-')
      expect(res.body.length).toBeGreaterThan(500)
    })

    it('DELETE /api/sales/returns/:id safely cancels return and reverses restocked stock', async () => {
      const prodBefore = await prisma.product.findUnique({ where: { id: testProduct.id } })
      const currentStock = Number(prodBefore.quantity)

      const delRes = await request(app)
        .delete(`/api/sales/returns/${createdReturn.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Return processed in error by cashier' })

      expect(delRes.status).toBe(200)
      expect(delRes.body.success).toBe(true)

      // Restocked quantity (2) should be deducted back from product stock
      const prodAfter = await prisma.product.findUnique({ where: { id: testProduct.id } })
      expect(Number(prodAfter.quantity)).toBe(currentStock - 2)

      // Return record marked cancelled
      const srAfter = await prisma.salesReturn.findUnique({ where: { id: createdReturn.id } })
      expect(srAfter.is_cancelled).toBe(true)
    })
  })
})
