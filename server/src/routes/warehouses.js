const express = require('express')
const { body, param, query } = require('express-validator')
const warehouseController = require('../controllers/warehouseController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)
router.use(authorize(['ADMIN', 'MANAGER']))

const createValidation = [
  body('code').isString().trim().notEmpty().withMessage('Warehouse code is required'),
  body('name').isString().trim().notEmpty().withMessage('Warehouse name is required'),
  body('address').optional({ nullable: true }).isString().trim(),
  body('is_default').optional().isBoolean().withMessage('is_default must be a boolean'),
  body('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
]

const updateValidation = [
  param('id').isString().trim().notEmpty().withMessage('Invalid warehouse ID'),
  body('code').optional().isString().trim().notEmpty().withMessage('Warehouse code cannot be empty'),
  body('name').optional().isString().trim().notEmpty().withMessage('Warehouse name cannot be empty'),
  body('address').optional({ nullable: true }).isString().trim(),
  body('is_default').optional().isBoolean().withMessage('is_default must be a boolean'),
  body('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
]

router.get('/default', warehouseController.getDefault)
router.get('/', [query('is_active').optional().isBoolean()], validate, warehouseController.list)
router.get('/:id', param('id').isString().trim().notEmpty().withMessage('Invalid warehouse ID'), validate, warehouseController.get)
router.post('/', createValidation, validate, warehouseController.create)
router.put('/:id', updateValidation, validate, warehouseController.update)

module.exports = router
