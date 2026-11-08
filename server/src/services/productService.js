const prisma = require('../utils/prismaClient')
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors')
const { getBaseUnit, getDefaultPricingUnit, isValidCategory, isValidUnitForCategory } = require('../utils/uom')
const { Decimal, toMoney } = require('../utils/money')
const path = require('path')
const fs = require('fs')

async function listProducts({ page = 1, per_page = 20, search, category_id, include_inactive = false } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (!include_inactive) where.is_active = true
  if (category_id) where.category_id = category_id
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.product.count({ where }),
  ])

  return { products, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function getProductById(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  })
  if (!product) throw new NotFoundError('Product not found')
  return product
}

async function getProductByBarcode(barcode) {
  const code = String(barcode || '').trim()
  if (!code) throw new NotFoundError('Product not found')
  const product = await prisma.product.findUnique({
    where: { barcode: code },
    include: { category: { select: { id: true, name: true } } },
  })
  if (!product) throw new NotFoundError('Product not found')
  if (!product.is_active) throw new NotFoundError('Product is inactive')
  return product
}

async function createProduct(data) {
  // Check uniqueness
  const [existingSku, existingBarcode] = await Promise.all([
    prisma.product.findUnique({ where: { sku: data.sku } }),
    data.barcode ? prisma.product.findUnique({ where: { barcode: data.barcode } }) : null,
  ])

  if (existingSku) throw new ConflictError('SKU already exists')
  if (existingBarcode) throw new ConflictError('Barcode already exists')

  // Check category exists
  const category = await prisma.category.findUnique({ where: { id: data.category_id } })
  if (!category) throw new NotFoundError('Category not found')

  const unit_category = data.unit_category || 'COUNT'
  const base_unit = data.base_unit || getBaseUnit(unit_category)
  const pricing_unit = data.pricing_unit || getDefaultPricingUnit(unit_category)

  if (!isValidCategory(unit_category)) {
    throw new ValidationError(`Invalid unit category "${unit_category}"`)
  }
  if (!isValidUnitForCategory(unit_category, base_unit)) {
    throw new ValidationError(`Invalid base unit "${base_unit}" for category "${unit_category}"`)
  }
  if (!isValidUnitForCategory(unit_category, pricing_unit)) {
    throw new ValidationError(`Invalid pricing unit "${pricing_unit}" for category "${unit_category}"`)
  }

  // Handle pricing fields
  let usualPrice = data.usual_price !== undefined && data.usual_price !== null && data.usual_price !== ''
    ? toMoney(data.usual_price)
    : (data.price !== undefined && data.price !== null && data.price !== '' ? toMoney(data.price) : null)

  let ourPrice = data.our_price !== undefined && data.our_price !== null && data.our_price !== ''
    ? toMoney(data.our_price)
    : (usualPrice !== null ? usualPrice : (data.price !== undefined && data.price !== null && data.price !== '' ? toMoney(data.price) : null))

  if (usualPrice === null || ourPrice === null) {
    throw new ValidationError('Price or usual price is required')
  }

  if (usualPrice.lt(0)) {
    throw new ValidationError('Market price must be non-negative', [
      { field: 'usual_price', message: 'Market price must be non-negative' },
    ])
  }
  if (ourPrice.lt(0)) {
    throw new ValidationError('Our price must be non-negative', [
      { field: 'our_price', message: 'Our price must be non-negative' },
    ])
  }
  if (ourPrice.gt(usualPrice)) {
    throw new ValidationError('Our price cannot exceed market price', [
      { field: 'our_price', message: 'Our price cannot exceed market price' },
    ])
  }

  let costPrice = null
  if (data.cost_price !== undefined && data.cost_price !== null && data.cost_price !== '') {
    const cp = toMoney(data.cost_price)
    if (cp.lt(0)) {
      throw new ValidationError('Cost price must be non-negative', [
        { field: 'cost_price', message: 'Cost price must be non-negative' },
      ])
    }
    if (ourPrice.lt(cp)) {
      throw new ValidationError('Our price cannot be lower than cost price', [
        { field: 'our_price', message: 'Our price cannot be lower than cost price' },
      ])
    }
    costPrice = cp
  }

  // price is kept synchronized with our_price (the active preferred selling price)
  const activePrice = ourPrice

  const product = await prisma.product.create({
    data: {
      name: data.name,
      sku: data.sku,
      barcode: data.barcode || null,
      category_id: data.category_id || null,
      unit_category,
      base_unit,
      pricing_unit,
      price: activePrice,
      usual_price: usualPrice,
      our_price: ourPrice,
      cost_price: costPrice,
      quantity: data.quantity ?? 0,
      low_stock_threshold: data.low_stock_threshold ?? 10,
      image_url: data.image_url || null,
    },
    include: { category: { select: { id: true, name: true } } },
  })

  return product
}

async function updateProduct(id, data) {
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Product not found')

  // Check uniqueness (exclude self)
  if (data.sku && data.sku !== existing.sku) {
    const conflict = await prisma.product.findUnique({ where: { sku: data.sku } })
    if (conflict) throw new ConflictError('SKU already exists')
  }
  if (data.barcode && data.barcode !== existing.barcode) {
    const conflict = await prisma.product.findUnique({ where: { barcode: data.barcode } })
    if (conflict) throw new ConflictError('Barcode already exists')
  }
  if (data.category_id) {
    const category = await prisma.category.findUnique({ where: { id: data.category_id } })
    if (!category) throw new NotFoundError('Category not found')
  }

  const targetCategory = data.unit_category !== undefined ? data.unit_category : existing.unit_category
  const targetBase = data.base_unit !== undefined ? data.base_unit : existing.base_unit
  const targetPricing = data.pricing_unit !== undefined ? data.pricing_unit : existing.pricing_unit

  if (data.unit_category !== undefined && !isValidCategory(targetCategory)) {
    throw new ValidationError(`Invalid unit category "${targetCategory}"`)
  }
  if (data.base_unit !== undefined && !isValidUnitForCategory(targetCategory, targetBase)) {
    throw new ValidationError(`Invalid base unit "${targetBase}" for category "${targetCategory}"`)
  }
  if (data.pricing_unit !== undefined && !isValidUnitForCategory(targetCategory, targetPricing)) {
    throw new ValidationError(`Invalid pricing unit "${targetPricing}" for category "${targetCategory}"`)
  }

  // Handle pricing fields
  let targetUsual = existing.usual_price !== undefined && existing.usual_price !== null ? toMoney(existing.usual_price) : toMoney(existing.price)
  let targetOur = existing.our_price !== undefined && existing.our_price !== null ? toMoney(existing.our_price) : toMoney(existing.price)

  if (data.usual_price !== undefined && data.usual_price !== null && data.usual_price !== '') {
    targetUsual = toMoney(data.usual_price)
  }
  if (data.our_price !== undefined && data.our_price !== null && data.our_price !== '') {
    targetOur = toMoney(data.our_price)
  }

  // If a legacy caller only provided data.price and neither usual_price nor our_price was provided
  if (data.price !== undefined && data.usual_price === undefined && data.our_price === undefined) {
    targetUsual = toMoney(data.price)
    targetOur = toMoney(data.price)
  }

  if (targetUsual.lt(0)) {
    throw new ValidationError('Market price must be non-negative', [
      { field: 'usual_price', message: 'Market price must be non-negative' },
    ])
  }
  if (targetOur.lt(0)) {
    throw new ValidationError('Our price must be non-negative', [
      { field: 'our_price', message: 'Our price must be non-negative' },
    ])
  }
  if (targetOur.gt(targetUsual)) {
    throw new ValidationError('Our price cannot exceed market price', [
      { field: 'our_price', message: 'Our price cannot exceed market price' },
    ])
  }

  let targetCost = undefined
  if (data.cost_price !== undefined) {
    if (data.cost_price === null || data.cost_price === '') {
      targetCost = null
    } else {
      const cp = toMoney(data.cost_price)
      if (cp.lt(0)) {
        throw new ValidationError('Cost price must be non-negative', [
          { field: 'cost_price', message: 'Cost price must be non-negative' },
        ])
      }
      targetCost = cp
    }
  }

  const effectiveCost = targetCost !== undefined
    ? targetCost
    : (existing.cost_price !== null && existing.cost_price !== undefined ? toMoney(existing.cost_price) : null)

  if (effectiveCost !== null && targetOur.lt(effectiveCost)) {
    throw new ValidationError('Our price cannot be lower than cost price', [
      { field: 'our_price', message: 'Our price cannot be lower than cost price' },
    ])
  }

  const activePrice = targetOur

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.sku !== undefined && { sku: data.sku }),
      ...(data.barcode !== undefined && { barcode: data.barcode || null }),
      ...(data.category_id !== undefined && { category_id: data.category_id || null }),
      ...(data.unit_category !== undefined && { unit_category: data.unit_category }),
      ...(data.base_unit !== undefined && { base_unit: data.base_unit }),
      ...(data.pricing_unit !== undefined && { pricing_unit: data.pricing_unit }),
      ...(data.usual_price !== undefined || (data.price !== undefined && data.our_price === undefined) ? { usual_price: targetUsual } : {}),
      ...(data.our_price !== undefined || (data.price !== undefined && data.usual_price === undefined) ? { our_price: targetOur } : {}),
      price: activePrice,
      ...(targetCost !== undefined && { cost_price: targetCost }),
      ...(data.quantity !== undefined && { quantity: data.quantity }),
      ...(data.low_stock_threshold !== undefined && { low_stock_threshold: data.low_stock_threshold }),
      ...(data.image_url !== undefined && { image_url: data.image_url || null }),
    },
    include: { category: { select: { id: true, name: true } } },
  })

  return product
}

async function softDeleteProduct(id) {
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Product not found')

  await prisma.product.update({ where: { id }, data: { is_active: false } })
}

// ---- Categories ----

async function listCategories() {
  return prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  })
}

async function createCategory(data) {
  const existing = await prisma.category.findUnique({ where: { name: data.name } })
  if (existing) throw new ConflictError('Category name already exists')

  return prisma.category.create({
    data: { name: data.name, description: data.description || null },
  })
}

async function updateCategory(id, data) {
  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Category not found')

  if (data.name && data.name !== existing.name) {
    const conflict = await prisma.category.findUnique({ where: { name: data.name } })
    if (conflict) throw new ConflictError('Category name already exists')
  }

  return prisma.category.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description || null }),
    },
  })
}

async function deleteCategory(id) {
  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Category not found')

  const affectedCount = await prisma.product.count({ where: { category_id: id } })

  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({
      where: { category_id: id },
      data: { category_id: null },
    })
    await tx.category.delete({ where: { id } })
  })

  return { id, affected_products: affectedCount }
}

module.exports = {
  listProducts,
  getProductById,
  getProductByBarcode,
  createProduct,
  updateProduct,
  softDeleteProduct,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
}
