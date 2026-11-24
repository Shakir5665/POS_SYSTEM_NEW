const request = require('supertest')
const jwt = require('jsonwebtoken')
const app = require('../app')
const prisma = require('../utils/prismaClient')

jest.setTimeout(30000)

function generateAccessToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_ACCESS_SECRET || 'access_secret', { expiresIn: '1h' })
}

describe('Multi-Branch Stock Transfers API', () => {
  let adminUser
  let adminToken
  let cashierUser
  let cashierToken
  let sourceWarehouse
  let destWarehouse
  let testProduct

  beforeAll(async () => {
    // 1. Create admin and cashier
    const ts = Date.now()
    adminUser = await prisma.user.create({
      data: {
        username: `transfer_admin_${ts}`,
        email: `transfer_admin_${ts}@test.com`,
        password_hash: 'dummy_hash',
        full_name: 'Transfer Admin',
        role: 'ADMIN',
      },
    })
    adminToken = generateAccessToken(adminUser.id, adminUser.role)

    cashierUser = await prisma.user.create({
      data: {
        username: `transfer_cashier_${ts}`,
        email: `transfer_cashier_${ts}@test.com`,
        password_hash: 'dummy_hash',
        full_name: 'Transfer Cashier',
        role: 'CASHIER',
      },
    })
    cashierToken = generateAccessToken(cashierUser.id, cashierUser.role)

    // 2. Create two warehouses
    sourceWarehouse = await prisma.warehouse.create({
      data: {
        code: `WH_SRC_${ts}`,
        name: `Source Branch ${ts}`,
        address: '100 North St',
      },
    })

    destWarehouse = await prisma.warehouse.create({
      data: {
        code: `WH_DST_${ts}`,
        name: `Destination Branch ${ts}`,
        address: '200 South St',
      },
    })

    // 3. Create product with initial global stock = 50
    testProduct = await prisma.product.create({
      data: {
        name: `Transfer Product ${ts}`,
        sku: `SKU-TRF-${ts}`,
        price: 25.0,
        cost_price: 15.0,
        quantity: 50,
      },
    })

    // 4. Initialize source branch stock = 50, dest branch stock = 0
    await prisma.warehouseStock.create({
      data: {
        warehouse_id: sourceWarehouse.id,
        product_id: testProduct.id,
        quantity: 50,
      },
    })

    await prisma.warehouseStock.create({
      data: {
        warehouse_id: destWarehouse.id,
        product_id: testProduct.id,
        quantity: 0,
      },
    })
  })

  afterAll(async () => {
    // Clean up
    await prisma.stockTransferItem.deleteMany({
      where: { product_id: testProduct.id },
    })
    await prisma.stockTransfer.deleteMany({
      where: {
        OR: [
          { source_warehouse_id: sourceWarehouse.id },
          { destination_warehouse_id: destWarehouse.id },
        ],
      },
    })
    await prisma.warehouseStock.deleteMany({
      where: { product_id: testProduct.id },
    })
    await prisma.inventoryLog.deleteMany({
      where: { product_id: testProduct.id },
    })
    await prisma.product.deleteMany({
      where: { id: testProduct.id },
    })
    await prisma.warehouse.deleteMany({
      where: { id: { in: [sourceWarehouse.id, destWarehouse.id] } },
    })
    await prisma.user.deleteMany({
      where: { id: { in: [adminUser.id, cashierUser.id] } },
    })
  })

  describe('1. Security & Authorization', () => {
    it('blocks unauthenticated access to transfers', async () => {
      const res = await request(app).get('/api/transfers')
      expect(res.status).toBe(401)
    })

    it('blocks non-manager users (e.g. Cashier) from initiating a transfer', async () => {
      const res = await request(app)
        .post('/api/transfers')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          from_warehouse_id: sourceWarehouse.id,
          to_warehouse_id: destWarehouse.id,
          items: [{ product_id: testProduct.id, quantity: 10 }],
        })
      expect(res.status).toBe(403)
    })
  })

  describe('2. Inter-Branch Transfer Workflow', () => {
    let createdTransferId

    it('rejects transfer when source and destination are identical', async () => {
      const res = await request(app)
        .post('/api/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          from_warehouse_id: sourceWarehouse.id,
          to_warehouse_id: sourceWarehouse.id,
          items: [{ product_id: testProduct.id, quantity: 5 }],
        })
      expect(res.status).toBe(422)
    })

    it('rejects transfer when requested quantity exceeds source branch stock', async () => {
      const res = await request(app)
        .post('/api/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          from_warehouse_id: sourceWarehouse.id,
          to_warehouse_id: destWarehouse.id,
          items: [{ product_id: testProduct.id, quantity: 100 }], // only 50 available
        })
      expect(res.status).toBe(422)
    })

    it('successfully initiates a transfer: deducts source stock and sets status to IN_TRANSIT', async () => {
      const res = await request(app)
        .post('/api/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          from_warehouse_id: sourceWarehouse.id,
          to_warehouse_id: destWarehouse.id,
          notes: 'Inter-branch weekend replenishment',
          items: [{ product_id: testProduct.id, quantity: 20 }],
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('IN_TRANSIT')
      expect(res.body.data.items).toHaveLength(1)
      expect(Number(res.body.data.items[0].quantity)).toBe(20)

      createdTransferId = res.body.data.id

      // Check source warehouse stock: was 50, now 30
      const srcStock = await prisma.warehouseStock.findUnique({
        where: {
          warehouse_id_product_id: {
            warehouse_id: sourceWarehouse.id,
            product_id: testProduct.id,
          },
        },
      })
      expect(Number(srcStock.quantity)).toBe(30)
    })

    it('allows listing transfers and viewing transfer details', async () => {
      const listRes = await request(app)
        .get('/api/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(listRes.status).toBe(200)
      expect(listRes.body.data.length).toBeGreaterThan(0)

      const detailRes = await request(app)
        .get(`/api/transfers/${createdTransferId}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(detailRes.status).toBe(200)
      expect(detailRes.body.data.id).toBe(createdTransferId)
      expect(detailRes.body.data.status).toBe('IN_TRANSIT')
    })

    it('successfully receives the transfer at destination branch: increments destination stock', async () => {
      const receiveRes = await request(app)
        .post(`/api/transfers/${createdTransferId}/receive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Shipment verified intact' })

      expect(receiveRes.status).toBe(200)
      expect(receiveRes.body.success).toBe(true)
      expect(receiveRes.body.data.status).toBe('COMPLETED')

      // Check destination warehouse stock: was 0, now 20
      const dstStock = await prisma.warehouseStock.findUnique({
        where: {
          warehouse_id_product_id: {
            warehouse_id: destWarehouse.id,
            product_id: testProduct.id,
          },
        },
      })
      expect(Number(dstStock.quantity)).toBe(20)

      // Verify total global stock invariant: Source (30) + Destination (20) = 50
      const srcStock = await prisma.warehouseStock.findUnique({
        where: {
          warehouse_id_product_id: {
            warehouse_id: sourceWarehouse.id,
            product_id: testProduct.id,
          },
        },
      })
      expect(Number(srcStock.quantity) + Number(dstStock.quantity)).toBe(50)
    })

    it('rejects duplicate receive on already completed transfer', async () => {
      const dupRes = await request(app)
        .post(`/api/transfers/${createdTransferId}/receive`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(dupRes.status).toBe(400)
    })
  })
})
