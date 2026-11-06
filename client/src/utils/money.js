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

/** Line total in pesewas: price × quantity − line discount. */
export function lineTotalPesewas(item) {
  return toPesewas(item.price) * item.quantity - toPesewas(item.discount)
}

/**
 * Cart totals in GH₵. Tax is charged on (subtotal − cart discount) and
 * rounded once, to the nearest pesewa, halves up.
 * @param {Array<{price, quantity, discount}>} items
 * @param {number} cartDiscount - GH₵
 * @param {number|string} taxRate - percent, e.g. 12.5
 */
export function cartTotals(items, cartDiscount, taxRate) {
  const subtotal = items.reduce((sum, item) => sum + lineTotalPesewas(item), 0)
  const discount = Math.min(toPesewas(cartDiscount), Math.max(0, subtotal))
  const taxable = Math.max(0, subtotal - discount)
  const rateHundredths = Math.round(Number(taxRate || 0) * 100) // 12.5% → 1250
  const tax = rateHundredths > 0 ? divideRoundHalfUp(taxable * rateHundredths, 10000) : 0

  return {
    subtotal: fromPesewas(subtotal),
    discount: fromPesewas(discount),
    tax: fromPesewas(tax),
    total: fromPesewas(taxable + tax),
  }
}
