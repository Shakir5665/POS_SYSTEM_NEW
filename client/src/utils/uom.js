export const UOM_CONFIG = {
  COUNT: {
    label: 'Count (Pieces)',
    baseUnit: 'pcs',
    defaultPricingUnit: 'pcs',
    units: [
      { value: 'pcs', label: 'Pieces (pcs)', factor: 1, step: 1, min: 1 },
    ],
  },
  WEIGHT: {
    label: 'Weight (Grams / Kilograms)',
    baseUnit: 'g',
    defaultPricingUnit: 'kg',
    units: [
      { value: 'g', label: 'Grams (g)', factor: 1, step: 1, min: 0.001 },
      { value: 'kg', label: 'Kilograms (kg)', factor: 1000, step: 0.05, min: 0.001 },
    ],
  },
  VOLUME: {
    label: 'Volume (Millilitres / Litres)',
    baseUnit: 'ml',
    defaultPricingUnit: 'L',
    units: [
      { value: 'ml', label: 'Millilitres (ml)', factor: 1, step: 1, min: 0.001 },
      { value: 'L', label: 'Litres (L)', factor: 1000, step: 0.05, min: 0.001 },
    ],
  },
}

export function getUnitsForCategory(category = 'COUNT') {
  return UOM_CONFIG[category]?.units || UOM_CONFIG.COUNT.units
}

export function getBaseUnit(category = 'COUNT') {
  return UOM_CONFIG[category]?.baseUnit || 'pcs'
}

export function getDefaultPricingUnit(category = 'COUNT') {
  return UOM_CONFIG[category]?.defaultPricingUnit || 'pcs'
}

export function getUnitFactor(category = 'COUNT', unit = 'pcs') {
  const units = getUnitsForCategory(category)
  const found = units.find((u) => u.value === unit)
  return found ? found.factor : 1
}

export function getUnitStep(category = 'COUNT', unit = 'pcs') {
  const units = getUnitsForCategory(category)
  const found = units.find((u) => u.value === unit)
  return found ? found.step : 1
}

export function getUnitMin(category = 'COUNT', unit = 'pcs') {
  const units = getUnitsForCategory(category)
  const found = units.find((u) => u.value === unit)
  return found ? found.min : 1
}

/**
 * Convert quantity from selling unit to base unit
 */
export function toBaseQuantity(quantity, unit, category = 'COUNT') {
  const factor = getUnitFactor(category, unit)
  return Number((Number(quantity || 0) * factor).toFixed(3))
}

/**
 * Format quantity with unit label nicely
 */
export function formatQuantityWithUnit(quantity, unit) {
  const num = Number(quantity || 0)
  const formatted = num % 1 === 0 ? num.toString() : num.toFixed(3).replace(/\.?0+$/, '')
  return `${formatted} ${unit || 'pcs'}`
}

/**
 * Calculate line total using exact 2-decimal rounded half up math
 */
export function calculateLineTotal({
  quantity,
  unit,
  pricingUnit,
  unitPrice,
  category = 'COUNT',
  discount = 0,
}) {
  const qty = Number(quantity || 0)
  const price = Number(unitPrice || 0)
  const disc = Number(discount || 0)

  const factorSelling = getUnitFactor(category, unit || pricingUnit || 'pcs')
  const factorPricing = getUnitFactor(category, pricingUnit || unit || 'pcs')

  // pricing units ratio
  const pricingQty = (qty * factorSelling) / factorPricing
  const grossInPesewas = Math.round(pricingQty * price * 100)
  const discountInPesewas = Math.round(disc * 100)
  const totalInPesewas = Math.max(0, grossInPesewas - discountInPesewas)

  return (totalInPesewas / 100).toFixed(2)
}
