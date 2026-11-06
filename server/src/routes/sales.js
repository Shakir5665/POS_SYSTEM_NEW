const express = require('express')
const { body, param } = require('express-validator')
const salesController = require('../controllers/salesController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

const saleValidation = [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isUUID().withMessage('Each item must have a valid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Each item quantity must be >= 1'),
  body('items.*.discount').optional().isFloat({ min: 0 }).withMessage('Item discount must be >= 0'),
  body('payment_method')
    .isIn(['CASH', 'MOBILE_MONEY', 'CARD'])
    .withMessage('Payment method must be CASH, MOBILE_MONEY, or CARD'),
  body('amount_paid').isFloat({ min: 0 }).withMessage('Amount paid must be >= 0'),
  body('discount_amount').optional().isFloat({ min: 0 }).withMessage('Discount must be >= 0'),
  body('customer_id').optional({ nullable: true }).isUUID().withMessage('Customer ID must be a valid UUID'),
]

router.post('/', saleValidation, validate, salesController.createSale)
router.get('/', salesController.listSales)
router.get('/:id', param('id').isUUID(), validate, salesController.getSale)
router.get('/:id/receipt', param('id').isUUID(), validate, salesController.getReceipt)
router.post(
  '/:id/refund',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isUUID(),
  validate,
  salesController.processRefund
)

module.exports = router
