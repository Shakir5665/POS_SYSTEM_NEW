const express = require('express')
const { body } = require('express-validator')
const rateLimit = require('express-rate-limit')
const authController = require('../controllers/authController')
const { authenticate } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // The test suite logs in far more than 10 times a minute
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many requests. Please try again in a minute.',
    },
  },
})

const loginValidation = [
  body('username').notEmpty().trim().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
]

router.post('/login', authLimiter, loginValidation, validate, authController.login)
router.post('/logout', authenticate, authController.logout)
router.post('/refresh', authLimiter, authController.refresh)
router.get('/me', authenticate, authController.getMe)

module.exports = router
