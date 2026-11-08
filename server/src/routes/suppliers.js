const express = require('express')
const { body, param, query } = require('express-validator')
const supplierController = require('../controllers/supplierController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

const supplierValidation = [
  body('name').notEmpty().trim().withMessage('Supplier name is required'),
  body('phone').optional({ nullable: true }).trim(),
  body('email').optional({ nullable: true }).isEmail().withMessage('Valid email is required'),
  body('address').optional({ nullable: true }).trim(),
  body('contact_person').optional({ nullable: true }).trim(),
  body('notes').optional({ nullable: true }).trim(),
]

const paymentValidation = [
  body('amount').isFloat({ gt: 0 }).withMessage('Payment amount must be greater than 0'),
  body('payment_method')
    .optional()
    .isIn(['CASH', 'MOBILE_MONEY', 'CARD'])
    .withMessage('Payment method must be CASH, MOBILE_MONEY, or CARD'),
  body('reference').optional({ nullable: true }).trim(),
  body('notes').optional({ nullable: true }).trim(),
]

router.get(
  '/',
  authorize(['ADMIN', 'MANAGER']),
  [query('page').optional().isInt({ min: 1 }), query('per_page').optional().isInt({ min: 1, max: 100 })],
  validate,
  supplierController.list
)

router.get('/:id', authorize(['ADMIN', 'MANAGER']), param('id').isUUID().withMessage('Invalid supplier ID'), validate, supplierController.get)

router.post(
  '/',
  authorize(['ADMIN', 'MANAGER']),
  supplierValidation,
  validate,
  supplierController.create
)

router.put(
  '/:id',
  authorize(['ADMIN', 'MANAGER']),
  [param('id').isUUID().withMessage('Invalid supplier ID'), ...supplierValidation.map((v) => v.optional())],
  validate,
  supplierController.update
)

router.get(
  '/:id/purchases',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isUUID().withMessage('Invalid supplier ID'),
  validate,
  supplierController.getPurchases
)

router.get(
  '/:id/payments',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isUUID().withMessage('Invalid supplier ID'),
  validate,
  supplierController.getPayments
)

router.post(
  '/:id/payments',
  authorize(['ADMIN', 'MANAGER']),
  [param('id').isUUID().withMessage('Invalid supplier ID'), ...paymentValidation],
  validate,
  supplierController.recordPayment
)

router.get(
  '/:id/statement',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isUUID().withMessage('Invalid supplier ID'),
  validate,
  supplierController.getStatement
)

module.exports = router
