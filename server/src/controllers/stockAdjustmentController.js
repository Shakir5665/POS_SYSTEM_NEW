const stockAdjustmentService = require('../services/stockAdjustmentService')

async function create(req, res, next) {
  try {
    const adjustment = await stockAdjustmentService.createLiveAdjustment(req.body, req.user)
    res.status(201).json({
      success: true,
      data: adjustment,
      message: 'Stock adjustment processed successfully',
    })
  } catch (err) {
    next(err)
  }
}

async function get(req, res, next) {
  try {
    const adjustment = await stockAdjustmentService.getStockAdjustmentById(req.params.id)
    res.json({
      success: true,
      data: adjustment,
    })
  } catch (err) {
    next(err)
  }
}

async function list(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1
    const per_page = parseInt(req.query.per_page, 10) || 20
    const { warehouse_id, is_legacy_import, start_date, end_date, search } = req.query

    const result = await stockAdjustmentService.listStockAdjustments({
      page,
      per_page,
      warehouse_id,
      is_legacy_import,
      start_date,
      end_date,
      search,
    })

    res.json({
      success: true,
      data: result.adjustments,
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

module.exports = {
  create,
  get,
  list,
}
