const prisma = require('../utils/prismaClient')
const { NotFoundError, ValidationError, ForbiddenError, BadRequestError } = require('../utils/errors')
const { Decimal } = require('../utils/money')
const { toBaseUnitQuantity } = require('../utils/uom')
const { adjustBranchStock, getOrCreateWarehouseStock } = require('./branchStockService')

function generateTransferNumber() {
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(1000 + Math.random() * 9000)
  return `TRF-${timestamp}-${random}`
}

async function listTransfers({
  page = 1,
  per_page = 20,
  source_warehouse_id,
  from_warehouse_id,
  destination_warehouse_id,
  to_warehouse_id,
  status,
  search,
} = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const srcId = source_warehouse_id || from_warehouse_id
  const destId = destination_warehouse_id || to_warehouse_id

  const where = {}
  if (srcId) where.source_warehouse_id = srcId
  if (destId) where.destination_warehouse_id = destId
  if (status) where.status = status

  if (search) {
    where.OR = [
      { transfer_number: { contains: search, mode: 'insensitive' } },
      { source_warehouse: { name: { contains: search, mode: 'insensitive' } } },
      { destination_warehouse: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const [transfers, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        source_warehouse: { select: { id: true, code: true, name: true } },
        destination_warehouse: { select: { id: true, code: true, name: true } },
        created_by: { select: { id: true, full_name: true, username: true } },
        received_by: { select: { id: true, full_name: true, username: true } },
        items: true,
      },
    }),
    prisma.stockTransfer.count({ where }),
  ])

  const formattedTransfers = transfers.map((t) => ({
    ...t,
    from_warehouse: t.source_warehouse,
    to_warehouse: t.destination_warehouse,
    creator: t.created_by,
    receiver: t.received_by,
    items: (t.items || []).map((it) => ({
      ...it,
      quantity_transferred: it.quantity,
      quantity_received: it.received_quantity,
    })),
  }))

  return { transfers: formattedTransfers, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function getTransferById(id) {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: {
      source_warehouse: true,
      destination_warehouse: true,
      created_by: { select: { id: true, full_name: true, username: true } },
      received_by: { select: { id: true, full_name: true, username: true } },
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, base_unit: true, pricing_unit: true },
          },
        },
      },
    },
  })
  if (!transfer) throw new NotFoundError('Stock transfer not found')
  return {
    ...transfer,
    from_warehouse: transfer.source_warehouse,
    to_warehouse: transfer.destination_warehouse,
    creator: transfer.created_by,
    receiver: transfer.received_by,
    items: (transfer.items || []).map((it) => ({
      ...it,
      quantity_transferred: it.quantity,
      quantity_received: it.received_quantity,
    })),
  }
}

/**
 * Creates a new stock transfer.
 * Dispatches items immediately from the source branch if status === 'IN_TRANSIT' or 'COMPLETED'.
 */
async function createTransfer(data, userId) {
  const source_warehouse_id = data.source_warehouse_id || data.from_warehouse_id
  const destination_warehouse_id = data.destination_warehouse_id || data.to_warehouse_id
  const { items, notes, status = 'IN_TRANSIT' } = data

  if (!source_warehouse_id || !destination_warehouse_id) {
    throw new ValidationError('Source and destination branches are required')
  }

  if (source_warehouse_id === destination_warehouse_id) {
    throw new ValidationError('Source and destination branches must be different')
  }

  if (!items || items.length === 0) {
    throw new ValidationError('Transfer must include at least one product item')
  }

  const [srcWh, destWh] = await Promise.all([
    prisma.warehouse.findUnique({ where: { id: source_warehouse_id } }),
    prisma.warehouse.findUnique({ where: { id: destination_warehouse_id } }),
  ])

  if (!srcWh) throw new NotFoundError('Source branch not found')
  if (!destWh) throw new NotFoundError('Destination branch not found')

  // Validate products and check source stock availability
  const productIds = items.map((i) => i.product_id)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const preparedItems = []
  for (const item of items) {
    const p = productMap.get(item.product_id)
    if (!p) throw new NotFoundError(`Product ${item.product_id} not found`)

    const qty = new Decimal(item.quantity)
    if (qty.lte(0)) throw new ValidationError(`Quantity for ${p.name} must be greater than 0`)

    const unit = item.unit || p.base_unit || 'pcs'
    const baseQty = toBaseUnitQuantity(qty, unit, p.unit_category, p.base_unit)

    // Check source branch stock
    const ws = await getOrCreateWarehouseStock(prisma, source_warehouse_id, p.id, 0)
    let available = new Decimal(ws.quantity)

    // Dynamic unallocated stock sync:
    // If source branch stock is insufficient, but the store's global product quantity has unallocated inventory
    // (e.g. from existing products or stock adjustments recorded before branch partitioning):
    if (available.lt(baseQty) && new Decimal(p.quantity).gt(0)) {
      const otherStocks = await prisma.warehouseStock.findMany({
        where: { product_id: p.id, warehouse_id: { not: source_warehouse_id } },
      })
      const allocatedElsewhere = otherStocks.reduce((sum, s) => {
        const q = new Decimal(s.quantity)
        return q.gt(0) ? sum.plus(q) : sum
      }, new Decimal(0))
      const unallocated = new Decimal(p.quantity).minus(allocatedElsewhere)

      if (unallocated.gte(baseQty)) {
        const reconciledQty = available.lte(0) ? unallocated : available.plus(unallocated)
        await prisma.warehouseStock.update({
          where: { id: ws.id },
          data: { quantity: reconciledQty },
        })
        available = reconciledQty
      }
    }

    if (available.lt(baseQty)) {
      throw new ValidationError(
        `Insufficient stock at ${srcWh.name} for "${p.name}". Available: ${available} ${p.base_unit}, requested: ${baseQty} ${p.base_unit}`
      )
    }

    preparedItems.push({
      product_id: p.id,
      product_name: p.name,
      product_sku: p.sku,
      unit,
      quantity: qty,
      base_quantity: baseQty,
      notes: item.notes || null,
    })
  }

  const transferNumber = generateTransferNumber()

  return prisma.$transaction(async (tx) => {
    // 1. Create the transfer record
    const transfer = await tx.stockTransfer.create({
      data: {
        transfer_number: transferNumber,
        source_warehouse_id,
        destination_warehouse_id,
        status,
        transfer_date: new Date(),
        dispatched_at: ['IN_TRANSIT', 'COMPLETED'].includes(status) ? new Date() : null,
        received_at: status === 'COMPLETED' ? new Date() : null,
        notes: notes || null,
        created_by_id: userId,
        received_by_id: status === 'COMPLETED' ? userId : null,
        items: {
          create: preparedItems.map((pi) => ({
            product_id: pi.product_id,
            product_name: pi.product_name,
            product_sku: pi.product_sku,
            unit: pi.unit,
            quantity: pi.quantity,
            base_quantity: pi.base_quantity,
            received_quantity: status === 'COMPLETED' ? pi.base_quantity : null,
            notes: pi.notes,
          })),
        },
      },
      include: {
        items: true,
      },
    })

    // 2. If dispatched or completed, decrement from source branch
    if (['IN_TRANSIT', 'COMPLETED'].includes(status)) {
      for (const item of preparedItems) {
        // Deduct from source branch stock
        const srcStock = await getOrCreateWarehouseStock(tx, source_warehouse_id, item.product_id, 0)
        const prevQty = new Decimal(srcStock.quantity)
        const newQty = prevQty.minus(item.base_quantity)

        await tx.warehouseStock.update({
          where: { id: srcStock.id },
          data: { quantity: newQty },
        })

        // Log transfer out
        await tx.inventoryLog.create({
          data: {
            product_id: item.product_id,
            warehouse_id: source_warehouse_id,
            user_id: userId,
            change_type: 'TRANSFER_OUT',
            unit: item.unit,
            quantity_change: item.base_quantity.negated(),
            previous_quantity: prevQty,
            new_quantity: newQty,
            notes: `Transfer ${transferNumber} to ${destWh.name}`,
          },
        })
      }
    }

    // 3. If immediately marked COMPLETED, increment at destination branch
    if (status === 'COMPLETED') {
      for (const item of preparedItems) {
        const destStock = await getOrCreateWarehouseStock(tx, destination_warehouse_id, item.product_id, 0)
        const prevQty = new Decimal(destStock.quantity)
        const newQty = prevQty.plus(item.base_quantity)

        await tx.warehouseStock.update({
          where: { id: destStock.id },
          data: { quantity: newQty },
        })

        // Log transfer in
        await tx.inventoryLog.create({
          data: {
            product_id: item.product_id,
            warehouse_id: destination_warehouse_id,
            user_id: userId,
            change_type: 'TRANSFER_IN',
            unit: item.unit,
            quantity_change: item.base_quantity,
            previous_quantity: prevQty,
            new_quantity: newQty,
            notes: `Transfer ${transferNumber} received from ${srcWh.name}`,
          },
        })
      }
    }

    return transfer
  })
}

/**
 * Receives an IN_TRANSIT transfer at the destination branch.
 */
async function receiveTransfer(transferId, userId, { item_receipts, notes } = {}) {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id: transferId },
    include: { items: true, source_warehouse: true, destination_warehouse: true },
  })

  if (!transfer) throw new NotFoundError('Stock transfer not found')
  if (transfer.status === 'COMPLETED') {
    // Duplicate receive attempt should be a bad request (400)
    throw new BadRequestError('Transfer has already been completed')
  }
  if (transfer.status === 'CANCELLED') {
    throw new ValidationError('Cannot receive a cancelled transfer')
  }

  return prisma.$transaction(async (tx) => {
    // 1. Update items received quantities
    for (const item of transfer.items) {
      const receipt = item_receipts?.find((r) => r.item_id === item.id)
      const receivedQty = receipt !== undefined && receipt.received_quantity !== undefined
        ? new Decimal(receipt.received_quantity)
        : item.base_quantity

      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: { received_quantity: receivedQty },
      })

      // Increment destination branch stock
      const destStock = await getOrCreateWarehouseStock(tx, transfer.destination_warehouse_id, item.product_id, 0)
      const prevQty = new Decimal(destStock.quantity)
      const newQty = prevQty.plus(receivedQty)

      await tx.warehouseStock.update({
        where: { id: destStock.id },
        data: { quantity: newQty },
      })

      // Log transfer in
      await tx.inventoryLog.create({
        data: {
          product_id: item.product_id,
          warehouse_id: transfer.destination_warehouse_id,
          user_id: userId,
          change_type: 'TRANSFER_IN',
          unit: item.unit,
          quantity_change: receivedQty,
          previous_quantity: prevQty,
          new_quantity: newQty,
          notes: `Transfer ${transfer.transfer_number} received from ${transfer.source_warehouse.name}`,
        },
      })
    }

    // 2. Mark transfer as COMPLETED
    const updated = await tx.stockTransfer.update({
      where: { id: transferId },
      data: {
        status: 'COMPLETED',
        received_at: new Date(),
        received_by_id: userId,
        notes: notes ? `${transfer.notes ? transfer.notes + '\n' : ''}${notes}` : transfer.notes,
      },
      include: {
        source_warehouse: true,
        destination_warehouse: true,
        items: true,
      },
    })

    return updated
  }, { timeout: 15000, maxWait: 10000 })
}

module.exports = {
  listTransfers,
  getTransferById,
  createTransfer,
  receiveTransfer,
}
