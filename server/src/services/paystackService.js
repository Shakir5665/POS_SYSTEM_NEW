const crypto = require('crypto')
const https = require('https')
const { AppError } = require('../utils/errors')
const { toPesewas } = require('../utils/money')

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY

function paystackRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    if (!PAYSTACK_SECRET) {
      return reject(new AppError('Paystack secret key is not configured', 500))
    }

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new AppError('Invalid response from Paystack', 502))
        }
      })
    })

    req.on('error', (err) => reject(new AppError(`Paystack request failed: ${err.message}`, 502)))

    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

/**
 * Initialize a Paystack transaction.
 * @param {object} params
 * @param {string} params.email     - Customer email (required by Paystack)
 * @param {number} params.amount    - Amount in GHS (will be converted to pesewas)
 * @param {string} params.reference - Unique transaction reference
 * @param {object} [params.metadata] - Optional metadata
 */
async function initializeTransaction({ email, amount, reference, metadata = {} }) {
  const body = {
    email,
    // Paystack expects amount in the smallest currency unit (pesewas for GHS)
    amount: toPesewas(amount),
    reference,
    currency: 'GHS',
    metadata,
  }

  const result = await paystackRequest('POST', '/transaction/initialize', body)

  if (!result.status) {
    throw new AppError(result.message || 'Failed to initialize Paystack transaction', 502)
  }

  return result.data // { authorization_url, access_code, reference }
}

/**
 * Verify a Paystack transaction by reference.
 * @param {string} reference
 * @returns {object} Paystack transaction data
 */
async function verifyTransaction(reference) {
  const result = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`)

  if (!result.status) {
    throw new AppError(result.message || 'Failed to verify Paystack transaction', 502)
  }

  return result.data // { status, amount, reference, channel, ... }
}

/**
 * Ask Paystack to refund a completed transaction in full. Paystack processes
 * refunds asynchronously and reports the outcome by webhook.
 * @param {string} reference - Reference of the original transaction
 * @returns {object} Paystack refund data
 */
async function createRefund(reference) {
  const result = await paystackRequest('POST', '/refund', { transaction: reference })

  if (!result.status) {
    throw new AppError(result.message || 'Paystack refused the refund', 502)
  }

  return result.data
}

/**
 * Validate Paystack webhook signature: an HMAC-SHA512 of the raw body,
 * keyed with the secret key, as hex. Compared in constant time so response
 * timing can't reveal how much of a forged signature was right.
 * @param {string} body   - Raw request body string
 * @param {string} signature - x-paystack-signature header value
 * @returns {boolean}
 */
function validateWebhookSignature(body, signature) {
  if (!PAYSTACK_SECRET || typeof body !== 'string' || typeof signature !== 'string') return false

  const expected = Buffer.from(crypto.createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex'))
  const received = Buffer.from(signature)
  // timingSafeEqual throws on different lengths; a wrong length is simply invalid
  if (received.length !== expected.length) return false
  return crypto.timingSafeEqual(received, expected)
}

module.exports = { initializeTransaction, verifyTransaction, createRefund, validateWebhookSignature }
