const prisma = require('./prismaClient')

/**
 * Generate a unique human-readable sales return number in format SR-YYYYMMDD-NNNN
 */
async function generateSalesReturnNumber() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const prefix = `SR-${year}${month}${day}-`

  const todaysReturns = await prisma.salesReturn.findMany({
    where: { return_number: { startsWith: prefix } },
    select: { return_number: true },
  })

  const lastSequence = todaysReturns.reduce((max, { return_number }) => {
    if (!return_number) return max
    const seq = parseInt(return_number.slice(prefix.length), 10)
    return Number.isNaN(seq) ? max : Math.max(max, seq)
  }, 0)

  const sequence = String(lastSequence + 1).padStart(4, '0')
  return `${prefix}${sequence}`
}

module.exports = generateSalesReturnNumber
