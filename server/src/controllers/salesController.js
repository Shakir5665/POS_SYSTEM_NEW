const salesService = require('../services/salesService')

function normalizeSale(sale) {
  return {
    ...sale,
    items: sale.sale_items ?? [],
    payment: sale.payments?.[0] ?? null,
    sale_items: undefined,
    payments: undefined,
  }
}

async function createSale(req, res, next) {
  try {
    const sale = await salesService.createSale(req.body, req.user.id)
    res.status(201).json({ success: true, data: normalizeSale(sale), message: 'Sale processed successfully' })
  } catch (err) {
    next(err)
  }
}

async function listSales(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { start_date, end_date, customer_id } = req.query

    // Cashiers can only see their own sales
    const user_id = req.user.role === 'CASHIER' ? req.user.id : req.query.user_id

    const result = await salesService.listSales({ page, per_page, start_date, end_date, user_id, customer_id })
    res.json({
      success: true,
      data: result.sales,
      meta: { page: result.page, per_page: result.per_page, total: result.total, total_pages: result.total_pages },
    })
  } catch (err) {
    next(err)
  }
}

async function getSale(req, res, next) {
  try {
    const sale = await salesService.getSaleById(req.params.id)
    res.json({ success: true, data: normalizeSale(sale) })
  } catch (err) {
    next(err)
  }
}

async function processRefund(req, res, next) {
  try {
    const sale = await salesService.processRefund(req.params.id, req.user.id)
    if (sale.payment_status !== 'REFUNDED') {
      // Paystack refund requested; it completes when the webhook confirms it
      return res.status(202).json({
        success: true,
        data: normalizeSale(sale),
        message: 'Refund requested. The sale will be marked refunded when Paystack confirms it.',
      })
    }
    res.json({ success: true, data: normalizeSale(sale), message: 'Refund processed successfully' })
  } catch (err) {
    next(err)
  }
}

async function getReceipt(req, res, next) {
  try {
    const data = await salesService.getReceiptData(req.params.id)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

module.exports = { createSale, listSales, getSale, processRefund, getReceipt }
