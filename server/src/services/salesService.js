const prisma = require('../utils/prismaClient')
const generateTransactionId = require('../utils/generateTransactionId')
const { Decimal, toMoney, roundMoney, toPesewas } = require('../utils/money')
const { NotFoundError, ValidationError, AppError } = require('../utils/errors')
const { toBaseUnitQuantity, toPricingUnitQuantity, calculateLineGross, calculateLineCost, validateQuantity, isValidUnitForCategory } = require('../utils/uom')
const { verifyTransaction, createRefund } = require('./paystackService')
const { getSettingValue } = require('./settingsService')

async function createSale({ items, customer_id, payment_method, amount_paid, discount_amount = 0, notes, reference, warehouse_id, sale_date, is_legacy_import = false }, userId) {
  // Step 1: Validate all items exist and have sufficient stock
  const productIds = items.map((i) => i.product_id)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, is_active: true },
  })

  const productMap = new Map(products.map((p) => [p.id, p]))

  const aggregatedBaseQuantities = new Map()

  for (const item of items) {
    const product = productMap.get(item.product_id)
    if (!product) {
      throw new NotFoundError(`Product ${item.product_id} not found or inactive`)
    }

    const sellingUnit = item.unit || product.pricing_unit || product.base_unit || 'pcs'
    if (!isValidUnitForCategory(product.unit_category, sellingUnit)) {
      throw new ValidationError(`Invalid unit "${sellingUnit}" for product "${product.name}"`)
    }

    validateQuantity(item.quantity, sellingUnit, product.unit_category)

    const baseQuantity = toBaseUnitQuantity(item.quantity, sellingUnit, product.unit_category, product.base_unit)
    const currentAgg = aggregatedBaseQuantities.get(item.product_id) || new Decimal(0)
    aggregatedBaseQuantities.set(item.product_id, currentAgg.plus(baseQuantity))
  }

  for (const [productId, totalRequestedBase] of aggregatedBaseQuantities.entries()) {
    const product = productMap.get(productId)
    const availableStock = new Decimal(product.quantity)

    if (availableStock.lt(totalRequestedBase)) {
      throw new ValidationError('Insufficient stock', [
        {
          field: 'items',
          message: `Insufficient stock for "${product.name}". Available: ${availableStock} ${product.base_unit}, requested: ${totalRequestedBase} ${product.base_unit}`,
        },
      ])
    }
  }

  // Step 2: Calculate totals with exact decimal arithmetic
  const taxRate = toMoney(await getSettingValue('tax_rate', 0))
  let subtotal = toMoney(0)
  const saleItems = items.map((item) => {
    const product = productMap.get(item.product_id)
    const sellingUnit = item.unit || product.pricing_unit || product.base_unit || 'pcs'
    const baseQuantity = toBaseUnitQuantity(item.quantity, sellingUnit, product.unit_category, product.base_unit)
    const costPriceSnapshot = product.cost_price !== null ? toMoney(product.cost_price) : null
    const rawUsual = product.usual_price !== null && product.usual_price !== undefined && Number(product.usual_price) > 0
      ? product.usual_price
      : product.price
    const catalogOur = product.our_price !== null && product.our_price !== undefined && Number(product.our_price) > 0
      ? product.our_price
      : rawUsual
    const hasLineOurOverride = item.our_price !== undefined && item.our_price !== null && item.our_price !== ''
    if (hasLineOurOverride && Number(item.our_price) < 0) {
      throw new ValidationError('Invalid our price', [
        { field: 'items', message: `Our price for "${product.name}" cannot be negative` },
      ])
    }
    // Transaction-only override: used for this sale's snapshots and totals, never written to product.our_price
    const rawOur = hasLineOurOverride ? item.our_price : catalogOur

    const usualPriceSnapshot = toMoney(rawUsual)
    const ourPriceSnapshot = toMoney(rawOur)
    const isWholesale = Boolean(item.is_wholesale)
    const rawWholesale = product.wholesale_price !== null && product.wholesale_price !== undefined
      ? product.wholesale_price
      : 0
    const wholesalePriceSnapshot = toMoney(rawWholesale)

    const predefinedDiscountApplied = isWholesale
      ? false
      : (item.predefined_discount_applied !== undefined
        ? Boolean(item.predefined_discount_applied)
        : true)

    const pricingQty = toPricingUnitQuantity(item.quantity, sellingUnit, product.pricing_unit, product.unit_category)

    let activeSellingPrice
    let predefinedDiscountAmount
    let itemDiscount

    if (isWholesale) {
      activeSellingPrice = wholesalePriceSnapshot
      const wholesaleDiff = usualPriceSnapshot.minus(wholesalePriceSnapshot)
      predefinedDiscountAmount = wholesaleDiff.gt(0)
        ? roundMoney(pricingQty.mul(wholesaleDiff))
        : toMoney(0)
      itemDiscount = toMoney(0)
    } else {
      activeSellingPrice = predefinedDiscountApplied ? ourPriceSnapshot : usualPriceSnapshot
      const unitDiscountDiff = usualPriceSnapshot.minus(ourPriceSnapshot)
      predefinedDiscountAmount = predefinedDiscountApplied && unitDiscountDiff.gt(0)
        ? roundMoney(pricingQty.mul(unitDiscountDiff))
        : toMoney(0)
      itemDiscount = toMoney(item.discount)
    }

    const unitPrice = activeSellingPrice
    const unitCost = toMoney(product.cost_price || 0)

    const lineGross = calculateLineGross(item.quantity, sellingUnit, product.pricing_unit, unitPrice, product.unit_category)
    const lineCost = calculateLineCost(item.quantity, sellingUnit, product.pricing_unit, unitCost, product.unit_category)

    if (itemDiscount.gt(lineGross)) {
      throw new ValidationError('Discount too large', [
        {
          field: 'items',
          message: `Discount on "${product.name}" (${itemDiscount.toFixed(2)}) is more than the line total (${lineGross.toFixed(2)})`,
        },
      ])
    }
    const lineTotal = lineGross.minus(itemDiscount)
    subtotal = subtotal.plus(lineTotal)
    return {
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      unit: sellingUnit,
      quantity: new Decimal(item.quantity),
      base_quantity: baseQuantity,
      base_unit: product.base_unit,
      pricing_unit: product.pricing_unit,
      unit_price: unitPrice,
      unit_cost_snapshot: unitCost,
      cost_price_snapshot: costPriceSnapshot,
      usual_price_snapshot: usualPriceSnapshot,
      our_price_snapshot: ourPriceSnapshot,
      wholesale_price_snapshot: wholesalePriceSnapshot,
      is_wholesale: isWholesale,
      predefined_discount_applied: predefinedDiscountApplied,
      predefined_discount_amount: predefinedDiscountAmount,
      line_cost: lineCost,
      discount: itemDiscount,
      total: lineTotal,
    }
  })

  const discountAmt = toMoney(discount_amount)
  if (discountAmt.lt(0)) {
    throw new ValidationError('Discount cannot be negative', [
      { field: 'discount_amount', message: 'Cart discount cannot be negative' },
    ])
  }
  if (discountAmt.gt(subtotal)) {
    throw new ValidationError('Discount too large', [
      {
        field: 'discount_amount',
        message: `Cart discount (${discountAmt.toFixed(2)}) is more than the subtotal (${subtotal.toFixed(2)})`,
      },
    ])
  }
  const taxableAmount = subtotal.minus(discountAmt)
  // Tax is rounded once, on the taxable amount, half away from zero
  const taxAmount = roundMoney(taxableAmount.mul(taxRate).div(100))
  const totalAmount = taxableAmount.plus(taxAmount)

  // Validate payment and compute amount_paid, balance_due, payment_status, change_given
  let amountPaid = toMoney(amount_paid || 0)
  let balanceDue = toMoney(0)
  let changeGiven = toMoney(0)
  let paymentStatus = 'COMPLETED'

  if (payment_method === 'CREDIT') {
    if (!customer_id) {
      throw new ValidationError('Credit sales require a registered customer', [
        { field: 'customer_id', message: 'Credit sales require a registered customer' },
      ])
    }
    if (amountPaid.lt(0)) {
      throw new ValidationError('Amount paid cannot be negative')
    }
    if (amountPaid.gt(totalAmount)) {
      throw new ValidationError('Amount paid cannot exceed total amount for credit sale', [
        { field: 'amount_paid', message: `Amount paid (${amountPaid.toFixed(2)}) cannot exceed sale total (${totalAmount.toFixed(2)})` },
      ])
    }
    balanceDue = totalAmount.minus(amountPaid)
    paymentStatus = balanceDue.eq(0) ? 'COMPLETED' : (amountPaid.gt(0) ? 'PARTIALLY_PAID' : 'PENDING')
    changeGiven = toMoney(0)
  } else if (payment_method === 'CASH') {
    if (amountPaid.lt(totalAmount)) {
      if (!customer_id) {
        throw new ValidationError('Credit sales require a registered customer', [
          { field: 'amount_paid', message: 'Amount paid is less than total. Partial payments or credit sales require a registered customer.' },
        ])
      }
      // Partial cash payment for registered customer
      balanceDue = totalAmount.minus(amountPaid)
      paymentStatus = amountPaid.gt(0) ? 'PARTIALLY_PAID' : 'PENDING'
      changeGiven = toMoney(0)
    } else {
      balanceDue = toMoney(0)
      paymentStatus = 'COMPLETED'
      changeGiven = amountPaid.minus(totalAmount)
    }
  } else {
    // CARD or MOBILE_MONEY — verify via Paystack before proceeding
    if (!reference) {
      throw new ValidationError('Payment reference required', [
        { field: 'reference', message: 'A Paystack reference is required for card/mobile money payments' },
      ])
    }

    // A successful Paystack reference may only pay for one sale
    const existingPayment = await prisma.payment.findFirst({ where: { reference } })
    if (existingPayment) {
      throw new ValidationError('Payment reference already used', [
        { field: 'reference', message: 'This Paystack reference has already been used for another sale' },
      ])
    }

    const paystackData = await verifyTransaction(reference)

    if (paystackData.status !== 'success') {
      throw new ValidationError('Payment not successful', [
        { field: 'reference', message: `Paystack payment status is "${paystackData.status}". Only successful payments are accepted.` },
      ])
    }

    // Paystack reports whole pesewas, so the amounts must match exactly
    if (paystackData.amount !== toPesewas(totalAmount)) {
      const paid = toMoney(paystackData.amount).div(100)
      const currencySymbol = await getSettingValue('currency_symbol', 'LKR')
      throw new ValidationError('Payment amount mismatch', [
        { field: 'amount_paid', message: `Paystack amount (${currencySymbol} ${paid.toFixed(2)}) does not match sale total (${currencySymbol} ${totalAmount.toFixed(2)})` },
      ])
    }

    balanceDue = toMoney(0)
    paymentStatus = 'COMPLETED'
    changeGiven = toMoney(0)
  }

  // Loyalty points (1 point per LKR 10 by default). Stored on the sale so a
  // refund reverses exactly what was earned, even if the rate changes later.
  let pointsEarned = 0
  if (customer_id) {
    const loyaltyRate = toMoney(await getSettingValue('loyalty_points_rate', 10))
    if (loyaltyRate.gt(0)) pointsEarned = totalAmount.div(loyaltyRate).floor().toNumber()
  }

  // Resolve default warehouse if warehouse_id not specified
  let resolvedWarehouseId = warehouse_id
  if (resolvedWarehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: resolvedWarehouseId } })
    if (!wh) {
      throw new NotFoundError(`Warehouse with ID ${resolvedWarehouseId} not found`)
    }
    if (!wh.is_active) {
      throw new ValidationError(`Cannot assign transaction to inactive warehouse "${wh.name}"`)
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

  // Step 3–6: Execute in a single DB transaction, retried with a fresh
  // transaction ID if a concurrent sale claimed the same one
  const sale = await withUniqueTransactionId((transaction_id) => prisma.$transaction(async (tx) => {
    // Create Sale
    const newSale = await tx.sale.create({
      data: {
        transaction_id,
        user_id: userId,
        customer_id: customer_id || null,
        warehouse_id: resolvedWarehouseId || null,
        sale_date: sale_date ? new Date(sale_date) : null,
        is_legacy_import: Boolean(is_legacy_import),
        subtotal,
        discount_amount: discountAmt,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        balance_due: balanceDue,
        payment_method,
        payment_status: paymentStatus,
        loyalty_points_earned: pointsEarned,
        notes: notes || null,
      },
    })

    // Create SaleItems
    await tx.saleItem.createMany({
      data: saleItems.map((si) => ({
        sale_id: newSale.id,
        product_id: si.product_id,
        product_name: si.product_name,
        product_sku: si.product_sku,
        unit: si.unit,
        quantity: si.quantity,
        base_quantity: si.base_quantity,
        base_unit: si.base_unit,
        pricing_unit: si.pricing_unit,
        unit_price: si.unit_price,
        unit_cost_snapshot: si.unit_cost_snapshot,
        cost_price_snapshot: si.cost_price_snapshot,
        usual_price_snapshot: si.usual_price_snapshot,
        our_price_snapshot: si.our_price_snapshot,
        wholesale_price_snapshot: si.wholesale_price_snapshot,
        is_wholesale: si.is_wholesale,
        predefined_discount_applied: si.predefined_discount_applied,
        predefined_discount_amount: si.predefined_discount_amount,
        line_cost: si.line_cost,
        discount: si.discount,
        total: si.total,
      })),
    })

    // Create Payment
    await tx.payment.create({
      data: {
        sale_id: newSale.id,
        method: payment_method,
        amount_paid: amountPaid,
        change_given: changeGiven,
        reference: reference || null,
      },
    })

    // Link the Paystack charge recorded by the charge.success webhook, if it arrived first
    if (reference) {
      await tx.paystackPayment.updateMany({ where: { reference, sale_id: null }, data: { sale_id: newSale.id } })
    }

    // Deduct stock and create inventory logs. The decrement is conditional on
    // there still being enough stock, so concurrent sales cannot oversell.
    for (const item of saleItems) {
      const { count } = await tx.product.updateMany({
        where: { id: item.product_id, quantity: { gte: item.base_quantity } },
        data: { quantity: { decrement: item.base_quantity } },
      })

      if (count === 0) {
        throw new ValidationError('Insufficient stock', [
          {
            field: 'items',
            message: `Insufficient stock for "${item.product_name}". It may have just been sold at another till.`,
          },
        ])
      }

      const { quantity: newQty } = await tx.product.findUnique({
        where: { id: item.product_id },
        select: { quantity: true },
      })

      const prevQty = newQty.plus(item.base_quantity)

      await tx.inventoryLog.create({
        data: {
          product_id: item.product_id,
          change_type: 'SALE',
          unit: item.base_unit,
          quantity_change: item.base_quantity.negated(),
          previous_quantity: prevQty,
          new_quantity: newQty,
          user_id: userId,
          notes: `Sale ${transaction_id}`,
        },
      })
    }

    // Award loyalty points if customer is linked
    if (pointsEarned > 0) {
      await tx.customer.update({
        where: { id: customer_id },
        data: { loyalty_points: { increment: pointsEarned } },
      })
    }

    return newSale
  }, { maxWait: 10000, timeout: 30000 }))

  // Fetch complete sale with relations
  return getSaleById(sale.id)
}

const MAX_TRANSACTION_ID_ATTEMPTS = 10

async function withUniqueTransactionId(createSaleWithId) {
  for (let attempt = 1; ; attempt++) {
    const transaction_id = await generateTransactionId()
    try {
      return await createSaleWithId(transaction_id)
    } catch (err) {
      const isIdConflict =
        err.code === 'P2002' &&
        (String(err.meta?.target).includes('transaction_id') ||
         String(err.meta?.target).includes('sales_transaction_id_key'))
      if (!isIdConflict || attempt >= MAX_TRANSACTION_ID_ATTEMPTS) throw err
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 50) + 15))
    }
  }
}

async function getSaleById(id) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, full_name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      sale_items: {
        include: {
          product: { select: { id: true, name: true, sku: true, unit_category: true, base_unit: true, pricing_unit: true } },
        },
      },
      payments: true,
    },
  })
  if (!sale) throw new NotFoundError('Sale not found')
  if (sale.sale_items) {
    sale.sale_items = sale.sale_items.map((item) => ({
      ...item,
      product_name: item.product_name || item.product?.name || '',
      product_sku: item.product_sku || item.product?.sku || '',
    }))
  }
  return sale
}

async function listSales({ page = 1, per_page = 20, start_date, end_date, user_id, customer_id, search, warehouse_id, is_legacy_import } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
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
        { sale_date: dateFilter },
        { sale_date: null, created_at: dateFilter },
      ],
    })
  }
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
  if (user_id) where.user_id = user_id
  if (customer_id) where.customer_id = customer_id

  if (search && search.trim()) {
    const q = search.trim()
    where.OR = [
      { transaction_id: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { user: { full_name: { contains: q, mode: 'insensitive' } } },
      { user: { username: { contains: q, mode: 'insensitive' } } },
    ]
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip,
      take,
      include: {
        user: { select: { id: true, username: true, full_name: true } },
        customer: { select: { id: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        _count: { select: { sale_items: true } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.sale.count({ where }),
  ])

  return { sales, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function processRefund(saleId, userId) {
  const sale = await getSaleById(saleId)

  if (sale.payment_status === 'REFUNDED') {
    throw new ValidationError('Sale already refunded', [
      { field: 'sale_id', message: 'This sale has already been refunded' },
    ])
  }

  // Card and mobile money refunds go through Paystack and only complete
  // when the refund.processed webhook confirms the money was returned
  if (sale.payment_method === 'CARD' || sale.payment_method === 'MOBILE_MONEY') {
    return requestPaystackRefund(sale, userId)
  }

  await prisma.$transaction((tx) => completeRefund(tx, sale, userId), { maxWait: 10000, timeout: 30000 })

  return getSaleById(saleId)
}

async function requestPaystackRefund(sale, userId) {
  const reference = sale.payments[0]?.reference
  if (!reference) {
    throw new ValidationError('No Paystack reference', [
      { field: 'sale_id', message: 'This sale has no Paystack payment reference to refund' },
    ])
  }

  // Claim the refund first so two requests can't both reach Paystack
  const { count } = await prisma.sale.updateMany({
    where: { id: sale.id, payment_status: 'COMPLETED', refund_requested_at: null },
    data: { refund_requested_at: new Date(), refund_requested_by: userId },
  })
  if (count === 0) {
    throw new ValidationError('Refund already requested', [
      { field: 'sale_id', message: 'A refund for this sale is already waiting for Paystack to confirm it' },
    ])
  }

  try {
    await createRefund(reference)
  } catch (err) {
    await prisma.sale.update({
      where: { id: sale.id },
      data: { refund_requested_at: null, refund_requested_by: null },
    })
    throw err
  }

  return getSaleById(sale.id)
}

/**
 * Handle Paystack's refund.processed webhook. Safe to call more than once
 * for the same refund: only a sale that is still COMPLETED is changed.
 * Also completes refunds started from the Paystack dashboard.
 * @returns {boolean} whether a sale was refunded by this call
 */
async function completePaystackRefund(transactionReference) {
  const payment = await prisma.payment.findUnique({ where: { reference: transactionReference } })
  if (!payment) return false

  const sale = await getSaleById(payment.sale_id)
  // Inventory logs need a user: whoever requested the refund, else the original cashier
  const userId = sale.refund_requested_by || sale.user_id

  try {
    await prisma.$transaction((tx) => completeRefund(tx, sale, userId), { maxWait: 10000, timeout: 30000 })
  } catch (err) {
    if (err instanceof ValidationError) return false // already refunded
    throw err
  }
  return true
}

/**
 * Handle Paystack's refund.failed webhook: clear the pending request so the
 * refund can be tried again.
 */
async function failPaystackRefund(transactionReference) {
  const payment = await prisma.payment.findUnique({ where: { reference: transactionReference } })
  if (!payment) return false

  const { count } = await prisma.sale.updateMany({
    where: { id: payment.sale_id, payment_status: 'COMPLETED' },
    data: { refund_requested_at: null, refund_requested_by: null },
  })
  return count > 0
}

async function completeRefund(tx, sale, userId) {
  // Mark the sale refunded only if it is not yet REFUNDED. If a concurrent
  // refund got there first, nothing is updated and this one is rejected.
  const { count } = await tx.sale.updateMany({
    where: { id: sale.id, payment_status: { in: ['COMPLETED', 'PARTIALLY_PAID', 'PENDING'] } },
    data: { payment_status: 'REFUNDED', balance_due: 0, refund_requested_at: null, refund_requested_by: null },
  })

  if (count === 0) {
    throw new ValidationError('Sale already refunded', [
      { field: 'sale_id', message: 'This sale has already been refunded' },
    ])
  }

  // Restore stock and create return inventory logs
  for (const item of sale.sale_items) {
    const restoreQty = item.base_quantity != null ? new Decimal(item.base_quantity) : new Decimal(item.quantity)
    const { quantity: newQty } = await tx.product.update({
      where: { id: item.product_id },
      data: { quantity: { increment: restoreQty } },
      select: { quantity: true },
    })

    const prevQty = newQty.minus(restoreQty)

    await tx.inventoryLog.create({
      data: {
        product_id: item.product_id,
        change_type: 'RETURN',
        unit: item.base_unit || 'pcs',
        quantity_change: restoreQty,
        previous_quantity: prevQty,
        new_quantity: newQty,
        user_id: userId,
        notes: `Refund for sale ${sale.transaction_id}`,
      },
    })
  }

  // Reverse exactly the loyalty points this sale earned
  if (sale.customer_id) {
    const pointsToDeduct = sale.loyalty_points_earned
    if (pointsToDeduct > 0) {
      // Deduct atomically, flooring at zero if the customer has already spent the points
      const { count: deducted } = await tx.customer.updateMany({
        where: { id: sale.customer_id, loyalty_points: { gte: pointsToDeduct } },
        data: { loyalty_points: { decrement: pointsToDeduct } },
      })
      if (deducted === 0) {
        await tx.customer.update({ where: { id: sale.customer_id }, data: { loyalty_points: 0 } })
      }
    }
  }
}

async function getReceiptData(saleId) {
  const sale = await getSaleById(saleId)

  const [storeName, storeAddress, storePhone] = await Promise.all([
    getSettingValue('store_name', 'My Store'),
    getSettingValue('store_address', ''),
    getSettingValue('store_phone', ''),
  ])

  return {
    store: { name: storeName, address: storeAddress, phone: storePhone },
    sale,
  }
}

async function getSalePayments(saleId) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      payments: {
        orderBy: { created_at: 'asc' },
      },
      customer_payment_allocations: {
        include: {
          customer_payment: {
            include: {
              user: { select: { id: true, username: true, full_name: true } },
            },
          },
        },
        orderBy: { created_at: 'asc' },
      },
    },
  })
  if (!sale) throw new NotFoundError('Sale not found')

  const payments = []

  for (const p of sale.payments) {
    payments.push({
      id: p.id,
      payment_type: 'CHECKOUT',
      method: p.method,
      amount: Number(p.amount_paid),
      change_given: Number(p.change_given),
      reference: p.reference,
      date: p.created_at,
      status: p.is_void ? 'VOIDED' : 'COMPLETED',
      is_void: p.is_void,
      void_reason: p.void_reason,
      voided_at: p.voided_at,
      voided_by: p.voided_by,
    })
  }

  for (const alloc of sale.customer_payment_allocations) {
    const cp = alloc.customer_payment
    payments.push({
      id: alloc.id,
      customer_payment_id: cp.id,
      payment_type: 'CUSTOMER_PAYMENT',
      method: cp.payment_method,
      amount: Number(alloc.amount),
      change_given: 0,
      reference: cp.reference,
      date: alloc.created_at || cp.created_at,
      status: cp.is_void ? 'VOIDED' : 'COMPLETED',
      is_void: cp.is_void,
      void_reason: cp.void_reason,
      voided_at: cp.voided_at,
      voided_by: cp.voided_by,
      notes: cp.notes,
      user: cp.user,
    })
  }

  payments.sort((a, b) => new Date(a.date) - new Date(b.date))

  return {
    sale_id: sale.id,
    transaction_id: sale.transaction_id,
    total_amount: Number(sale.total_amount),
    amount_paid: Number(sale.amount_paid),
    balance_due: Number(sale.balance_due),
    payment_status: sale.payment_status,
    payments,
  }
}

async function voidSalePayment(saleId, paymentId, { reason }, userId) {
  if (!reason || !String(reason).trim()) {
    throw new ValidationError('A void/reversal reason is required', [
      { field: 'reason', message: 'Reversal reason is required' },
    ])
  }

  return prisma.$transaction(async (tx) => {
    // 1. Lock parent sale
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`

    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        payments: true,
        customer_payment_allocations: {
          include: { customer_payment: true },
        },
      },
    })
    if (!sale) throw new NotFoundError('Sale not found')

    if (sale.is_cancelled) {
      throw new ValidationError('Cannot void payments on a cancelled sale')
    }

    // Check direct Payment table first
    const directPayment = sale.payments.find((p) => p.id === paymentId)

    if (directPayment) {
      if (directPayment.is_void) {
        throw new ValidationError('Payment has already been voided')
      }

      // Protect confirmed Paystack settled payments from silent local void
      if (
        (directPayment.method === 'CARD' || directPayment.method === 'MOBILE_MONEY') &&
        directPayment.reference
      ) {
        throw new ValidationError(
          'Settled electronic Paystack payments cannot be voided directly. Please use the refund workflow.'
        )
      }

      await tx.payment.update({
        where: { id: directPayment.id },
        data: {
          is_void: true,
          void_reason: reason.trim(),
          voided_at: new Date(),
          voided_by: userId,
        },
      })
    } else {
      // Check customer payment allocations
      const allocation = sale.customer_payment_allocations.find(
        (a) => a.id === paymentId || a.customer_payment_id === paymentId
      )

      if (!allocation) {
        throw new NotFoundError('Payment record not found for this sale')
      }

      const cp = allocation.customer_payment
      if (cp.is_void) {
        throw new ValidationError('Customer payment has already been voided')
      }

      // Mark CustomerPayment as void
      await tx.customerPayment.update({
        where: { id: cp.id },
        data: {
          is_void: true,
          void_reason: reason.trim(),
          voided_at: new Date(),
          voided_by: userId,
        },
      })

      // If customer payment was allocated across multiple sales, recompute all affected sales
      const allAllocations = await tx.customerPaymentAllocation.findMany({
        where: { customer_payment_id: cp.id },
      })

      for (const otherAlloc of allAllocations) {
        if (otherAlloc.sale_id !== saleId) {
          const otherSale = await tx.sale.findUnique({
            where: { id: otherAlloc.sale_id },
            include: {
              payments: { where: { is_void: false } },
              customer_payment_allocations: {
                where: { customer_payment_id: { not: cp.id } },
                include: { customer_payment: true },
              },
            },
          })
          if (otherSale) {
            let otherPaid = toMoney(0)
            for (const p of otherSale.payments) {
              const eff = toMoney(p.amount_paid).minus(toMoney(p.change_given))
              otherPaid = otherPaid.plus(Decimal.max(0, eff))
            }
            for (const a of otherSale.customer_payment_allocations) {
              if (!a.customer_payment.is_void) {
                otherPaid = otherPaid.plus(toMoney(a.amount))
              }
            }
            const otherBalance = Decimal.max(0, toMoney(otherSale.total_amount).minus(otherPaid))
            const otherStatus = otherBalance.eq(0)
              ? 'COMPLETED'
              : (otherPaid.gt(0) ? 'PARTIALLY_PAID' : 'PENDING')

            await tx.sale.update({
              where: { id: otherSale.id },
              data: {
                amount_paid: otherPaid,
                balance_due: otherBalance,
                payment_status: otherSale.payment_status === 'REFUNDED' ? 'REFUNDED' : otherStatus,
              },
            })
          }
        }
      }
    }

    // 2. Recompute the active payments on this sale
    const updatedSale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        payments: { where: { is_void: false } },
        customer_payment_allocations: {
          include: { customer_payment: true },
        },
      },
    })

    let activePaid = toMoney(0)
    for (const p of updatedSale.payments) {
      const eff = toMoney(p.amount_paid).minus(toMoney(p.change_given))
      activePaid = activePaid.plus(Decimal.max(0, eff))
    }
    for (const a of updatedSale.customer_payment_allocations) {
      if (!a.customer_payment.is_void) {
        activePaid = activePaid.plus(toMoney(a.amount))
      }
    }

    const newBalanceDue = Decimal.max(0, toMoney(updatedSale.total_amount).minus(activePaid))
    const newPaymentStatus = updatedSale.payment_status === 'REFUNDED'
      ? 'REFUNDED'
      : (newBalanceDue.eq(0) ? 'COMPLETED' : (activePaid.gt(0) ? 'PARTIALLY_PAID' : 'PENDING'))

    await tx.sale.update({
      where: { id: saleId },
      data: {
        amount_paid: activePaid,
        balance_due: newBalanceDue,
        payment_status: newPaymentStatus,
      },
    })

    return getSaleById(saleId)
  }, { maxWait: 10000, timeout: 30000 })
}

async function updateSale(saleId, data, userId) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`

    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        sale_items: {
          include: { product: true },
        },
        sales_returns: {
          include: { items: true },
        },
        payments: true,
        customer_payment_allocations: {
          include: { customer_payment: true },
        },
      },
    })
    if (!sale) throw new NotFoundError('Sale not found')

    if (sale.is_cancelled) {
      throw new ValidationError('Cancelled sales cannot be edited')
    }
    if (sale.payment_status === 'REFUNDED') {
      throw new ValidationError('Refunded sales cannot be edited')
    }
    if (sale.is_legacy_import) {
      throw new ValidationError('Historical imported sales cannot be edited')
    }

    // Calculate returned quantities per sale_item
    const returnedByItem = {}
    for (const sr of sale.sales_returns) {
      if (!sr.is_cancelled) {
        for (const item of sr.items) {
          returnedByItem[item.sale_item_id] = (returnedByItem[item.sale_item_id] || new Decimal(0)).plus(item.quantity)
        }
      }
    }

    const existingItemMap = new Map(sale.sale_items.map((i) => [i.id, i]))
    const newItems = data.items || []

    if (!Array.isArray(newItems) || newItems.length === 0) {
      throw new ValidationError('Sale must contain at least one item')
    }

    // Validate that existing items with returns are not reduced below returned quantities
    for (const reqItem of newItems) {
      const itemId = reqItem.id || reqItem.sale_item_id
      if (itemId && existingItemMap.has(itemId)) {
        const existingItem = existingItemMap.get(itemId)
        const returnedQty = returnedByItem[existingItem.id] || new Decimal(0)
        const requestedQty = new Decimal(reqItem.quantity || 0)
        if (requestedQty.lt(returnedQty)) {
          throw new ValidationError(
            `Cannot reduce quantity of "${existingItem.product_name}" below already returned quantity (${returnedQty.toString()})`
          )
        }
      }
    }

    // Process item inventory diffs
    const updatedSaleItems = []
    let newSubtotal = toMoney(0)

    for (const reqItem of newItems) {
      const itemId = reqItem.id || reqItem.sale_item_id
      let saleItemRecord = itemId ? existingItemMap.get(itemId) : null
      let product = null

      if (saleItemRecord) {
        product = await tx.product.findUnique({ where: { id: saleItemRecord.product_id } })
        if (!product) {
          throw new NotFoundError(`Product associated with sale item not found`)
        }
      } else {
        const prodId = reqItem.product_id || reqItem.productId
        if (!prodId) {
          throw new ValidationError('Product ID is required for each sale item')
        }
        product = await tx.product.findUnique({ where: { id: prodId } })
        if (!product || !product.is_active) {
          throw new NotFoundError(`Product not found or inactive`)
        }
      }

      const sellingUnit = reqItem.unit || (saleItemRecord ? saleItemRecord.unit : product.pricing_unit || 'pcs')
      const newQty = new Decimal(reqItem.quantity || 0)
      if (newQty.lte(0)) {
        throw new ValidationError('Item quantity must be greater than zero')
      }

      const newBaseQty = toBaseUnitQuantity(newQty, sellingUnit, product.unit_category, product.base_unit)
      const oldBaseQty = saleItemRecord ? new Decimal(saleItemRecord.base_quantity) : new Decimal(0)
      const netBaseDiff = newBaseQty.minus(oldBaseQty)

      if (netBaseDiff.gt(0)) {
        // Quantity increased: check stock and decrement
        const currentProd = await tx.product.findUnique({ where: { id: product.id } })
        if (new Decimal(currentProd.quantity).lt(netBaseDiff)) {
          throw new ValidationError(`Insufficient stock for "${product.name}". Available: ${currentProd.quantity}, required: ${netBaseDiff}`)
        }

        const { quantity: newStock } = await tx.product.update({
          where: { id: product.id },
          data: { quantity: { decrement: netBaseDiff } },
          select: { quantity: true },
        })

        await tx.inventoryLog.create({
          data: {
            product_id: product.id,
            change_type: 'ADJUSTMENT',
            unit: product.base_unit,
            quantity_change: netBaseDiff.negated(),
            previous_quantity: newStock.plus(netBaseDiff),
            new_quantity: newStock,
            user_id: userId,
            warehouse_id: sale.warehouse_id,
            notes: `Sale ${sale.transaction_id} edit: quantity increased`,
          },
        })
      } else if (netBaseDiff.lt(0)) {
        // Quantity decreased: restore net difference to stock
        const restoreQty = netBaseDiff.abs()
        const { quantity: newStock } = await tx.product.update({
          where: { id: product.id },
          data: { quantity: { increment: restoreQty } },
          select: { quantity: true },
        })

        await tx.inventoryLog.create({
          data: {
            product_id: product.id,
            change_type: 'ADJUSTMENT',
            unit: product.base_unit,
            quantity_change: restoreQty,
            previous_quantity: newStock.minus(restoreQty),
            new_quantity: newStock,
            user_id: userId,
            warehouse_id: sale.warehouse_id,
            notes: `Sale ${sale.transaction_id} edit: quantity decreased`,
          },
        })
      }

      // Preserve snapshot unit price or apply item price
      const unitPrice = saleItemRecord ? toMoney(saleItemRecord.unit_price) : toMoney(product.our_price || product.price)
      const itemDisc = toMoney(reqItem.discount || (saleItemRecord ? saleItemRecord.discount : 0))
      const lineGross = calculateLineGross(newQty, sellingUnit, product.pricing_unit, unitPrice, product.unit_category)
      const lineTotal = lineGross.minus(itemDisc)
      newSubtotal = newSubtotal.plus(lineTotal)

      updatedSaleItems.push({
        id: saleItemRecord ? saleItemRecord.id : undefined,
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        unit: sellingUnit,
        quantity: newQty,
        base_quantity: newBaseQty,
        base_unit: product.base_unit,
        pricing_unit: product.pricing_unit,
        unit_price: unitPrice,
        unit_cost_snapshot: saleItemRecord ? saleItemRecord.unit_cost_snapshot : toMoney(product.cost_price || 0),
        cost_price_snapshot: saleItemRecord ? saleItemRecord.cost_price_snapshot : (product.cost_price ? toMoney(product.cost_price) : null),
        usual_price_snapshot: saleItemRecord ? saleItemRecord.usual_price_snapshot : toMoney(product.usual_price || product.price),
        our_price_snapshot: saleItemRecord ? saleItemRecord.our_price_snapshot : toMoney(product.our_price || product.price),
        wholesale_price_snapshot: saleItemRecord ? saleItemRecord.wholesale_price_snapshot : toMoney(product.wholesale_price || 0),
        is_wholesale: saleItemRecord ? saleItemRecord.is_wholesale : false,
        predefined_discount_applied: saleItemRecord ? saleItemRecord.predefined_discount_applied : false,
        predefined_discount_amount: saleItemRecord ? saleItemRecord.predefined_discount_amount : toMoney(0),
        line_cost: calculateLineCost(newQty, sellingUnit, product.pricing_unit, toMoney(product.cost_price || 0), product.unit_category),
        discount: itemDisc,
        total: lineTotal,
      })
    }

    // Check items that were completely removed
    const newItemIds = new Set(newItems.map((i) => i.id || i.sale_item_id).filter(Boolean))
    for (const [existingId, oldItem] of existingItemMap.entries()) {
      if (!newItemIds.has(existingId)) {
        const retQty = returnedByItem[existingId] || new Decimal(0)
        if (retQty.gt(0)) {
          throw new ValidationError(`Cannot remove item "${oldItem.product_name}" because returns have been processed against it`)
        }

        // Restore entire item stock
        const restoreQty = new Decimal(oldItem.base_quantity)
        const { quantity: newStock } = await tx.product.update({
          where: { id: oldItem.product_id },
          data: { quantity: { increment: restoreQty } },
          select: { quantity: true },
        })

        await tx.inventoryLog.create({
          data: {
            product_id: oldItem.product_id,
            change_type: 'ADJUSTMENT',
            unit: oldItem.base_unit,
            quantity_change: restoreQty,
            previous_quantity: newStock.minus(restoreQty),
            new_quantity: newStock,
            user_id: userId,
            warehouse_id: sale.warehouse_id,
            notes: `Sale ${sale.transaction_id} edit: item removed`,
          },
        })

        await tx.saleItem.delete({ where: { id: existingId } })
      }
    }

    const discountAmt = data.discount_amount !== undefined ? toMoney(data.discount_amount) : toMoney(sale.discount_amount)
    const taxRate = toMoney(await getSettingValue('tax_rate', 0))
    const taxableAmount = Decimal.max(0, newSubtotal.minus(discountAmt))
    const taxAmount = roundMoney(taxableAmount.mul(taxRate).div(100))
    const newTotal = taxableAmount.plus(taxAmount)

    // Check Paystack constraint: card/mobile money settled payment total cannot change
    const hasPaystack = sale.payments.some((p) => (p.method === 'CARD' || p.method === 'MOBILE_MONEY') && p.reference && !p.is_void)
    if (hasPaystack && !newTotal.equals(toMoney(sale.total_amount))) {
      throw new ValidationError('Cannot modify total amount of a sale with confirmed electronic Paystack payments')
    }

    // Upsert items
    for (const item of updatedSaleItems) {
      if (item.id) {
        await tx.saleItem.update({
          where: { id: item.id },
          data: {
            quantity: item.quantity,
            base_quantity: item.base_quantity,
            discount: item.discount,
            total: item.total,
          },
        })
      } else {
        await tx.saleItem.create({
          data: {
            sale_id: sale.id,
            ...item,
          },
        })
      }
    }

    // Recalculate balances and payment status
    const finalCustomerId = data.customer_id !== undefined ? (data.customer_id || null) : sale.customer_id
    const newPaymentMethod = data.payment_method || sale.payment_method || 'CASH'
    const isExplicitPaymentUpdate = data.payment_method !== undefined || data.amount_paid !== undefined
    let amountPaid = data.amount_paid !== undefined ? toMoney(data.amount_paid) : toMoney(sale.amount_paid)
    let newBalanceDue = toMoney(0)
    let changeGiven = toMoney(0)
    let newPaymentStatus = 'COMPLETED'

    if (newPaymentMethod === 'CREDIT') {
      if (!finalCustomerId) {
        throw new ValidationError('Credit sales require a registered customer', [
          { field: 'customer_id', message: 'Credit sales require a registered customer' },
        ])
      }
      if (amountPaid.lt(0)) {
        throw new ValidationError('Amount paid cannot be negative')
      }
      if (amountPaid.gt(newTotal)) {
        throw new ValidationError('Amount paid cannot exceed total amount for credit sale', [
          { field: 'amount_paid', message: `Amount paid (${amountPaid.toFixed(2)}) cannot exceed sale total (${newTotal.toFixed(2)})` },
        ])
      }
      newBalanceDue = newTotal.minus(amountPaid)
      newPaymentStatus = newBalanceDue.eq(0) ? 'COMPLETED' : (amountPaid.gt(0) ? 'PARTIALLY_PAID' : 'PENDING')
      changeGiven = toMoney(0)
    } else if (newPaymentMethod === 'CASH') {
      if (isExplicitPaymentUpdate && amountPaid.lt(newTotal) && !finalCustomerId) {
        throw new ValidationError('Partial payments or credit sales require a registered customer', [
          { field: 'amount_paid', message: 'Amount paid is less than total. Partial payments or credit sales require a registered customer.' },
        ])
      }
      if (!isExplicitPaymentUpdate && !finalCustomerId && sale.payment_status === 'COMPLETED') {
        amountPaid = newTotal
        newBalanceDue = toMoney(0)
        newPaymentStatus = 'COMPLETED'
        changeGiven = toMoney(0)
      } else if (amountPaid.lt(newTotal)) {
        newBalanceDue = newTotal.minus(amountPaid)
        newPaymentStatus = amountPaid.gt(0) ? 'PARTIALLY_PAID' : 'PENDING'
        changeGiven = toMoney(0)
      } else {
        newBalanceDue = toMoney(0)
        newPaymentStatus = 'COMPLETED'
        changeGiven = amountPaid.minus(newTotal)
      }
    } else {
      newBalanceDue = Decimal.max(0, newTotal.minus(amountPaid))
      newPaymentStatus = newBalanceDue.eq(0) ? 'COMPLETED' : (amountPaid.gt(0) ? 'PARTIALLY_PAID' : 'PENDING')
      changeGiven = toMoney(0)
    }

    // Update or create payment record
    const activePayment = sale.payments.find((p) => !p.is_void)
    if (activePayment) {
      await tx.payment.update({
        where: { id: activePayment.id },
        data: {
          method: newPaymentMethod,
          amount_paid: amountPaid,
          change_given: changeGiven,
        },
      })
    } else if (amountPaid.gt(0) || newPaymentMethod === 'CREDIT') {
      await tx.payment.create({
        data: {
          sale_id: sale.id,
          method: newPaymentMethod,
          amount_paid: amountPaid,
          change_given: changeGiven,
        },
      })
    }

    // Recalculate loyalty points if customer linked
    let newPoints = sale.loyalty_points_earned
    if (finalCustomerId) {
      const loyaltyRate = toMoney(await getSettingValue('loyalty_points_rate', 10))
      if (loyaltyRate.gt(0)) {
        newPoints = newTotal.div(loyaltyRate).floor().toNumber()
        const pointsDiff = newPoints - sale.loyalty_points_earned
        if (pointsDiff > 0) {
          await tx.customer.update({
            where: { id: finalCustomerId },
            data: { loyalty_points: { increment: pointsDiff } },
          })
        } else if (pointsDiff < 0) {
          const deduct = Math.abs(pointsDiff)
          const { count } = await tx.customer.updateMany({
            where: { id: finalCustomerId, loyalty_points: { gte: deduct } },
            data: { loyalty_points: { decrement: deduct } },
          })
          if (count === 0) {
            await tx.customer.update({ where: { id: finalCustomerId }, data: { loyalty_points: 0 } })
          }
        }
      }
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        subtotal: newSubtotal,
        discount_amount: discountAmt,
        tax_amount: taxAmount,
        total_amount: newTotal,
        amount_paid: amountPaid,
        balance_due: newBalanceDue,
        payment_method: newPaymentMethod,
        payment_status: newPaymentStatus,
        loyalty_points_earned: newPoints,
        notes: data.notes !== undefined ? data.notes : sale.notes,
        customer_id: finalCustomerId,
        warehouse_id: data.warehouse_id !== undefined ? data.warehouse_id || null : sale.warehouse_id,
      },
    })

    return getSaleById(sale.id)
  }, { maxWait: 10000, timeout: 30000 })
}

async function cancelSale(saleId, { reason }, userId) {
  if (!reason || !String(reason).trim()) {
    throw new ValidationError('Cancellation reason is required', [
      { field: 'reason', message: 'Cancellation reason is required' },
    ])
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`

    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        sale_items: true,
        sales_returns: {
          include: { items: true },
        },
      },
    })
    if (!sale) throw new NotFoundError('Sale not found')

    if (sale.is_cancelled) {
      throw new ValidationError('Sale is already cancelled')
    }
    if (sale.is_legacy_import) {
      throw new ValidationError('Historical imported sales cannot be cancelled')
    }

    const wasRefunded = sale.payment_status === 'REFUNDED'

    // Calculate restocked quantities from sales returns
    const alreadyRestockedByItem = {}
    for (const sr of sale.sales_returns) {
      if (!sr.is_cancelled) {
        for (const item of sr.items) {
          if (item.restock) {
            alreadyRestockedByItem[item.sale_item_id] = (alreadyRestockedByItem[item.sale_item_id] || new Decimal(0)).plus(item.base_quantity)
          }
        }
      }
    }

    // Only restore remaining stock that was not already restored by refund or return
    if (!wasRefunded) {
      for (const item of sale.sale_items) {
        const itemBaseQty = item.base_quantity != null ? new Decimal(item.base_quantity) : new Decimal(item.quantity)
        const alreadyRestocked = alreadyRestockedByItem[item.id] || new Decimal(0)
        const eligibleRestore = Decimal.max(0, itemBaseQty.minus(alreadyRestocked))

        if (eligibleRestore.gt(0)) {
          const { quantity: newStock } = await tx.product.update({
            where: { id: item.product_id },
            data: { quantity: { increment: eligibleRestore } },
            select: { quantity: true },
          })

          await tx.inventoryLog.create({
            data: {
              product_id: item.product_id,
              change_type: 'RETURN',
              unit: item.base_unit || 'pcs',
              quantity_change: eligibleRestore,
              previous_quantity: newStock.minus(eligibleRestore),
              new_quantity: newStock,
              user_id: userId,
              warehouse_id: sale.warehouse_id,
              notes: `Cancellation of Sale ${sale.transaction_id}: ${reason.trim()}`,
            },
          })
        }
      }
    }

    // Revert loyalty points earned
    if (sale.customer_id && sale.loyalty_points_earned > 0) {
      const pts = sale.loyalty_points_earned
      const { count } = await tx.customer.updateMany({
        where: { id: sale.customer_id, loyalty_points: { gte: pts } },
        data: { loyalty_points: { decrement: pts } },
      })
      if (count === 0) {
        await tx.customer.update({ where: { id: sale.customer_id }, data: { loyalty_points: 0 } })
      }
    }

    // Mark sale cancelled
    await tx.sale.update({
      where: { id: saleId },
      data: {
        is_cancelled: true,
        cancelled_at: new Date(),
        cancelled_by: userId,
        cancellation_reason: reason.trim(),
        payment_status: 'REFUNDED',
        balance_due: 0,
      },
    })

    return getSaleById(saleId)
  }, { maxWait: 10000, timeout: 30000 })
}

module.exports = {
  createSale,
  getSaleById,
  listSales,
  processRefund,
  completePaystackRefund,
  failPaystackRefund,
  getReceiptData,
  getSalePayments,
  voidSalePayment,
  updateSale,
  cancelSale,
}
