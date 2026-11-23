const express = require('express')
const { body, param, query } = require('express-validator')
const brandController = require('../controllers/brandController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

const brandValidation = [
  body('name').notEmpty().trim().withMessage('Brand name is required'),
  body('description').optional({ nullable: true }).isString().trim(),
]

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('per_page').optional().isInt({ min: 1, max: 100 }).withMessage('Per page must be 1-100'),
    query('search').optional().isString().trim(),
  ],
  validate,
  brandController.listBrands
)

router.get(
  '/:id',
  param('id').isString().trim().notEmpty().withMessage('Invalid brand ID'),
  validate,
  brandController.getBrand
)

router.post(
  '/',
  authorize(['ADMIN', 'MANAGER']),
  brandValidation,
  validate,
  brandController.createBrand
)

router.put(
  '/:id',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isString().trim().notEmpty().withMessage('Invalid brand ID'),
  brandValidation,
  validate,
  brandController.updateBrand
)

router.delete(
  '/:id',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isString().trim().notEmpty().withMessage('Invalid brand ID'),
  validate,
  brandController.deleteBrand
)

module.exports = router
