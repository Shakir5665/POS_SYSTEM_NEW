let activeCurrencySymbol = 'LKR'

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem('dashpos_currency_symbol')
    if (saved) activeCurrencySymbol = saved
  }
} catch {
  // Ignore localStorage access errors
}

/**
 * Update the active currency symbol in memory and localStorage for 0ms load latency.
 * @param {string} symbol
 */
export function setActiveCurrencySymbol(symbol) {
  if (typeof symbol === 'string' && symbol.trim()) {
    activeCurrencySymbol = symbol.trim()
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('dashpos_currency_symbol', activeCurrencySymbol)
      }
    } catch {
      // Ignore localStorage errors
    }
  }
}

/**
 * Get the currently active currency symbol.
 * @returns {string}
 */
export function getActiveCurrencySymbol() {
  return activeCurrencySymbol
}

/**
 * Format a number as currency using the active or provided currency symbol.
 * @param {number|string} amount
 * @param {string} [symbol] - Currency symbol (defaults to active currency symbol configured by admin)
 * @returns {string}
 */
export function formatCurrency(amount, symbol = activeCurrencySymbol) {
  const sym = symbol ?? activeCurrencySymbol
  const num = parseFloat(amount)
  if (isNaN(num)) return `${sym} 0.00`
  return `${sym} ${num.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
