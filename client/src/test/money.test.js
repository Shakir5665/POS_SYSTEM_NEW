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
    expect(cartTotals([{ price: '19.99', quantity: 1 }], 0, '12.5')).toMatchObject({
      subtotal: 19.99,
      discount: 0,
      tax: 2.5,
      total: 22.49,
      distinct_items: 1,
      total_quantity: 1,
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
    expect(cartTotals(items, 3.49, 15)).toMatchObject({ subtotal: 23.49, discount: 3.49, tax: 3, total: 23 })
  })

  it('caps the cart discount at the subtotal', () => {
    const { discount, total } = cartTotals([{ price: 5, quantity: 1 }], 8, 0)
    expect(discount).toBe(5)
    expect(total).toBe(0)
  })
})

describe('cartTotals matches the server', () => {
  it('charges 0.02 tax on GH₵ 0.30 at 5% (0.015 rounds up), like the server test', () => {
    expect(cartTotals([{ price: '0.30', quantity: 1 }], 0, '5')).toMatchObject({ subtotal: 0.3, discount: 0, tax: 0.02, total: 0.32 })
  })

  it('calculates weight items: 500g at 20.00/kg gives 10.00 subtotal', () => {
    const items = [
      {
        price: 20.0,
        quantity: 500,
        unit: 'g',
        pricing_unit: 'kg',
        unit_category: 'WEIGHT',
      },
    ]
    expect(cartTotals(items, 0, 0)).toMatchObject({ subtotal: 10, discount: 0, tax: 0, total: 10 })
  })

  it('calculates volume items: 250ml at 5.00/L gives 1.25 subtotal', () => {
    const items = [
      {
        price: 5.0,
        quantity: 250,
        unit: 'ml',
        pricing_unit: 'L',
        unit_category: 'VOLUME',
      },
    ]
    expect(cartTotals(items, 0, 0)).toMatchObject({ subtotal: 1.25, discount: 0, tax: 0, total: 1.25 })
  })
})

describe('Batch 3 & Batch 4: Predefined discounts and cart presentation', () => {
  it('calculates usual subtotal, predefined discount, and selling subtotal when predefined discount is active', () => {
    // Sugar: Usual = 120, Our = 100, Qty = 2 -> Predefined discount = 40, Selling Subtotal = 200
    const items = [
      {
        price: 100, // our price
        usual_price: 120,
        our_price: 100,
        quantity: 2,
        apply_predefined_discount: true,
      },
    ]

    const totals = cartTotals(items, 15, 0) // 15 additional cart discount
    expect(totals.usual_subtotal).toBe(240)
    expect(totals.predefined_discounts).toBe(40)
    expect(totals.subtotal).toBe(200) // 200 is base subtotal
    expect(totals.discount).toBe(15) // additional cart discount
    expect(totals.total).toBe(185) // 200 - 15 = 185
    expect(totals.distinct_items).toBe(1)
    expect(totals.total_quantity).toBe(2)
  })

  it('uses a cart-line our_price override for this transaction only', () => {
    const items = [
      {
        price: 100,
        usual_price: 120,
        our_price: 90,
        quantity: 2,
        apply_predefined_discount: true,
      },
    ]

    const totals = cartTotals(items, 0, 0)
    expect(totals.usual_subtotal).toBe(240)
    expect(totals.predefined_discounts).toBe(60)
    expect(totals.subtotal).toBe(180)
    expect(totals.total).toBe(180)
  })

  it('calculates at Usual Price when predefined discount is toggled off', () => {
    const items = [
      {
        price: 100,
        usual_price: 120,
        our_price: 100,
        quantity: 2,
        apply_predefined_discount: false, // checkbox UNCHECKED -> sell at usual price 120
      },
    ]

    const totals = cartTotals(items, 0, 0)
    expect(totals.usual_subtotal).toBe(240)
    expect(totals.predefined_discounts).toBe(0)
    expect(totals.subtotal).toBe(240)
    expect(totals.total).toBe(240)
  })

  it('correctly tracks distinct items count vs total quantity for multiple products', () => {
    const items = [
      { price: 10, quantity: 3 }, // 3 units
      { price: 20, quantity: 2 }, // 2 units
      { price: 50, quantity: 1 }, // 1 unit
    ]

    const totals = cartTotals(items, 0, 0)
    expect(totals.distinct_items).toBe(3) // 3 distinct items
    expect(totals.total_quantity).toBe(6) // 6 total units
  })
})
