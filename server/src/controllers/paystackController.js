const { v4: uuidv4 } = require('uuid')
const { initializeTransaction, verifyTransaction, validateWebhookSignature } = require('../services/paystackService')
const { ValidationError } = require('../utils/errors')
const { logger } = require('../middleware/logger')
const { toMoney } = require('../utils/money')
const { completePaystackRefund, failPaystackRefund } = require('../services/salesService')
const paystackPayments = require('../services/paystackPaymentService')

async function initialize(req, res, next) {
  try {
    const { amount, email, metadata } = req.body

    // Generate a unique reference for this payment attempt
    const reference = `${paystackPayments.POS_REFERENCE_PREFIX}${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`

    const data = await initializeTransaction({ email, amount, reference, metadata })

    res.status(200).json({
      success: true,
      data: {
        reference: data.reference,
        authorization_url: data.authorization_url,
        access_code: data.access_code,
      },
      message: 'Transaction initialized',
    })
  } catch (err) {
    next(err)
  }
}

async function verify(req, res, next) {
  try {
    const { reference } = req.params
    if (!reference) throw new ValidationError('Reference is required')

    const data = await verifyTransaction(reference)

    res.status(200).json({
      success: true,
      data: {
        status: data.status,           // 'success' | 'failed' | 'abandoned'
        amount: toMoney(data.amount).div(100).toNumber(), // pesewas back to GHS
        reference: data.reference,
        channel: data.channel,         // 'card' | 'mobile_money' etc.
        paid_at: data.paid_at,
      },
      message: 'Transaction verified',
    })
  } catch (err) {
    next(err)
  }
}

async function webhook(req, res) {
  const signature = req.headers['x-paystack-signature']
  const rawBody = req.rawBody

  if (!validateWebhookSignature(rawBody, signature)) {
    logger.warn('Paystack webhook: invalid signature')
    return res.sendStatus(400)
  }

  const { event, data = {} } = req.body

  try {
    if (event === 'charge.success') {
      // Record the charge so a payment whose sale was never created
      // (e.g. the browser closed after paying) shows up as unmatched
      const record = await paystackPayments.recordCharge(data)
      logger.info(`Paystack webhook: charge.success for ${data.reference}${record ? (record.sale_id ? ', linked to sale' : ', no sale yet') : ', not a DASHPOS charge'}`)
    } else if (event === 'refund.processed' || event === 'refund.failed') {
      const reference = refundTransactionReference(data)
      if (!reference) {
        logger.warn(`Paystack webhook: ${event} without a transaction reference`)
      } else if (event === 'refund.processed') {
        const refunded = (await completePaystackRefund(reference)) || (await paystackPayments.markRefunded(reference))
        logger.info(`Paystack webhook: refund.processed for ${reference}${refunded ? ', refund recorded' : ', nothing to update'}`)
      } else {
        const cleared = (await failPaystackRefund(reference)) || (await paystackPayments.clearRefundRequest(reference))
        logger.warn(`Paystack webhook: refund.failed for ${reference}${cleared ? ', refund request cleared' : ''}`)
      }
    }
  } catch (err) {
    // A non-200 makes Paystack retry; handling the same event twice is safe
    logger.error(`Paystack webhook: failed to handle ${event}: ${err.message}`)
    return res.sendStatus(500)
  }

  res.sendStatus(200)
}

async function listUnmatched(req, res, next) {
  try {
    const data = await paystackPayments.listUnmatched()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function refundUnmatched(req, res, next) {
  try {
    const data = await paystackPayments.refundUnmatched(req.params.id)
    res.status(202).json({
      success: true,
      data,
      message: 'Refund requested. It completes when Paystack confirms it.',
    })
  } catch (err) {
    next(err)
  }
}

// Refund events carry the original transaction's reference; accept the
// documented field and the nested form in case the payload shape differs
function refundTransactionReference(data) {
  return data.transaction_reference || data.transaction?.reference || null
}

module.exports = { initialize, verify, webhook, listUnmatched, refundUnmatched }
