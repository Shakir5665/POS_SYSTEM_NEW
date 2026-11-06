let activeCurrencySymbol = 'GH₵'

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem('nextill_currency_symbol') || localStorage.getItem('dashpos_currency_symbol')
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
        localStorage.setItem('nextill_currency_symbol', activeCurrencySymbol)
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
 * If symbol is empty string (''), returns only the formatted amount without any currency prefix.
 * @param {number|string} amount
 * @param {string} [symbol] - Currency symbol (defaults to active currency symbol configured by admin)
 * @returns {string}
 */
export function formatCurrency(amount, symbol = activeCurrencySymbol) {
  const sym = symbol !== undefined && symbol !== null ? symbol : activeCurrencySymbol
  const num = parseFloat(amount)
  if (isNaN(num)) return sym ? `${sym} 0.00` : '0.00'
  const formatted = num.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return sym ? `${sym} ${formatted}` : formatted
}

/**
 * Format a numeric amount without any currency symbol.
 * E.g., 1200 -> "1,200.00"
 * @param {number|string} amount
 * @returns {string}
 */
export function formatAmount(amount) {
  return formatCurrency(amount, '')
}
