const prisma = require('../utils/prismaClient')
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors')
const { Decimal, toMoney, roundMoney } = require('../utils/money')

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Rent', description: 'Store, warehouse, and premises rent' },
  { name: 'Utilities', description: 'Electricity, water, internet, and trash services' },
  { name: 'Salaries & Wages', description: 'Staff compensation and bonuses' },
  { name: 'Maintenance & Repairs', description: 'Store and equipment servicing' },
  { name: 'Transport & Logistics', description: 'Goods delivery, dispatch, and travel' },
  { name: 'Packaging & Supplies', description: 'Bags, receipts, printing, and cleaning supplies' },
  { name: 'Marketing & Advertising', description: 'Flyers, promos, and digital advertising' },
  { name: 'Miscellaneous', description: 'Other general business operational expenses' },
]

// Seed default categories if none exist
async function ensureDefaultCategories() {
  const count = await prisma.expenseCategory.count()
  if (count === 0) {
    for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
      await prisma.expenseCategory.upsert({
        where: { name: cat.name },
        update: {},
        create: cat,
      })
    }
  }
}

// ------------------- Operating Expenses -------------------

async function listExpenseCategories() {
  await ensureDefaultCategories()
  return prisma.expenseCategory.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { expenses: true } },
    },
  })
}

async function createExpenseCategory({ name, description }) {
  if (!name || !name.trim()) {
    throw new ValidationError('Category name is required', [{ field: 'name', message: 'Category name is required' }])
  }
  const cleanName = name.trim()
  const existing = await prisma.expenseCategory.findUnique({ where: { name: cleanName } })
  if (existing) {
    throw new ConflictError('Expense category already exists')
  }
  return prisma.expenseCategory.create({
    data: {
      name: cleanName,
      description: description ? description.trim() : null,
    },
  })
}

async function listExpenses({ page = 1, per_page = 20, category_id, search, start_date, end_date } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (category_id) where.category_id = category_id
  if (start_date || end_date) {
    where.expense_date = {}
    if (start_date) where.expense_date.gte = new Date(start_date)
    if (end_date) where.expense_date.lte = new Date(end_date)
  }
  if (search) {
    where.OR = [
      { payee: { contains: search, mode: 'insensitive' } },
      { reference: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [expenses, total, sumAgg] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip,
      take,
      orderBy: { expense_date: 'desc' },
      include: {
        category: true,
        user: { select: { id: true, full_name: true, username: true } },
      },
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({
      where,
      _sum: { amount: true },
    }),
  ])

  const total_expenses_amount = sumAgg._sum.amount ? Number(sumAgg._sum.amount) : 0

  return {
    expenses,
    total,
    page,
    per_page: take,
    total_pages: Math.ceil(total / take),
    total_expenses_amount,
  }
}

async function createExpense({ category_id, user_id, amount, payment_method = 'CASH', expense_date, payee, reference, notes }) {
  if (!category_id) {
    throw new ValidationError('Expense category is required', [{ field: 'category_id', message: 'Category is required' }])
  }

  const category = await prisma.expenseCategory.findUnique({ where: { id: category_id } })
  if (!category) throw new NotFoundError('Expense category not found')
  if (!category.is_active) throw new ValidationError('Cannot record expense in an inactive category')

  const parsedAmount = toMoney(amount)
  if (parsedAmount.lte(0)) {
    throw new ValidationError('Expense amount must be greater than zero', [
      { field: 'amount', message: 'Expense amount must be greater than zero' },
    ])
  }

  return prisma.expense.create({
    data: {
      category_id,
      user_id,
      amount: parsedAmount,
      payment_method: payment_method || 'CASH',
      expense_date: expense_date ? new Date(expense_date) : new Date(),
      payee: payee ? payee.trim() : null,
      reference: reference ? reference.trim() : null,
      notes: notes ? notes.trim() : null,
    },
    include: {
      category: true,
      user: { select: { id: true, full_name: true } },
    },
  })
}

async function deleteExpense(id) {
  const existing = await prisma.expense.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Expense not found')
  return prisma.expense.delete({ where: { id } })
}

// ------------------- Business Assets -------------------

async function listAssets({ page = 1, per_page = 20, category, status, search } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (category) where.category = category
  if (status) where.status = status
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { asset_code: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [assets, total, valAgg] = await Promise.all([
    prisma.businessAsset.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
    }),
    prisma.businessAsset.count({ where }),
    prisma.businessAsset.aggregate({
      where,
      _sum: { current_value: true, acquisition_cost: true },
    }),
  ])

  return {
    assets,
    total,
    page,
    per_page: take,
    total_pages: Math.ceil(total / take),
    total_current_value: valAgg._sum.current_value ? Number(valAgg._sum.current_value) : 0,
    total_acquisition_cost: valAgg._sum.acquisition_cost ? Number(valAgg._sum.acquisition_cost) : 0,
  }
}

async function getAssetById(id) {
  const asset = await prisma.businessAsset.findUnique({ where: { id } })
  if (!asset) throw new NotFoundError('Asset not found')
  return asset
}

async function createAsset({
  name,
  asset_code,
  category,
  acquisition_cost,
  acquisition_date,
  current_value,
  location,
  notes,
  status = 'ACTIVE',
}) {
  if (!name || !name.trim()) {
    throw new ValidationError('Asset name is required', [{ field: 'name', message: 'Asset name is required' }])
  }
  if (!category || !category.trim()) {
    throw new ValidationError('Asset category is required', [{ field: 'category', message: 'Asset category is required' }])
  }

  const acqCost = toMoney(acquisition_cost || 0)
  if (acqCost.lt(0)) {
    throw new ValidationError('Acquisition cost cannot be negative')
  }

  const curVal = current_value !== undefined ? toMoney(current_value) : acqCost
  if (curVal.lt(0)) {
    throw new ValidationError('Current value cannot be negative')
  }

  if (asset_code) {
    const existing = await prisma.businessAsset.findUnique({ where: { asset_code: asset_code.trim() } })
    if (existing) throw new ConflictError('Asset code already in use')
  }

  return prisma.businessAsset.create({
    data: {
      name: name.trim(),
      asset_code: asset_code ? asset_code.trim() : null,
      category: category.trim(),
      acquisition_cost: acqCost,
      acquisition_date: acquisition_date ? new Date(acquisition_date) : new Date(),
      current_value: curVal,
      status: status || 'ACTIVE',
      location: location ? location.trim() : null,
      notes: notes ? notes.trim() : null,
    },
  })
}

async function updateAsset(id, data) {
  const existing = await prisma.businessAsset.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Asset not found')

  if (data.asset_code && data.asset_code !== existing.asset_code) {
    const conflict = await prisma.businessAsset.findUnique({ where: { asset_code: data.asset_code.trim() } })
    if (conflict) throw new ConflictError('Asset code already in use')
  }

  return prisma.businessAsset.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.asset_code !== undefined && { asset_code: data.asset_code ? data.asset_code.trim() : null }),
      ...(data.category !== undefined && { category: data.category.trim() }),
      ...(data.acquisition_cost !== undefined && { acquisition_cost: toMoney(data.acquisition_cost) }),
      ...(data.acquisition_date !== undefined && { acquisition_date: new Date(data.acquisition_date) }),
      ...(data.current_value !== undefined && { current_value: toMoney(data.current_value) }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.location !== undefined && { location: data.location ? data.location.trim() : null }),
      ...(data.notes !== undefined && { notes: data.notes ? data.notes.trim() : null }),
    },
  })
}

async function deleteAsset(id) {
  const existing = await prisma.businessAsset.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Asset not found')
  return prisma.businessAsset.delete({ where: { id } })
}

// ------------------- Owner Equity Transactions -------------------

async function listOwnerTransactions({ page = 1, per_page = 20, type, start_date, end_date } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (type) where.type = type
  if (start_date || end_date) {
    where.transaction_date = {}
    if (start_date) where.transaction_date.gte = new Date(start_date)
    if (end_date) where.transaction_date.lte = new Date(end_date)
  }

  const [transactions, total, contribAgg, withdrAgg] = await Promise.all([
    prisma.ownerTransaction.findMany({
      where,
      skip,
      take,
      orderBy: { transaction_date: 'desc' },
      include: {
        user: { select: { id: true, full_name: true, username: true } },
      },
    }),
    prisma.ownerTransaction.count({ where }),
    prisma.ownerTransaction.aggregate({
      where: { type: 'CONTRIBUTION' },
      _sum: { amount: true },
    }),
    prisma.ownerTransaction.aggregate({
      where: { type: 'WITHDRAWAL' },
      _sum: { amount: true },
    }),
  ])

  const total_contributions = contribAgg._sum.amount ? Number(contribAgg._sum.amount) : 0
  const total_withdrawals = withdrAgg._sum.amount ? Number(withdrAgg._sum.amount) : 0
  const net_owner_equity = Number(new Decimal(total_contributions).minus(new Decimal(total_withdrawals)).toFixed(2))

  return {
    transactions,
    total,
    page,
    per_page: take,
    total_pages: Math.ceil(total / take),
    summary: {
      total_contributions,
      total_withdrawals,
      net_owner_equity,
    },
  }
}

async function createOwnerTransaction({ user_id, type, amount, payment_method = 'CASH', transaction_date, reference, notes }) {
  if (!['CONTRIBUTION', 'WITHDRAWAL'].includes(type)) {
    throw new ValidationError('Transaction type must be CONTRIBUTION or WITHDRAWAL', [
      { field: 'type', message: 'Type must be CONTRIBUTION or WITHDRAWAL' },
    ])
  }

  const parsedAmount = toMoney(amount)
  if (parsedAmount.lte(0)) {
    throw new ValidationError('Amount must be greater than zero', [
      { field: 'amount', message: 'Amount must be greater than zero' },
    ])
  }

  return prisma.ownerTransaction.create({
    data: {
      user_id,
      type,
      amount: parsedAmount,
      payment_method: payment_method || 'CASH',
      transaction_date: transaction_date ? new Date(transaction_date) : new Date(),
      reference: reference ? reference.trim() : null,
      notes: notes ? notes.trim() : null,
    },
    include: {
      user: { select: { id: true, full_name: true } },
    },
  })
}

// ------------------- Executive Financial Overview -------------------

async function getFinanceSummary() {
  const [expenseAgg, assetAgg, contribAgg, withdrAgg, supplierDebtAgg, customerDebtAgg] = await Promise.all([
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.businessAsset.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { current_value: true },
    }),
    prisma.ownerTransaction.aggregate({
      where: { type: 'CONTRIBUTION' },
      _sum: { amount: true },
    }),
    prisma.ownerTransaction.aggregate({
      where: { type: 'WITHDRAWAL' },
      _sum: { amount: true },
    }),
    prisma.purchase.aggregate({
      where: { status: { not: 'CANCELLED' }, balance_due: { gt: 0 } },
      _sum: { balance_due: true },
    }),
    prisma.sale.aggregate({
      where: { balance_due: { gt: 0 } },
      _sum: { balance_due: true },
    }),
  ])

  const total_expenses = expenseAgg._sum.amount ? Number(expenseAgg._sum.amount) : 0
  const total_asset_value = assetAgg._sum.current_value ? Number(assetAgg._sum.current_value) : 0
  const total_contributions = contribAgg._sum.amount ? Number(contribAgg._sum.amount) : 0
  const total_withdrawals = withdrAgg._sum.amount ? Number(withdrAgg._sum.amount) : 0
  const net_capital = Number(new Decimal(total_contributions).minus(new Decimal(total_withdrawals)).toFixed(2))
  const total_supplier_payables = supplierDebtAgg._sum.balance_due ? Number(supplierDebtAgg._sum.balance_due) : 0
  const total_customer_receivables = customerDebtAgg._sum.balance_due ? Number(customerDebtAgg._sum.balance_due) : 0

  return {
    total_expenses,
    total_asset_value,
    total_contributions,
    total_withdrawals,
    net_capital,
    total_supplier_payables,
    total_customer_receivables,
  }
}

module.exports = {
  listExpenseCategories,
  createExpenseCategory,
  listExpenses,
  createExpense,
  deleteExpense,
  listAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  listOwnerTransactions,
  createOwnerTransaction,
  getFinanceSummary,
}
