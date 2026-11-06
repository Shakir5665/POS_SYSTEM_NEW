const prisma = require('../utils/prismaClient')
const { NotFoundError, ValidationError } = require('../utils/errors')

async function listInventory({ page = 1, per_page = 20, search, status } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = { is_active: true }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
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
        quantity: true,
        low_stock_threshold: true,
        price: true,
        category: { select: { id: true, name: true } },
        updated_at: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.product.count({ where }),
  ])

  return { products, total, page, per_page: take, total_pages: Math.ceil(total / take) }
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

async function getLowStock() {
  return prisma.$queryRaw`
    SELECT p.id, p.name, p.sku, p.quantity, p.low_stock_threshold,
           json_build_object('id', c.id, 'name', c.name) as category
    FROM "Product" p
    JOIN "Category" c ON c.id = p.category_id
    WHERE p.is_active = true AND p.quantity <= p.low_stock_threshold
    ORDER BY p.quantity ASC
  `
}

async function adjustStock(productId, quantityChange, changeType, userId, notes) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new NotFoundError('Product not found')

  const newQty = product.quantity + quantityChange
  if (newQty < 0) {
    throw new ValidationError('Adjustment would result in negative stock', [
      { field: 'quantity_change', message: `Cannot reduce below 0. Current stock: ${product.quantity}` },
    ])
  }

  const [updatedProduct, log] = await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { quantity: newQty },
    }),
    prisma.inventoryLog.create({
      data: {
        product_id: productId,
        change_type: changeType,
        quantity_change: quantityChange,
        previous_quantity: product.quantity,
        new_quantity: newQty,
        user_id: userId,
        notes: notes || null,
      },
    }),
  ])

  return { product: updatedProduct, log }
}

async function restockProduct(productId, quantity, userId, notes) {
  if (quantity <= 0) {
    throw new ValidationError('Restock quantity must be positive', [
      { field: 'quantity', message: 'Must be greater than 0' },
    ])
  }
  return adjustStock(productId, quantity, 'RESTOCK', userId, notes)
}

async function manualAdjust(productId, newQuantity, userId, notes) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new NotFoundError('Product not found')

  const change = newQuantity - product.quantity

  const [updatedProduct, log] = await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { quantity: newQuantity } }),
    prisma.inventoryLog.create({
      data: {
        product_id: productId,
        change_type: 'ADJUSTMENT',
        quantity_change: change,
        previous_quantity: product.quantity,
        new_quantity: newQuantity,
        user_id: userId,
        notes: notes || null,
      },
    }),
  ])

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

module.exports = {
  listInventory,
  getLowStock,
  getLowStockCount,
  adjustStock,
  restockProduct,
  manualAdjust,
  getInventoryLog,
}
