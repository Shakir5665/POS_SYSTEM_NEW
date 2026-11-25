const prisma = require('../utils/prismaClient')
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../utils/errors')
const { Decimal, roundMoney } = require('../utils/money')
const { toBaseUnitQuantity, validateQuantity } = require('../utils/uom')
const generatePurchaseReturnNumber = require('../utils/generatePurchaseReturnNumber')

/**
 * Check if user is authorized to perform purchase returns
 */
function assertPurchaseReturnPermission(user) {
  if (!user || !['ADMIN', 'MANAGER', 'SUPERADMIN'].includes(user.role)) {
    throw new ForbiddenError('Purchase returns require administrative authorization')
  }
}

/**
 * Get return eligibility for a purchase order
 */
async function getPurchaseReturnEligibility(purchaseId) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, base_unit: true, pricing_unit: true, unit_category: true, quantity: true },
          },
        },
      },
      supplier: { select: { id: true, name: true, phone: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      purchase_returns: {
        include: {
          items: true,
        },
      },
    },
  })

  if (!purchase) {
    throw new NotFoundError(`Purchase order with ID ${purchaseId} not found`)
  }

  // Calculate already returned quantities per purchase_item_id
  const returnedByItem = {}
  for (const pr of purchase.purchase_returns) {
    for (const item of pr.items) {
      returnedByItem[item.purchase_item_id] = (returnedByItem[item.purchase_item_id] || new Decimal(0)).plus(item.quantity)
    }
  }

  const items = purchase.items.map((pi) => {
    const originalQty = new Decimal(pi.quantity)
    const alreadyReturned = returnedByItem[pi.id] || new Decimal(0)
    const remainingEligible = Decimal.max(0, originalQty.minus(alreadyReturned))
    const netUnitCost = originalQty.gt(0)
      ? roundMoney(new Decimal(pi.total_cost).div(originalQty))
      : new Decimal(pi.unit_cost)

    return {
      purchase_item_id: pi.id,
      product_id: pi.product_id,
      product_name: pi.product_name || pi.product?.name || '',
      product_sku: pi.product_sku || pi.product?.sku || '',
      unit: pi.unit,
      purchased_quantity: originalQty.toString(),
      already_returned: alreadyReturned.toString(),
      remaining_eligible: remainingEligible.toString(),
      unit_cost: Number(pi.unit_cost),
      net_unit_cost: Number(netUnitCost),
      total_cost: Number(pi.total_cost),
      current_stock: pi.product ? Number(pi.product.quantity) : 0,
    }
  })

  return {
    purchase: {
      id: purchase.id,
      purchase_number: purchase.purchase_number,
      purchase_date: purchase.purchase_date || purchase.created_at,
      status: purchase.status,
      payment_status: purchase.payment_status,
      total_amount: Number(purchase.total_amount),
      is_legacy_import: purchase.is_legacy_import,
      supplier: purchase.supplier,
      warehouse: purchase.warehouse,
    },
    items,
  }
}

/**
 * Create a purchase return
 */
async function createPurchaseReturn(data, user) {
  assertPurchaseReturnPermission(user)

  const {
    purchase_id,
    items,
    reason,
    settlement_status = 'PENDING',
    settlement_method = 'CASH',
    notes,
    idempotency_key,
    return_date,
  } = data

  if (!purchase_id) {
    throw new ValidationError('Purchase ID is required', [{ field: 'purchase_id', message: 'Purchase ID is required' }])
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
    const existing = await prisma.purchaseReturn.findUnique({
      where: { idempotency_key: idempotencyKey },
      include: {
        items: true,
        purchase: { select: { id: true, purchase_number: true } },
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, username: true, full_name: true } },
      },
    })
    if (existing) {
      throw new ConflictError(`Purchase return with idempotency key "${idempotencyKey}" has already been processed`)
    }
  }

  // Fetch purchase with items and previous returns
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchase_id },
    include: {
      items: {
        include: { product: true },
      },
      supplier: true,
      warehouse: true,
      purchase_returns: {
        include: { items: true },
      },
    },
  })

  if (!purchase) {
    throw new NotFoundError(`Purchase order with ID ${purchase_id} not found`)
  }

  // Only received purchases can be returned
  if (purchase.status !== 'RECEIVED') {
    throw new ValidationError(`Cannot return items from purchase in "${purchase.status}" status. Only received goods can be returned.`, [
      { field: 'purchase_id', message: 'Purchase order has not been received' },
    ])
  }

  // Legacy safety check
  if (purchase.is_legacy_import) {
    throw new ValidationError('Returns cannot be processed on historical imported transactions with unverified data.', [
      { field: 'purchase_id', message: 'Returns cannot be processed on historical imported transactions with unverified data' },
    ])
  }

  // Calculate already returned quantities per purchase_item_id
  const returnedByItem = {}
  for (const pr of purchase.purchase_returns) {
    for (const item of pr.items) {
      returnedByItem[item.purchase_item_id] = (returnedByItem[item.purchase_item_id] || new Decimal(0)).plus(item.quantity)
    }
  }

  const purchaseItemMap = new Map(purchase.items.map((pi) => [pi.id, pi]))
  let totalReturnAmount = new Decimal(0)
  const preparedItems = []

  for (let idx = 0; idx < items.length; idx++) {
    const reqItem = items[idx]
    const purchaseItem = purchaseItemMap.get(reqItem.purchase_item_id)
    if (!purchaseItem) {
      throw new ValidationError(`Purchase line item "${reqItem.purchase_item_id}" does not belong to purchase "${purchase.purchase_number}"`, [
        { field: `items[${idx}].purchase_item_id`, message: 'Item does not belong to this purchase' },
      ])
    }

    const qty = new Decimal(reqItem.quantity || 0)
    if (qty.lte(0)) {
      throw new ValidationError(`Returned quantity must be greater than zero for "${purchaseItem.product_name || purchaseItem.product.name}"`, [
        { field: `items[${idx}].quantity`, message: 'Quantity must be positive' },
      ])
    }

    const alreadyRet = returnedByItem[purchaseItem.id] || new Decimal(0)
    const originalQty = new Decimal(purchaseItem.quantity)
    const remainingEligible = originalQty.minus(alreadyRet)

    if (qty.gt(remainingEligible)) {
      throw new ValidationError(
        `Cannot return ${qty.toString()} of "${purchaseItem.product_name || purchaseItem.product.name}". Remaining eligible quantity is ${remainingEligible.toString()}`,
        [{ field: `items[${idx}].quantity`, message: `Maximum returnable quantity is ${remainingEligible.toString()}` }]
      )
    }

    const product = purchaseItem.product
    validateQuantity(qty.toString(), purchaseItem.unit, product.unit_category)

    const baseQty = toBaseUnitQuantity(
      qty.toString(),
      purchaseItem.unit,
      product.unit_category,
      product.base_unit
    )

    // Check current stock availability: goods physically leave inventory
    const currentStock = new Decimal(product.quantity)
    if (currentStock.lt(baseQty)) {
      throw new ValidationError(
        `Insufficient current stock to return "${product.name}". Required: ${baseQty.toString()}, Current available: ${currentStock.toString()}`,
        [{ field: `items[${idx}].quantity`, message: `Current available stock (${currentStock.toString()}) is insufficient` }]
      )
    }

    const netUnitCost = originalQty.gt(0)
      ? roundMoney(new Decimal(purchaseItem.total_cost).div(originalQty))
      : new Decimal(purchaseItem.unit_cost)
    const lineTotalCost = roundMoney(qty.mul(netUnitCost))
    totalReturnAmount = totalReturnAmount.plus(lineTotalCost)

    preparedItems.push({
      purchase_item_id: purchaseItem.id,
      product_id: product.id,
      product_name: purchaseItem.product_name || product.name,
      product_sku: purchaseItem.product_sku || product.sku,
      unit: purchaseItem.unit,
      quantity: qty,
      base_quantity: baseQty,
      unit_cost: netUnitCost,
      total_cost: lineTotalCost,
    })
  }

  const returnNumber = await generatePurchaseReturnNumber()

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Database-level exclusive lock on parent Purchase record to serialize concurrent return requests
        await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${purchase.id} FOR UPDATE`

        // Database-level exclusive locks on affected Product rows to guarantee inventory consistency
        for (const p of preparedItems) {
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${p.product_id} FOR UPDATE`
        }

        // Concurrency guard: re-verify return quantities and stock inside transaction
        const currentReturnItems = await tx.purchaseReturnItem.findMany({
          where: {
            purchase_item_id: { in: preparedItems.map((p) => p.purchase_item_id) },
          },
        })
        const lockedReturnedByItem = {}
        for (const cri of currentReturnItems) {
          lockedReturnedByItem[cri.purchase_item_id] = (lockedReturnedByItem[cri.purchase_item_id] || new Decimal(0)).plus(cri.quantity)
        }
        for (const p of preparedItems) {
          const purchaseItem = purchaseItemMap.get(p.purchase_item_id)
          const curReturned = lockedReturnedByItem[p.purchase_item_id] || new Decimal(0)
          const origQty = new Decimal(purchaseItem.quantity)
          if (curReturned.plus(p.quantity).gt(origQty)) {
            throw new ConflictError(`Concurrent return conflict for item "${p.product_name}". Exceeds eligible quantity.`)
          }

          // Strict concurrency stock check
          const liveProd = await tx.product.findUnique({ where: { id: p.product_id } })
          if (new Decimal(liveProd.quantity).lt(p.base_quantity)) {
            throw new ValidationError(
              `Insufficient stock for "${p.product_name}" under concurrent transaction. Available: ${liveProd.quantity}`
            )
          }
        }

        // 1. Create PurchaseReturn header & items
        const purchaseReturn = await tx.purchaseReturn.create({
          data: {
            return_number: returnNumber,
            purchase_id: purchase.id,
            supplier_id: purchase.supplier_id,
            user_id: user.id,
            warehouse_id: purchase.warehouse_id,
            return_date: return_date ? new Date(return_date) : new Date(),
            reason: reason.trim(),
            settlement_status,
            settlement_method: settlement_method || 'CASH',
            total_amount: totalReturnAmount,
            notes: notes ? notes.trim() : null,
            idempotency_key: idempotencyKey,
            items: {
              create: preparedItems.map((item) => ({
                purchase_item_id: item.purchase_item_id,
                product_id: item.product_id,
                product_name: item.product_name,
                product_sku: item.product_sku,
                unit: item.unit,
                quantity: item.quantity,
                base_quantity: item.base_quantity,
                unit_cost: item.unit_cost,
                total_cost: item.total_cost,
              })),
            },
          },
          include: {
            items: true,
            purchase: { select: { id: true, purchase_number: true, purchase_date: true, total_amount: true } },
            supplier: { select: { id: true, name: true, phone: true } },
            warehouse: { select: { id: true, code: true, name: true } },
            user: { select: { id: true, username: true, full_name: true } },
          },
        })

        // 2. Deduct physical items from inventory
        for (const item of preparedItems) {
          const prod = await tx.product.findUnique({ where: { id: item.product_id } })
          const prevQty = new Decimal(prod.quantity)
          const newQty = prevQty.minus(item.base_quantity)

          await tx.product.update({
            where: { id: item.product_id },
            data: { quantity: newQty },
          })

          await tx.inventoryLog.create({
            data: {
              product_id: item.product_id,
              change_type: 'RETURN',
              unit: item.unit,
              quantity_change: item.base_quantity.negated(),
              previous_quantity: prevQty,
              new_quantity: newQty,
              user_id: user.id,
              warehouse_id: purchase.warehouse_id || null,
              notes: `Purchase Return #${returnNumber} (PO #${purchase.purchase_number})`,
            },
          })
        }

        return purchaseReturn
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
 * List purchase returns with pagination, filters, and search
 */
async function listPurchaseReturns({
  page = 1,
  per_page = 20,
  search,
  purchase_id,
  supplier_id,
  warehouse_id,
  start_date,
  end_date,
} = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (purchase_id) where.purchase_id = purchase_id
  if (supplier_id) where.supplier_id = supplier_id
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
      { purchase: { purchase_number: { contains: q, mode: 'insensitive' } } },
      { supplier: { name: { contains: q, mode: 'insensitive' } } },
      { reason: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [returns, total] = await Promise.all([
    prisma.purchaseReturn.findMany({
      where,
      skip,
      take,
      orderBy: { return_date: 'desc' },
      include: {
        purchase: { select: { id: true, purchase_number: true, total_amount: true } },
        supplier: { select: { id: true, name: true, phone: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, username: true, full_name: true } },
        items: true,
      },
    }),
    prisma.purchaseReturn.count({ where }),
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
 * Get purchase return by ID
 */
async function getPurchaseReturnById(id) {
  const pr = await prisma.purchaseReturn.findUnique({
    where: { id },
    include: {
      purchase: {
        include: {
          supplier: true,
          warehouse: true,
        },
      },
      supplier: true,
      warehouse: true,
      user: { select: { id: true, username: true, full_name: true, role: true } },
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, base_unit: true },
          },
          purchase_item: true,
        },
      },
    },
  })

  if (!pr) {
    throw new NotFoundError(`Purchase return with ID ${id} not found`)
  }

  return pr
}

/**
 * Settle a pending purchase return (Mark as COMPLETED or CREDITED)
 */
async function settlePurchaseReturn(id, { settlement_status = 'COMPLETED', settlement_method = 'CASH', notes } = {}, user) {
  assertPurchaseReturnPermission(user)

  const allowedStatuses = ['COMPLETED', 'CREDITED']
  if (!allowedStatuses.includes(settlement_status)) {
    throw new ValidationError(`Invalid settlement status "${settlement_status}". Allowed: ${allowedStatuses.join(', ')}`, [
      { field: 'settlement_status', message: 'Status must be COMPLETED or CREDITED' },
    ])
  }

  const allowedMethods = ['CASH', 'MOBILE_MONEY', 'CARD', 'CREDIT']
  if (settlement_method && !allowedMethods.includes(settlement_method)) {
    throw new ValidationError(`Invalid settlement method "${settlement_method}"`, [
      { field: 'settlement_method', message: 'Invalid payment method' },
    ])
  }

  const existing = await prisma.purchaseReturn.findUnique({
    where: { id },
    include: {
      purchase: { select: { id: true, purchase_number: true } },
      supplier: { select: { id: true, name: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, username: true, full_name: true } },
      items: true,
    },
  })

  if (!existing) {
    throw new NotFoundError(`Purchase return with ID ${id} not found`)
  }

  if (existing.settlement_status === settlement_status) {
    return existing
  }

  const updatedNotes = notes
    ? (existing.notes ? `${existing.notes} | Settlement: ${notes.trim()}` : `Settlement: ${notes.trim()}`)
    : existing.notes

  const updated = await prisma.purchaseReturn.update({
    where: { id },
    data: {
      settlement_status,
      settlement_method: settlement_method || existing.settlement_method,
      notes: updatedNotes,
    },
    include: {
      purchase: { select: { id: true, purchase_number: true, total_amount: true } },
      supplier: { select: { id: true, name: true, phone: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, username: true, full_name: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, base_unit: true } },
        },
      },
    },
  })

  return updated
}

module.exports = {
  createPurchaseReturn,
  listPurchaseReturns,
  getPurchaseReturnById,
  getPurchaseReturnEligibility,
  settlePurchaseReturn,
  assertPurchaseReturnPermission,
}
