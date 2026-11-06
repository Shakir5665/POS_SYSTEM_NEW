const express = require('express')
const { body, param } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')
const userController = require('../controllers/userController')

const router = express.Router()

router.use(authenticate)
router.use(authorize(['ADMIN']))

router.get('/', userController.listUsers)

router.post(
  '/',
  [
    body('username').notEmpty().trim().withMessage('Username is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('full_name').notEmpty().trim().withMessage('Full name is required'),
    body('role').isIn(['ADMIN', 'MANAGER', 'CASHIER']).withMessage('Valid role required'),
  ],
  validate,
  userController.createUser
)

// Update role, active status, full_name, email
router.put(
  '/:id',
  [
    param('id').isUUID(),
    body('role').optional().isIn(['ADMIN', 'MANAGER', 'CASHIER']),
    body('is_active').optional().isBoolean(),
    body('full_name').optional().notEmpty().trim(),
    body('email').optional().isEmail(),
  ],
  validate,
  userController.updateUser
)

// Reset password (also unlocks the account)
router.post(
  '/:id/reset-password',
  [param('id').isUUID(), body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')],
  validate,
  userController.resetPassword
)

router.post('/:id/unlock', [param('id').isUUID()], validate, userController.unlockUser)

module.exports = router
