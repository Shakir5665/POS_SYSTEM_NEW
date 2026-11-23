const PDFDocument = require('pdfkit')
const prisma = require('../utils/prismaClient')
const { NotFoundError } = require('../utils/errors')
const { getSettingValue } = require('./settingsService')

function formatMoney(amount, currency = 'LKR') {
  const num = Number(amount || 0)
  return `${currency} ${num.toFixed(2)}`
}

function formatDate(date) {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function generateInvoicePdf(saleId, format = 'a4') {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      user: { select: { id: true, username: true, full_name: true } },
      customer: { select: { id: true, name: true, phone: true, email: true, address: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      sale_items: {
        include: {
          product: { select: { id: true, name: true, sku: true, base_unit: true, pricing_unit: true } },
        },
      },
      payments: { where: { is_void: false } },
      customer_payment_allocations: {
        include: {
          customer_payment: { select: { id: true, payment_method: true, reference: true, is_void: true, created_at: true } },
        },
      },
    },
  })

  if (!sale) throw new NotFoundError('Sale not found')

  const [storeName, storeAddress, storePhone, currency] = await Promise.all([
    getSettingValue('store_name', 'NexTill POS'),
    getSettingValue('store_address', '123 Main Street'),
    getSettingValue('store_phone', '+94 11 2345678'),
    getSettingValue('currency_symbol', 'LKR'),
  ])

  const pageSize = String(format).toLowerCase() === 'a5' ? 'A5' : 'A4'

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: pageSize,
      margin: 36,
      bufferPages: true,
    })

    const buffers = []
    doc.on('data', (data) => buffers.push(data))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', (err) => reject(err))

    const pageWidth = doc.page.width
    const margin = 36
    const contentWidth = pageWidth - margin * 2

    // Header: Store Info
    doc.fontSize(16).font('Helvetica-Bold').text(storeName, margin, margin, { align: 'left' })
    doc.fontSize(8).font('Helvetica').fillColor('#555555')
    if (storeAddress) doc.text(storeAddress)
    if (storePhone) doc.text(`Phone: ${storePhone}`)

    // Header Right: Invoice Title & Meta
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827').text('COMMERCIAL INVOICE', margin, margin, { align: 'right' })
    doc.fontSize(8).font('Helvetica').fillColor('#374151')
    doc.text(`Invoice #: ${sale.transaction_id}`, { align: 'right' })
    doc.text(`Date: ${formatDate(sale.sale_date || sale.created_at)}`, { align: 'right' })
    doc.text(`Payment Status: ${sale.payment_status}`, { align: 'right' })

    doc.moveDown(1.5)
    doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.8)

    // Bill To & Sale Meta columns
    const colY = doc.y
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1F2937').text('BILL TO:', margin, colY)
    doc.font('Helvetica').fontSize(8).fillColor('#4B5563')
    if (sale.customer) {
      doc.text(sale.customer.name)
      if (sale.customer.phone) doc.text(`Phone: ${sale.customer.phone}`)
      if (sale.customer.address) doc.text(sale.customer.address)
    } else {
      doc.text('Walk-in Customer')
    }

    const rightColX = margin + contentWidth * 0.55
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1F2937').text('TRANSACTION DETAILS:', rightColX, colY)
    doc.font('Helvetica').fontSize(8).fillColor('#4B5563')
    doc.text(`Cashier: ${sale.user?.full_name || sale.user?.username || '—'}`, rightColX)
    if (sale.warehouse) doc.text(`Warehouse: ${sale.warehouse.name}`, rightColX)
    doc.text(`Payment Method: ${sale.payment_method}`, rightColX)

    doc.moveDown(1.2)
    doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.5)

    // Product Table Header
    const tableTop = doc.y
    const colProduct = margin
    const colUnit = margin + contentWidth * 0.42
    const colQty = margin + contentWidth * 0.55
    const colPrice = margin + contentWidth * 0.68
    const colDiscount = margin + contentWidth * 0.82
    const colTotal = margin + contentWidth * 0.92

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151')
    doc.text('ITEM & DESCRIPTION', colProduct, tableTop)
    doc.text('UNIT', colUnit, tableTop)
    doc.text('QTY', colQty, tableTop, { width: 40, align: 'right' })
    doc.text('UNIT PRICE', colPrice, tableTop, { width: 50, align: 'right' })
    doc.text('DISC', colDiscount, tableTop, { width: 35, align: 'right' })
    doc.text('TOTAL', colTotal, tableTop, { width: contentWidth - (colTotal - margin), align: 'right' })

    doc.moveDown(0.4)
    doc.strokeColor('#D1D5DB').lineWidth(1).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.3)

    // Product Rows
    doc.font('Helvetica').fontSize(8).fillColor('#1F2937')
    sale.sale_items.forEach((item) => {
      const rowY = doc.y
      if (rowY > doc.page.height - 80) {
        doc.addPage()
      }

      const pName = item.product_name || item.product?.name || 'Product'
      const pSku = item.product_sku || item.product?.sku ? ` (${item.product_sku || item.product?.sku})` : ''
      const lineDisc = Number(item.discount || 0)

      doc.text(`${pName}${pSku}`, colProduct, doc.y, { width: contentWidth * 0.40 })
      doc.text(item.unit || item.pricing_unit || 'pcs', colUnit, rowY)
      doc.text(Number(item.quantity).toString(), colQty, rowY, { width: 40, align: 'right' })
      doc.text(formatMoney(item.unit_price, ''), colPrice, rowY, { width: 50, align: 'right' })
      doc.text(lineDisc > 0 ? formatMoney(lineDisc, '') : '—', colDiscount, rowY, { width: 35, align: 'right' })
      doc.text(formatMoney(item.total, ''), colTotal, rowY, { width: contentWidth - (colTotal - margin), align: 'right' })

      doc.moveDown(0.4)
    })

    doc.moveDown(0.3)
    doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.5)

    // Financial Summary Block
    const summaryX = margin + contentWidth * 0.55
    const summaryValX = margin + contentWidth * 0.80
    const summaryValW = contentWidth * 0.20

    function summaryRow(label, val, bold = false) {
      const y = doc.y
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 9 : 8).fillColor('#111827')
      doc.text(label, summaryX, y)
      doc.text(val, summaryValX, y, { width: summaryValW, align: 'right' })
      doc.moveDown(0.4)
    }

    summaryRow('Subtotal:', formatMoney(sale.subtotal, currency))
    if (Number(sale.discount_amount || 0) > 0) {
      summaryRow('Order Discount:', `-${formatMoney(sale.discount_amount, currency)}`)
    }
    if (Number(sale.tax_amount || 0) > 0) {
      summaryRow('Tax:', formatMoney(sale.tax_amount, currency))
    }
    doc.strokeColor('#D1D5DB').lineWidth(1).moveTo(summaryX, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.3)
    summaryRow('Grand Total:', formatMoney(sale.total_amount, currency), true)
    summaryRow('Amount Paid:', formatMoney(sale.amount_paid, currency))
    summaryRow('Balance Due:', formatMoney(sale.balance_due, currency), Number(sale.balance_due) > 0)

    // Notes
    if (sale.notes) {
      doc.moveDown(1)
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#4B5563').text('Notes / Instructions:')
      doc.font('Helvetica').fillColor('#6B7280').text(sale.notes)
    }

    // Page numbering in footer
    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)
      doc.fontSize(7).font('Helvetica').fillColor('#9CA3AF')
      doc.text(
        `Page ${i + 1} of ${pages.count} — Generated by NexTill POS`,
        margin,
        doc.page.height - 24,
        { align: 'center', width: contentWidth }
      )
    }

    doc.end()
  })
}

async function generateCreditNotePdf(returnId, format = 'a4') {
  const sr = await prisma.salesReturn.findUnique({
    where: { id: returnId },
    include: {
      sale: { select: { id: true, transaction_id: true, sale_date: true, total_amount: true, created_at: true } },
      customer: { select: { id: true, name: true, phone: true, email: true, address: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, username: true, full_name: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, base_unit: true } },
        },
      },
    },
  })

  if (!sr) throw new NotFoundError('Sales return not found')

  const [storeName, storeAddress, storePhone, currency] = await Promise.all([
    getSettingValue('store_name', 'NexTill POS'),
    getSettingValue('store_address', '123 Main Street'),
    getSettingValue('store_phone', '+94 11 2345678'),
    getSettingValue('currency_symbol', 'LKR'),
  ])

  const pageSize = String(format).toLowerCase() === 'a5' ? 'A5' : 'A4'

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: pageSize,
      margin: 36,
      bufferPages: true,
    })

    const buffers = []
    doc.on('data', (data) => buffers.push(data))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', (err) => reject(err))

    const pageWidth = doc.page.width
    const margin = 36
    const contentWidth = pageWidth - margin * 2

    // Header: Store Info
    doc.fontSize(16).font('Helvetica-Bold').text(storeName, margin, margin, { align: 'left' })
    doc.fontSize(8).font('Helvetica').fillColor('#555555')
    if (storeAddress) doc.text(storeAddress)
    if (storePhone) doc.text(`Phone: ${storePhone}`)

    // Header Right: Credit Note Title & Meta
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#DC2626').text('CREDIT NOTE', margin, margin, { align: 'right' })
    doc.fontSize(8).font('Helvetica').fillColor('#374151')
    doc.text(`Credit Note #: ${sr.return_number}`, { align: 'right' })
    doc.text(`Return Date: ${formatDate(sr.return_date || sr.created_at)}`, { align: 'right' })
    doc.text(`Original Invoice #: ${sr.sale?.transaction_id || '—'}`, { align: 'right' })
    doc.text(`Refund Status: ${sr.refund_status}`, { align: 'right' })

    doc.moveDown(1.5)
    doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.8)

    // Customer & Return Details
    const colY = doc.y
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1F2937').text('CREDITED CUSTOMER:', margin, colY)
    doc.font('Helvetica').fontSize(8).fillColor('#4B5563')
    if (sr.customer) {
      doc.text(sr.customer.name)
      if (sr.customer.phone) doc.text(`Phone: ${sr.customer.phone}`)
      if (sr.customer.address) doc.text(sr.customer.address)
    } else {
      doc.text('Walk-in Customer')
    }

    const rightColX = margin + contentWidth * 0.55
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1F2937').text('RETURN INFORMATION:', rightColX, colY)
    doc.font('Helvetica').fontSize(8).fillColor('#4B5563')
    doc.text(`Processed By: ${sr.user?.full_name || sr.user?.username || '—'}`, rightColX)
    if (sr.warehouse) doc.text(`Warehouse: ${sr.warehouse.name}`, rightColX)
    doc.text(`Refund Method: ${sr.refund_method}`, rightColX)
    doc.text(`Reason: ${sr.reason}`, rightColX)

    doc.moveDown(1.2)
    doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.5)

    // Table Header
    const tableTop = doc.y
    const colProduct = margin
    const colUnit = margin + contentWidth * 0.42
    const colQty = margin + contentWidth * 0.55
    const colPrice = margin + contentWidth * 0.68
    const colDisposition = margin + contentWidth * 0.80
    const colTotal = margin + contentWidth * 0.90

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151')
    doc.text('RETURNED ITEM', colProduct, tableTop)
    doc.text('UNIT', colUnit, tableTop)
    doc.text('QTY', colQty, tableTop, { width: 40, align: 'right' })
    doc.text('NET PRICE', colPrice, tableTop, { width: 50, align: 'right' })
    doc.text('RESTOCKED', colDisposition, tableTop, { width: 45, align: 'center' })
    doc.text('REFUND', colTotal, tableTop, { width: contentWidth - (colTotal - margin), align: 'right' })

    doc.moveDown(0.4)
    doc.strokeColor('#D1D5DB').lineWidth(1).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.3)

    // Items
    doc.font('Helvetica').fontSize(8).fillColor('#1F2937')
    sr.items.forEach((item) => {
      const rowY = doc.y
      if (rowY > doc.page.height - 80) {
        doc.addPage()
      }

      const pName = item.product_name || item.product?.name || 'Product'
      const pSku = item.product_sku || item.product?.sku ? ` (${item.product_sku || item.product?.sku})` : ''

      doc.text(`${pName}${pSku}`, colProduct, doc.y, { width: contentWidth * 0.40 })
      doc.text(item.unit || 'pcs', colUnit, rowY)
      doc.text(Number(item.quantity).toString(), colQty, rowY, { width: 40, align: 'right' })
      doc.text(formatMoney(item.unit_price, ''), colPrice, rowY, { width: 50, align: 'right' })
      doc.text(item.restock ? 'YES' : 'NO', colDisposition, rowY, { width: 45, align: 'center' })
      doc.text(formatMoney(item.refund_subtotal, ''), colTotal, rowY, { width: contentWidth - (colTotal - margin), align: 'right' })

      doc.moveDown(0.4)
    })

    doc.moveDown(0.3)
    doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.5)

    // Summary Block
    const summaryX = margin + contentWidth * 0.55
    const summaryValX = margin + contentWidth * 0.80
    const summaryValW = contentWidth * 0.20

    const y = doc.y
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#DC2626')
    doc.text('Total Refund Amount:', summaryX, y)
    doc.text(formatMoney(sr.refund_amount, currency), summaryValX, y, { width: summaryValW, align: 'right' })
    doc.moveDown(0.6)

    if (sr.notes) {
      doc.moveDown(0.5)
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#4B5563').text('Return Notes:')
      doc.font('Helvetica').fillColor('#6B7280').text(sr.notes)
    }

    // Page numbering
    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)
      doc.fontSize(7).font('Helvetica').fillColor('#9CA3AF')
      doc.text(
        `Page ${i + 1} of ${pages.count} — Generated by NexTill POS`,
        margin,
        doc.page.height - 24,
        { align: 'center', width: contentWidth }
      )
    }

    doc.end()
  })
}

module.exports = {
  generateInvoicePdf,
  generateCreditNotePdf,
}
