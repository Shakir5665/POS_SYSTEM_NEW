const prisma = require('../utils/prismaClient')
const { NotFoundError, ValidationError } = require('../utils/errors')
const { Decimal, toMoney, roundMoney } = require('../utils/money')
const { toBaseUnitQuantity, validateQuantity } = require('../utils/uom')
const generatePurchaseNumber = require('../utils/generatePurchaseNumber')
const { getOrCreateWarehouseStock } = require('./branchStockService')

async function listPurchases({ page = 1, per_page = 20, search, status, payment_status, supplier_id, warehouse_id, is_legacy_import, start_date, end_date } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (status) where.status = status
  if (payment_status) where.payment_status = payment_status
  if (supplier_id) where.supplier_id = supplier_id
  if (warehouse_id) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouse_id } })
    if (!wh) {
      throw new NotFoundError(`Warehouse with ID ${warehouse_id} not found`)
    }
    where.warehouse_id = warehouse_id
  }
  if (is_legacy_import !== undefined) {
    where.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  if (start_date || end_date) {
    const start = start_date ? new Date(start_date) : null
    const end = end_date ? new Date(end_date) : null
    if (end) end.setHours(23, 59, 59, 999)

    const dateFilter = {}
    if (start) dateFilter.gte = start
    if (end) dateFilter.lte = end

    where.AND = where.AND || []
    where.AND.push({
      OR: [
        { purchase_date: dateFilter },
        { purchase_date: null, created_at: dateFilter },
      ],
    })
  }

  if (search) {
    where.OR = [
      { purchase_number: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, full_name: true, username: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        items: true,
      },
    }),
    prisma.purchase.count({ where }),
  ])

  return { purchases, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function getPurchaseById(id) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      user: { select: { id: true, full_name: true, username: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, base_unit: true, pricing_unit: true },
          },
        },
      },
      allocations: {
        include: {
          supplier_payment: {
            include: { user: { select: { id: true, full_name: true } } },
          },
        },
      },
    },
  })
  if (!purchase) throw new NotFoundError('Purchase order not found')
  return purchase
}

async function createPurchase({
  supplier_id,
  user_id,
  items,
  initial_payment = 0,
  payment_method = 'CASH',
  notes,
  status = 'ORDERED',
  warehouse_id,
  purchase_date,
  is_legacy_import = false,
}) {
  if (!supplier_id) {
    throw new ValidationError('Supplier is required', [{ field: 'supplier_id', message: 'Supplier is required' }])
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: supplier_id } })
  if (!supplier) throw new NotFoundError('Supplier not found')
  if (!supplier.is_active) throw new ValidationError('Cannot create purchase for an inactive supplier')

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ValidationError('Purchase must contain at least one item', [
      { field: 'items', message: 'Purchase must contain at least one item' },
    ])
  }

  // Validate items and pre-fetch products
  const productIds = items.map((i) => i.product_id)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  let subtotal = new Decimal(0)
  const preparedItems = []

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    const product = productMap.get(item.product_id)
    if (!product) {
      throw new NotFoundError(`Product not found for item at index ${idx}`)
    }

    const qty = new Decimal(item.quantity || 0)
    if (qty.lte(0)) {
      throw new ValidationError(`Quantity must be greater than zero for ${product.name}`)
    }

    validateQuantity(item.quantity, item.unit || product.base_unit, product.unit_category)

    const unitCost = toMoney(item.unit_cost !== undefined ? item.unit_cost : (product.cost_price || 0))
    if (unitCost.lt(0)) {
      throw new ValidationError(`Unit cost cannot be negative for ${product.name}`)
    }

    const lineTotal = roundMoney(qty.mul(unitCost))
    subtotal = subtotal.plus(lineTotal)

    const baseQty = toBaseUnitQuantity(
      item.quantity,
      item.unit || product.base_unit,
      product.unit_category,
      product.base_unit
    )

    preparedItems.push({
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      unit: item.unit || product.base_unit,
      quantity: qty,
      base_quantity: baseQty,
      unit_cost: unitCost,
      total_cost: lineTotal,
    })
  }

  const totalAmount = roundMoney(subtotal)
  const initPay = toMoney(initial_payment || 0)

  if (initPay.lt(0)) {
    throw new ValidationError('Initial payment cannot be negative')
  }
  if (initPay.gt(totalAmount)) {
    throw new ValidationError('Initial payment cannot exceed total purchase amount')
  }

  const balanceDue = totalAmount.minus(initPay)
  let paymentStatus = 'PENDING'
  if (initPay.gt(0)) {
    paymentStatus = balanceDue.eq(0) ? 'COMPLETED' : 'PARTIALLY_PAID'
  }

  const purchaseNumber = await generatePurchaseNumber()
  const purchaseStatus = status === 'RECEIVED' ? 'RECEIVED' : 'ORDERED'
  const receivedAt = purchaseStatus === 'RECEIVED' ? new Date() : null

  // Resolve default warehouse if warehouse_id not specified
  let resolvedWarehouseId = warehouse_id
  if (resolvedWarehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: resolvedWarehouseId } })
    if (!wh) {
      throw new NotFoundError(`Warehouse with ID ${resolvedWarehouseId} not found`)
    }
    if (!wh.is_active) {
      throw new ValidationError(`Cannot assign purchase order to inactive warehouse "${wh.name}"`)
    }
  } else {
    const defaultWarehouse = await prisma.warehouse.findFirst({
      where: { is_default: true, is_active: true },
      select: { id: true },
    })
    if (defaultWarehouse) {
      resolvedWarehouseId = defaultWarehouse.id
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create Purchase
    const purchase = await tx.purchase.create({
      data: {
        purchase_number: purchaseNumber,
        supplier_id,
        user_id,
        warehouse_id: resolvedWarehouseId || null,
        purchase_date: purchase_date ? new Date(purchase_date) : null,
        is_legacy_import: Boolean(is_legacy_import),
        status: purchaseStatus,
        payment_status: paymentStatus,
        subtotal,
        tax_amount: 0,
        total_amount: totalAmount,
        amount_paid: initPay,
        balance_due: balanceDue,
        received_at: receivedAt,
        notes: notes || null,
        items: {
          create: preparedItems.map((item) => ({
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
        supplier: true,
        user: { select: { id: true, full_name: true, username: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        items: true,
      },
    })

    // 2. If initial payment recorded, create SupplierPayment and Allocation
    if (initPay.gt(0)) {
      const payment = await tx.supplierPayment.create({
        data: {
          supplier_id,
          user_id,
          amount: initPay,
          payment_method: payment_method || 'CASH',
          reference: `INIT-${purchase.purchase_number}`,
          notes: `Initial payment for Purchase Order #${purchase.purchase_number}`,
        },
      })

      await tx.supplierPaymentAllocation.create({
        data: {
          supplier_payment_id: payment.id,
          purchase_id: purchase.id,
          amount: initPay,
        },
      })
    }

    // 3. If received immediately, update product inventory and logs
    if (purchaseStatus === 'RECEIVED') {
      for (const item of preparedItems) {
        const prod = await tx.product.findUnique({ where: { id: item.product_id } })
        const prevQty = new Decimal(prod.quantity)
        const newQty = prevQty.plus(item.base_quantity)

        await tx.product.update({
          where: { id: item.product_id },
          data: {
            quantity: newQty,
            ...(item.unit_cost.gt(0) && { cost_price: item.unit_cost }),
          },
        })

        if (resolvedWarehouseId) {
          const branchStock = await getOrCreateWarehouseStock(tx, resolvedWarehouseId, item.product_id, 0)
          await tx.warehouseStock.update({
            where: { id: branchStock.id },
            data: { quantity: { increment: item.base_quantity } },
          })
        }

        await tx.inventoryLog.create({
          data: {
            product_id: item.product_id,
            warehouse_id: resolvedWarehouseId || null,
            change_type: 'RESTOCK',
            unit: item.unit,
            quantity_change: item.base_quantity,
            previous_quantity: prevQty,
            new_quantity: newQty,
            user_id,
            notes: `Purchase order #${purchase.purchase_number}`,
          },
        })
      }
    }

    return purchase
  }, { maxWait: 10000, timeout: 30000 })
}

async function receivePurchase(id, userId) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { items: true },
  })

  if (!purchase) throw new NotFoundError('Purchase order not found')
  if (purchase.status === 'RECEIVED') {
    throw new ValidationError('Purchase order has already been received')
  }
  if (purchase.status === 'CANCELLED') {
    throw new ValidationError('Cannot receive a cancelled purchase order')
  }

  return prisma.$transaction(async (tx) => {
    for (const item of purchase.items) {
      const prod = await tx.product.findUnique({ where: { id: item.product_id } })
      if (!prod) continue

      const prevQty = new Decimal(prod.quantity)
      const newQty = prevQty.plus(item.base_quantity)

      await tx.product.update({
        where: { id: item.product_id },
        data: {
          quantity: newQty,
          ...(Number(item.unit_cost) > 0 && { cost_price: item.unit_cost }),
        },
      })

      if (purchase.warehouse_id) {
        const branchStock = await getOrCreateWarehouseStock(tx, purchase.warehouse_id, item.product_id, 0)
        await tx.warehouseStock.update({
          where: { id: branchStock.id },
          data: { quantity: { increment: item.base_quantity } },
        })
      }

      await tx.inventoryLog.create({
        data: {
          product_id: item.product_id,
          warehouse_id: purchase.warehouse_id || null,
          change_type: 'RESTOCK',
          unit: item.unit,
          quantity_change: item.base_quantity,
          previous_quantity: prevQty,
          new_quantity: newQty,
          user_id: userId,
          notes: `Purchase order #${purchase.purchase_number} received`,
        },
      })
    }

    return tx.purchase.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        received_at: new Date(),
      },
      include: {
        supplier: true,
        user: { select: { id: true, full_name: true } },
        items: true,
      },
    })
  }, { maxWait: 10000, timeout: 30000 })
}

async function cancelPurchase(id, userId) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { allocations: true },
  })

  if (!purchase) throw new NotFoundError('Purchase order not found')
  if (purchase.status === 'RECEIVED') {
    throw new ValidationError('Cannot cancel a purchase order that has already been received')
  }
  if (purchase.status === 'CANCELLED') {
    throw new ValidationError('Purchase order is already cancelled')
  }
  if (Number(purchase.amount_paid) > 0 || purchase.allocations.length > 0) {
    throw new ValidationError('Cannot cancel a purchase order that has recorded payments')
  }

  return prisma.purchase.update({
    where: { id },
    data: {
      status: 'CANCELLED',
    },
    include: {
      supplier: true,
      items: true,
    },
  })
}

module.exports = {
  listPurchases,
  getPurchaseById,
  createPurchase,
  receivePurchase,
  cancelPurchase,
}
