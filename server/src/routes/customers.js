const express = require('express')
const { body, param, query } = require('express-validator')
const customerController = require('../controllers/customerController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

const customerValidation = [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('phone').optional({ nullable: true }).trim(),
  body('email').optional({ nullable: true }).isEmail().withMessage('Valid email required'),
  body('address').optional({ nullable: true }).trim(),
]

const paymentValidation = [
  body('amount').isFloat({ gt: 0 }).withMessage('Payment amount must be greater than 0'),
  body('payment_method').optional().isIn(['CASH', 'MOBILE_MONEY', 'CARD']).withMessage('Payment method must be CASH, MOBILE_MONEY, or CARD'),
  body('reference').optional({ nullable: true }).trim(),
  body('notes').optional({ nullable: true }).trim(),
]

router.get(
  '/',
  [query('page').optional().isInt({ min: 1 }), query('per_page').optional().isInt({ min: 1, max: 100 })],
  validate,
  customerController.listCustomers
)
router.get('/:id', param('id').isUUID().withMessage('Invalid customer ID'), validate, customerController.getCustomer)
router.post('/', authorize(['ADMIN', 'MANAGER', 'CASHIER']), customerValidation, validate, customerController.createCustomer)
router.put(
  '/:id',
  authorize(['ADMIN', 'MANAGER']),
  [param('id').isUUID().withMessage('Invalid customer ID'), ...customerValidation.map((v) => v.optional())],
  validate,
  customerController.updateCustomer
)
router.get(
  '/:id/purchases',
  param('id').isUUID().withMessage('Invalid customer ID'),
  validate,
  customerController.getCustomerPurchases
)
router.get(
  '/:id/credit-sales',
  param('id').isUUID().withMessage('Invalid customer ID'),
  validate,
  customerController.getCustomerCreditSales
)
router.get(
  '/:id/payments',
  param('id').isUUID().withMessage('Invalid customer ID'),
  validate,
  customerController.getCustomerPayments
)
router.post(
  '/:id/payments',
  authorize(['ADMIN', 'MANAGER', 'CASHIER']),
  param('id').isUUID().withMessage('Invalid customer ID'),
  paymentValidation,
  validate,
  customerController.recordCustomerPayment
)
router.get(
  '/:id/statement',
  param('id').isUUID().withMessage('Invalid customer ID'),
  validate,
  customerController.getCustomerAccountStatement
)

module.exports = router
