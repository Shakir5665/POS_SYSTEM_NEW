const express = require('express')
const { body } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')
const controller = require('../controllers/systemAdminController')

const router = express.Router()
router.use(authenticate)
router.use(authorize(['SUPERADMIN']))

router.get('/status', controller.getStatus)
router.put(
  '/access',
  [body('access_enabled').isBoolean().withMessage('Access status must be true or false')],
  validate,
  controller.setAccess
)
router.patch(
  '/account',
  [
    body('current_password').isString().notEmpty().withMessage('Current password is required'),
    body('username').optional().isString().trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3 to 50 characters'),
    body('password').optional().isString().isLength({ min: 12 }).withMessage('New password must be at least 12 characters'),
    body().custom((_, { req }) => {
      if (req.body.username === undefined && req.body.password === undefined) {
        throw new Error('Enter a new username or password')
      }
      return true
    }),
  ],
  validate,
  controller.updateAccount
)

module.exports = router
