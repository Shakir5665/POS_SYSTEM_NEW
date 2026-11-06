import { describe, it, expect } from 'vitest'
import { toPesewas, cartTotals } from '../utils/money'

describe('toPesewas', () => {
  it('converts amounts that are inexact as floats', () => {
    expect(toPesewas(0.1)).toBe(10)
    expect(toPesewas('19.99')).toBe(1999)
    expect(toPesewas(1.15)).toBe(115) // 1.15 * 100 = 114.99999999999999
  })

  it('treats empty or invalid input as zero', () => {
    expect(toPesewas('')).toBe(0)
    expect(toPesewas(undefined)).toBe(0)
    expect(toPesewas('abc')).toBe(0)
  })
})

describe('cartTotals', () => {
  it('adds 3 × GH₵ 0.10 to exactly GH₵ 0.30', () => {
    const { subtotal, total } = cartTotals([{ price: 0.1, quantity: 3 }], 0, 0)
    expect(subtotal).toBe(0.3) // floats give 0.30000000000000004
    expect(total).toBe(0.3)
  })

  it('rounds tax once, halves up, matching the server', () => {
    // 19.99 × 12.5% = 2.49875 → 2.50
    expect(cartTotals([{ price: '19.99', quantity: 1 }], 0, '12.5')).toEqual({
      subtotal: 19.99,
      discount: 0,
      tax: 2.5,
      total: 22.49,
    })
    // 0.10 × 5% = 0.005 → 0.01 (exact half rounds up)
    expect(cartTotals([{ price: 0.1, quantity: 1 }], 0, 5).tax).toBe(0.01)
  })

  it('applies line and cart discounts before tax', () => {
    const items = [
      { price: 10, quantity: 2, discount: 1.5 },
      { price: 4.99, quantity: 1 },
    ]
    // subtotal 18.50 + 4.99 = 23.49; minus 3.49 = 20.00; tax 15% = 3.00
    expect(cartTotals(items, 3.49, 15)).toEqual({ subtotal: 23.49, discount: 3.49, tax: 3, total: 23 })
  })

  it('caps the cart discount at the subtotal', () => {
    const { discount, total } = cartTotals([{ price: 5, quantity: 1 }], 8, 0)
    expect(discount).toBe(5)
    expect(total).toBe(0)
  })
})

describe('cartTotals matches the server', () => {
  it('charges 0.02 tax on GH₵ 0.30 at 5% (0.015 rounds up), like the server test', () => {
    expect(cartTotals([{ price: '0.30', quantity: 1 }], 0, '5')).toEqual({ subtotal: 0.3, discount: 0, tax: 0.02, total: 0.32 })
  })
})
