/**
 * Shared Receipt Data Model & Calculation Logic
 * Single source of truth for both on-screen receipt preview and printable receipt.
 */

/**
 * Normalizes and calculates a single receipt item breakdown.
 * Consumes authoritative transaction data without re-fetching current catalog prices.
 */
export function formatReceiptItem(item) {
  if (!item) {
    return {
      name: 'Item',
      qty: 1,
      unitLabel: '',
      unitPrice: 0,
      lineGross: 0,
      unitDiscount: 0,
      totalDiscount: 0,
      lineTotal: 0,
    }
  }

  const name = item.product_name || item.product?.name || item.name || 'Item'
  const qty = Number(item.quantity != null ? item.quantity : 1)
  const unitLabel = item.unit ? ` ${item.unit}` : ''
  const unitPrice = Number(item.unit_price != null ? item.unit_price : (item.price != null ? item.price : 0))

  const hasUsualPrice = item.usual_price_snapshot != null || item.usual_price != null
  const usualPrice = hasUsualPrice
    ? Number(item.usual_price_snapshot != null ? item.usual_price_snapshot : item.usual_price)
    : null

  const hasOurPrice = item.our_price_snapshot != null || item.our_price != null
  const ourPrice = hasOurPrice
    ? Number(item.our_price_snapshot != null ? item.our_price_snapshot : item.our_price)
    : null

  const predefinedApplied = item.predefined_discount_applied !== undefined
    ? Boolean(item.predefined_discount_applied)
    : (item.apply_predefined_discount !== undefined
      ? Boolean(item.apply_predefined_discount)
      : (usualPrice != null && ourPrice != null && usualPrice > ourPrice && Math.abs(unitPrice - ourPrice) < 0.01))

  let pricingFactor = 1
  if (item.unit_category === 'WEIGHT' || item.unit_category === 'VOLUME') {
    const factorSelling = item.unit === 'g' || item.unit === 'ml' ? 1 : 1000
    const factorPricing = (item.pricing_unit || 'kg') === 'g' || (item.pricing_unit || 'L') === 'ml' ? 1 : 1000
    pricingFactor = factorSelling / factorPricing
  }
  const pricingQty = qty * pricingFactor

  const usualLineGross = usualPrice != null ? Number((pricingQty * usualPrice).toFixed(2)) : null
  const predefinedDiscountAmount = item.predefined_discount_amount != null
    ? Number(item.predefined_discount_amount)
    : (predefinedApplied && usualPrice != null && ourPrice != null ? Number((Math.max(0, usualPrice - ourPrice) * pricingQty).toFixed(2)) : 0)

  // Determine line gross at unit_price
  let lineGross = 0
  if (item.line_gross != null) {
    lineGross = Number(item.line_gross)
  } else {
    lineGross = Number((pricingQty * unitPrice).toFixed(2))
  }

  // Determine discount per unit and total product discount
  let unitDiscount = 0
  let totalDiscount = 0
  let lineTotal = lineGross

  if (item.unit_discount != null) {
    unitDiscount = Number(item.unit_discount)
    totalDiscount = item.total_discount != null ? Number(item.total_discount) : Number((unitDiscount * qty).toFixed(2))
    lineTotal = item.total != null ? Number(item.total) : Number((lineGross - totalDiscount).toFixed(2))
  } else if (item.total_discount != null) {
    totalDiscount = Number(item.total_discount)
    unitDiscount = qty > 0 ? Number((totalDiscount / qty).toFixed(2)) : 0
    lineTotal = item.total != null ? Number(item.total) : Number((lineGross - totalDiscount).toFixed(2))
  } else if (item.discount != null && Number(item.discount) > 0) {
    const rawDisc = Number(item.discount)
    if (item.total != null) {
      const explicitTotal = Number(item.total)
      lineTotal = explicitTotal
      const diffFromGross = Number((lineGross - explicitTotal).toFixed(2))
      if (Math.abs(diffFromGross - rawDisc) < 0.01) {
        totalDiscount = rawDisc
        unitDiscount = qty > 0 ? Number((totalDiscount / qty).toFixed(2)) : 0
      } else if (Math.abs(diffFromGross - (rawDisc * qty)) < 0.01) {
        unitDiscount = rawDisc
        totalDiscount = Number((unitDiscount * qty).toFixed(2))
      } else if (diffFromGross > 0) {
        totalDiscount = diffFromGross
        unitDiscount = qty > 0 ? Number((totalDiscount / qty).toFixed(2)) : 0
      } else {
        totalDiscount = 0
        unitDiscount = 0
      }
    } else {
      unitDiscount = rawDisc
      totalDiscount = Number((unitDiscount * qty).toFixed(2))
      lineTotal = Math.max(0, Number((lineGross - totalDiscount).toFixed(2)))
    }
  } else if (item.total != null) {
    lineTotal = Number(item.total)
    if (lineGross > lineTotal) {
      totalDiscount = Number((lineGross - lineTotal).toFixed(2))
      unitDiscount = qty > 0 ? Number((totalDiscount / qty).toFixed(2)) : 0
    }
  }

  lineTotal = Math.max(0, lineTotal)
  totalDiscount = Math.min(lineGross, Math.max(0, totalDiscount))

  const marketPrice = usualPrice != null ? usualPrice : unitPrice
  // If predefined discount is unchecked (or disabled), show "our price" as same as "market price"
  const ourPriceVal = predefinedApplied
    ? (ourPrice != null ? ourPrice : unitPrice)
    : marketPrice

  return {
    name,
    qty,
    unitLabel,
    unitPrice,
    usualPrice,
    ourPrice: ourPriceVal,
    marketPrice,
    predefinedApplied,
    predefinedDiscountAmount,
    usualLineGross,
    marketLineGross: usualLineGross != null ? usualLineGross : lineGross,
    lineGross,
    unitDiscount,
    totalDiscount,
    lineTotal,
  }
}

/**
 * Calculates receipt financial totals according to the 6-step breakdown order:
 * 1. Gross Subtotal — total before discounts.
 * 2. Total Product Discounts — sum of quantity × per-unit product discount.
 * 3. Additional Cart Discount — separate purchase-level discount.
 * 4. Total Discounts — product discounts + additional cart discount.
 * 5. Applicable Taxes — follow existing tax calculation rules.
 * 6. Final Total — actual amount payable.
 */
export function calculateReceiptSummary(sale, computedItems = []) {
  if (!sale) {
    return {
      distinctItems: 0,
      totalQuantity: 0,
      usualSubtotal: 0,
      totalPredefinedDiscounts: 0,
      grossSubtotal: 0,
      totalProductDiscounts: 0,
      additionalCartDiscount: 0,
      totalDiscounts: 0,
      applicableTaxes: 0,
      finalTotal: 0,
      amountPaid: 0,
      outstandingBalance: 0,
    }
  }

  const distinctItems = computedItems.length
  const totalQuantity = computedItems.reduce((sum, it) => sum + (it.qty || 0), 0)

  // 1. Usual Price Subtotal
  const hasUsualPrice = computedItems.some(it => it.usualPrice != null)
  const computedUsualSubtotal = computedItems.reduce(
    (sum, it) => sum + (it.usualLineGross != null ? it.usualLineGross : (it.lineGross || 0)),
    0
  )
  const usualSubtotal = hasUsualPrice ? Number(computedUsualSubtotal.toFixed(2)) : null

  // 2. Predefined Discounts
  const computedPredefinedDiscounts = computedItems.reduce(
    (sum, it) => sum + (it.predefinedDiscountAmount || 0),
    0
  )
  const totalPredefinedDiscounts = Number(computedPredefinedDiscounts.toFixed(2))

  // 3. Gross Subtotal at selling price
  const computedGross = computedItems.reduce((sum, it) => sum + (it.lineGross || 0), 0)
  const grossSubtotal = sale.gross_subtotal != null ? Number(sale.gross_subtotal) : Number(computedGross.toFixed(2))
  const marketSubtotalVal = usualSubtotal != null ? usualSubtotal : grossSubtotal

  // 4. Line-level manual discounts
  const computedProductDiscounts = computedItems.reduce((sum, it) => sum + (it.totalDiscount || 0), 0)
  const totalProductDiscounts = sale.total_product_discounts != null
    ? Number(sale.total_product_discounts)
    : Number(computedProductDiscounts.toFixed(2))

  // 5. Additional Cart Discount
  const additionalCartDiscount = Number(sale.cart_discount != null ? sale.cart_discount : (sale.discount_amount || 0))

  // 6. Total Discounts
  const totalDiscounts = sale.total_discounts != null
    ? Number(sale.total_discounts)
    : Number((totalPredefinedDiscounts + totalProductDiscounts + additionalCartDiscount).toFixed(2))

  // 7. Applicable Taxes
  const applicableTaxes = Number(sale.tax_amount || 0)

  // 8. Final Total
  const finalTotal = sale.total_amount != null
    ? Number(sale.total_amount)
    : Number((grossSubtotal - totalProductDiscounts - additionalCartDiscount + applicableTaxes).toFixed(2))

  // 9. Payment & Outstanding Balance
  const paymentObj = sale.payment || (sale.payments && sale.payments[0]) || null
  const amountPaid = paymentObj != null
    ? Number(paymentObj.amount_paid || 0)
    : (sale.amount_paid != null ? Number(sale.amount_paid) : finalTotal)
  const outstandingBalance = Math.max(0, Number((finalTotal - amountPaid).toFixed(2)))

  // Combined Our Total Discount = Total Predefined Discounts + Additional Cart Discount + any manual item discounts
  const ourTotalDiscount = Number((totalPredefinedDiscounts + additionalCartDiscount + totalProductDiscounts).toFixed(2))

  return {
    distinctItems,
    totalQuantity: Number(totalQuantity.toFixed(3)),
    usualSubtotal: marketSubtotalVal,
    marketSubtotal: marketSubtotalVal,
    totalPredefinedDiscounts,
    grossSubtotal,
    totalProductDiscounts,
    additionalCartDiscount,
    totalDiscounts,
    ourTotalDiscount,
    applicableTaxes,
    finalTotal,
    grandTotal: finalTotal,
    amountPaid,
    outstandingBalance,
  }
}

/**
 * Single source of truth data model consumed by both preview and print portal.
 */
export function getReceiptDataModel(sale) {
  if (!sale) return { items: [], summary: calculateReceiptSummary(null) }

  const itemsList = (sale.items && sale.items.length > 0) ? sale.items : (sale.sale_items || [])
  const items = itemsList.map(formatReceiptItem)
  const summary = calculateReceiptSummary(sale, items)

  return {
    items,
    summary,
  }
}
