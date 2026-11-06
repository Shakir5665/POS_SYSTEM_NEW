import { describe, it, expect } from 'vitest'
import {
  UOM_CONFIG,
  getUnitsForCategory,
  getBaseUnit,
  getDefaultPricingUnit,
  toBaseQuantity,
  formatQuantityWithUnit,
  calculateLineTotal,
} from '../utils/uom'

describe('client/utils/uom', () => {
  it('returns valid units and defaults for each category', () => {
    expect(getBaseUnit('COUNT')).toBe('pcs')
    expect(getBaseUnit('WEIGHT')).toBe('g')
    expect(getBaseUnit('VOLUME')).toBe('ml')

    expect(getDefaultPricingUnit('WEIGHT')).toBe('kg')
    expect(getDefaultPricingUnit('VOLUME')).toBe('L')

    expect(getUnitsForCategory('WEIGHT').map((u) => u.value)).toEqual(['g', 'kg'])
    expect(getUnitsForCategory('VOLUME').map((u) => u.value)).toEqual(['ml', 'L'])
  })

  it('converts to base quantity correctly', () => {
    expect(toBaseQuantity(1.5, 'kg', 'WEIGHT')).toBe(1500)
    expect(toBaseQuantity(500, 'g', 'WEIGHT')).toBe(500)
    expect(toBaseQuantity(2, 'L', 'VOLUME')).toBe(2000)
    expect(toBaseQuantity(750, 'ml', 'VOLUME')).toBe(750)
    expect(toBaseQuantity(3, 'pcs', 'COUNT')).toBe(3)
  })

  it('formats quantities with units nicely', () => {
    expect(formatQuantityWithUnit(500, 'g')).toBe('500 g')
    expect(formatQuantityWithUnit(1.5, 'kg')).toBe('1.5 kg')
    expect(formatQuantityWithUnit(2, 'pcs')).toBe('2 pcs')
  })

  it('calculates line total using exact rounding', () => {
    // 500 g at 20.00 / kg = 10.00
    const total1 = calculateLineTotal({
      quantity: 500,
      unit: 'g',
      pricingUnit: 'kg',
      unitPrice: 20.0,
      category: 'WEIGHT',
    })
    expect(total1).toBe('10.00')

    // 1.5 kg at 20.00 / kg = 30.00
    const total2 = calculateLineTotal({
      quantity: 1.5,
      unit: 'kg',
      pricingUnit: 'kg',
      unitPrice: 20.0,
      category: 'WEIGHT',
    })
    expect(total2).toBe('30.00')

    // 250 ml at 5.00 / L = 1.25
    const total3 = calculateLineTotal({
      quantity: 250,
      unit: 'ml',
      pricingUnit: 'L',
      unitPrice: 5.0,
      category: 'VOLUME',
    })
    expect(total3).toBe('1.25')
  })
})
