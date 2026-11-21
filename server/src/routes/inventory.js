const express = require('express')
const { body, param, query } = require('express-validator')
const inventoryController = require('../controllers/inventoryController')
const stockAdjustmentController = require('../controllers/stockAdjustmentController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

const adjustmentValidation = [
  body('reason').isString().trim().notEmpty().withMessage('Reason is required and cannot be empty'),
  body('notes').optional({ nullable: true }).isString().trim(),
  body('warehouse_id').optional({ nullable: true }).isUUID().withMessage('Warehouse ID must be a valid UUID'),
  body('idempotency_key').optional({ nullable: true }).isString().trim().notEmpty().withMessage('Idempotency key cannot be empty'),
  body('is_legacy_import').custom((val) => {
    if (val !== undefined) {
      throw new Error('Client-supplied is_legacy_import flag is not allowed on live stock adjustments')
    }
    return true
  }),
  body('items').isArray({ min: 1 }).withMessage('Adjustment must contain at least one item'),
  body('items.*.product_id').isUUID().withMessage('Each item must have a valid product UUID'),
  body('items.*.quantity_change')
    .isFloat()
    .custom((val) => Number(val) !== 0)
    .withMessage('Each item quantity change must be a non-zero number'),
  body('items.*.unit').optional().isString().trim(),
  body('items.*.notes').optional({ nullable: true }).isString().trim(),
]

router.get('/', inventoryController.listInventory)
router.get('/low-stock', inventoryController.getLowStock)

// Stock adjustment routes (multi-item transactional adjustment service)
router.get('/adjustments', authorize(['ADMIN', 'MANAGER']), stockAdjustmentController.list)
router.get('/adjustments/:id', authorize(['ADMIN', 'MANAGER']), param('id').isUUID().withMessage('Invalid adjustment ID'), validate, stockAdjustmentController.get)
router.post('/adjustments', authorize(['ADMIN', 'MANAGER']), adjustmentValidation, validate, stockAdjustmentController.create)

router.get('/log/:productId',
  param('productId').isUUID().withMessage('Invalid product ID'),
  validate,
  inventoryController.getInventoryLog
)
router.post(
  '/adjust',
  authorize(['ADMIN', 'MANAGER']),
  [
    body('product_id').isUUID().withMessage('Valid product ID required'),
    body('quantity_change')
      .isFloat()
      .custom((value) => Number(value) !== 0)
      .withMessage('Quantity change must be a non-zero number'),
    body('unit').optional().isString().trim(),
  ],
  validate,
  inventoryController.adjustStock
)
router.post(
  '/restock',
  authorize(['ADMIN', 'MANAGER']),
  [
    body('product_id').isUUID().withMessage('Valid product ID required'),
    body('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be > 0'),
    body('unit').optional().isString().trim(),
  ],
  validate,
  inventoryController.restockProduct
)

module.exports = router
