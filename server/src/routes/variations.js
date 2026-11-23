const express = require('express')
const { body, param, query } = require('express-validator')
const variationController = require('../controllers/variationController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

const variationValidation = [
  body('name').notEmpty().trim().withMessage('Variation name is required'),
  body('values').isArray({ min: 1 }).withMessage('Values array is required and must contain at least one value'),
]

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('per_page').optional().isInt({ min: 1, max: 100 }).withMessage('Per page must be 1-100'),
    query('search').optional().isString().trim(),
  ],
  validate,
  variationController.listVariations
)

router.get(
  '/:id',
  param('id').isString().trim().notEmpty().withMessage('Invalid variation ID'),
  validate,
  variationController.getVariation
)

router.post(
  '/',
  authorize(['ADMIN', 'MANAGER']),
  variationValidation,
  validate,
  variationController.createVariation
)

router.put(
  '/:id',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isString().trim().notEmpty().withMessage('Invalid variation ID'),
  [
    body('name').optional().notEmpty().trim().withMessage('Variation name cannot be empty'),
    body('values').optional().isArray({ min: 1 }).withMessage('Values must be a non-empty array'),
  ],
  validate,
  variationController.updateVariation
)

router.delete(
  '/:id',
  authorize(['ADMIN', 'MANAGER']),
  param('id').isString().trim().notEmpty().withMessage('Invalid variation ID'),
  validate,
  variationController.deleteVariation
)

module.exports = router
