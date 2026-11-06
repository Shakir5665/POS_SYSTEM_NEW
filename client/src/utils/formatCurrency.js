/**
 * Format a number as currency.
 * @param {number|string} amount
 * @param {string} [symbol='GH₵'] - Currency symbol (defaults to GHS)
 * @returns {string}
 */
export function formatCurrency(amount, symbol = 'GH₵') {
  const num = parseFloat(amount)
  if (isNaN(num)) return `${symbol} 0.00`
  return `${symbol} ${num.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
