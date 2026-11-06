const inventoryService = require('../services/inventoryService')

async function listInventory(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { search, status } = req.query

    const result = await inventoryService.listInventory({ page, per_page, search, status })

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
    const items = await inventoryService.getLowStock()
    res.json({ success: true, data: items })
  } catch (err) {
    next(err)
  }
}

async function adjustStock(req, res, next) {
  try {
    const { product_id, quantity_change, notes } = req.body
    const result = await inventoryService.adjustStock(
      product_id,
      quantity_change,
      'ADJUSTMENT',
      req.user.id,
      notes
    )
    res.json({ success: true, data: result, message: 'Stock adjusted successfully' })
  } catch (err) {
    next(err)
  }
}

async function restockProduct(req, res, next) {
  try {
    const { product_id, quantity, notes } = req.body
    const result = await inventoryService.restockProduct(product_id, quantity, req.user.id, notes)
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

module.exports = { listInventory, getLowStock, adjustStock, restockProduct, getInventoryLog }
