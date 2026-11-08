const prisma = require('./prismaClient')

/**
 * Generate a unique, human-readable purchase order number in format PO-YYYYMMDD-NNNN
 * Follows the same pattern as generateTransactionId.js
 */
async function generatePurchaseNumber() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const prefix = `PO-${year}${month}${day}-`

  const todaysPurchases = await prisma.purchase.findMany({
    where: { purchase_number: { startsWith: prefix } },
    select: { purchase_number: true },
  })

  const lastSequence = todaysPurchases.reduce((max, { purchase_number }) => {
    const seq = parseInt(purchase_number.slice(prefix.length), 10)
    return Number.isNaN(seq) ? max : Math.max(max, seq)
  }, 0)

  const sequence = String(lastSequence + 1).padStart(4, '0')
  return `${prefix}${sequence}`
}

module.exports = generatePurchaseNumber
