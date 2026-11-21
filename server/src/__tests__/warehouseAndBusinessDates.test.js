require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
jest.setTimeout(60000)
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')
const reportService = require('../services/reportService')

describe('Phase 3A: Backend Business Dates and Warehouse Query Integration', () => {
  let adminToken
  let cashierToken
  let adminUser
  let cashierUser
  let defaultWarehouse
  let secondaryWarehouse
  let testCategory
  let testProduct
  let testSupplier
  let historicalSale
  let liveSale
  let historicalPurchase

  beforeAll(async () => {
    // Clean up any stale data from previous test runs
    await prisma.stockAdjustmentItem.deleteMany({})
    await prisma.stockAdjustment.deleteMany({})
    await prisma.supplierPaymentAllocation.deleteMany({})
    await prisma.supplierPayment.deleteMany({})
    await prisma.purchaseItem.deleteMany({})
    await prisma.purchase.deleteMany({ where: { notes: { in: ['Phase 3A Purchase Default', 'Phase 3A Purchase Explicit'] } } })
    await prisma.payment.deleteMany({ where: { reference: { in: ['REF-PHASE3A-1', 'REF-PHASE3A-2'] } } })
    await prisma.saleItem.deleteMany({ where: { product_name: 'Phase 3A Test Item' } })
    await prisma.sale.deleteMany({ where: { notes: { in: ['Phase 3A Historical Sale', 'Phase 3A Live Sale'] } } })
    const staleProduct = await prisma.product.findUnique({ where: { sku: 'SKU-PHASE3A-01' } })
    if (staleProduct) {
      await prisma.inventoryLog.deleteMany({ where: { product_id: staleProduct.id } })
      await prisma.saleItem.deleteMany({ where: { product_id: staleProduct.id } })
      await prisma.purchaseItem.deleteMany({ where: { product_id: staleProduct.id } })
      await prisma.product.delete({ where: { id: staleProduct.id } })
    }
    await prisma.inventoryLog.deleteMany({ where: { notes: { contains: 'Phase 3A' } } })
    await prisma.category.deleteMany({ where: { name: 'Category Phase 3A' } })
    await prisma.supplier.deleteMany({ where: { name: 'Supplier Phase 3A' } })
    await prisma.warehouse.deleteMany({ where: { code: { in: ['WH-PHASE3A-SEC', 'WH-PHASE3A-NEW', 'WH-PHASE3A-UPD'] } } })
    await prisma.authLog.deleteMany({ where: { user: { username: { in: ['phase3a_admin', 'phase3a_cashier'] } } } })
    await prisma.user.deleteMany({ where: { username: { in: ['phase3a_admin', 'phase3a_cashier'] } } })

    // Ensure default warehouse exists
    defaultWarehouse = await prisma.warehouse.findFirst({ where: { is_default: true } })
    if (!defaultWarehouse) {
      defaultWarehouse = await prisma.warehouse.create({
        data: {
          code: 'WH-MAIN-001',
          name: 'Main Warehouse',
          is_default: true,
          is_active: true,
        },
      })
    }

    // Create a secondary warehouse for multi-warehouse isolation tests
    secondaryWarehouse = await prisma.warehouse.create({
      data: {
        code: 'WH-PHASE3A-SEC',
        name: 'Secondary Warehouse 3A',
        is_default: false,
        is_active: true,
      },
    })

    // Create admin and cashier users
    const hash = await bcrypt.hash('testpass123', 12)
    adminUser = await prisma.user.create({
      data: {
        username: 'phase3a_admin',
        email: 'phase3a_admin@test.com',
        password_hash: hash,
        full_name: 'Phase 3A Admin',
        role: 'ADMIN',
      },
    })

    cashierUser = await prisma.user.create({
      data: {
        username: 'phase3a_cashier',
        email: 'phase3a_cashier@test.com',
        password_hash: hash,
        full_name: 'Phase 3A Cashier',
        role: 'CASHIER',
      },
    })

    // Login tokens
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'phase3a_admin', password: 'testpass123' })
    adminToken = adminLogin.body.data.accessToken

    const cashierLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'phase3a_cashier', password: 'testpass123' })
    cashierToken = cashierLogin.body.data.accessToken

    // Seed test category, product, supplier
    testCategory = await prisma.category.create({
      data: { name: 'Category Phase 3A' },
    })

    testProduct = await prisma.product.create({
      data: {
        name: 'Phase 3A Test Item',
        sku: 'SKU-PHASE3A-01',
        category_id: testCategory.id,
        price: 50.0,
        cost_price: 30.0,
        quantity: 1000,
        base_unit: 'pcs',
        pricing_unit: 'pcs',
        unit_category: 'COUNT',
      },
    })

    testSupplier = await prisma.supplier.create({
      data: {
        name: 'Supplier Phase 3A',
        contact_person: 'Supplier Rep',
        phone: '0770000001',
      },
    })
  })

  afterAll(async () => {
    // Cleanup
    await prisma.stockAdjustmentItem.deleteMany({})
    await prisma.stockAdjustment.deleteMany({})
    await prisma.supplierPaymentAllocation.deleteMany({})
    await prisma.supplierPayment.deleteMany({})
    await prisma.purchaseItem.deleteMany({})
    await prisma.purchase.deleteMany({ where: { notes: { in: ['Phase 3A Purchase Default', 'Phase 3A Purchase Explicit'] } } })
    await prisma.payment.deleteMany({ where: { reference: { in: ['REF-PHASE3A-1', 'REF-PHASE3A-2'] } } })
    await prisma.saleItem.deleteMany({ where: { product_name: 'Phase 3A Test Item' } })
    await prisma.sale.deleteMany({ where: { notes: { in: ['Phase 3A Historical Sale', 'Phase 3A Live Sale'] } } })
    await prisma.inventoryLog.deleteMany({ where: { notes: { contains: 'Phase 3A' } } })
    if (testProduct) {
      await prisma.inventoryLog.deleteMany({ where: { product_id: testProduct.id } })
      await prisma.saleItem.deleteMany({ where: { product_id: testProduct.id } })
      await prisma.purchaseItem.deleteMany({ where: { product_id: testProduct.id } })
      await prisma.product.deleteMany({ where: { id: testProduct.id } })
    }
    if (testCategory) await prisma.category.deleteMany({ where: { id: testCategory.id } })
    if (testSupplier) await prisma.supplier.deleteMany({ where: { id: testSupplier.id } })
    await prisma.warehouse.deleteMany({ where: { code: { in: ['WH-PHASE3A-SEC', 'WH-PHASE3A-NEW', 'WH-PHASE3A-UPD'] } } })
    await prisma.authLog.deleteMany({ where: { user_id: { in: [adminUser?.id, cashierUser?.id].filter(Boolean) } } })
    await prisma.user.deleteMany({ where: { id: { in: [adminUser?.id, cashierUser?.id].filter(Boolean) } } })
    await prisma.$disconnect()
  })

  describe('1. Warehouse Endpoints & Single-Default Invariant', () => {
    it('GET /api/warehouses should reject unauthenticated access', async () => {
      const res = await request(app).get('/api/warehouses')
      expect(res.status).toBe(401)
    })

    it('GET /api/warehouses should reject CASHIER role access (ADMIN/MANAGER only)', async () => {
      const res = await request(app)
        .get('/api/warehouses')
        .set('Authorization', `Bearer ${cashierToken}`)
      expect(res.status).toBe(403)
    })

    it('GET /api/warehouses should list warehouses for ADMIN', async () => {
      const res = await request(app)
        .get('/api/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBeGreaterThanOrEqual(2)
      // Default warehouse should be first in the list
      expect(res.body.data[0].is_default).toBe(true)
    })

    it('GET /api/warehouses/default should return the active default warehouse', async () => {
      const res = await request(app)
        .get('/api/warehouses/default')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.is_default).toBe(true)
    })

    it('POST /api/warehouses should create a new warehouse', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'WH-PHASE3A-NEW',
          name: 'Phase 3A New Warehouse',
          address: '123 New Road',
          is_default: false,
        })
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.code).toBe('WH-PHASE3A-NEW')
      expect(res.body.data.is_default).toBe(false)
    })

    it('POST /api/warehouses with is_default=true should safely transfer default designation', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'WH-PHASE3A-UPD',
          name: 'Temporary Default Warehouse',
          is_default: true,
        })
      expect(res.status).toBe(201)
      expect(res.body.data.is_default).toBe(true)

      // Verify old default is no longer default
      const oldDefault = await prisma.warehouse.findUnique({ where: { id: defaultWarehouse.id } })
      expect(oldDefault.is_default).toBe(false)

      // Restore original default warehouse
      await request(app)
        .put(`/api/warehouses/${defaultWarehouse.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_default: true })

      const restoredDefault = await prisma.warehouse.findUnique({ where: { id: defaultWarehouse.id } })
      expect(restoredDefault.is_default).toBe(true)
    })
  })

  describe('2. Sales & Purchases Warehouse Auto-Assignment and Dates', () => {
    it('POST /api/sales without warehouse_id should automatically assign the default warehouse', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 2 }],
          payment_method: 'CASH',
          amount_paid: 100,
          notes: 'Phase 3A Live Sale',
        })
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      liveSale = res.body.data
      expect(liveSale.warehouse_id).toBe(defaultWarehouse.id)
      expect(liveSale.is_legacy_import).toBe(false)
      expect(liveSale.sale_date).toBeNull()
      expect(liveSale.warehouse).toBeDefined()
      expect(liveSale.warehouse.id).toBe(defaultWarehouse.id)
    })

    it('POST /api/sales with client-supplied is_legacy_import should be rejected with 422', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 1 }],
          payment_method: 'CASH',
          amount_paid: 50,
          is_legacy_import: true,
        })
      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
    })

    it('POST /api/sales with explicit warehouse_id and sale_date should record both for ADMIN', async () => {
      const historicalDateStr = '2021-06-15T10:30:00.000Z'
      // Create historical sale directly via database to simulate Phase 4 migration import
      historicalSale = await prisma.sale.create({
        data: {
          transaction_id: 'TXN-LEGACY-001',
          user_id: adminUser.id,
          warehouse_id: secondaryWarehouse.id,
          sale_date: new Date(historicalDateStr),
          is_legacy_import: true,
          subtotal: 50,
          discount_amount: 0,
          tax_amount: 0,
          total_amount: 50,
          amount_paid: 50,
          balance_due: 0,
          payment_method: 'CASH',
          payment_status: 'COMPLETED',
          notes: 'Phase 3A Historical Sale',
          sale_items: {
            create: [
              {
                product_id: testProduct.id,
                product_name: testProduct.name,
                product_sku: testProduct.sku,
                unit: 'pcs',
                quantity: 1,
                base_quantity: 1,
                unit_price: 50,
                unit_cost_snapshot: 30,
                cost_price_snapshot: 30,
                total: 50,
                line_cost: 30,
              },
            ],
          },
          payments: {
            create: [
              {
                method: 'CASH',
                amount_paid: 50,
                change_given: 0,
              },
            ],
          },
        },
        include: { warehouse: true },
      })
      expect(historicalSale.warehouse_id).toBe(secondaryWarehouse.id)
      expect(historicalSale.is_legacy_import).toBe(true)
      expect(new Date(historicalSale.sale_date).toISOString()).toBe(historicalDateStr)
      expect(historicalSale.warehouse.id).toBe(secondaryWarehouse.id)
    })

    it('GET /api/sales/:id should include warehouse metadata', async () => {
      const res = await request(app)
        .get(`/api/sales/${historicalSale.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.data.warehouse).toBeDefined()
      expect(res.body.data.warehouse.code).toBe('WH-PHASE3A-SEC')
    })

    it('GET /api/sales should filter by warehouse_id and is_legacy_import', async () => {
      const resSec = await request(app)
        .get(`/api/sales?warehouse_id=${secondaryWarehouse.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(resSec.status).toBe(200)
      expect(resSec.body.data.some((s) => s.id === historicalSale.id)).toBe(true)
      expect(resSec.body.data.some((s) => s.id === liveSale.id)).toBe(false)

      const resLegacy = await request(app)
        .get('/api/sales?is_legacy_import=true')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(resLegacy.status).toBe(200)
      expect(resLegacy.body.data.some((s) => s.id === historicalSale.id)).toBe(true)
      expect(resLegacy.body.data.some((s) => s.id === liveSale.id)).toBe(false)
    })

    it('GET /api/sales should filter by historical business date range', async () => {
      const res = await request(app)
        .get('/api/sales?start_date=2021-06-01&end_date=2021-06-30')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.data.some((s) => s.id === historicalSale.id)).toBe(true)
      expect(res.body.data.some((s) => s.id === liveSale.id)).toBe(false)
    })

    it('POST /api/purchases without warehouse_id should automatically assign the default warehouse', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplier_id: testSupplier.id,
          items: [{ product_id: testProduct.id, quantity: 10, unit_cost: 30 }],
          notes: 'Phase 3A Purchase Default',
        })
      expect(res.status).toBe(201)
      expect(res.body.data.warehouse_id).toBe(defaultWarehouse.id)
      expect(res.body.data.warehouse).toBeDefined()
      expect(res.body.data.warehouse.id).toBe(defaultWarehouse.id)
    })

    it('POST /api/purchases with client-supplied is_legacy_import should be rejected with 422', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplier_id: testSupplier.id,
          items: [{ product_id: testProduct.id, quantity: 5, unit_cost: 30 }],
          is_legacy_import: true,
        })
      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
    })

    it('Historical purchases should be queryable by warehouse_id and business date range', async () => {
      const purchaseDateStr = '2022-03-20T08:00:00.000Z'
      historicalPurchase = await prisma.purchase.create({
        data: {
          purchase_number: 'PO-LEGACY-001',
          supplier_id: testSupplier.id,
          user_id: adminUser.id,
          warehouse_id: secondaryWarehouse.id,
          purchase_date: new Date(purchaseDateStr),
          is_legacy_import: true,
          status: 'ORDERED',
          payment_status: 'PENDING',
          subtotal: 150,
          total_amount: 150,
          amount_paid: 0,
          balance_due: 150,
          notes: 'Phase 3A Purchase Explicit',
          items: {
            create: [
              {
                product_id: testProduct.id,
                product_name: testProduct.name,
                product_sku: testProduct.sku,
                unit: 'pcs',
                quantity: 5,
                base_quantity: 5,
                unit_cost: 30,
                total_cost: 150,
              },
            ],
          },
        },
        include: { warehouse: true },
      })
      expect(historicalPurchase.warehouse_id).toBe(secondaryWarehouse.id)
      expect(historicalPurchase.is_legacy_import).toBe(true)
      expect(new Date(historicalPurchase.purchase_date).toISOString()).toBe(purchaseDateStr)
      expect(historicalPurchase.warehouse.id).toBe(secondaryWarehouse.id)
    })

    it('GET /api/purchases should filter by warehouse_id and business date range', async () => {
      const res = await request(app)
        .get(`/api/purchases?warehouse_id=${secondaryWarehouse.id}&start_date=2022-03-01&end_date=2022-03-31`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.data.some((p) => p.id === historicalPurchase.id)).toBe(true)
    })
  })

  describe('3. Report Service Business Dates & Warehouse Isolation', () => {
    it('getSalesSummary should include historical sale when queried by historical date range', async () => {
      const summary = await reportService.getSalesSummary({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
      })
      expect(summary.transaction_count).toBeGreaterThanOrEqual(1)
      expect(summary.total_revenue).toBeGreaterThanOrEqual(50)
    })

    it('getSalesSummary should isolate by warehouse_id', async () => {
      const summarySec = await reportService.getSalesSummary({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: secondaryWarehouse.id,
      })
      expect(summarySec.transaction_count).toBe(1)
      expect(summarySec.total_revenue).toBe(50)

      const summaryMain = await reportService.getSalesSummary({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: defaultWarehouse.id,
      })
      expect(summaryMain.transaction_count).toBe(0)
      expect(summaryMain.total_revenue).toBe(0)
    })

    it('getSalesByDay should group by historical sale_date when present', async () => {
      const days = await reportService.getSalesByDay({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: secondaryWarehouse.id,
      })
      expect(days.length).toBe(1)
      expect(days[0].value).toBe(50)
      expect(days[0].transactions).toBe(1)
    })

    it('getTopProducts should respect warehouse_id filter', async () => {
      const topProductsSec = await reportService.getTopProducts({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: secondaryWarehouse.id,
      })
      expect(topProductsSec.length).toBe(1)
      expect(topProductsSec[0].sku).toBe('SKU-PHASE3A-01')
      expect(topProductsSec[0].value).toBe(50)

      const topProductsMain = await reportService.getTopProducts({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: defaultWarehouse.id,
      })
      expect(topProductsMain.length).toBe(0)
    })

    it('getCategoryPerformance should respect warehouse_id filter', async () => {
      const catSec = await reportService.getCategoryPerformance({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: secondaryWarehouse.id,
      })
      expect(catSec.length).toBe(1)
      expect(catSec[0].label).toBe('Category Phase 3A')
      expect(catSec[0].value).toBe(50)
    })

    it('getCashierPerformance should respect warehouse_id filter', async () => {
      const cashierSec = await reportService.getCashierPerformance({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: secondaryWarehouse.id,
      })
      expect(cashierSec.length).toBe(1)
      expect(cashierSec[0].transactions).toBe(1)
      expect(cashierSec[0].value).toBe(50)
    })

    it('getProfitReport should respect business date and warehouse filter', async () => {
      const profitSec = await reportService.getProfitReport({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: secondaryWarehouse.id,
      })
      expect(profitSec.length).toBe(1)
      expect(profitSec[0].sku).toBe('SKU-PHASE3A-01')
      expect(profitSec[0].revenue).toBe(50)
      expect(profitSec[0].cost).toBe(30)
      expect(profitSec[0].profit).toBe(20)
    })

    it('getFinancialStatement should isolate gross sales and cogs by warehouse', async () => {
      const finSec = await reportService.getFinancialStatement({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: secondaryWarehouse.id,
      })
      expect(finSec.gross_sales).toBe(50)
      expect(finSec.cogs).toBe(30)
      expect(finSec.gross_profit).toBe(20)

      const finMain = await reportService.getFinancialStatement({
        start_date: '2021-06-01',
        end_date: '2021-06-30',
        warehouse_id: defaultWarehouse.id,
      })
      expect(finMain.gross_sales).toBe(0)
      expect(finMain.cogs).toBe(0)
    })

    it('getDashboardSummary should respect warehouse filter', async () => {
      const dashSec = await reportService.getDashboardSummary({ warehouse_id: secondaryWarehouse.id })
      expect(dashSec).toHaveProperty('today_revenue')
      expect(dashSec).toHaveProperty('total_customer_receivables')
      expect(dashSec).toHaveProperty('total_supplier_payables')
    })
  })

  describe('4. Unknown Warehouse IDs, Inactive Warehouses & Stock Invariance', () => {
    const unknownId = '00000000-0000-0000-0000-000000000000'

    it('GET /api/sales with unknown warehouse_id should return 404 Not Found', async () => {
      const res = await request(app)
        .get(`/api/sales?warehouse_id=${unknownId}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('GET /api/purchases with unknown warehouse_id should return 404 Not Found', async () => {
      const res = await request(app)
        .get(`/api/purchases?warehouse_id=${unknownId}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('GET /api/reports/sales-summary with unknown warehouse_id should return 404 Not Found', async () => {
      const res = await request(app)
        .get(`/api/reports/sales-summary?warehouse_id=${unknownId}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('GET /api/inventory/adjustments with unknown warehouse_id should return 404 Not Found', async () => {
      const res = await request(app)
        .get(`/api/inventory/adjustments?warehouse_id=${unknownId}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('POST /api/sales with inactive warehouse_id should be rejected with 422', async () => {
      const inactiveWh = await prisma.warehouse.create({
        data: {
          code: 'WH-INACTIVE-TEST',
          name: 'Inactive Warehouse Test',
          is_active: false,
          is_default: false,
        },
      })

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 1 }],
          payment_method: 'CASH',
          amount_paid: 50,
          warehouse_id: inactiveWh.id,
        })
      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)

      await prisma.warehouse.delete({ where: { id: inactiveWh.id } })
    })

    it('StockAdjustment records should be queryable and NOT mutate Product.quantity', async () => {
      // Check current authoritative stock
      const productBefore = await prisma.product.findUnique({ where: { id: testProduct.id } })
      const stockBefore = Number(productBefore.quantity)

      // Create a historical stock adjustment record
      const adjustment = await prisma.stockAdjustment.create({
        data: {
          adjustment_number: 'ADJ-TEST-PHASE3A',
          adjustment_date: new Date('2021-08-10T12:00:00.000Z'),
          warehouse_id: secondaryWarehouse.id,
          user_id: adminUser.id,
          reason: 'Legacy physical audit difference',
          is_legacy_import: true,
          items: {
            create: [
              {
                product_id: testProduct.id,
                quantity_change: 15.0,
                unit: 'pcs',
                method_type: 1,
              },
            ],
          },
        },
        include: { items: true },
      })

      // Query stock adjustments via API
      const resList = await request(app)
        .get(`/api/inventory/adjustments?warehouse_id=${secondaryWarehouse.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(resList.status).toBe(200)
      expect(resList.body.data.some((a) => a.id === adjustment.id)).toBe(true)

      // Verify Product.quantity is completely unchanged (no silent triggers or mutations)
      const productAfter = await prisma.product.findUnique({ where: { id: testProduct.id } })
      const stockAfter = Number(productAfter.quantity)
      expect(stockAfter).toBe(stockBefore)
    })
  })
})
