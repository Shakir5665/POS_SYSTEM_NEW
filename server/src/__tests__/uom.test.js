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
      expect(isValidCategory('LENGTH')).toBe(true)
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

      expect(isValidUnitForCategory('LENGTH', 'm')).toBe(true)
      expect(isValidUnitForCategory('LENGTH', 'cm')).toBe(true)
      expect(isValidUnitForCategory('LENGTH', 'yd')).toBe(true)
      expect(isValidUnitForCategory('LENGTH', 'kg')).toBe(false)
    })

    it('provides correct default units', () => {
      expect(getBaseUnit('COUNT')).toBe('pcs')
      expect(getBaseUnit('WEIGHT')).toBe('g')
      expect(getBaseUnit('VOLUME')).toBe('ml')
      expect(getBaseUnit('LENGTH')).toBe('m')

      expect(getDefaultPricingUnit('COUNT')).toBe('pcs')
      expect(getDefaultPricingUnit('WEIGHT')).toBe('kg')
      expect(getDefaultPricingUnit('VOLUME')).toBe('L')
      expect(getDefaultPricingUnit('LENGTH')).toBe('m')
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

    it('converts length units to metres', () => {
      // 2.5 m -> 2.5 m
      expect(toBaseUnitQuantity(2.5, 'm', 'LENGTH').toNumber()).toBe(2.5)
      // 150 cm -> 1.5 m
      expect(toBaseUnitQuantity(150, 'cm', 'LENGTH').toNumber()).toBe(1.5)
      // 1000 mm -> 1 m
      expect(toBaseUnitQuantity(1000, 'mm', 'LENGTH').toNumber()).toBe(1)
      // 2 yd -> 1.829 m (0.9144 * 2 = 1.8288 rounded to 1.829)
      expect(toBaseUnitQuantity(2, 'yd', 'LENGTH').toNumber()).toBe(1.829)
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

    it('calculates line gross for length: 2.5m at 50.00 per m = 125.00', () => {
      const gross = calculateLineGross(2.5, 'm', 'm', '50.00', 'LENGTH')
      expect(gross.toString()).toBe('125')
    })

    it('calculates line gross for length: 50cm at 100.00 per m = 50.00', () => {
      const gross = calculateLineGross(50, 'cm', 'm', '100.00', 'LENGTH')
      expect(gross.toString()).toBe('50')
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

    it('accepts decimals for LENGTH up to 3 places', () => {
      expect(validateQuantity(1.75, 'm', 'LENGTH')).toBe(true)
      expect(validateQuantity(25.5, 'cm', 'LENGTH')).toBe(true)
      expect(() => validateQuantity(1.1234, 'm', 'LENGTH')).toThrow()
    })

    it('rejects zero or negative quantities', () => {
      expect(() => validateQuantity(0, 'pcs', 'COUNT')).toThrow()
      expect(() => validateQuantity(-1, 'kg', 'WEIGHT')).toThrow()
    })
  })
})
