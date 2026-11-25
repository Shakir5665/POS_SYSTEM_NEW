const PDFDocument = require('pdfkit')
const path = require('path')
const fs = require('fs')
const prisma = require('../utils/prismaClient')
const { NotFoundError } = require('../utils/errors')
const { getSettingValue } = require('./settingsService')

const ISKPOTA_REGULAR = path.join(__dirname, '../../assets/fonts/iskpota.ttf')
const ISKPOTA_BOLD = path.join(__dirname, '../../assets/fonts/iskpotab.ttf')
const HAS_SINHALA_FONT = fs.existsSync(ISKPOTA_REGULAR) && fs.existsSync(ISKPOTA_BOLD)

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

function computeItemBreakdown(item) {
  const qty = Number(item.quantity != null ? item.quantity : 1)
  const unitPrice = Number(item.unit_price != null ? item.unit_price : 0)
  const usualPrice =
    item.usual_price_snapshot != null && Number(item.usual_price_snapshot) > 0
      ? Number(item.usual_price_snapshot)
      : null
  const ourPrice =
    item.our_price_snapshot != null && Number(item.our_price_snapshot) > 0
      ? Number(item.our_price_snapshot)
      : null
  const isWholesale = Boolean(item.is_wholesale)
  const wholesalePrice =
    item.wholesale_price_snapshot != null && Number(item.wholesale_price_snapshot) > 0
      ? Number(item.wholesale_price_snapshot)
      : null
  const predefinedApplied = isWholesale
    ? false
    : (item.predefined_discount_applied !== undefined && item.predefined_discount_applied !== null
        ? Boolean(item.predefined_discount_applied)
        : (usualPrice != null && ourPrice != null && usualPrice > ourPrice && Math.abs(unitPrice - ourPrice) < 0.01))

  let pricingFactor = 1
  const unitStr = (item.unit || item.base_unit || '').toLowerCase()
  const pricingUnitStr = (item.pricing_unit || '').toLowerCase()
  const isWeight =
    item.product?.unit_category === 'WEIGHT' ||
    ['g', 'kg'].includes(unitStr) ||
    ['g', 'kg'].includes(pricingUnitStr)
  const isVolume =
    item.product?.unit_category === 'VOLUME' ||
    ['ml', 'l'].includes(unitStr) ||
    ['ml', 'l'].includes(pricingUnitStr)

  if (isWeight || isVolume) {
    const factorSelling = unitStr === 'g' || unitStr === 'ml' ? 0.001 : 1
    const factorPricing = pricingUnitStr === 'g' || pricingUnitStr === 'ml' ? 0.001 : 1
    pricingFactor = factorPricing ? factorSelling / factorPricing : 1
  }

  const pricingQty = qty * pricingFactor
  const unitMarket = usualPrice != null ? usualPrice : unitPrice
  const unitOur = isWholesale
    ? (wholesalePrice != null ? wholesalePrice : unitPrice)
    : (!predefinedApplied ? unitMarket : (ourPrice != null ? ourPrice : unitPrice))

  const marketPrice = Number((pricingQty * unitMarket).toFixed(2))
  const lineTotal = Number(
    Number(item.total != null ? item.total : pricingQty * unitPrice).toFixed(2)
  )
  const lineDiscount = Math.max(0, Number((marketPrice - lineTotal).toFixed(2)))

  return {
    name: item.product_name || item.product?.name || 'Product',
    sku: item.product_sku || item.product?.sku || '',
    unit: item.unit || item.pricing_unit || 'pcs',
    qty,
    returnedQty: parseFloat(item.returned_quantity || 0),
    unitMarketPrice: unitMarket,
    unitOurPrice: unitOur,
    marketPrice,
    lineDiscount,
    lineTotal,
  }
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
          product: { select: { id: true, name: true, sku: true, base_unit: true, pricing_unit: true, unit_category: true } },
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

  const pageSize = 'A4'

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: pageSize,
      margin: 36,
      bufferPages: true,
    })

    const fontRegular = HAS_SINHALA_FONT ? 'Sinhala' : 'Helvetica'
    const fontBold = HAS_SINHALA_FONT ? 'Sinhala-Bold' : 'Helvetica-Bold'

    if (HAS_SINHALA_FONT) {
      doc.registerFont('Sinhala', ISKPOTA_REGULAR)
      doc.registerFont('Sinhala-Bold', ISKPOTA_BOLD)
    }

    const buffers = []
    doc.on('data', (data) => buffers.push(data))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', (err) => reject(err))

    const pageWidth = doc.page.width
    const margin = 36
    const contentWidth = pageWidth - margin * 2

    // Header: Store Info
    doc.fontSize(16).font(fontBold).fillColor('#111827').text(storeName, margin, margin, { align: 'left' })
    doc.fontSize(8).font(fontRegular).fillColor('#555555')
    if (storeAddress) doc.text(storeAddress)
    if (storePhone) doc.text(`Phone: ${storePhone}`)

    // Header Right: Invoice Title & Meta
    doc.fontSize(14).font(fontBold).fillColor('#111827').text('COMMERCIAL INVOICE', margin, margin, { align: 'right' })
    doc.fontSize(8).font(fontRegular).fillColor('#374151')
    doc.text(`Invoice #: ${sale.transaction_id}`, { align: 'right' })
    doc.text(`Date: ${formatDate(sale.sale_date || sale.created_at)}`, { align: 'right' })
    doc.text(`Payment Status: ${sale.payment_status}`, { align: 'right' })

    doc.moveDown(1.5)
    doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.8)

    // Bill To & Sale Meta columns
    const colY = doc.y
    doc.fontSize(9).font(fontBold).fillColor('#1F2937').text('BILL TO:', margin, colY)
    doc.font(fontRegular).fontSize(8).fillColor('#4B5563')
    if (sale.customer) {
      doc.text(sale.customer.name)
      if (sale.customer.phone) doc.text(`Phone: ${sale.customer.phone}`)
      if (sale.customer.address) doc.text(sale.customer.address)
    } else {
      doc.text('Walk-in Customer')
    }

    const rightColX = margin + contentWidth * 0.55
    doc.fontSize(9).font(fontBold).fillColor('#1F2937').text('TRANSACTION DETAILS:', rightColX, colY)
    doc.font(fontRegular).fontSize(8).fillColor('#4B5563')
    doc.text(`Cashier: ${sale.user?.full_name || sale.user?.username || '—'}`, rightColX)
    if (sale.warehouse) doc.text(`Warehouse: ${sale.warehouse.name}`, rightColX)
    doc.text(`Payment Method: ${sale.payment_method}`, rightColX)

    doc.moveDown(1.2)
    doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.5)

    // Compute items matching the View modal
    const computedItems = (sale.sale_items || []).map(computeItemBreakdown)

    // Product Table Columns matching View Sale Details modal
    // Product | Qty | Unit Price (සා.මිල) | Discount | Net Price (අපේ මිල) | Subtotal
    const tableTop = doc.y
    const colProductX = margin
    const colProductW = 160

    const colQtyX = margin + 165
    const colQtyW = 45

    const colUnitMarketX = margin + 215
    const colUnitMarketW = 80

    const colNetPriceX = margin + 370
    const colNetPriceW = 80

    const colTotalX = margin + 455
    const colTotalW = contentWidth - 455

    const headerMarket = HAS_SINHALA_FONT ? 'Unit Price (සා.මිල)' : 'Unit Price'
    const headerNet = HAS_SINHALA_FONT ? 'Net Price (අපේ මිල)' : 'Net Price'

    doc.fontSize(8).font(fontBold).fillColor('#374151')
    doc.text('Product', colProductX, tableTop, { width: colProductW })
    doc.text('Qty', colQtyX, tableTop, { width: colQtyW, align: 'center' })
    doc.text(headerMarket, colUnitMarketX, tableTop, { width: colUnitMarketW, align: 'right' })

    doc.text(headerNet, colNetPriceX, tableTop, { width: colNetPriceW, align: 'right' })
    doc.text('Subtotal', colTotalX, tableTop, { width: colTotalW, align: 'right' })

    doc.moveDown(0.4)
    doc.strokeColor('#D1D5DB').lineWidth(1).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.3)

    // Product Rows
    computedItems.forEach((item) => {
      let rowY = doc.y
      if (rowY > doc.page.height - 90) {
        doc.addPage()
        rowY = doc.y
      }

      const pName = item.name
      const pSku = item.sku ? ` (${item.sku})` : ''
      const retLabel = item.returnedQty > 0 ? ` [${item.returnedQty} returned]` : ''

      doc.font(fontBold).fontSize(8).fillColor('#111827')
      doc.text(`${pName}${pSku}${retLabel}`, colProductX, rowY, { width: colProductW })

      doc.font(fontBold).fontSize(8).fillColor('#1F2937')
      doc.text(`${item.qty} ${item.unit}`, colQtyX, rowY, { width: colQtyW, align: 'center' })

      doc.font(fontRegular).fontSize(8).fillColor('#4B5563')
      doc.text(formatMoney(item.unitMarketPrice, ''), colUnitMarketX, rowY, { width: colUnitMarketW, align: 'right' })

      

      doc.font(fontBold).fontSize(8).fillColor('#111827')
      doc.text(formatMoney(item.unitOurPrice, ''), colNetPriceX, rowY, { width: colNetPriceW, align: 'right' })
      doc.text(formatMoney(item.lineTotal, ''), colTotalX, rowY, { width: colTotalW, align: 'right' })

      doc.moveDown(1.5)
    })

    doc.moveDown(0.3)
    doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke()
    doc.moveDown(0.6)

    // Calculations for summary matching View modal
    const marketSubtotal = computedItems.reduce((acc, it) => acc + (it.marketPrice || 0), 0)
    const cartDiscount = Number(sale.discount_amount || 0)
    const totalItemDiscounts = computedItems.reduce((acc, it) => acc + (it.lineDiscount || 0), 0)
    const totalDiscounts = Number((totalItemDiscounts + cartDiscount).toFixed(2))
    const grandTotal = Number(sale.total_amount)
    const amountPaid = Number(sale.amount_paid != null ? sale.amount_paid : sale.total_amount)
    const balanceDue = Math.max(0, Number((grandTotal - amountPaid).toFixed(2)))
    const changeGiven = Number(sale.change_amount || 0)

    // Summary Section (Left: Payment records snapshot; Right: Financial Totals)
    const summaryBlockTop = doc.y

    // Left column: Payment Records (matching View modal)
    const leftW = contentWidth * 0.46
    doc.fontSize(8).font(fontBold).fillColor('#1F2937').text('Payment Records', margin, summaryBlockTop)
    doc.moveDown(0.3)

    if (sale.payments && sale.payments.length > 0) {
      sale.payments.forEach((p) => {
        const payY = doc.y
        doc.font(fontRegular).fontSize(7.5).fillColor(p.is_void ? '#DC2626' : '#374151')
        const refStr = p.reference ? ` (${p.reference})` : ''
        doc.text(`${p.payment_method}${refStr}`, margin, payY, { width: leftW * 0.65 })
        doc.font(fontBold).fontSize(7.5).fillColor(p.is_void ? '#DC2626' : '#059669')
        doc.text(formatMoney(p.amount, currency), margin + leftW * 0.65, payY, { width: leftW * 0.35, align: 'right' })
        doc.moveDown(0.25)
      })
    } else {
      doc.font(fontRegular).fontSize(7.5).fillColor('#9CA3AF').text('No direct payment records found.', margin, doc.y)
    }

    // Right column: Financial Summary Block
    const summaryX = margin + contentWidth * 0.52
    const summaryLabelW = contentWidth * 0.26
    const summaryValX = margin + contentWidth * 0.78
    const summaryValW = contentWidth * 0.22

    let currentSummaryY = summaryBlockTop

    function summaryRow(label, val, bold = false, color = '#111827') {
      doc.font(bold ? fontBold : fontRegular).fontSize(bold ? 8.5 : 8).fillColor(color)
      doc.text(label, summaryX, currentSummaryY, { width: summaryLabelW })
      doc.text(val, summaryValX, currentSummaryY, { width: summaryValW, align: 'right' })
      currentSummaryY += 13
    }

    const labelSubtotal = HAS_SINHALA_FONT ? 'Subtotal:' : 'Subtotal (Market Price):'
    const labelDiscount = HAS_SINHALA_FONT ? 'Total Discounts (වට්ටම්):' : 'Total Discounts:'
    const labelGrand = HAS_SINHALA_FONT ? 'Grand Total (එකතුව):' : 'Grand Total (Our Price):'

    summaryRow(labelSubtotal, formatMoney(marketSubtotal, currency))

    if (totalDiscounts > 0) {
      summaryRow(labelDiscount, `${formatMoney(totalDiscounts, currency)}`, false, '#059669')
    }

    if (Number(sale.tax_amount || 0) > 0) {
      summaryRow('Tax:', `+${formatMoney(sale.tax_amount, currency)}`)
    }

    // Divider line before Grand Total
    doc.strokeColor('#D1D5DB').lineWidth(1).moveTo(summaryX, currentSummaryY).lineTo(pageWidth - margin, currentSummaryY).stroke()
    currentSummaryY += 4

    summaryRow(labelGrand, formatMoney(grandTotal, currency), true, '#111827')
    summaryRow('Amount Paid:', formatMoney(amountPaid, currency), false, '#047857')

    if (balanceDue > 0) {
      summaryRow('Balance Due:', formatMoney(balanceDue, currency), true, '#DC2626')
    }

    if (changeGiven > 0) {
      summaryRow('Change Given:', formatMoney(changeGiven, currency), false, '#6B7280')
    }

    doc.y = Math.max(doc.y, currentSummaryY + 10)

    // Notes
    if (sale.notes) {
      doc.moveDown(0.8)
      doc.fontSize(8).font(fontBold).fillColor('#4B5563').text('Notes / Instructions:')
      doc.font(fontRegular).fillColor('#6B7280').text(sale.notes)
    }

    // Page numbering in footer
    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)
      doc.fontSize(7).font(fontRegular).fillColor('#9CA3AF')
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

async function generateCreditNotePdf(returnId) {
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

  const pageSize = 'A4'

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
