const express = require('express')
const { body, param, query } = require('express-validator')
const purchaseController = require('../controllers/purchaseController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

const purchaseValidation = [
  body('supplier_id').isUUID().withMessage('Valid supplier ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isUUID().withMessage('Valid product ID is required'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than 0'),
  body('items.*.unit_cost').isFloat({ min: 0 }).withMessage('Unit cost must be non-negative'),
  body('items.*.unit').optional().notEmpty().trim(),
  body('initial_payment').optional().isFloat({ min: 0 }).withMessage('Initial payment must be non-negative'),
  body('payment_method').optional().isIn(['CASH', 'MOBILE_MONEY', 'CARD']).withMessage('Payment method must be CASH, MOBILE_MONEY, or CARD'),
  body('status').optional().isIn(['ORDERED', 'RECEIVED']).withMessage('Status must be ORDERED or RECEIVED'),
  body('notes').optional({ nullable: true }).trim(),
]

router.get(
  '/',
  authorize(['ADMIN', 'MANAGER']),
  [query('page').optional().isInt({ min: 1 }), query('per_page').optional().isInt({ min: 1, max: 100 })],
  validate,
  purchaseController.list
)

router.get('/:id', authorize(['ADMIN', 'MANAGER']), param('id').isUUID().withMessage('Invalid purchase ID'), validate, purchaseController.get)

router.post(
  '/',
  authorize(['ADMIN', 'MANAGER']),
  purchaseValidation,
  validate,
  purchaseController.create
)

router.post(
  '/:id/receive',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isUUID().withMessage('Invalid purchase ID'),
  validate,
  purchaseController.receive
)

router.post(
  '/:id/cancel',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isUUID().withMessage('Invalid purchase ID'),
  validate,
  purchaseController.cancel
)

module.exports = router
