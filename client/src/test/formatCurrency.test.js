import { describe, it, expect } from 'vitest'
import { formatCurrency } from '../utils/formatCurrency'

describe('formatCurrency', () => {
  it('formats a whole number correctly', () => {
    expect(formatCurrency(100)).toBe('GH₵ 100.00')
  })

  it('formats a decimal amount correctly', () => {
    expect(formatCurrency(1234.56)).toBe('GH₵ 1,234.56')
  })

  it('formats a small amount correctly', () => {
    expect(formatCurrency(0.5)).toBe('GH₵ 0.50')
  })

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('GH₵ 0.00')
  })

  it('handles string input', () => {
    expect(formatCurrency('50.00')).toBe('GH₵ 50.00')
  })

  it('returns GH₵ 0.00 for NaN input', () => {
    expect(formatCurrency('not-a-number')).toBe('GH₵ 0.00')
  })

  it('returns GH₵ 0.00 for undefined input', () => {
    expect(formatCurrency(undefined)).toBe('GH₵ 0.00')
  })

  it('formats large amounts with comma separators', () => {
    const result = formatCurrency(1000000)
    expect(result).toContain('GH₵')
    expect(result).toContain('1,000,000.00')
  })

  it('rounds to 2 decimal places', () => {
    expect(formatCurrency(9.999)).toBe('GH₵ 10.00')
  })
})
