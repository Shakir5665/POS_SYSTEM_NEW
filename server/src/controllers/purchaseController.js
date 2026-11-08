const purchaseService = require('../services/purchaseService')

async function list(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { search, status, payment_status, supplier_id } = req.query
    const result = await purchaseService.listPurchases({
      page,
      per_page,
      search,
      status,
      payment_status,
      supplier_id,
    })
    res.json({
      success: true,
      data: result.purchases,
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

async function get(req, res, next) {
  try {
    const purchase = await purchaseService.getPurchaseById(req.params.id)
    res.json({ success: true, data: purchase })
  } catch (err) {
    next(err)
  }
}

async function create(req, res, next) {
  try {
    const purchase = await purchaseService.createPurchase({
      ...req.body,
      user_id: req.user.id,
    })
    res.status(201).json({ success: true, data: purchase, message: 'Purchase order created successfully' })
  } catch (err) {
    next(err)
  }
}

async function receive(req, res, next) {
  try {
    const purchase = await purchaseService.receivePurchase(req.params.id, req.user.id)
    res.json({ success: true, data: purchase, message: 'Purchase order received and inventory updated' })
  } catch (err) {
    next(err)
  }
}

async function cancel(req, res, next) {
  try {
    const purchase = await purchaseService.cancelPurchase(req.params.id, req.user.id)
    res.json({ success: true, data: purchase, message: 'Purchase order cancelled successfully' })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  list,
  get,
  create,
  receive,
  cancel,
}
