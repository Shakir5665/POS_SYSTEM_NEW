const prisma = require('../utils/prismaClient')
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../utils/errors')
const { Decimal, roundMoney } = require('../utils/money')
const { toBaseUnitQuantity, validateQuantity } = require('../utils/uom')
const generateSalesReturnNumber = require('../utils/generateSalesReturnNumber')

/**
 * Check if user is authorized to perform returns
 */
function assertReturnPermission(user) {
  if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
    throw new ForbiddenError('Sales returns require administrative authorization')
  }
}

/**
 * Get return eligibility for a sale
 */
async function getSaleReturnEligibility(saleId) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      sale_items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, base_unit: true, pricing_unit: true, unit_category: true, quantity: true },
          },
        },
      },
      customer: { select: { id: true, name: true, phone: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      sales_returns: {
        include: {
          items: true,
        },
      },
    },
  })

  if (!sale) {
    throw new NotFoundError(`Sale with ID ${saleId} not found`)
  }

  // Calculate already returned quantities per sale_item_id
  const returnedByItem = {}
  for (const sr of sale.sales_returns) {
    if (!sr.is_cancelled) {
      for (const item of sr.items) {
        returnedByItem[item.sale_item_id] = (returnedByItem[item.sale_item_id] || new Decimal(0)).plus(item.quantity)
      }
    }
  }

  const items = sale.sale_items.map((si) => {
    const originalQty = new Decimal(si.quantity)
    const alreadyReturned = returnedByItem[si.id] || new Decimal(0)
    const remainingEligible = Decimal.max(0, originalQty.minus(alreadyReturned))
    const netUnitPrice = originalQty.gt(0)
      ? roundMoney(new Decimal(si.total).div(originalQty))
      : new Decimal(si.unit_price)

    return {
      sale_item_id: si.id,
      product_id: si.product_id,
      product_name: si.product_name || si.product?.name || '',
      product_sku: si.product_sku || si.product?.sku || '',
      unit: si.unit,
      sold_quantity: originalQty.toString(),
      already_returned: alreadyReturned.toString(),
      remaining_eligible: remainingEligible.toString(),
      unit_price: Number(si.unit_price),
      net_unit_price: Number(netUnitPrice),
      line_total: Number(si.total),
      current_stock: si.product ? Number(si.product.quantity) : 0,
    }
  })

  return {
    sale: {
      id: sale.id,
      transaction_id: sale.transaction_id,
      sale_date: sale.sale_date || sale.created_at,
      total_amount: Number(sale.total_amount),
      payment_method: sale.payment_method,
      payment_status: sale.payment_status,
      is_legacy_import: sale.is_legacy_import,
      customer: sale.customer,
      warehouse: sale.warehouse,
    },
    items,
  }
}

/**
 * Create a sales return
 */
async function createSalesReturn(data, user) {
  assertReturnPermission(user)

  const {
    sale_id,
    items,
    reason,
    refund_method = 'CASH',
    notes,
    idempotency_key,
    return_date,
  } = data

  if (!sale_id) {
    throw new ValidationError('Sale ID is required', [{ field: 'sale_id', message: 'Sale ID is required' }])
  }

  if (!reason || !reason.trim()) {
    throw new ValidationError('Return reason is required', [{ field: 'reason', message: 'Return reason is required' }])
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ValidationError('Return must contain at least one item', [
      { field: 'items', message: 'Return must contain at least one item' },
    ])
  }

  // Check idempotency key if provided
  const idempotencyKey = idempotency_key ? String(idempotency_key).trim() : null
  if (idempotencyKey) {
    const existing = await prisma.salesReturn.findUnique({
      where: { idempotency_key: idempotencyKey },
      include: {
        items: true,
        sale: { select: { id: true, transaction_id: true } },
        customer: { select: { id: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, username: true, full_name: true } },
      },
    })
    if (existing) {
      throw new ConflictError(`Sales return with idempotency key "${idempotencyKey}" has already been processed`)
    }
  }

  // Fetch sale with its items and existing returns
  const sale = await prisma.sale.findUnique({
    where: { id: sale_id },
    include: {
      sale_items: {
        include: { product: true },
      },
      customer: true,
      warehouse: true,
      sales_returns: {
        include: { items: true },
      },
    },
  })

  if (!sale) {
    throw new NotFoundError(`Sale with ID ${sale_id} not found`)
  }

  // Legacy safety check
  if (sale.is_legacy_import) {
    throw new ValidationError('Returns cannot be processed on historical imported transactions with unverified data.', [
      { field: 'sale_id', message: 'Returns cannot be processed on historical imported transactions with unverified data' },
    ])
  }

  // Calculate already returned quantities per sale_item_id
  const returnedByItem = {}
  for (const sr of sale.sales_returns) {
    if (!sr.is_cancelled) {
      for (const item of sr.items) {
        returnedByItem[item.sale_item_id] = (returnedByItem[item.sale_item_id] || new Decimal(0)).plus(item.quantity)
      }
    }
  }

  const saleItemMap = new Map(sale.sale_items.map((si) => [si.id, si]))
  let totalRefundAmount = new Decimal(0)
  const preparedItems = []

  for (let idx = 0; idx < items.length; idx++) {
    const reqItem = items[idx]
    const saleItem = saleItemMap.get(reqItem.sale_item_id)
    if (!saleItem) {
      throw new ValidationError(`Sale line item "${reqItem.sale_item_id}" does not belong to sale "${sale.transaction_id}"`, [
        { field: `items[${idx}].sale_item_id`, message: 'Item does not belong to this sale' },
      ])
    }

    const qty = new Decimal(reqItem.quantity || 0)
    if (qty.lte(0)) {
      throw new ValidationError(`Returned quantity must be greater than zero for "${saleItem.product_name || saleItem.product.name}"`, [
        { field: `items[${idx}].quantity`, message: 'Quantity must be positive' },
      ])
    }

    const alreadyRet = returnedByItem[saleItem.id] || new Decimal(0)
    const originalQty = new Decimal(saleItem.quantity)
    const remainingEligible = originalQty.minus(alreadyRet)

    if (qty.gt(remainingEligible)) {
      throw new ValidationError(
        `Cannot return ${qty.toString()} of "${saleItem.product_name || saleItem.product.name}". Remaining eligible quantity is ${remainingEligible.toString()}`,
        [{ field: `items[${idx}].quantity`, message: `Maximum returnable quantity is ${remainingEligible.toString()}` }]
      )
    }

    const product = saleItem.product
    validateQuantity(qty.toString(), saleItem.unit, product.unit_category)

    const baseQty = toBaseUnitQuantity(
      qty.toString(),
      saleItem.unit,
      product.unit_category,
      product.base_unit
    )

    // Decimal-safe refund calculation based on original transaction values
    const netUnitPrice = originalQty.gt(0)
      ? roundMoney(new Decimal(saleItem.total).div(originalQty))
      : new Decimal(saleItem.unit_price)
    const lineRefund = roundMoney(qty.mul(netUnitPrice))
    totalRefundAmount = totalRefundAmount.plus(lineRefund)

    const restock = reqItem.restock !== undefined ? Boolean(reqItem.restock) : true
    const disposition = reqItem.disposition
      ? String(reqItem.disposition).trim().toUpperCase()
      : (restock ? 'RESTOCKED' : 'DAMAGED')

    preparedItems.push({
      sale_item_id: saleItem.id,
      product_id: product.id,
      product_name: saleItem.product_name || product.name,
      product_sku: saleItem.product_sku || product.sku,
      unit: saleItem.unit,
      quantity: qty,
      base_quantity: baseQty,
      unit_price: netUnitPrice,
      refund_subtotal: lineRefund,
      restock,
      disposition,
    })
  }

  const returnNumber = await generateSalesReturnNumber()

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Database-level exclusive lock on parent Sale record to serialize concurrent return requests
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${sale.id} FOR UPDATE`

        // Concurrency guard: re-verify remaining quantities inside transaction
        const currentReturnItems = await tx.salesReturnItem.findMany({
          where: {
            sale_item_id: { in: preparedItems.map((p) => p.sale_item_id) },
          },
        })
        const lockedReturnedByItem = {}
        for (const cri of currentReturnItems) {
          lockedReturnedByItem[cri.sale_item_id] = (lockedReturnedByItem[cri.sale_item_id] || new Decimal(0)).plus(cri.quantity)
        }
        for (const p of preparedItems) {
          const saleItem = saleItemMap.get(p.sale_item_id)
          const curReturned = lockedReturnedByItem[p.sale_item_id] || new Decimal(0)
          const origQty = new Decimal(saleItem.quantity)
          if (curReturned.plus(p.quantity).gt(origQty)) {
            throw new ConflictError(`Concurrent return conflict for item "${p.product_name}". Exceeds eligible quantity.`)
          }
        }

        // 1. Create SalesReturn header & line items
        const salesReturn = await tx.salesReturn.create({
          data: {
            return_number: returnNumber,
            sale_id: sale.id,
            customer_id: sale.customer_id,
            user_id: user.id,
            warehouse_id: sale.warehouse_id,
            return_date: return_date ? new Date(return_date) : new Date(),
            reason: reason.trim(),
            refund_status: 'COMPLETED',
            refund_method: refund_method || 'CASH',
            refund_amount: totalRefundAmount,
            notes: notes ? notes.trim() : null,
            idempotency_key: idempotencyKey,
            items: {
              create: preparedItems.map((item) => ({
                sale_item_id: item.sale_item_id,
                product_id: item.product_id,
                product_name: item.product_name,
                product_sku: item.product_sku,
                unit: item.unit,
                quantity: item.quantity,
                base_quantity: item.base_quantity,
                unit_price: item.unit_price,
                refund_subtotal: item.refund_subtotal,
                restock: item.restock,
                disposition: item.disposition,
              })),
            },
          },
          include: {
            items: true,
            sale: { select: { id: true, transaction_id: true, sale_date: true, total_amount: true } },
            customer: { select: { id: true, name: true, phone: true } },
            warehouse: { select: { id: true, code: true, name: true } },
            user: { select: { id: true, username: true, full_name: true } },
          },
        })

        // 2. Restock physical items into sellable inventory
        for (const item of preparedItems) {
          if (item.restock) {
            const prod = await tx.product.findUnique({ where: { id: item.product_id } })
            const prevQty = new Decimal(prod.quantity)
            const newQty = prevQty.plus(item.base_quantity)

            await tx.product.update({
              where: { id: item.product_id },
              data: { quantity: newQty },
            })

            await tx.inventoryLog.create({
              data: {
                product_id: item.product_id,
                change_type: 'RETURN',
                unit: item.unit,
                quantity_change: item.base_quantity,
                previous_quantity: prevQty,
                new_quantity: newQty,
                user_id: user.id,
                warehouse_id: sale.warehouse_id || null,
                notes: `Sales Return #${returnNumber} (Sale #${sale.transaction_id})`,
              },
            })
          }
        }

        return salesReturn
      },
      { maxWait: 10000, timeout: 30000 }
    )
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ConflictError(`Return number or idempotency key already exists`)
    }
    throw err
  }
}

/**
 * List sales returns with pagination, filters, and search
 */
async function listSalesReturns({
  page = 1,
  per_page = 20,
  search,
  sale_id,
  customer_id,
  warehouse_id,
  start_date,
  end_date,
} = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (sale_id) where.sale_id = sale_id
  if (customer_id) where.customer_id = customer_id
  if (warehouse_id) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouse_id } })
    if (!wh) {
      throw new NotFoundError(`Warehouse with ID ${warehouse_id} not found`)
    }
    where.warehouse_id = warehouse_id
  }

  if (start_date || end_date) {
    const start = start_date ? new Date(start_date) : null
    const end = end_date ? new Date(end_date) : null
    if (end) end.setHours(23, 59, 59, 999)

    where.return_date = {}
    if (start) where.return_date.gte = start
    if (end) where.return_date.lte = end
  }

  if (search && search.trim()) {
    const q = search.trim()
    where.OR = [
      { return_number: { contains: q, mode: 'insensitive' } },
      { sale: { transaction_id: { contains: q, mode: 'insensitive' } } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { reason: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [returns, total] = await Promise.all([
    prisma.salesReturn.findMany({
      where,
      skip,
      take,
      orderBy: { return_date: 'desc' },
      include: {
        sale: { select: { id: true, transaction_id: true, total_amount: true } },
        customer: { select: { id: true, name: true, phone: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, username: true, full_name: true } },
        items: true,
      },
    }),
    prisma.salesReturn.count({ where }),
  ])

  return {
    returns,
    total,
    page,
    per_page: take,
    total_pages: Math.ceil(total / take),
  }
}

/**
 * Get sales return by ID
 */
async function getSalesReturnById(id) {
  const sr = await prisma.salesReturn.findUnique({
    where: { id },
    include: {
      sale: {
        include: {
          customer: true,
          warehouse: true,
        },
      },
      customer: true,
      warehouse: true,
      user: { select: { id: true, username: true, full_name: true, role: true } },
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, base_unit: true },
          },
          sale_item: true,
        },
      },
    },
  })

  if (!sr) {
    throw new NotFoundError(`Sales return with ID ${id} not found`)
  }

  return sr
}

async function cancelSalesReturn(returnId, { reason }, user) {
  assertReturnPermission(user)
  if (!reason || !String(reason).trim()) {
    throw new ValidationError('Cancellation reason is required', [
      { field: 'reason', message: 'Cancellation reason is required' },
    ])
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SalesReturn" WHERE id = ${returnId} FOR UPDATE`

    const sr = await tx.salesReturn.findUnique({
      where: { id: returnId },
      include: {
        items: true,
        sale: true,
      },
    })
    if (!sr) throw new NotFoundError('Sales return not found')

    if (sr.is_cancelled) {
      throw new ValidationError('Sales return is already cancelled')
    }

    // For each item where restock === true, reverse the stock addition if possible
    for (const item of sr.items) {
      if (item.restock) {
        const prod = await tx.product.findUnique({ where: { id: item.product_id } })
        const currentStock = new Decimal(prod.quantity)
        const reverseQty = new Decimal(item.base_quantity)

        if (currentStock.lt(reverseQty)) {
          throw new ValidationError(
            `Cannot cancel return: insufficient stock to reverse restocked "${item.product_name}". Current stock: ${currentStock.toString()}, required: ${reverseQty.toString()}`
          )
        }

        const newStock = currentStock.minus(reverseQty)
        await tx.product.update({
          where: { id: item.product_id },
          data: { quantity: newStock },
        })

        await tx.inventoryLog.create({
          data: {
            product_id: item.product_id,
            change_type: 'ADJUSTMENT',
            unit: item.unit,
            quantity_change: reverseQty.negated(),
            previous_quantity: currentStock,
            new_quantity: newStock,
            user_id: user.id,
            warehouse_id: sr.warehouse_id,
            notes: `Cancellation of Sales Return #${sr.return_number}: ${reason.trim()}`,
          },
        })
      }
    }

    // Mark SalesReturn as cancelled
    const updated = await tx.salesReturn.update({
      where: { id: returnId },
      data: {
        is_cancelled: true,
        cancelled_at: new Date(),
        cancelled_by: user.id,
        cancellation_reason: reason.trim(),
        refund_status: 'FAILED',
      },
      include: {
        sale: true,
        customer: true,
        warehouse: true,
        user: true,
        items: true,
      },
    })

    return updated
  }, { maxWait: 10000, timeout: 30000 })
}

module.exports = {
  createSalesReturn,
  listSalesReturns,
  getSalesReturnById,
  getSaleReturnEligibility,
  assertReturnPermission,
  cancelSalesReturn,
}
