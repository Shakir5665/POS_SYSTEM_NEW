const customerService = require('../services/customerService')

async function listCustomers(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { search } = req.query
    const result = await customerService.listCustomers({ page, per_page, search })
    res.json({
      success: true,
      data: result.customers,
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

async function getCustomer(req, res, next) {
  try {
    const customer = await customerService.getCustomerById(req.params.id)
    res.json({ success: true, data: customer })
  } catch (err) {
    next(err)
  }
}

async function createCustomer(req, res, next) {
  try {
    const customer = await customerService.createCustomer(req.body)
    res.status(201).json({ success: true, data: customer, message: 'Customer created successfully' })
  } catch (err) {
    next(err)
  }
}

async function updateCustomer(req, res, next) {
  try {
    const customer = await customerService.updateCustomer(req.params.id, req.body)
    res.json({ success: true, data: customer, message: 'Customer updated successfully' })
  } catch (err) {
    next(err)
  }
}

async function getCustomerPurchases(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const result = await customerService.getCustomerPurchases(req.params.id, { page, per_page })
    const sales = result.sales.map((s) => ({
      ...s,
      items_count: s._count?.sale_items ?? 0,
      _count: undefined,
    }))
    res.json({
      success: true,
      data: sales,
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, getCustomerPurchases }
