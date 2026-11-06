const prisma = require('../utils/prismaClient')
const generateTransactionId = require('../utils/generateTransactionId')
const { toMoney, roundMoney, toPesewas } = require('../utils/money')
const { NotFoundError, ValidationError, AppError } = require('../utils/errors')
const { verifyTransaction, createRefund } = require('./paystackService')

async function createSale({ items, customer_id, payment_method, amount_paid, discount_amount = 0, notes, reference }, userId) {
  // Step 1: Validate all items exist and have sufficient stock
  const productIds = items.map((i) => i.product_id)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, is_active: true },
  })

  const productMap = new Map(products.map((p) => [p.id, p]))

  for (const item of items) {
    const product = productMap.get(item.product_id)
    if (!product) {
      throw new NotFoundError(`Product ${item.product_id} not found or inactive`)
    }
    if (product.quantity < item.quantity) {
      throw new ValidationError('Insufficient stock', [
        {
          field: 'items',
          message: `Insufficient stock for "${product.name}". Available: ${product.quantity}, requested: ${item.quantity}`,
        },
      ])
    }
  }

  // Step 2: Calculate totals with exact decimal arithmetic
  const taxRate = toMoney(await getSettingValue('tax_rate', 0))
  let subtotal = toMoney(0)
  const saleItems = items.map((item) => {
    const product = productMap.get(item.product_id)
    const unit_price = toMoney(product.price)
    const itemDiscount = toMoney(item.discount)
    const lineGross = unit_price.mul(item.quantity)
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
      quantity: item.quantity,
      unit_price,
      discount: itemDiscount,
      total: lineTotal,
      product_name: product.name, // for receipt
    }
  })

  const discountAmt = toMoney(discount_amount)
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

  // Validate payment
  const amountPaid = toMoney(amount_paid)
  if (payment_method === 'CASH') {
    if (amountPaid.lt(totalAmount)) {
      throw new ValidationError('Insufficient payment', [
        { field: 'amount_paid', message: `Amount paid (${amountPaid.toFixed(2)}) is less than total (${totalAmount.toFixed(2)})` },
      ])
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
      throw new ValidationError('Payment amount mismatch', [
        { field: 'amount_paid', message: `Paystack amount (GH₵ ${paid.toFixed(2)}) does not match sale total (GH₵ ${totalAmount.toFixed(2)})` },
      ])
    }
  }

  const changeGiven = payment_method === 'CASH' ? amountPaid.minus(totalAmount) : toMoney(0)

  // Loyalty points (1 point per GHS 10 by default). Stored on the sale so a
  // refund reverses exactly what was earned, even if the rate changes later.
  let pointsEarned = 0
  if (customer_id) {
    const loyaltyRate = toMoney(await getSettingValue('loyalty_points_rate', 10))
    if (loyaltyRate.gt(0)) pointsEarned = totalAmount.div(loyaltyRate).floor().toNumber()
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
        subtotal,
        discount_amount: discountAmt,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        payment_method,
        payment_status: 'COMPLETED',
        loyalty_points_earned: pointsEarned,
        notes: notes || null,
      },
    })

    // Create SaleItems
    await tx.saleItem.createMany({
      data: saleItems.map((si) => ({
        sale_id: newSale.id,
        product_id: si.product_id,
        quantity: si.quantity,
        unit_price: si.unit_price,
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
        where: { id: item.product_id, quantity: { gte: item.quantity } },
        data: { quantity: { decrement: item.quantity } },
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

      await tx.inventoryLog.create({
        data: {
          product_id: item.product_id,
          change_type: 'SALE',
          quantity_change: -item.quantity,
          previous_quantity: newQty + item.quantity,
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
  }))

  // Fetch complete sale with relations
  return getSaleById(sale.id)
}

const MAX_TRANSACTION_ID_ATTEMPTS = 5

async function withUniqueTransactionId(createSaleWithId) {
  for (let attempt = 1; ; attempt++) {
    const transaction_id = await generateTransactionId()
    try {
      return await createSaleWithId(transaction_id)
    } catch (err) {
      const isIdConflict = err.code === 'P2002' && String(err.meta?.target).includes('transaction_id')
      if (!isIdConflict || attempt >= MAX_TRANSACTION_ID_ATTEMPTS) throw err
    }
  }
}

async function getSaleById(id) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, full_name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      sale_items: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
      },
      payments: true,
    },
  })
  if (!sale) throw new NotFoundError('Sale not found')
  return sale
}

async function listSales({ page = 1, per_page = 20, start_date, end_date, user_id, customer_id } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (start_date || end_date) {
    where.created_at = {}
    if (start_date) where.created_at.gte = new Date(start_date)
    if (end_date) {
      const end = new Date(end_date)
      end.setHours(23, 59, 59, 999)
      where.created_at.lte = end
    }
  }
  if (user_id) where.user_id = user_id
  if (customer_id) where.customer_id = customer_id

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip,
      take,
      include: {
        user: { select: { id: true, username: true, full_name: true } },
        customer: { select: { id: true, name: true } },
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
  if (sale.payment_method !== 'CASH') {
    return requestPaystackRefund(sale, userId)
  }

  await prisma.$transaction((tx) => completeRefund(tx, sale, userId))

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
    await prisma.$transaction((tx) => completeRefund(tx, sale, userId))
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
  // Mark the sale refunded only if it is still COMPLETED. If a concurrent
  // refund got there first, nothing is updated and this one is rejected.
  const { count } = await tx.sale.updateMany({
    where: { id: sale.id, payment_status: 'COMPLETED' },
    data: { payment_status: 'REFUNDED', refund_requested_at: null, refund_requested_by: null },
  })

  if (count === 0) {
    throw new ValidationError('Sale already refunded', [
      { field: 'sale_id', message: 'This sale has already been refunded' },
    ])
  }

  // Restore stock and create return inventory logs
  for (const item of sale.sale_items) {
    const { quantity: newQty } = await tx.product.update({
      where: { id: item.product_id },
      data: { quantity: { increment: item.quantity } },
      select: { quantity: true },
    })

    await tx.inventoryLog.create({
      data: {
        product_id: item.product_id,
        change_type: 'RETURN',
        quantity_change: item.quantity,
        previous_quantity: newQty - item.quantity,
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

async function getSettingValue(key, defaultValue) {
  try {
    const setting = await prisma.settings.findUnique({ where: { key } })
    if (!setting) return defaultValue
    const val = parseFloat(setting.value)
    return isNaN(val) ? setting.value : val
  } catch {
    return defaultValue
  }
}

module.exports = {
  createSale,
  getSaleById,
  listSales,
  processRefund,
  completePaystackRefund,
  failPaystackRefund,
  getReceiptData,
}
