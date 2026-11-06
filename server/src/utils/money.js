const { Prisma } = require('@prisma/client')

const Decimal = Prisma.Decimal

/**
 * Exact money arithmetic. Amounts are Decimal values (decimal.js, the type
 * Prisma returns for Decimal columns), so 0.1 + 0.2 is exactly 0.3.
 * Convert to plain numbers only at the edges: API responses and Paystack.
 */

/** Convert a number, numeric string or Decimal to a Decimal (null/undefined → 0). */
function toMoney(value) {
  return new Decimal(value ?? 0)
}

/** Round to 2 decimal places, halves away from zero (2.495 → 2.50). */
function roundMoney(value) {
  return toMoney(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/** Whole pesewas (smallest GHS unit), as Paystack expects. */
function toPesewas(value) {
  return toMoney(value).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

module.exports = { Decimal, toMoney, roundMoney, toPesewas }
