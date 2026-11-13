let activeCurrencySymbol = 'LKR'

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
  const cleanAmount = typeof amount === 'string' ? amount.replace(/,/g, '') : amount
  const num = parseFloat(cleanAmount)
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

/**
 * Format a number as compact currency with K, M, B suffixes.
 * - Values below 1,000: Display normally (e.g., Rs. 950.00)
 * - 1,000 to below 1 million: Use K (e.g., Rs. 110K, Rs. 1K)
 * - 1 million to below 1 billion: Use M (e.g., Rs. 1.25M, Rs. 1M)
 * - 1 billion or above: Use B (e.g., Rs. 1.2B, Rs. 1B)
 * - Up to 2 decimal places when necessary, removing unnecessary trailing zeros.
 * - Preserves existing currency symbol.
 * - Handles negative values and zero correctly.
 *
 * @param {number|string} amount
 * @param {string} [symbol] - Currency symbol (defaults to active currency symbol configured by admin)
 * @returns {string}
 */
export function formatCompactCurrency(amount, symbol = activeCurrencySymbol) {
  const sym = symbol !== undefined && symbol !== null ? symbol : activeCurrencySymbol
  const cleanAmount = typeof amount === 'string' ? amount.replace(/,/g, '') : amount
  const num = parseFloat(cleanAmount)
  if (isNaN(num)) return sym ? `${sym} 0.00` : '0.00'

  const isNegative = num < 0
  const abs = Math.abs(num)

  // Values below 1,000: Display normally (e.g., Rs. 950.00)
  if (abs < 1000) {
    return formatCurrency(num, sym)
  }

  let suffix = 'K'
  let divisor = 1e3

  if (abs >= 1e9) {
    suffix = 'B'
    divisor = 1e9
  } else if (abs >= 1e6) {
    suffix = 'M'
    divisor = 1e6
  }

  let scaled = abs / divisor
  let rounded = Math.round(scaled * 100) / 100

  // Handle boundary edge cases where rounding up rolls into the next suffix tier
  // e.g. 999,999 -> 1000K -> 1M
  if (rounded >= 1000 && suffix !== 'B') {
    if (suffix === 'K') {
      suffix = 'M'
      divisor = 1e6
    } else if (suffix === 'M') {
      suffix = 'B'
      divisor = 1e9
    }
    scaled = abs / divisor
    rounded = Math.round(scaled * 100) / 100
  }

  const formattedNumber = rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

  const formatted = `${isNegative ? '-' : ''}${formattedNumber}${suffix}`
  return sym ? `${sym} ${formatted}` : formatted
}

/**
 * Format a number into compact representation without currency symbol (or with explicit symbol if provided).
 * E.g., 1250000 -> "1.25M"
 * @param {number|string} amount
 * @param {string} [symbol='']
 * @returns {string}
 */
export function formatCompactNumber(amount, symbol = '') {
  return formatCompactCurrency(amount, symbol)
}

/**
 * Format a numeric amount in compact representation without any currency symbol.
 * E.g., 1250000 -> "1.25M"
 * @param {number|string} amount
 * @returns {string}
 */
export function formatCompactAmount(amount) {
  return formatCompactCurrency(amount, '')
}

export const formatCompact = formatCompactCurrency
