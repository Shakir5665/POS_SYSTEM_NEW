const supplierService = require('../services/supplierService')

async function list(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { search, is_active } = req.query
    const result = await supplierService.listSuppliers({ page, per_page, search, is_active })
    res.json({
      success: true,
      data: result.suppliers,
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

async function get(req, res, next) {
  try {
    const supplier = await supplierService.getSupplierById(req.params.id)
    res.json({ success: true, data: supplier })
  } catch (err) {
    next(err)
  }
}

async function create(req, res, next) {
  try {
    const supplier = await supplierService.createSupplier(req.body)
    res.status(201).json({ success: true, data: supplier, message: 'Supplier registered successfully' })
  } catch (err) {
    next(err)
  }
}

async function update(req, res, next) {
  try {
    const supplier = await supplierService.updateSupplier(req.params.id, req.body)
    res.json({ success: true, data: supplier, message: 'Supplier updated successfully' })
  } catch (err) {
    next(err)
  }
}

async function getPurchases(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { status, payment_status } = req.query
    const result = await supplierService.getSupplierPurchases(req.params.id, { page, per_page, status, payment_status })
    res.json({
      success: true,
      data: result.purchases,
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

async function getPayments(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const result = await supplierService.getSupplierPayments(req.params.id, { page, per_page })
    res.json({
      success: true,
      data: result.payments,
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

async function recordPayment(req, res, next) {
  try {
    const result = await supplierService.recordSupplierPayment(req.params.id, req.body, req.user.id)
    res.status(201).json({
      success: true,
      data: result,
      message: 'Payment recorded and allocated successfully',
    })
  } catch (err) {
    next(err)
  }
}

async function getStatement(req, res, next) {
  try {
    const statement = await supplierService.getSupplierAccountStatement(req.params.id)
    res.json({ success: true, data: statement })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  list,
  get,
  create,
  update,
  getPurchases,
  getPayments,
  recordPayment,
  getStatement,
}
