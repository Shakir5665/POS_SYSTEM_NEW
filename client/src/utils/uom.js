export const UOM_CONFIG = {
  COUNT: {
    label: 'Count (Pieces, Units, Packs…)',
    baseUnit: 'pcs',
    defaultPricingUnit: 'pcs',
    units: [
      { value: 'pcs', label: 'Pieces (pcs)', factor: 1, step: 1, min: 1 },
      { value: 'unit', label: 'Units (units)', factor: 1, step: 1, min: 1 },
      { value: 'item', label: 'Items (items)', factor: 1, step: 1, min: 1 },
      { value: 'pack', label: 'Packs (pack)', factor: 1, step: 1, min: 1 },
      { value: 'box', label: 'Boxes (box)', factor: 1, step: 1, min: 1 },
      { value: 'bottle', label: 'Bottles (bottle)', factor: 1, step: 1, min: 1 },
      { value: 'can', label: 'Cans (can)', factor: 1, step: 1, min: 1 },
      { value: 'carton', label: 'Cartons (carton)', factor: 1, step: 1, min: 1 },
      { value: 'bag', label: 'Bags (bag)', factor: 1, step: 1, min: 1 },
      { value: 'pair', label: 'Pairs (pair)', factor: 1, step: 1, min: 1 },
      { value: 'set', label: 'Sets (set)', factor: 1, step: 1, min: 1 },
      { value: 'roll', label: 'Rolls (roll)', factor: 1, step: 1, min: 1 },
      { value: 'bundle', label: 'Bundles (bundle)', factor: 1, step: 1, min: 1 },
      { value: 'doz', label: 'Dozens (doz)', factor: 12, step: 1, min: 1 },
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

export function getUnitCategory(unit) {
  if (['g', 'kg'].includes(unit)) return 'WEIGHT'
  if (['ml', 'L'].includes(unit)) return 'VOLUME'
  return 'COUNT'
}

export function getAllUnitsFlat() {
  return [
    ...UOM_CONFIG.WEIGHT.units,
    ...UOM_CONFIG.VOLUME.units,
    ...UOM_CONFIG.COUNT.units,
  ]
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
 * Convert quantity from given unit to target base unit.
 * If targetBaseUnit is omitted, defaults to category canonical baseUnit.
 */
export function toBaseQuantity(quantity, unit, category = 'COUNT', targetBaseUnit = null) {
  const target = targetBaseUnit || getBaseUnit(category)
  if (unit === target) {
    return Number(Number(quantity || 0).toFixed(3))
  }
  const catUnit = getUnitCategory(unit) || category
  const catTarget = getUnitCategory(target) || category
  const factorUnit = getUnitFactor(catUnit, unit)
  const factorTarget = getUnitFactor(catTarget, target)
  return Number(((Number(quantity || 0) * factorUnit) / factorTarget).toFixed(3))
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

/**
 * Calculate available stock for a cart item in its current selling unit,
 * taking into account any OTHER rows in the cart that share the same product_id.
 */
export function getAvailableStockForItem(item, allCartItems = [], productData = null) {
  if (!item) return 0
  const rawAvail = productData?.quantity ?? item.quantity_available
  if (rawAvail === undefined || rawAvail === null) {
    return Infinity
  }
  const availBase = Number(rawAvail)
  if (availBase <= 0) return 0

  const category = item.unit_category || 'COUNT'
  const unit = item.unit || item.pricing_unit || item.base_unit || 'pcs'
  const baseUnit = item.base_unit || getBaseUnit(category)
  const factorUnit = getUnitFactor(category, unit)
  const factorBase = getUnitFactor(category, baseUnit)

  // Calculate base quantity reserved by OTHER items in cart with the same product_id
  let otherUsedBase = 0
  if (Array.isArray(allCartItems)) {
    for (const other of allCartItems) {
      if (other && other !== item && other.product_id === item.product_id) {
        otherUsedBase += toBaseQuantity(other.quantity, other.unit, other.unit_category, other.base_unit)
      }
    }
  }

  const remainingBase = Math.max(0, availBase - otherUsedBase)
  return Number(((remainingBase * factorBase) / factorUnit).toFixed(3))
}
