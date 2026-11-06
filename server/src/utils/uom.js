const { Decimal, toMoney, roundMoney } = require('./money')
const { ValidationError } = require('./errors')

const UOM_CONFIG = {
  COUNT: {
    baseUnit: 'pcs',
    defaultPricingUnit: 'pcs',
    allowedUnits: ['pcs'],
    factors: {
      pcs: new Decimal(1),
    },
    decimals: 0,
  },
  WEIGHT: {
    baseUnit: 'g',
    defaultPricingUnit: 'kg',
    allowedUnits: ['g', 'kg'],
    factors: {
      g: new Decimal(1),
      kg: new Decimal(1000),
    },
    decimals: 3,
  },
  VOLUME: {
    baseUnit: 'ml',
    defaultPricingUnit: 'L',
    allowedUnits: ['ml', 'L'],
    factors: {
      ml: new Decimal(1),
      L: new Decimal(1000),
    },
    decimals: 3,
  },
}

function isValidCategory(category) {
  return Boolean(category && UOM_CONFIG[category])
}

function isValidUnitForCategory(category, unit) {
  const conf = UOM_CONFIG[category]
  if (!conf) return false
  return conf.allowedUnits.includes(unit)
}

function getBaseUnit(category) {
  return UOM_CONFIG[category]?.baseUnit || 'pcs'
}

function getDefaultPricingUnit(category) {
  return UOM_CONFIG[category]?.defaultPricingUnit || 'pcs'
}

function getConversionFactorToBase(category, unit) {
  const conf = UOM_CONFIG[category]
  if (!conf || !conf.factors[unit]) {
    throw new ValidationError(`Invalid unit "${unit}" for category "${category}"`)
  }
  return conf.factors[unit]
}

/**
 * Convert quantity from given unit to base inventory unit (pcs, g, ml).
 * Result is a Decimal with up to 3 decimal places.
 */
function toBaseUnitQuantity(quantity, unit, category = 'COUNT') {
  const factor = getConversionFactorToBase(category, unit)
  const qty = new Decimal(quantity)
  return qty.mul(factor).toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
}

/**
 * Convert quantity from selling unit to pricing unit.
 * E.g., 500 g with pricing unit kg -> 0.5 kg.
 */
function toPricingUnitQuantity(quantity, sellingUnit, pricingUnit, category = 'COUNT') {
  const factorSelling = getConversionFactorToBase(category, sellingUnit)
  const factorPricing = getConversionFactorToBase(category, pricingUnit)
  const qty = new Decimal(quantity)
  // selling_in_base / pricing_in_base = qty * factorSelling / factorPricing
  return qty.mul(factorSelling).div(factorPricing)
}

/**
 * Calculate gross line total based on pricing unit price and round to money.
 */
function calculateLineGross(quantity, sellingUnit, pricingUnit, unitPrice, category = 'COUNT') {
  const pricingQty = toPricingUnitQuantity(quantity, sellingUnit, pricingUnit, category)
  const price = toMoney(unitPrice)
  return roundMoney(pricingQty.mul(price))
}

/**
 * Calculate line cost based on pricing unit cost price and round to money.
 */
function calculateLineCost(quantity, sellingUnit, pricingUnit, costPrice, category = 'COUNT') {
  if (!costPrice) return toMoney(0)
  const pricingQty = toPricingUnitQuantity(quantity, sellingUnit, pricingUnit, category)
  const cost = toMoney(costPrice)
  return roundMoney(pricingQty.mul(cost))
}

/**
 * Validate that a quantity adheres to unit category constraints.
 */
function validateQuantity(quantity, unit, category = 'COUNT') {
  if (quantity === undefined || quantity === null) {
    throw new ValidationError('Quantity is required')
  }

  const dec = new Decimal(quantity)
  if (dec.lte(0)) {
    throw new ValidationError('Quantity must be greater than 0')
  }

  if (category === 'COUNT') {
    if (!dec.isInteger()) {
      throw new ValidationError(`Count products must have integer quantities, got ${quantity}`)
    }
  } else {
    // WEIGHT / VOLUME - at most 3 decimal places
    if (dec.decimalPlaces() > 3) {
      throw new ValidationError(`Quantity cannot have more than 3 decimal places, got ${quantity}`)
    }
  }

  return true
}

module.exports = {
  UOM_CONFIG,
  isValidCategory,
  isValidUnitForCategory,
  getBaseUnit,
  getDefaultPricingUnit,
  getConversionFactorToBase,
  toBaseUnitQuantity,
  toPricingUnitQuantity,
  calculateLineGross,
  calculateLineCost,
  validateQuantity,
}
