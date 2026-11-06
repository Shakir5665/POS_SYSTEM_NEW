const {
  isValidCategory,
  isValidUnitForCategory,
  getBaseUnit,
  getDefaultPricingUnit,
  toBaseUnitQuantity,
  toPricingUnitQuantity,
  calculateLineGross,
  calculateLineCost,
  validateQuantity,
} = require('../utils/uom')
const { Decimal } = require('../utils/money')

describe('UOM Engine', () => {
  describe('validation helpers', () => {
    it('validates categories', () => {
      expect(isValidCategory('COUNT')).toBe(true)
      expect(isValidCategory('WEIGHT')).toBe(true)
      expect(isValidCategory('VOLUME')).toBe(true)
      expect(isValidCategory('INVALID')).toBe(false)
    })

    it('validates allowed units per category', () => {
      expect(isValidUnitForCategory('COUNT', 'pcs')).toBe(true)
      expect(isValidUnitForCategory('COUNT', 'kg')).toBe(false)

      expect(isValidUnitForCategory('WEIGHT', 'g')).toBe(true)
      expect(isValidUnitForCategory('WEIGHT', 'kg')).toBe(true)
      expect(isValidUnitForCategory('WEIGHT', 'ml')).toBe(false)

      expect(isValidUnitForCategory('VOLUME', 'ml')).toBe(true)
      expect(isValidUnitForCategory('VOLUME', 'L')).toBe(true)
      expect(isValidUnitForCategory('VOLUME', 'g')).toBe(false)
    })

    it('provides correct default units', () => {
      expect(getBaseUnit('COUNT')).toBe('pcs')
      expect(getBaseUnit('WEIGHT')).toBe('g')
      expect(getBaseUnit('VOLUME')).toBe('ml')

      expect(getDefaultPricingUnit('COUNT')).toBe('pcs')
      expect(getDefaultPricingUnit('WEIGHT')).toBe('kg')
      expect(getDefaultPricingUnit('VOLUME')).toBe('L')
    })
  })

  describe('quantity conversion to base unit', () => {
    it('converts count units', () => {
      const base = toBaseUnitQuantity(5, 'pcs', 'COUNT')
      expect(base.equals(new Decimal(5))).toBe(true)
    })

    it('converts weight units to grams', () => {
      // 500 g -> 500 g
      expect(toBaseUnitQuantity(500, 'g', 'WEIGHT').toNumber()).toBe(500)
      // 1.5 kg -> 1500 g
      expect(toBaseUnitQuantity(1.5, 'kg', 'WEIGHT').toNumber()).toBe(1500)
      // 0.25 kg -> 250 g
      expect(toBaseUnitQuantity(0.25, 'kg', 'WEIGHT').toNumber()).toBe(250)
    })

    it('converts volume units to millilitres', () => {
      // 750 ml -> 750 ml
      expect(toBaseUnitQuantity(750, 'ml', 'VOLUME').toNumber()).toBe(750)
      // 2 L -> 2000 ml
      expect(toBaseUnitQuantity(2, 'L', 'VOLUME').toNumber()).toBe(2000)
    })
  })

  describe('pricing and line total calculation', () => {
    it('calculates gross for weight: 500g at 20.00 per kg = 10.00', () => {
      const gross = calculateLineGross(500, 'g', 'kg', '20.00', 'WEIGHT')
      expect(gross.toString()).toBe('10')
    })

    it('calculates gross for weight: 1.5kg at 20.00 per kg = 30.00', () => {
      const gross = calculateLineGross(1.5, 'kg', 'kg', '20.00', 'WEIGHT')
      expect(gross.toString()).toBe('30')
    })

    it('calculates cost for weight: 500g at 15.00 per kg = 7.50', () => {
      const cost = calculateLineCost(500, 'g', 'kg', '15.00', 'WEIGHT')
      expect(cost.toString()).toBe('7.5')
    })

    it('calculates line gross for count: 3 pcs at 15.00 per pcs = 45.00', () => {
      const gross = calculateLineGross(3, 'pcs', 'pcs', '15.00', 'COUNT')
      expect(gross.toString()).toBe('45')
    })
  })

  describe('quantity step validation', () => {
    it('rejects non-integer for COUNT', () => {
      expect(() => validateQuantity(1.5, 'pcs', 'COUNT')).toThrow()
      expect(validateQuantity(2, 'pcs', 'COUNT')).toBe(true)
    })

    it('accepts decimals for WEIGHT and VOLUME up to 3 places', () => {
      expect(validateQuantity(0.125, 'kg', 'WEIGHT')).toBe(true)
      expect(validateQuantity(500, 'g', 'WEIGHT')).toBe(true)
      expect(() => validateQuantity(0.1234, 'kg', 'WEIGHT')).toThrow()
    })

    it('rejects zero or negative quantities', () => {
      expect(() => validateQuantity(0, 'pcs', 'COUNT')).toThrow()
      expect(() => validateQuantity(-1, 'kg', 'WEIGHT')).toThrow()
    })
  })
})
