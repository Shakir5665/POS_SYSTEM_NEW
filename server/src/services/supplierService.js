const prisma = require('../utils/prismaClient')
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors')
const { Decimal, toMoney } = require('../utils/money')

async function listSuppliers({ page = 1, per_page = 20, search, is_active } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (is_active !== undefined) {
    where.is_active = is_active === 'true' || is_active === true
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { contact_person: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { purchases: true } },
      },
    }),
    prisma.supplier.count({ where }),
  ])

  const supplierIds = suppliers.map((s) => s.id)
  const debtAggregates = await prisma.purchase.groupBy({
    by: ['supplier_id'],
    where: {
      supplier_id: { in: supplierIds },
      payment_status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      status: { not: 'CANCELLED' },
      balance_due: { gt: 0 },
    },
    _sum: { balance_due: true },
  })

  const debtMap = new Map()
  debtAggregates.forEach((agg) => {
    debtMap.set(agg.supplier_id, Number(agg._sum.balance_due || 0))
  })

  const enrichedSuppliers = suppliers.map((s) => ({
    ...s,
    outstanding_debt: debtMap.get(s.id) || 0,
  }))

  return {
    suppliers: enrichedSuppliers,
    total,
    page,
    per_page: take,
    total_pages: Math.ceil(total / take),
  }
}

async function getSupplierById(id) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      _count: { select: { purchases: true } },
    },
  })
  if (!supplier) throw new NotFoundError('Supplier not found')

  const [debtAgg, totalPurchasedAgg] = await Promise.all([
    prisma.purchase.aggregate({
      where: {
        supplier_id: id,
        payment_status: { in: ['PENDING', 'PARTIALLY_PAID'] },
        status: { not: 'CANCELLED' },
        balance_due: { gt: 0 },
      },
      _sum: { balance_due: true },
    }),
    prisma.purchase.aggregate({
      where: {
        supplier_id: id,
        status: { not: 'CANCELLED' },
      },
      _sum: { total_amount: true },
    }),
  ])

  const outstanding_debt = debtAgg._sum.balance_due ? Number(debtAgg._sum.balance_due) : 0
  const total_purchased_amount = totalPurchasedAgg._sum.total_amount ? Number(totalPurchasedAgg._sum.total_amount) : 0

  return {
    ...supplier,
    outstanding_debt,
    total_purchased_amount,
  }
}

async function createSupplier(data) {
  if (!data.name || !data.name.trim()) {
    throw new ValidationError('Supplier name is required', [
      { field: 'name', message: 'Supplier name is required' },
    ])
  }

  if (data.phone) {
    const existing = await prisma.supplier.findFirst({ where: { phone: data.phone } })
    if (existing) throw new ConflictError('Supplier with this phone number already exists')
  }

  if (data.email) {
    const existing = await prisma.supplier.findFirst({ where: { email: data.email } })
    if (existing) throw new ConflictError('Supplier with this email already exists')
  }

  return prisma.supplier.create({
    data: {
      name: data.name.trim(),
      phone: data.phone ? data.phone.trim() : null,
      email: data.email ? data.email.trim() : null,
      address: data.address ? data.address.trim() : null,
      contact_person: data.contact_person ? data.contact_person.trim() : null,
      notes: data.notes ? data.notes.trim() : null,
    },
  })
}

async function updateSupplier(id, data) {
  const existing = await prisma.supplier.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Supplier not found')

  if (data.phone && data.phone !== existing.phone) {
    const conflict = await prisma.supplier.findFirst({ where: { phone: data.phone, id: { not: id } } })
    if (conflict) throw new ConflictError('Supplier with this phone number already exists')
  }

  if (data.email && data.email !== existing.email) {
    const conflict = await prisma.supplier.findFirst({ where: { email: data.email, id: { not: id } } })
    if (conflict) throw new ConflictError('Supplier with this email already exists')
  }

  return prisma.supplier.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.phone !== undefined && { phone: data.phone ? data.phone.trim() : null }),
      ...(data.email !== undefined && { email: data.email ? data.email.trim() : null }),
      ...(data.address !== undefined && { address: data.address ? data.address.trim() : null }),
      ...(data.contact_person !== undefined && { contact_person: data.contact_person ? data.contact_person.trim() : null }),
      ...(data.notes !== undefined && { notes: data.notes ? data.notes.trim() : null }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
    },
  })
}

async function getSupplierPurchases(supplierId, { page = 1, per_page = 20, status, payment_status } = {}) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) throw new NotFoundError('Supplier not found')

  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = { supplier_id: supplierId }
  if (status) where.status = status
  if (payment_status) where.payment_status = payment_status

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        items: true,
        user: { select: { id: true, full_name: true, username: true } },
      },
    }),
    prisma.purchase.count({ where }),
  ])

  return { purchases, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function getSupplierPayments(supplierId, { page = 1, per_page = 20 } = {}) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) throw new NotFoundError('Supplier not found')

  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const [payments, total] = await Promise.all([
    prisma.supplierPayment.findMany({
      where: { supplier_id: supplierId },
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { id: true, full_name: true } },
        allocations: {
          include: {
            purchase: {
              select: { id: true, purchase_number: true, total_amount: true, balance_due: true },
            },
          },
        },
      },
    }),
    prisma.supplierPayment.count({ where: { supplier_id: supplierId } }),
  ])

  return { payments, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function recordSupplierPayment(supplierId, { amount, payment_method = 'CASH', reference, notes }, userId) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) throw new NotFoundError('Supplier not found')

  const paymentAmount = toMoney(amount)
  if (paymentAmount.lte(0)) {
    throw new ValidationError('Payment amount must be greater than zero', [
      { field: 'amount', message: 'Payment amount must be greater than zero' },
    ])
  }

  // Fetch unpaid purchases (FIFO oldest first)
  const unpaidPurchases = await prisma.purchase.findMany({
    where: {
      supplier_id: supplierId,
      status: { not: 'CANCELLED' },
      payment_status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      balance_due: { gt: 0 },
    },
    orderBy: { created_at: 'asc' },
  })

  const totalOutstanding = unpaidPurchases.reduce((sum, p) => sum.plus(toMoney(p.balance_due)), toMoney(0))

  if (unpaidPurchases.length === 0 || totalOutstanding.lte(0)) {
    throw new ValidationError('Supplier has no outstanding balance', [
      { field: 'amount', message: 'Supplier has no outstanding balance to pay' },
    ])
  }

  if (paymentAmount.gt(totalOutstanding)) {
    throw new ValidationError('Payment exceeds outstanding balance', [
      {
        field: 'amount',
        message: `Payment amount (${paymentAmount.toFixed(2)}) exceeds total outstanding balance (${totalOutstanding.toFixed(2)})`,
      },
    ])
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create SupplierPayment
    const payment = await tx.supplierPayment.create({
      data: {
        supplier_id: supplierId,
        user_id: userId,
        amount: paymentAmount,
        payment_method: payment_method || 'CASH',
        reference: reference || null,
        notes: notes || null,
      },
      include: {
        user: { select: { full_name: true } },
      },
    })

    let remaining = paymentAmount
    const allocations = []

    // 2. FIFO Allocation across unpaid purchases
    for (const purchase of unpaidPurchases) {
      if (remaining.lte(0)) break

      const currentBalance = toMoney(purchase.balance_due)
      const allocAmt = Decimal.min(remaining, currentBalance)
      const newBalance = currentBalance.minus(allocAmt)
      const newAmountPaid = toMoney(purchase.amount_paid).plus(allocAmt)
      const newStatus = newBalance.eq(0) ? 'COMPLETED' : 'PARTIALLY_PAID'

      const allocation = await tx.supplierPaymentAllocation.create({
        data: {
          supplier_payment_id: payment.id,
          purchase_id: purchase.id,
          amount: allocAmt,
        },
      })
      allocations.push(allocation)

      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          balance_due: newBalance,
          amount_paid: newAmountPaid,
          payment_status: newStatus,
        },
      })

      remaining = remaining.minus(allocAmt)
    }

    return {
      payment,
      allocations,
      allocated_amount: paymentAmount.minus(remaining).toNumber(),
    }
  })
}

async function getSupplierAccountStatement(supplierId) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) throw new NotFoundError('Supplier not found')

  const [purchases, payments] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        supplier_id: supplierId,
        status: { not: 'CANCELLED' },
      },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        purchase_number: true,
        total_amount: true,
        amount_paid: true,
        balance_due: true,
        payment_status: true,
        created_at: true,
        allocations: {
          select: {
            amount: true,
            supplier_payment: { select: { created_at: true } },
          },
        },
      },
    }),
    prisma.supplierPayment.findMany({
      where: { supplier_id: supplierId },
      orderBy: { created_at: 'asc' },
      include: {
        user: { select: { full_name: true } },
      },
    }),
  ])

  const entries = []

  // Add all purchases as debits
  purchases.forEach((p) => {
    const total = Number(p.total_amount)
    entries.push({
      date: p.created_at,
      type: 'PURCHASE',
      reference: p.purchase_number,
      purchase_id: p.id,
      description: `Inventory Purchase Order (${p.purchase_number})`,
      debit: total,
      credit: 0,
      amount: total,
    })
  })

  // Add all payments as credits
  payments.forEach((pm) => {
    const paidAmt = Number(pm.amount)
    entries.push({
      date: pm.created_at,
      type: 'SUPPLIER_PAYMENT',
      reference: pm.reference || `PMT-${pm.id.slice(0, 8).toUpperCase()}`,
      payment_id: pm.id,
      description: `Payment to Supplier via ${pm.payment_method}${pm.notes ? ` - ${pm.notes}` : ''}`,
      debit: 0,
      credit: paidAmt,
      amount: -paidAmt,
    })
  })

  // Sort chronologically
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Compute running balance
  let runningBalance = new Decimal(0)
  const statementEntries = entries.map((e) => {
    runningBalance = runningBalance.plus(new Decimal(e.debit)).minus(new Decimal(e.credit))
    return {
      ...e,
      running_balance: runningBalance.toNumber(),
    }
  })

  const totalDebits = statementEntries.reduce((sum, e) => sum + e.debit, 0)
  const totalCredits = statementEntries.reduce((sum, e) => sum + e.credit, 0)

  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      contact_person: supplier.contact_person,
    },
    statement: statementEntries,
    summary: {
      total_purchased: Number(totalDebits.toFixed(2)),
      total_paid: Number(totalCredits.toFixed(2)),
      current_balance: Number(runningBalance.toFixed(2)),
    },
  }
}

module.exports = {
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  getSupplierPurchases,
  getSupplierPayments,
  recordSupplierPayment,
  getSupplierAccountStatement,
}
