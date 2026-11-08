const prisma = require('../utils/prismaClient')
const { NotFoundError, ValidationError } = require('../utils/errors')
const { Decimal, toMoney, roundMoney } = require('../utils/money')
const { toBaseUnitQuantity, validateQuantity } = require('../utils/uom')
const generatePurchaseNumber = require('../utils/generatePurchaseNumber')

async function listPurchases({ page = 1, per_page = 20, search, status, payment_status, supplier_id } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (status) where.status = status
  if (payment_status) where.payment_status = payment_status
  if (supplier_id) where.supplier_id = supplier_id

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

  return prisma.$transaction(async (tx) => {
    // 1. Create Purchase
    const purchase = await tx.purchase.create({
      data: {
        purchase_number: purchaseNumber,
        supplier_id,
        user_id,
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

        await tx.inventoryLog.create({
          data: {
            product_id: item.product_id,
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
  })
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

      await tx.inventoryLog.create({
        data: {
          product_id: item.product_id,
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
  })
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
