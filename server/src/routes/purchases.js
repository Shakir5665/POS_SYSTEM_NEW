const express = require('express')
const { body, param, query } = require('express-validator')
const purchaseController = require('../controllers/purchaseController')
const purchaseReturnController = require('../controllers/purchaseReturnController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

const purchaseReturnValidation = [
  body('purchase_id').isString().trim().notEmpty().withMessage('Valid purchase ID is required'),
  body('reason').isString().trim().notEmpty().withMessage('Return reason is required'),
  body('settlement_status').optional().isIn(['PENDING', 'COMPLETED', 'CREDITED']).withMessage('Invalid settlement status'),
  body('settlement_method').optional().isIn(['CASH', 'MOBILE_MONEY', 'CARD', 'CREDIT']).withMessage('Invalid settlement method'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.purchase_item_id').isString().trim().notEmpty().withMessage('Valid purchase item ID required'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Returned quantity must be > 0'),
  body('notes').optional({ nullable: true }).isString().trim(),
  body('idempotency_key').optional({ nullable: true }).isString().trim(),
]

const purchaseValidation = [
  body('supplier_id').isString().trim().notEmpty().withMessage('Valid supplier ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isString().trim().notEmpty().withMessage('Valid product ID is required'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than 0'),
  body('items.*.unit_cost').isFloat({ min: 0 }).withMessage('Unit cost must be non-negative'),
  body('items.*.unit').optional().notEmpty().trim(),
  body('initial_payment').optional().isFloat({ min: 0 }).withMessage('Initial payment must be non-negative'),
  body('payment_method').optional().isIn(['CASH', 'MOBILE_MONEY', 'CARD']).withMessage('Payment method must be CASH, MOBILE_MONEY, or CARD'),
  body('status').optional().isIn(['ORDERED', 'RECEIVED']).withMessage('Status must be ORDERED or RECEIVED'),
  body('warehouse_id').optional({ nullable: true }).isString().trim().notEmpty().withMessage('Warehouse ID must be a valid ID'),
  body('purchase_date').optional({ nullable: true }).isISO8601().withMessage('Purchase date must be a valid ISO 8601 date'),
  body('is_legacy_import').custom((val) => {
    if (val !== undefined) {
      throw new Error('Client-supplied is_legacy_import flag is not allowed on purchase orders')
    }
    return true
  }),
  body('notes').optional({ nullable: true }).trim(),
]

// Purchase Returns endpoints (must be before /:id)
router.get('/returns', authorize(['ADMIN', 'MANAGER']), purchaseReturnController.list)
router.get('/returns/:id', authorize(['ADMIN', 'MANAGER']), param('id').isString().trim().notEmpty().withMessage('Invalid return ID'), validate, purchaseReturnController.get)
router.post('/returns', authorize(['ADMIN', 'MANAGER']), purchaseReturnValidation, validate, purchaseReturnController.create)
router.patch(
  '/returns/:id/settle',
  authorize(['ADMIN', 'MANAGER']),
  [
    param('id').isString().trim().notEmpty().withMessage('Invalid return ID'),
    body('settlement_status').optional().isIn(['COMPLETED', 'CREDITED']).withMessage('Status must be COMPLETED or CREDITED'),
    body('settlement_method').optional().isIn(['CASH', 'MOBILE_MONEY', 'CARD', 'CREDIT']).withMessage('Invalid settlement method'),
    body('notes').optional({ nullable: true }).isString().trim(),
  ],
  validate,
  purchaseReturnController.settle
)

router.get(
  '/',
  authorize(['ADMIN', 'MANAGER']),
  [query('page').optional().isInt({ min: 1 }), query('per_page').optional().isInt({ min: 1, max: 100 })],
  validate,
  purchaseController.list
)

router.get('/:id/eligibility', authorize(['ADMIN', 'MANAGER']), param('id').isString().trim().notEmpty().withMessage('Invalid purchase ID'), validate, purchaseReturnController.getEligibility)
router.get('/:id', authorize(['ADMIN', 'MANAGER']), param('id').isString().trim().notEmpty().withMessage('Invalid purchase ID'), validate, purchaseController.get)

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
  param('id').isString().trim().notEmpty().withMessage('Invalid purchase ID'),
  validate,
  purchaseController.receive
)

router.post(
  '/:id/cancel',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isString().trim().notEmpty().withMessage('Invalid purchase ID'),
  validate,
  purchaseController.cancel
)

module.exports = router
