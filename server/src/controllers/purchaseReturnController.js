const purchaseReturnService = require('../services/purchaseReturnService')

async function create(req, res, next) {
  try {
    const returnRecord = await purchaseReturnService.createPurchaseReturn(req.body, req.user)
    res.status(201).json({
      success: true,
      data: returnRecord,
      message: 'Purchase return processed successfully',
    })
  } catch (err) {
    next(err)
  }
}

async function list(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1
    const per_page = parseInt(req.query.per_page, 10) || 20
    const { search, purchase_id, supplier_id, warehouse_id, start_date, end_date } = req.query

    const result = await purchaseReturnService.listPurchaseReturns({
      page,
      per_page,
      search,
      purchase_id,
      supplier_id,
      warehouse_id,
      start_date,
      end_date,
    })

    res.json({
      success: true,
      data: result.returns,
      meta: {
        page: result.page,
        per_page: result.per_page,
        total: result.total,
        total_pages: result.total_pages,
      },
    })
  } catch (err) {
    next(err)
  }
}

async function get(req, res, next) {
  try {
    const returnRecord = await purchaseReturnService.getPurchaseReturnById(req.params.id)
    res.json({
      success: true,
      data: returnRecord,
    })
  } catch (err) {
    next(err)
  }
}

async function getEligibility(req, res, next) {
  try {
    const eligibility = await purchaseReturnService.getPurchaseReturnEligibility(req.params.id)
    res.json({
      success: true,
      data: eligibility,
    })
  } catch (err) {
    next(err)
  }
}

async function settle(req, res, next) {
  try {
    const returnRecord = await purchaseReturnService.settlePurchaseReturn(req.params.id, req.body, req.user)
    res.json({
      success: true,
      data: returnRecord,
      message: 'Purchase return settlement updated successfully',
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  create,
  list,
  get,
  getEligibility,
  settle,
}
