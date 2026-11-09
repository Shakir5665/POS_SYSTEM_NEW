const prisma = require('../utils/prismaClient')
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors')
const { Decimal, toMoney } = require('../utils/money')

async function listCustomers({ page = 1, per_page = 20, search } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { _count: { select: { sales: true } } },
    }),
    prisma.customer.count({ where }),
  ])

  const customerIds = customers.map((c) => c.id)
  const debtAggregates = await prisma.sale.groupBy({
    by: ['customer_id'],
    where: {
      customer_id: { in: customerIds },
      payment_status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      balance_due: { gt: 0 },
    },
    _sum: { balance_due: true },
  })

  const debtMap = new Map()
  debtAggregates.forEach((agg) => {
    debtMap.set(agg.customer_id, Number(agg._sum.balance_due || 0))
  })

  const enrichedCustomers = customers.map((c) => ({
    ...c,
    outstanding_debt: debtMap.get(c.id) || 0,
  }))

  return { customers: enrichedCustomers, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function getCustomerById(id) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      _count: { select: { sales: true } },
    },
  })
  if (!customer) throw new NotFoundError('Customer not found')

  const debtAgg = await prisma.sale.aggregate({
    where: {
      customer_id: id,
      payment_status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      balance_due: { gt: 0 },
    },
    _sum: { balance_due: true },
  })
  const outstanding_debt = debtAgg._sum.balance_due ? Number(debtAgg._sum.balance_due) : 0

  return { ...customer, outstanding_debt }
}

async function createCustomer(data) {
  if (data.phone) {
    const existing = await prisma.customer.findUnique({ where: { phone: data.phone } })
    if (existing) throw new ConflictError('Phone number already registered')
  }
  if (data.email) {
    const existing = await prisma.customer.findUnique({ where: { email: data.email } })
    if (existing) throw new ConflictError('Email already registered')
  }

  return prisma.customer.create({
    data: {
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
    },
  })
}

async function updateCustomer(id, data) {
  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Customer not found')

  if (data.phone && data.phone !== existing.phone) {
    const conflict = await prisma.customer.findUnique({ where: { phone: data.phone } })
    if (conflict) throw new ConflictError('Phone number already registered')
  }
  if (data.email && data.email !== existing.email) {
    const conflict = await prisma.customer.findUnique({ where: { email: data.email } })
    if (conflict) throw new ConflictError('Email already registered')
  }

  return prisma.customer.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone || null }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.address !== undefined && { address: data.address || null }),
    },
  })
}

async function getCustomerPurchases(id, { page = 1, per_page = 20 } = {}) {
  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) throw new NotFoundError('Customer not found')

  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where: { customer_id: id },
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { sale_items: true } },
        user: { select: { full_name: true } },
      },
    }),
    prisma.sale.count({ where: { customer_id: id } }),
  ])

  return { sales, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function getCustomerCreditSales(id, { page = 1, per_page = 20 } = {}) {
  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) throw new NotFoundError('Customer not found')

  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {
    customer_id: id,
    OR: [
      { payment_method: 'CREDIT' },
      { balance_due: { gt: 0 } },
      { payment_status: 'PARTIALLY_PAID' },
    ],
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { sale_items: true } },
        user: { select: { full_name: true } },
        customer_payment_allocations: {
          include: { customer_payment: true },
        },
      },
    }),
    prisma.sale.count({ where }),
  ])

  return { sales, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function getCustomerPayments(id, { page = 1, per_page = 20 } = {}) {
  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) throw new NotFoundError('Customer not found')

  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const [payments, total] = await Promise.all([
    prisma.customerPayment.findMany({
      where: { customer_id: id },
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { full_name: true } },
        allocations: {
          include: {
            sale: { select: { transaction_id: true, total_amount: true, balance_due: true } },
          },
        },
      },
    }),
    prisma.customerPayment.count({ where: { customer_id: id } }),
  ])

  return { payments, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function recordCustomerPayment(customerId, { amount, payment_method = 'CASH', reference, notes }, userId) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new NotFoundError('Customer not found')

  const paymentAmount = toMoney(amount)
  if (paymentAmount.lte(0)) {
    throw new ValidationError('Payment amount must be greater than zero', [
      { field: 'amount', message: 'Payment amount must be greater than zero' },
    ])
  }

  // Fetch all unpaid or partially paid credit sales for this customer (oldest first - FIFO)
  const unpaidSales = await prisma.sale.findMany({
    where: {
      customer_id: customerId,
      payment_status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      balance_due: { gt: 0 },
    },
    orderBy: { created_at: 'asc' },
  })

  const totalOutstanding = unpaidSales.reduce((sum, s) => sum.plus(toMoney(s.balance_due)), toMoney(0))

  if (unpaidSales.length === 0 || totalOutstanding.lte(0)) {
    throw new ValidationError('Customer has no outstanding balance', [
      { field: 'amount', message: 'Customer has no outstanding debt to pay' },
    ])
  }

  if (paymentAmount.gt(totalOutstanding)) {
    throw new ValidationError('Payment exceeds outstanding debt', [
      { field: 'amount', message: `Payment amount (${paymentAmount.toFixed(2)}) exceeds total outstanding debt (${totalOutstanding.toFixed(2)})` },
    ])
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create the customer payment record
    const payment = await tx.customerPayment.create({
      data: {
        customer_id: customerId,
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

    // 2. FIFO Allocation across unpaid sales
    for (const sale of unpaidSales) {
      if (remaining.lte(0)) break

      const currentBalance = toMoney(sale.balance_due)
      const allocAmt = Decimal.min(remaining, currentBalance)
      const newBalance = currentBalance.minus(allocAmt)
      const newAmountPaid = toMoney(sale.amount_paid).plus(allocAmt)
      const newStatus = newBalance.eq(0) ? 'COMPLETED' : 'PARTIALLY_PAID'

      // Create allocation record
      const allocation = await tx.customerPaymentAllocation.create({
        data: {
          customer_payment_id: payment.id,
          sale_id: sale.id,
          amount: allocAmt,
        },
      })
      allocations.push(allocation)

      // Update sale balance and status
      await tx.sale.update({
        where: { id: sale.id },
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
  }, { maxWait: 10000, timeout: 30000 })
}

async function getCustomerAccountStatement(customerId) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new NotFoundError('Customer not found')

  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({
      where: { customer_id: customerId },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        transaction_id: true,
        total_amount: true,
        amount_paid: true,
        balance_due: true,
        payment_method: true,
        payment_status: true,
        created_at: true,
        payments: {
          select: { amount_paid: true },
        },
      },
    }),
    prisma.customerPayment.findMany({
      where: { customer_id: customerId },
      orderBy: { created_at: 'asc' },
      include: {
        user: { select: { full_name: true } },
      },
    }),
  ])

  const entries = []

  sales.forEach((s) => {
    const total = Number(s.total_amount)
    const initialPaid = s.payments.reduce((sum, p) => sum + Number(p.amount_paid), 0)
    const netCredit = total - initialPaid

    if (s.payment_method === 'CREDIT' || Number(s.balance_due) > 0 || netCredit > 0 || s.payment_status === 'PARTIALLY_PAID') {
      entries.push({
        date: s.created_at,
        type: 'CREDIT_SALE',
        reference: s.transaction_id,
        sale_id: s.id,
        description: `Credit Sale (${s.payment_method})`,
        debit: total,
        credit: initialPaid,
        amount: netCredit,
      })
    }
  })

  payments.forEach((p) => {
    entries.push({
      date: p.created_at,
      type: 'PAYMENT',
      reference: p.reference || `PAY-${p.id.slice(0, 8)}`,
      payment_id: p.id,
      description: `Debt Repayment (${p.payment_method}) - ${p.user?.full_name || 'Cashier'}`,
      debit: 0,
      credit: Number(p.amount),
      amount: -Number(p.amount),
    })
  })

  entries.sort((a, b) => new Date(a.date) - new Date(b.date))

  let runningBalance = 0
  const statementEntries = entries.map((e) => {
    runningBalance += e.debit - e.credit
    return {
      ...e,
      running_balance: Number(runningBalance.toFixed(2)),
    }
  })

  const totalCreditGranted = entries.reduce((s, e) => s + e.debit, 0)
  const totalRepayments = entries.reduce((s, e) => s + e.credit, 0)

  return {
    customer,
    total_credit_granted: Number(totalCreditGranted.toFixed(2)),
    total_repayments: Number(totalRepayments.toFixed(2)),
    current_balance: Number(runningBalance.toFixed(2)),
    statement: statementEntries,
  }
}

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  getCustomerPurchases,
  getCustomerCreditSales,
  getCustomerPayments,
  recordCustomerPayment,
  getCustomerAccountStatement,
}
