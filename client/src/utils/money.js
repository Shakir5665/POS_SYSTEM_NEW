/**
 * Exact money arithmetic for the cart. Amounts are converted to whole
 * pesewas (integers) before any maths, so 3 × GH₵ 0.10 is exactly GH₵ 0.30.
 * The rules match the server's salesService so the screen shows the same
 * total the server will charge.
 */

/** Convert GH₵ (number or numeric string) to whole pesewas. */
export function toPesewas(amount) {
  const n = Number(amount)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Convert whole pesewas back to GH₵. */
export function fromPesewas(pesewas) {
  return pesewas / 100
}

// Integer division of non-negative integers, rounding halves up (like the server)
function divideRoundHalfUp(numerator, denominator) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}

function getPricingQuantity(item) {
  const qty = Number(item.quantity || 0)
  if (item.unit_category === 'WEIGHT' || item.unit_category === 'VOLUME') {
    const factorSelling = item.unit === 'g' || item.unit === 'ml' ? 1 : 1000
    const factorPricing = (item.pricing_unit || 'kg') === 'g' || (item.pricing_unit || 'L') === 'ml' ? 1 : 1000
    return (qty * factorSelling) / factorPricing
  }
  return qty
}

/** Line gross at standard Usual Price in pesewas. */
export function lineUsualGrossPesewas(item) {
  const usualPricePesewas = toPesewas(item.usual_price != null ? item.usual_price : item.price)
  const pricingQty = getPricingQuantity(item)
  return Math.round(pricingQty * usualPricePesewas)
}

/** Line predefined discount in pesewas: (Usual Price - Our Price) * Qty if enabled. */
export function linePredefinedDiscountPesewas(item) {
  const usualPesewas = toPesewas(item.usual_price != null ? item.usual_price : item.price)
  const ourPesewas = toPesewas(item.our_price != null ? item.our_price : item.price)
  const applyPredefined = item.apply_predefined_discount !== false
  if (!applyPredefined || usualPesewas <= ourPesewas) return 0
  const pricingQty = getPricingQuantity(item)
  return Math.round(pricingQty * (usualPesewas - ourPesewas))
}

/** Line total in pesewas: effective price × quantity − line discount. */
export function lineTotalPesewas(item) {
  const usualPesewas = toPesewas(item.usual_price != null ? item.usual_price : item.price)
  const ourPesewas = toPesewas(item.our_price != null ? item.our_price : item.price)
  const applyPredefined = item.apply_predefined_discount !== false
  const effectivePricePesewas = applyPredefined ? ourPesewas : usualPesewas
  const discountPesewas = toPesewas(item.discount)
  const pricingQty = getPricingQuantity(item)

  const lineGross = Math.round(pricingQty * effectivePricePesewas)
  return Math.max(0, lineGross - discountPesewas)
}

/**
 * Cart totals in GH₵. Tax is charged on (subtotal − cart discount) and
 * rounded once, to the nearest pesewa, halves up.
 * @param {Array<{price, usual_price, our_price, quantity, discount, apply_predefined_discount}>} items
 * @param {number} cartDiscount - GH₵ (Additional Cart Discount)
 * @param {number|string} taxRate - percent, e.g. 12.5
 */
export function cartTotals(items, cartDiscount, taxRate) {
  const usualSubtotal = items.reduce((sum, item) => sum + lineUsualGrossPesewas(item), 0)
  const predefinedDiscounts = items.reduce((sum, item) => sum + linePredefinedDiscountPesewas(item), 0)
  const subtotal = items.reduce((sum, item) => sum + lineTotalPesewas(item), 0)
  const discount = Math.min(toPesewas(cartDiscount), Math.max(0, subtotal))
  const taxable = Math.max(0, subtotal - discount)
  const rateHundredths = Math.round(Number(taxRate || 0) * 100) // 12.5% → 1250
  const tax = rateHundredths > 0 ? divideRoundHalfUp(taxable * rateHundredths, 10000) : 0
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)

  return {
    usual_subtotal: fromPesewas(usualSubtotal),
    predefined_discounts: fromPesewas(predefinedDiscounts),
    subtotal: fromPesewas(subtotal),
    discount: fromPesewas(discount),
    tax: fromPesewas(tax),
    total: fromPesewas(taxable + tax),
    distinct_items: items.length,
    total_quantity: Number(totalQuantity.toFixed(3)),
  }
}
