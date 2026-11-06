const prisma = require('./prismaClient')

/**
 * Generate a human-readable transaction ID in format TXN-YYYYMMDD-NNNN
 * The sequence continues from the highest ID issued today, so deleted sales
 * never cause an ID to be handed out twice. Concurrent sales can still pick
 * the same next number; the caller retries on the unique constraint.
 */
async function generateTransactionId() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const prefix = `TXN-${year}${month}${day}-`

  const todaysIds = await prisma.sale.findMany({
    where: { transaction_id: { startsWith: prefix } },
    select: { transaction_id: true },
  })

  const lastSequence = todaysIds.reduce((max, { transaction_id }) => {
    const seq = parseInt(transaction_id.slice(prefix.length), 10)
    return Number.isNaN(seq) ? max : Math.max(max, seq)
  }, 0)

  const sequence = String(lastSequence + 1).padStart(4, '0')
  return `${prefix}${sequence}`
}

module.exports = generateTransactionId
