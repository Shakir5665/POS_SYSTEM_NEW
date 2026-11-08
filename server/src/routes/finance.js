const express = require('express')
const { body, param, query } = require('express-validator')
const financeController = require('../controllers/financeController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)

// Category validation
const categoryValidation = [
  body('name').notEmpty().trim().withMessage('Category name is required'),
  body('description').optional({ nullable: true }).trim(),
]

// Expense validation
const expenseValidation = [
  body('category_id').isUUID().withMessage('Valid category ID is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
  body('payment_method').optional().isIn(['CASH', 'MOBILE_MONEY', 'CARD']).withMessage('Payment method must be CASH, MOBILE_MONEY, or CARD'),
  body('expense_date').optional().isISO8601().withMessage('Valid expense date is required'),
  body('payee').optional({ nullable: true }).trim(),
  body('reference').optional({ nullable: true }).trim(),
  body('notes').optional({ nullable: true }).trim(),
]

// Asset validation
const assetValidation = [
  body('name').notEmpty().trim().withMessage('Asset name is required'),
  body('category').notEmpty().trim().withMessage('Category is required'),
  body('acquisition_cost').isFloat({ min: 0 }).withMessage('Acquisition cost must be non-negative'),
  body('current_value').optional().isFloat({ min: 0 }).withMessage('Current value must be non-negative'),
  body('acquisition_date').optional().isISO8601().withMessage('Valid acquisition date is required'),
  body('status').optional().isIn(['ACTIVE', 'IN_REPAIR', 'DISPOSED', 'DEPRECIATED']).withMessage('Invalid asset status'),
  body('asset_code').optional({ nullable: true }).trim(),
  body('location').optional({ nullable: true }).trim(),
  body('notes').optional({ nullable: true }).trim(),
]

// Owner transaction validation
const ownerTxValidation = [
  body('type').isIn(['CONTRIBUTION', 'WITHDRAWAL']).withMessage('Type must be CONTRIBUTION or WITHDRAWAL'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
  body('payment_method').optional().isIn(['CASH', 'MOBILE_MONEY', 'CARD']).withMessage('Payment method must be CASH, MOBILE_MONEY, or CARD'),
  body('transaction_date').optional().isISO8601().withMessage('Valid date is required'),
  body('reference').optional({ nullable: true }).trim(),
  body('notes').optional({ nullable: true }).trim(),
]

// Routes
router.get('/summary', authorize(['ADMIN', 'MANAGER']), financeController.getSummary)

// Expense categories
router.get('/categories', authorize(['ADMIN', 'MANAGER']), financeController.listExpenseCategories)
router.post('/categories', authorize(['ADMIN', 'MANAGER']), categoryValidation, validate, financeController.createExpenseCategory)

// Operating expenses
router.get('/expenses', authorize(['ADMIN', 'MANAGER']), financeController.listExpenses)
router.post('/expenses', authorize(['ADMIN', 'MANAGER']), expenseValidation, validate, financeController.createExpense)
router.delete('/expenses/:id', authorize(['ADMIN', 'MANAGER']), param('id').isUUID().withMessage('Invalid expense ID'), validate, financeController.deleteExpense)

// Business assets
router.get('/assets', authorize(['ADMIN', 'MANAGER']), financeController.listAssets)
router.get('/assets/:id', authorize(['ADMIN', 'MANAGER']), param('id').isUUID().withMessage('Invalid asset ID'), validate, financeController.getAsset)
router.post('/assets', authorize(['ADMIN', 'MANAGER']), assetValidation, validate, financeController.createAsset)
router.put('/assets/:id', authorize(['ADMIN', 'MANAGER']), [param('id').isUUID().withMessage('Invalid asset ID'), ...assetValidation.map((v) => v.optional())], validate, financeController.updateAsset)
router.delete('/assets/:id', authorize(['ADMIN', 'MANAGER']), param('id').isUUID().withMessage('Invalid asset ID'), validate, financeController.deleteAsset)

// Owner transactions
router.get('/owner-transactions', authorize(['ADMIN']), financeController.listOwnerTransactions)
router.post('/owner-transactions', authorize(['ADMIN']), ownerTxValidation, validate, financeController.createOwnerTransaction)

module.exports = router
