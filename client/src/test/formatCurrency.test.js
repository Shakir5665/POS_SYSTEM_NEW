import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  formatCurrency,
  formatAmount,
  formatCompactCurrency,
  formatCompactNumber,
  formatCompactAmount,
  setActiveCurrencySymbol,
  getActiveCurrencySymbol,
} from '../utils/formatCurrency'

describe('formatCurrency', () => {
  beforeEach(() => {
    setActiveCurrencySymbol('LKR')
  })

  afterEach(() => {
    setActiveCurrencySymbol('LKR')
  })

  it('formats a whole number correctly with default currency', () => {
    expect(formatCurrency(100)).toBe('LKR 100.00')
  })

  it('formats a decimal amount correctly with default currency', () => {
    expect(formatCurrency(1234.56)).toBe('LKR 1,234.56')
  })

  it('formats a small amount correctly', () => {
    expect(formatCurrency(0.5)).toBe('LKR 0.50')
  })

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('LKR 0.00')
  })

  it('handles string input', () => {
    expect(formatCurrency('50.00')).toBe('LKR 50.00')
  })

  it('returns LKR 0.00 for NaN input', () => {
    expect(formatCurrency('not-a-number')).toBe('LKR 0.00')
  })

  it('returns LKR 0.00 for undefined input', () => {
    expect(formatCurrency(undefined)).toBe('LKR 0.00')
  })

  it('formats large amounts with comma separators', () => {
    const result = formatCurrency(1000000)
    expect(result).toContain('LKR')
    expect(result).toContain('1,000,000.00')
  })

  it('rounds to 2 decimal places', () => {
    expect(formatCurrency(9.999)).toBe('LKR 10.00')
  })

  it('allows explicit currency symbol override', () => {
    expect(formatCurrency(100, '$')).toBe('$ 100.00')
    expect(formatCurrency(25.5, 'EUR')).toBe('EUR 25.50')
  })

  it('formats without currency symbol when symbol is empty string', () => {
    expect(formatCurrency(100, '')).toBe('100.00')
    expect(formatCurrency(1234.56, '')).toBe('1,234.56')
    expect(formatCurrency(0, '')).toBe('0.00')
    expect(formatCurrency('not-a-number', '')).toBe('0.00')
  })

  it('formatAmount formats amounts without any currency prefix', () => {
    expect(formatAmount(1200)).toBe('1,200.00')
    expect(formatAmount('2000.00')).toBe('2,000.00')
    expect(formatAmount(800)).toBe('800.00')
    expect(formatAmount(0)).toBe('0.00')
    expect(formatAmount(null)).toBe('0.00')
  })

  it('dynamically formats with updated active currency symbol', () => {
    setActiveCurrencySymbol('$')
    expect(getActiveCurrencySymbol()).toBe('$')
    expect(formatCurrency(100)).toBe('$ 100.00')

    setActiveCurrencySymbol('LKR')
    expect(getActiveCurrencySymbol()).toBe('LKR')
    expect(formatCurrency(250)).toBe('LKR 250.00')
  })
})

describe('formatCompactCurrency & formatCompactNumber', () => {
  beforeEach(() => {
    setActiveCurrencySymbol('Rs.')
  })

  afterEach(() => {
    setActiveCurrencySymbol('LKR')
  })

  it('formats values below 1,000 normally with 2 decimal places', () => {
    expect(formatCompactCurrency(950)).toBe('Rs. 950.00')
    expect(formatCompactCurrency(0)).toBe('Rs. 0.00')
    expect(formatCompactCurrency(0.5)).toBe('Rs. 0.50')
    expect(formatCompactCurrency(999.99)).toBe('Rs. 999.99')
    expect(formatCompactCurrency('12.5')).toBe('Rs. 12.50')
  })

  it('formats thousands with K suffix and removes unnecessary trailing zeros', () => {
    expect(formatCompactCurrency(1000)).toBe('Rs. 1K')
    expect(formatCompactCurrency(50000)).toBe('Rs. 50K')
    expect(formatCompactCurrency(110000)).toBe('Rs. 110K')
    expect(formatCompactCurrency(1500)).toBe('Rs. 1.5K')
    expect(formatCompactCurrency(1250)).toBe('Rs. 1.25K')
    expect(formatCompactCurrency(999950)).toBe('Rs. 999.95K')
  })

  it('formats millions with M suffix and removes unnecessary trailing zeros', () => {
    expect(formatCompactCurrency(1000000)).toBe('Rs. 1M')
    expect(formatCompactCurrency(1250000)).toBe('Rs. 1.25M')
    expect(formatCompactCurrency(1200000)).toBe('Rs. 1.2M')
    expect(formatCompactCurrency(1256000)).toBe('Rs. 1.26M')
    expect(formatCompactCurrency(50000000)).toBe('Rs. 50M')
  })

  it('formats billions with B suffix and removes unnecessary trailing zeros', () => {
    expect(formatCompactCurrency(1000000000)).toBe('Rs. 1B')
    expect(formatCompactCurrency(1200000000)).toBe('Rs. 1.2B')
    expect(formatCompactCurrency(1250000000)).toBe('Rs. 1.25B')
    expect(formatCompactCurrency(10000000000)).toBe('Rs. 10B')
  })

  it('preserves existing currency symbols such as RS, LKR, $', () => {
    expect(formatCompactCurrency(950, 'RS')).toBe('RS 950.00')
    expect(formatCompactCurrency(1000, 'RS')).toBe('RS 1K')
    expect(formatCompactCurrency(50000, 'RS')).toBe('RS 50K')
    expect(formatCompactCurrency(1000000, 'RS')).toBe('RS 1M')
    expect(formatCompactCurrency(1250000, 'RS')).toBe('RS 1.25M')
    expect(formatCompactCurrency(1000000000, 'RS')).toBe('RS 1B')

    expect(formatCompactCurrency(1250000, 'LKR')).toBe('LKR 1.25M')
    expect(formatCompactCurrency(1250000, '$')).toBe('$ 1.25M')
  })

  it('handles negative numbers correctly', () => {
    expect(formatCompactCurrency(-950)).toBe('Rs. -950.00')
    expect(formatCompactCurrency(-1000)).toBe('Rs. -1K')
    expect(formatCompactCurrency(-50000)).toBe('Rs. -50K')
    expect(formatCompactCurrency(-1250000)).toBe('Rs. -1.25M')
    expect(formatCompactCurrency(-1200000000)).toBe('Rs. -1.2B')
    expect(formatCompactNumber(-1250000)).toBe('-1.25M')
    expect(formatCompactNumber(-1000)).toBe('-1K')
    expect(formatCompactNumber(-950)).toBe('-950.00')
  })

  it('handles zero and zero edge cases correctly', () => {
    expect(formatCompactCurrency(0)).toBe('Rs. 0.00')
    expect(formatCompactCurrency(-0)).toBe('Rs. 0.00')
    expect(formatCompactNumber(0)).toBe('0.00')
    expect(formatCompactAmount(0)).toBe('0.00')
  })

  it('handles string inputs and inputs with commas', () => {
    expect(formatCompactCurrency('950')).toBe('Rs. 950.00')
    expect(formatCompactCurrency('1000')).toBe('Rs. 1K')
    expect(formatCompactCurrency('1,250,000')).toBe('Rs. 1.25M')
  })

  it('handles invalid or empty inputs gracefully', () => {
    expect(formatCompactCurrency(null)).toBe('Rs. 0.00')
    expect(formatCompactCurrency(undefined)).toBe('Rs. 0.00')
    expect(formatCompactCurrency('invalid-amount')).toBe('Rs. 0.00')
    expect(formatCompactNumber(null)).toBe('0.00')
    expect(formatCompactNumber(undefined)).toBe('0.00')
  })

  it('handles tier rollover on boundary rounding (e.g. 999,999 -> 1M)', () => {
    expect(formatCompactCurrency(999999)).toBe('Rs. 1M')
    expect(formatCompactCurrency(999999999)).toBe('Rs. 1B')
  })

  it('formatCompactNumber and formatCompactAmount format without currency prefix by default', () => {
    expect(formatCompactNumber(950)).toBe('950.00')
    expect(formatCompactNumber(1000)).toBe('1K')
    expect(formatCompactNumber(50000)).toBe('50K')
    expect(formatCompactNumber(1000000)).toBe('1M')
    expect(formatCompactNumber(1250000)).toBe('1.25M')
    expect(formatCompactNumber(1000000000)).toBe('1B')

    expect(formatCompactAmount(1250000)).toBe('1.25M')
    expect(formatCompactAmount(950)).toBe('950.00')
  })
})
