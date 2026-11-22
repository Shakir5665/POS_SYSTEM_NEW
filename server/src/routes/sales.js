const express = require('express')
const { body, param } = require('express-validator')
const salesController = require('../controllers/salesController')
const salesReturnController = require('../controllers/salesReturnController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

const salesReturnValidation = [
  body('sale_id').isUUID().withMessage('Valid sale ID required'),
  body('reason').isString().trim().notEmpty().withMessage('Return reason is required'),
  body('refund_method').optional().isIn(['CASH', 'MOBILE_MONEY', 'CARD', 'CREDIT']).withMessage('Invalid refund method'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.sale_item_id').isUUID().withMessage('Valid sale item ID required'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Returned quantity must be > 0'),
  body('items.*.restock').optional().isBoolean(),
  body('items.*.disposition').optional().isString().trim(),
  body('notes').optional({ nullable: true }).isString().trim(),
  body('idempotency_key').optional({ nullable: true }).isString().trim(),
]

const saleValidation = [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isUUID().withMessage('Each item must have a valid product ID'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Each item quantity must be > 0'),
  body('items.*.unit').optional().isString().trim(),
  body('items.*.predefined_discount_applied').optional().isBoolean().withMessage('Predefined discount applied must be boolean'),
  body('items.*.our_price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Our price must be >= 0'),
  body('items.*.discount').optional().isFloat({ min: 0 }).withMessage('Item discount must be >= 0'),
  body('payment_method')
    .isIn(['CASH', 'MOBILE_MONEY', 'CARD', 'CREDIT'])
    .withMessage('Payment method must be CASH, MOBILE_MONEY, CARD, or CREDIT'),
  body('amount_paid').optional().isFloat({ min: 0 }).withMessage('Amount paid must be >= 0'),
  body('discount_amount').optional().isFloat({ min: 0 }).withMessage('Discount must be >= 0'),
  body('customer_id').optional({ nullable: true }).isUUID().withMessage('Customer ID must be a valid UUID'),
  body('warehouse_id').optional({ nullable: true }).isUUID().withMessage('Warehouse ID must be a valid UUID'),
  body('sale_date').optional({ nullable: true }).isISO8601().withMessage('Sale date must be a valid ISO 8601 date').custom((val, { req }) => {
    if (val && req.user && req.user.role !== 'ADMIN') {
      throw new Error('Backdating sales transactions requires ADMIN authorization')
    }
    return true
  }),
  body('is_legacy_import').custom((val) => {
    if (val !== undefined) {
      throw new Error('Client-supplied is_legacy_import flag is not allowed on live sales')
    }
    return true
  }),
]

// Sales Returns endpoints (must be before /:id)
router.get('/returns', authorize(['ADMIN', 'MANAGER']), salesReturnController.list)
router.get('/returns/:id', authorize(['ADMIN', 'MANAGER']), param('id').isUUID(), validate, salesReturnController.get)
router.post('/returns', authorize(['ADMIN', 'MANAGER']), salesReturnValidation, validate, salesReturnController.create)

router.post('/', saleValidation, validate, salesController.createSale)
router.get('/', salesController.listSales)
router.get('/:id/eligibility', authorize(['ADMIN', 'MANAGER']), param('id').isUUID(), validate, salesReturnController.getEligibility)
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
