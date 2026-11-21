const prisma = require('./prismaClient')

/**
 * Generate a unique human-readable adjustment number in format ADJ-YYYYMMDD-NNNN
 * Sequential per day to prevent conflicts.
 */
async function generateAdjustmentNumber() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const prefix = `ADJ-${year}${month}${day}-`

  const todaysAdjustments = await prisma.stockAdjustment.findMany({
    where: { adjustment_number: { startsWith: prefix } },
    select: { adjustment_number: true },
  })

  const lastSequence = todaysAdjustments.reduce((max, { adjustment_number }) => {
    if (!adjustment_number) return max
    const seq = parseInt(adjustment_number.slice(prefix.length), 10)
    return Number.isNaN(seq) ? max : Math.max(max, seq)
  }, 0)

  const sequence = String(lastSequence + 1).padStart(4, '0')
  return `${prefix}${sequence}`
}

module.exports = generateAdjustmentNumber
