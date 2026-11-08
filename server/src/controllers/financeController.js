const financeService = require('../services/financeService')

// Expenses
async function listExpenseCategories(req, res, next) {
  try {
    const categories = await financeService.listExpenseCategories()
    res.json({ success: true, data: categories })
  } catch (err) {
    next(err)
  }
}

async function createExpenseCategory(req, res, next) {
  try {
    const category = await financeService.createExpenseCategory(req.body)
    res.status(201).json({ success: true, data: category, message: 'Expense category created successfully' })
  } catch (err) {
    next(err)
  }
}

async function listExpenses(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { category_id, search, start_date, end_date } = req.query
    const result = await financeService.listExpenses({
      page,
      per_page,
      category_id,
      search,
      start_date,
      end_date,
    })
    res.json({
      success: true,
      data: result.expenses,
      meta: {
        page: result.page,
        per_page: result.per_page,
        total: result.total,
        total_pages: result.total_pages,
        total_expenses_amount: result.total_expenses_amount,
      },
    })
  } catch (err) {
    next(err)
  }
}

async function createExpense(req, res, next) {
  try {
    const expense = await financeService.createExpense({
      ...req.body,
      user_id: req.user.id,
    })
    res.status(201).json({ success: true, data: expense, message: 'Expense recorded successfully' })
  } catch (err) {
    next(err)
  }
}

async function deleteExpense(req, res, next) {
  try {
    await financeService.deleteExpense(req.params.id)
    res.json({ success: true, message: 'Expense deleted successfully' })
  } catch (err) {
    next(err)
  }
}

// Assets
async function listAssets(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { category, status, search } = req.query
    const result = await financeService.listAssets({
      page,
      per_page,
      category,
      status,
      search,
    })
    res.json({
      success: true,
      data: result.assets,
      meta: {
        page: result.page,
        per_page: result.per_page,
        total: result.total,
        total_pages: result.total_pages,
        total_current_value: result.total_current_value,
        total_acquisition_cost: result.total_acquisition_cost,
      },
    })
  } catch (err) {
    next(err)
  }
}

async function getAsset(req, res, next) {
  try {
    const asset = await financeService.getAssetById(req.params.id)
    res.json({ success: true, data: asset })
  } catch (err) {
    next(err)
  }
}

async function createAsset(req, res, next) {
  try {
    const asset = await financeService.createAsset(req.body)
    res.status(201).json({ success: true, data: asset, message: 'Asset registered successfully' })
  } catch (err) {
    next(err)
  }
}

async function updateAsset(req, res, next) {
  try {
    const asset = await financeService.updateAsset(req.params.id, req.body)
    res.json({ success: true, data: asset, message: 'Asset updated successfully' })
  } catch (err) {
    next(err)
  }
}

async function deleteAsset(req, res, next) {
  try {
    await financeService.deleteAsset(req.params.id)
    res.json({ success: true, message: 'Asset deleted successfully' })
  } catch (err) {
    next(err)
  }
}

// Owner Transactions
async function listOwnerTransactions(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { type, start_date, end_date } = req.query
    const result = await financeService.listOwnerTransactions({
      page,
      per_page,
      type,
      start_date,
      end_date,
    })
    res.json({
      success: true,
      data: result.transactions,
      meta: {
        page: result.page,
        per_page: result.per_page,
        total: result.total,
        total_pages: result.total_pages,
        summary: result.summary,
      },
    })
  } catch (err) {
    next(err)
  }
}

async function createOwnerTransaction(req, res, next) {
  try {
    const transaction = await financeService.createOwnerTransaction({
      ...req.body,
      user_id: req.user.id,
    })
    res.status(201).json({ success: true, data: transaction, message: 'Capital transaction recorded successfully' })
  } catch (err) {
    next(err)
  }
}

// Summary
async function getSummary(req, res, next) {
  try {
    const summary = await financeService.getFinanceSummary()
    res.json({ success: true, data: summary })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listExpenseCategories,
  createExpenseCategory,
  listExpenses,
  createExpense,
  deleteExpense,
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  listOwnerTransactions,
  createOwnerTransaction,
  getSummary,
}
