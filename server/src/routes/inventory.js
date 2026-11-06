const express = require('express')
const { body, param } = require('express-validator')
const inventoryController = require('../controllers/inventoryController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

router.get('/', inventoryController.listInventory)
router.get('/low-stock', inventoryController.getLowStock)
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
