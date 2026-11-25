const salesService = require('../services/salesService')
const pdfService = require('../services/pdfService')

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
    const {
      items,
      customer_id,
      payment_method,
      amount_paid,
      discount_amount = 0,
      notes,
      reference,
      warehouse_id,
      sale_date,
    } = req.body

    const sale = await salesService.createSale(
      {
        items,
        customer_id,
        payment_method,
        amount_paid,
        discount_amount,
        notes,
        reference,
        warehouse_id,
        sale_date: req.user && ['ADMIN', 'SUPERADMIN'].includes(req.user.role) && sale_date ? sale_date : null,
        is_legacy_import: false, // Server-enforced: live checkout is never a legacy import
      },
      req.user.id
    )
    res.status(201).json({ success: true, data: normalizeSale(sale), message: 'Sale processed successfully' })
  } catch (err) {
    next(err)
  }
}

async function listSales(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { start_date, end_date, customer_id, search, warehouse_id, is_legacy_import } = req.query

    // Cashiers can only see their own sales
    const user_id = req.user.role === 'CASHIER' ? req.user.id : req.query.user_id

    const result = await salesService.listSales({ page, per_page, start_date, end_date, user_id, customer_id, search, warehouse_id, is_legacy_import })
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

async function getPayments(req, res, next) {
  try {
    const data = await salesService.getSalePayments(req.params.id)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function voidPayment(req, res, next) {
  try {
    const data = await salesService.voidSalePayment(
      req.params.id,
      req.params.paymentId,
      req.body,
      req.user.id
    )
    res.json({ success: true, data: normalizeSale(data), message: 'Payment voided successfully' })
  } catch (err) {
    next(err)
  }
}

async function updateSale(req, res, next) {
  try {
    const data = await salesService.updateSale(req.params.id, req.body, req.user.id)
    res.json({ success: true, data: normalizeSale(data), message: 'Sale updated successfully' })
  } catch (err) {
    next(err)
  }
}

async function deleteSale(req, res, next) {
  try {
    const data = await salesService.cancelSale(req.params.id, req.body, req.user.id)
    res.json({ success: true, data: normalizeSale(data), message: 'Sale cancelled successfully. Stock restored.' })
  } catch (err) {
    next(err)
  }
}

async function downloadInvoicePdf(req, res, next) {
  try {
    const format = req.query.format || 'a4'
    const pdfBuffer = await pdfService.generateInvoicePdf(req.params.id, format)
    const sale = await salesService.getSaleById(req.params.id)
    const filename = `Invoice-${sale.transaction_id || req.params.id}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    res.send(pdfBuffer)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  createSale,
  listSales,
  getSale,
  processRefund,
  getReceipt,
  getPayments,
  voidPayment,
  updateSale,
  deleteSale,
  downloadInvoicePdf,
}
