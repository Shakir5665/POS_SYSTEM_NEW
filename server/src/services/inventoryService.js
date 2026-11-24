const prisma = require('../utils/prismaClient')
const { NotFoundError, ValidationError } = require('../utils/errors')
const { toBaseUnitQuantity, validateQuantity } = require('../utils/uom')
const { Decimal } = require('../utils/money')
const generateAdjustmentNumber = require('../utils/generateAdjustmentNumber')
const { getDefaultWarehouse } = require('./warehouseService')
const { getOrCreateWarehouseStock } = require('./branchStockService')

async function listInventory({ page = 1, per_page = 20, search, status, warehouse_id } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = { is_active: true }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (status === 'out') {
    where.quantity = 0
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        quantity: true,
        low_stock_threshold: true,
        price: true,
        base_unit: true,
        pricing_unit: true,
        unit_category: true,
        category: { select: { id: true, name: true } },
        updated_at: true,
        warehouse_stocks: warehouse_id ? {
          where: { warehouse_id },
          select: { quantity: true, low_stock_threshold: true },
        } : true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.product.count({ where }),
  ])

  // If filtered by warehouse, map the branch quantity onto the returned product
  const mappedProducts = products.map((p) => {
    if (warehouse_id && p.warehouse_stocks && p.warehouse_stocks.length > 0) {
      const bStock = p.warehouse_stocks[0]
      return {
        ...p,
        branch_quantity: bStock.quantity,
        branch_low_stock_threshold: bStock.low_stock_threshold,
      }
    }
    return p
  })

  return { products: mappedProducts, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function getLowStockProducts() {
  return prisma.product.findMany({
    where: {
      is_active: true,
      quantity: { lte: prisma.product.fields.low_stock_threshold },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      quantity: true,
      low_stock_threshold: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: { quantity: 'asc' },
  })
}

async function getLowStockCount() {
  // Raw query for comparing two columns
  const result = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM "Product"
    WHERE is_active = true AND quantity <= low_stock_threshold
  `
  return result[0].count
}

async function getLowStock(search) {
  if (search) {
    const term = `%${search}%`
    return prisma.$queryRaw`
      SELECT p.id, p.name, p.sku, p.barcode, p.quantity, p.low_stock_threshold, p.base_unit, p.pricing_unit,
             json_build_object('id', c.id, 'name', c.name) as category
      FROM "Product" p
      JOIN "Category" c ON c.id = p.category_id
      WHERE p.is_active = true AND p.quantity <= p.low_stock_threshold
        AND (p.name ILIKE ${term} OR p.sku ILIKE ${term} OR (p.barcode IS NOT NULL AND p.barcode ILIKE ${term}))
      ORDER BY p.quantity ASC
    `
  }
  return prisma.$queryRaw`
    SELECT p.id, p.name, p.sku, p.barcode, p.quantity, p.low_stock_threshold, p.base_unit, p.pricing_unit,
           json_build_object('id', c.id, 'name', c.name) as category
    FROM "Product" p
    JOIN "Category" c ON c.id = p.category_id
    WHERE p.is_active = true AND p.quantity <= p.low_stock_threshold
    ORDER BY p.quantity ASC
  `
}

async function adjustStock(productId, quantityChange, changeType, userId, notes, unit, warehouseId) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new NotFoundError('Product not found')

  const effectiveUnit = unit || product.base_unit
  const changeInBase = toBaseUnitQuantity(quantityChange, effectiveUnit, product.unit_category, product.base_unit)
  const currentQty = new Decimal(product.quantity)
  const newQty = currentQty.plus(changeInBase)

  if (newQty.lt(0)) {
    throw new ValidationError('Adjustment would result in negative stock', [
      { field: 'quantity_change', message: `Cannot reduce below 0. Current stock: ${product.quantity}` },
    ])
  }

  const defaultWh = await getDefaultWarehouse().catch(() => null)
  const targetWarehouseId = warehouseId || defaultWh?.id || null
  const adjNumber = await generateAdjustmentNumber()

  const [updatedProduct, log] = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: productId },
      data: { quantity: newQty },
    })

    if (targetWarehouseId) {
      const branchStock = await getOrCreateWarehouseStock(tx, targetWarehouseId, productId, 0)
      await tx.warehouseStock.update({
        where: { id: branchStock.id },
        data: { quantity: { increment: changeInBase } },
      })
    }

    const createdLog = await tx.inventoryLog.create({
      data: {
        product_id: productId,
        change_type: changeType,
        unit: product.base_unit,
        quantity_change: changeInBase,
        previous_quantity: currentQty,
        new_quantity: newQty,
        user_id: userId,
        warehouse_id: targetWarehouseId,
        notes: notes || null,
      },
    })

    await tx.stockAdjustment.create({
      data: {
        adjustment_number: adjNumber,
        adjustment_date: new Date(),
        warehouse_id: targetWarehouseId,
        user_id: userId,
        reason: notes || (changeType === 'RESTOCK' ? 'Manual Restock' : 'Stock Adjustment'),
        notes: notes || null,
        items: {
          create: [
            {
              product_id: productId,
              quantity_change: changeInBase,
              unit: product.base_unit || 'pcs',
              notes: notes || null,
            },
          ],
        },
      },
    })

    return [updated, createdLog]
  })

  return { product: updatedProduct, log }
}

async function restockProduct(productId, quantity, userId, notes, unit) {
  if (quantity <= 0) {
    throw new ValidationError('Restock quantity must be positive', [
      { field: 'quantity', message: 'Must be greater than 0' },
    ])
  }
  return adjustStock(productId, quantity, 'RESTOCK', userId, notes, unit)
}

async function manualAdjust(productId, newQuantity, userId, notes, unit) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new NotFoundError('Product not found')

  const effectiveUnit = unit || product.base_unit
  const targetQtyInBase = toBaseUnitQuantity(newQuantity, effectiveUnit, product.unit_category, product.base_unit)
  const currentQty = new Decimal(product.quantity)
  const change = targetQtyInBase.minus(currentQty)

  const defaultWh = await getDefaultWarehouse().catch(() => null)
  const adjNumber = await generateAdjustmentNumber()

  const [updatedProduct, log] = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id: productId }, data: { quantity: targetQtyInBase } })

    const createdLog = await tx.inventoryLog.create({
      data: {
        product_id: productId,
        change_type: 'ADJUSTMENT',
        unit: product.base_unit,
        quantity_change: change,
        previous_quantity: currentQty,
        new_quantity: targetQtyInBase,
        user_id: userId,
        warehouse_id: defaultWh?.id || null,
        notes: notes || null,
      },
    })

    await tx.stockAdjustment.create({
      data: {
        adjustment_number: adjNumber,
        adjustment_date: new Date(),
        warehouse_id: defaultWh?.id || null,
        user_id: userId,
        reason: notes || 'Manual Stock Level Adjustment',
        notes: notes || null,
        items: {
          create: [
            {
              product_id: productId,
              quantity_change: change,
              unit: product.base_unit || 'pcs',
              notes: notes || null,
            },
          ],
        },
      },
    })

    return [updated, createdLog]
  })

  return { product: updatedProduct, log }
}

async function getInventoryLog(productId, { page = 1, per_page = 20 } = {}) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new NotFoundError('Product not found')

  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const [logs, total] = await Promise.all([
    prisma.inventoryLog.findMany({
      where: { product_id: productId },
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { id: true, username: true, full_name: true } },
      },
    }),
    prisma.inventoryLog.count({ where: { product_id: productId } }),
  ])

  return { logs, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function listStockAdjustments({ page = 1, per_page = 20, warehouse_id, is_legacy_import, start_date, end_date, search } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  if (warehouse_id) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouse_id } })
    if (!wh) {
      throw new NotFoundError(`Warehouse with ID ${warehouse_id} not found`)
    }
  }

  const where = {}
  if (warehouse_id) where.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    where.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }
  if (start_date || end_date) {
    where.adjustment_date = {}
    if (start_date) where.adjustment_date.gte = new Date(start_date)
    if (end_date) {
      const end = new Date(end_date)
      end.setHours(23, 59, 59, 999)
      where.adjustment_date.lte = end
    }
  }
  if (search && search.trim()) {
    where.OR = [
      { adjustment_number: { contains: search.trim(), mode: 'insensitive' } },
      { reason: { contains: search.trim(), mode: 'insensitive' } },
      { notes: { contains: search.trim(), mode: 'insensitive' } },
    ]
  }

  const [adjustments, total] = await Promise.all([
    prisma.stockAdjustment.findMany({
      where,
      skip,
      take,
      orderBy: { adjustment_date: 'desc' },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, username: true, full_name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, base_unit: true } },
          },
        },
      },
    }),
    prisma.stockAdjustment.count({ where }),
  ])

  return { adjustments, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

module.exports = {
  listInventory,
  getLowStock,
  getLowStockCount,
  adjustStock,
  restockProduct,
  manualAdjust,
  getInventoryLog,
  listStockAdjustments,
}
