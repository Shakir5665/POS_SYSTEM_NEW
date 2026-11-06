const express = require('express')
const { body, param } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')
const { initialize, verify, webhook, listUnmatched, refundUnmatched } = require('../controllers/paystackController')

const router = express.Router()

// Webhook must use raw body — register before express.json() parses it.
// We capture rawBody in app.js via a verify callback on express.json().
router.post(
  '/paystack/webhook',
  webhook
)

// All routes below require authentication
router.use(authenticate)

router.post(
  '/paystack/initialize',
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('email').isEmail().withMessage('A valid email is required for card/mobile money payments'),
    validate,
  ],
  initialize
)

router.get(
  '/paystack/verify/:reference',
  [
    param('reference').notEmpty().withMessage('Reference is required'),
    validate,
  ],
  verify
)

// Paystack charges with no sale (e.g. the browser closed after paying)
router.get('/paystack/unmatched', authorize(['ADMIN', 'MANAGER']), listUnmatched)
router.post(
  '/paystack/unmatched/:id/refund',
  authorize(['ADMIN', 'MANAGER']),
  [param('id').isUUID().withMessage('Valid payment ID required'), validate],
  refundUnmatched
)

module.exports = router
