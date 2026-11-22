const salesReturnService = require('../services/salesReturnService')

async function create(req, res, next) {
  try {
    const returnRecord = await salesReturnService.createSalesReturn(req.body, req.user)
    res.status(201).json({
      success: true,
      data: returnRecord,
      message: 'Sales return processed successfully',
    })
  } catch (err) {
    next(err)
  }
}

async function list(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1
    const per_page = parseInt(req.query.per_page, 10) || 20
    const { search, sale_id, customer_id, warehouse_id, start_date, end_date } = req.query

    const result = await salesReturnService.listSalesReturns({
      page,
      per_page,
      search,
      sale_id,
      customer_id,
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
    const returnRecord = await salesReturnService.getSalesReturnById(req.params.id)
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
    const eligibility = await salesReturnService.getSaleReturnEligibility(req.params.id)
    res.json({
      success: true,
      data: eligibility,
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
}
