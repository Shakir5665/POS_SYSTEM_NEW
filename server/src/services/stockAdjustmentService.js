const prisma = require('../utils/prismaClient')
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors')
const { Decimal } = require('../utils/money')
const { toBaseUnitQuantity, validateQuantity } = require('../utils/uom')
const generateAdjustmentNumber = require('../utils/generateAdjustmentNumber')
const { validateWarehouseId, getDefaultWarehouse } = require('./warehouseService')
const { getOrCreateWarehouseStock } = require('./branchStockService')

/**
 * Determine appropriate InventoryChangeType based on reason and sign.
 * The schema enum InventoryChangeType supports SALE, RESTOCK, ADJUSTMENT, RETURN.
 */
function determineChangeType(reason, quantityChange) {
  if (quantityChange.gt(0)) {
    return 'RESTOCK'
  }
  return 'ADJUSTMENT'
}

/**
 * Create a live stock adjustment with transactional concurrency protection and audit logs.
 *
 * @param {Object} data
 * @param {string} [data.warehouse_id] - Target warehouse ID
 * @param {string} data.reason - Reason for adjustment (required)
 * @param {string} [data.notes] - Additional notes
 * @param {string} [data.idempotency_key] - Optional client idempotency key
 * @param {Array<Object>} data.items - Adjustment items
 * @param {string} data.items[].product_id - Product UUID
 * @param {number|string|Decimal} data.items[].quantity_change - Net change (positive or negative)
 * @param {string} [data.items[].unit] - Unit of measurement
 * @param {string} [data.items[].notes] - Item-level notes
 * @param {Object} user - Authenticated user context ({ id, role, ... })
 * @returns {Promise<StockAdjustment>} Committed adjustment record
 */
async function createLiveAdjustment(data, user) {
  if (!user || !user.id) {
    throw new ValidationError('Authenticated user is required for audit attribution')
  }

  // Strictly reject client-supplied legacy import flags on live adjustments
  if (data.is_legacy_import !== undefined && Boolean(data.is_legacy_import)) {
    throw new ValidationError('Client cannot set is_legacy_import on live stock adjustments')
  }

  const reason = (data.reason || '').trim()
  if (!reason) {
    throw new ValidationError('Adjustment reason is required', [{ field: 'reason', message: 'Reason is required' }])
  }

  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    throw new ValidationError('Adjustment must contain at least one item', [
      { field: 'items', message: 'At least one item is required' },
    ])
  }

  // 1. Resolve and validate warehouse
  let warehouseId = data.warehouse_id
  if (warehouseId) {
    await validateWarehouseId(warehouseId, { allowInactive: false })
  } else {
    const defaultWh = await getDefaultWarehouse()
    warehouseId = defaultWh ? defaultWh.id : null
  }

  // 2. Check idempotency key if provided
  const idempotencyKey = data.idempotency_key ? String(data.idempotency_key).trim() : null
  if (idempotencyKey) {
    const existing = await prisma.stockAdjustment.findUnique({
      where: { adjustment_number: idempotencyKey },
    })
    if (existing) {
      throw new ConflictError(`Adjustment with idempotency key "${idempotencyKey}" has already been processed`)
    }
  }

  // 3. Pre-fetch and validate all products
  const productIds = data.items.map((i) => i.product_id)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const preparedItems = []
  const aggregatedProductChanges = new Map()

  for (let idx = 0; idx < data.items.length; idx++) {
    const item = data.items[idx]
    if (!item.product_id) {
      throw new ValidationError(`Product ID required at item index ${idx}`, [
        { field: `items[${idx}].product_id`, message: 'Product ID is required' },
      ])
    }

    const product = productMap.get(item.product_id)
    if (!product) {
      throw new NotFoundError(`Product "${item.product_id}" not found`)
    }
    if (!product.is_active) {
      throw new ValidationError(`Cannot adjust inactive product "${product.name}"`, [
        { field: `items[${idx}].product_id`, message: `Product "${product.name}" is inactive` },
      ])
    }

    if (item.quantity_change === undefined || item.quantity_change === null || item.quantity_change === '') {
      throw new ValidationError(`Quantity change required at item index ${idx}`, [
        { field: `items[${idx}].quantity_change`, message: 'Quantity change is required' },
      ])
    }

    const rawChange = new Decimal(item.quantity_change)
    if (rawChange.isZero()) {
      throw new ValidationError(`Quantity change cannot be zero at item index ${idx}`, [
        { field: `items[${idx}].quantity_change`, message: 'Quantity change cannot be zero' },
      ])
    }

    const effectiveUnit = item.unit || product.base_unit || 'pcs'
    validateQuantity(rawChange.abs().toNumber(), effectiveUnit, product.unit_category)

    const changeInBase = toBaseUnitQuantity(rawChange, effectiveUnit, product.unit_category, product.base_unit)

    preparedItems.push({
      product,
      rawChange,
      changeInBase,
      unit: effectiveUnit,
      notes: item.notes ? item.notes.trim() : null,
    })

    const currentAgg = aggregatedProductChanges.get(product.id) || new Decimal(0)
    aggregatedProductChanges.set(product.id, currentAgg.plus(changeInBase))
  }

  // Preliminary stock check before opening the transaction
  for (const [productId, netChange] of aggregatedProductChanges.entries()) {
    if (netChange.lt(0)) {
      const product = productMap.get(productId)
      const currentStock = new Decimal(product.quantity)
      const requestedReduction = netChange.abs()

      if (currentStock.lt(requestedReduction)) {
        throw new ValidationError('Insufficient stock', [
          {
            field: 'items',
            message: `Insufficient stock for "${product.name}". Available: ${currentStock} ${product.base_unit}, requested reduction: ${requestedReduction} ${product.base_unit}`,
          },
        ])
      }
    }
  }

  // 4. Generate or assign adjustment number
  const adjustmentNumber = idempotencyKey || (await generateAdjustmentNumber())

  // 5. Execute all stock mutations, log entries, and audit records in an atomic transaction
  try {
    return await prisma.$transaction(async (tx) => {
      // Step A: Apply stock mutations per aggregated product with strict concurrency checks
      for (const [productId, netChange] of aggregatedProductChanges.entries()) {
        const product = productMap.get(productId)

        if (netChange.lt(0)) {
          const decrementAmt = netChange.abs()
          // Conditional decrement: fails if concurrent transactions decreased stock below requirement
          const { count } = await tx.product.updateMany({
            where: {
              id: productId,
              quantity: { gte: decrementAmt },
            },
            data: {
              quantity: { decrement: decrementAmt },
            },
          })

          if (count === 0) {
            const fresh = await tx.product.findUnique({
              where: { id: productId },
              select: { quantity: true },
            })
            throw new ValidationError('Insufficient stock', [
              {
                field: 'items',
                message: `Insufficient stock for "${product.name}" due to concurrent activity. Available: ${fresh?.quantity ?? 0} ${product.base_unit}, requested: ${decrementAmt} ${product.base_unit}`,
              },
            ])
          }
        } else if (netChange.gt(0)) {
          await tx.product.update({
            where: { id: productId },
            data: {
              quantity: { increment: netChange },
            },
          })
        }

        // Also adjust branch stock if an active warehouse is assigned to this adjustment
        if (warehouseId) {
          const branchStock = await getOrCreateWarehouseStock(tx, warehouseId, productId, 0)
          await tx.warehouseStock.update({
            where: { id: branchStock.id },
            data: {
              quantity: new Decimal(branchStock.quantity).plus(netChange),
            },
          })
        }
      }

      // Step B: Write InventoryLog entries per item with exact before/after quantities
      for (const item of preparedItems) {
        const product = item.product
        const freshProduct = await tx.product.findUnique({
          where: { id: product.id },
          select: { quantity: true },
        })

        const newQty = new Decimal(freshProduct.quantity)
        const prevQty = newQty.minus(item.changeInBase)
        const changeType = determineChangeType(reason, item.changeInBase)

        await tx.inventoryLog.create({
          data: {
            product_id: product.id,
            warehouse_id: warehouseId || null,
            change_type: changeType,
            unit: product.base_unit,
            quantity_change: item.changeInBase,
            previous_quantity: prevQty,
            new_quantity: newQty,
            user_id: user.id,
            notes: `Adjustment ${adjustmentNumber}: ${reason}${item.notes ? ` (${item.notes})` : ''}`,
          },
        })
      }

      // Step C: Create StockAdjustment header and items
      const adjustment = await tx.stockAdjustment.create({
        data: {
          adjustment_number: adjustmentNumber,
          adjustment_date: new Date(),
          warehouse_id: warehouseId,
          user_id: user.id,
          reason,
          notes: data.notes ? data.notes.trim() : null,
          is_legacy_import: false,
          items: {
            create: preparedItems.map((item) => ({
              product_id: item.product.id,
              quantity_change: item.changeInBase,
              unit: item.unit,
              notes: item.notes,
            })),
          },
        },
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          user: { select: { id: true, full_name: true, username: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, base_unit: true } },
            },
          },
        },
      })

      return adjustment
    }, { maxWait: 10000, timeout: 30000 })
  } catch (err) {
    // Intercept unique constraint violation on adjustment_number
    if (err.code === 'P2002' && String(err.meta?.target).includes('adjustment_number')) {
      throw new ConflictError(`Adjustment number or idempotency key "${adjustmentNumber}" already exists`)
    }
    throw err
  }
}

/**
 * Record a historical stock adjustment imported from legacy records.
 * STRICT ISOLATION GUARANTEE: Does NOT alter Product.quantity and does NOT create InventoryLog.
 *
 * @param {Object} data
 * @param {string} data.adjustment_number - Original or generated legacy reference
 * @param {Date|string} data.adjustment_date - Historical business date
 * @param {string} [data.warehouse_id] - Target warehouse ID
 * @param {string} [data.reason] - Legacy reason
 * @param {string} [data.notes] - Legacy notes
 * @param {string} data.user_id - Migration user ID
 * @param {Array<Object>} data.items - Historical adjustment items
 * @param {string} [batch_id] - Optional migration batch ID
 * @returns {Promise<StockAdjustment>} Recorded historical adjustment
 */
async function recordHistoricalAdjustment(data, batchId = null) {
  const {
    adjustment_number,
    adjustment_date,
    warehouse_id,
    reason,
    notes,
    user_id,
    items = [],
  } = data

  if (!adjustment_date) {
    throw new ValidationError('Adjustment date is required for historical adjustment')
  }
  if (!user_id) {
    throw new ValidationError('User ID is required for historical adjustment')
  }

  return prisma.stockAdjustment.create({
    data: {
      adjustment_number: adjustment_number || null,
      adjustment_date: new Date(adjustment_date),
      warehouse_id: warehouse_id || null,
      user_id,
      reason: reason ? String(reason).trim() : null,
      notes: notes ? String(notes).trim() : null,
      is_legacy_import: true,
      items: {
        create: items.map((item) => ({
          product_id: item.product_id || null,
          quantity_change: new Decimal(item.quantity_change || 0),
          method_type: item.method_type !== undefined ? parseInt(item.method_type, 10) : null,
          unit: item.unit || 'pcs',
          notes: item.notes ? String(item.notes).trim() : null,
        })),
      },
    },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, full_name: true, username: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, base_unit: true } },
        },
      },
    },
  })
}

/**
 * Get a stock adjustment by ID with relations.
 */
async function getStockAdjustmentById(id) {
  const adjustment = await prisma.stockAdjustment.findUnique({
    where: { id },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, full_name: true, username: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, base_unit: true } },
        },
      },
    },
  })
  if (!adjustment) {
    throw new NotFoundError(`Stock adjustment with ID ${id} not found`)
  }
  return adjustment
}

/**
 * List stock adjustments with pagination, warehouse, legacy import, date range, and search filters.
 */
async function listStockAdjustments({ page = 1, per_page = 20, warehouse_id, is_legacy_import, start_date, end_date, search } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  if (warehouse_id) {
    await validateWarehouseId(warehouse_id, { allowInactive: true })
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
  createLiveAdjustment,
  recordHistoricalAdjustment,
  getStockAdjustmentById,
  listStockAdjustments,
}
