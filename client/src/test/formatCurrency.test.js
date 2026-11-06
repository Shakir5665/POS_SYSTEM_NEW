import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { formatCurrency, formatAmount, setActiveCurrencySymbol, getActiveCurrencySymbol } from '../utils/formatCurrency'

describe('formatCurrency', () => {
  beforeEach(() => {
    setActiveCurrencySymbol('LKR')
  })

  afterEach(() => {
    setActiveCurrencySymbol('GH₵')
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
