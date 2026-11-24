const inventoryService = require('../services/inventoryService')

async function listInventory(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { search, status, warehouse_id } = req.query

    const result = await inventoryService.listInventory({ page, per_page, search, status, warehouse_id })

    res.json({
      success: true,
      data: result.products,
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

async function getLowStock(req, res, next) {
  try {
    const { search } = req.query
    const items = await inventoryService.getLowStock(search)
    res.json({ success: true, data: items })
  } catch (err) {
    next(err)
  }
}

async function adjustStock(req, res, next) {
  try {
    const { product_id, quantity_change, notes, unit, warehouse_id } = req.body
    const result = await inventoryService.adjustStock(
      product_id,
      quantity_change,
      'ADJUSTMENT',
      req.user.id,
      notes,
      unit,
      warehouse_id
    )
    res.json({ success: true, data: result, message: 'Stock adjusted successfully' })
  } catch (err) {
    next(err)
  }
}

async function restockProduct(req, res, next) {
  try {
    const { product_id, quantity, notes, unit } = req.body
    const result = await inventoryService.restockProduct(product_id, quantity, req.user.id, notes, unit)
    res.json({ success: true, data: result, message: 'Product restocked successfully' })
  } catch (err) {
    next(err)
  }
}

async function getInventoryLog(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const result = await inventoryService.getInventoryLog(req.params.productId, { page, per_page })
    res.json({
      success: true,
      data: result.logs,
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

async function listStockAdjustments(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { warehouse_id, is_legacy_import, start_date, end_date, search } = req.query
    const result = await inventoryService.listStockAdjustments({
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
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { listInventory, getLowStock, adjustStock, restockProduct, getInventoryLog, listStockAdjustments }
