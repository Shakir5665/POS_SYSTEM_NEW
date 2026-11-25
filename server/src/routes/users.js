const express = require('express')
const { body, param } = require('express-validator')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')
const userController = require('../controllers/userController')

const router = express.Router()

router.use(authenticate)

router.get('/', authorize(['ADMIN', 'SUPERADMIN']), userController.listUsers)

router.post(
  '/',
  authorize(['SUPERADMIN']),
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
  authorize(['ADMIN', 'SUPERADMIN']),
  [
    param('id').isString().trim().notEmpty().withMessage('Invalid user ID'),
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
  authorize(['ADMIN', 'SUPERADMIN']),
  [param('id').isString().trim().notEmpty().withMessage('Invalid user ID'), body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')],
  validate,
  userController.resetPassword
)

router.post('/:id/unlock', authorize(['ADMIN', 'SUPERADMIN']), [param('id').isString().trim().notEmpty().withMessage('Invalid user ID')], validate, userController.unlockUser)

// Permanently delete staff user (Superadmin only)
router.delete('/:id', authorize(['ADMIN', 'SUPERADMIN']), [param('id').isString().trim().notEmpty().withMessage('Invalid user ID')], validate, userController.deleteUser)

module.exports = router
