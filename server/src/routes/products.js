const express = require('express')
const { body, param, query } = require('express-validator')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const productController = require('../controllers/productController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

// Multer config for product image uploads
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'products')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('Only image files are allowed'))
  },
})

const productValidation = [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('sku').notEmpty().trim().withMessage('SKU is required'),
  body('category_id').notEmpty().isUUID().withMessage('Valid category ID is required'),
  body('price').isFloat({ min: 0.01 }).withMessage('Price must be greater than 0'),
  body('cost_price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Cost price must be >= 0'),
  body('quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be >= 0'),
  body('low_stock_threshold').optional().isInt({ min: 0 }).withMessage('Threshold must be >= 0'),
]

const categoryValidation = [
  body('name').notEmpty().trim().withMessage('Category name is required'),
]

// All routes require authentication
router.use(authenticate)

// Category routes — must be before /:id to avoid being shadowed
router.get('/categories', productController.listCategories)
router.post('/categories', authorize(['ADMIN', 'MANAGER']), categoryValidation, validate, productController.createCategory)
router.put('/categories/:id', authorize(['ADMIN', 'MANAGER']), param('id').isUUID().withMessage('Invalid category ID'), categoryValidation, validate, productController.updateCategory)

// Product routes
router.get('/', listProductsValidation(), validate, productController.listProducts)
router.get('/barcode/:code', productController.getProductByBarcode)
router.get('/:id', param('id').isUUID().withMessage('Invalid product ID'), validate, productController.getProduct)
router.post('/', authorize(['ADMIN', 'MANAGER']), upload.single('image'), productValidation, validate, productController.createProduct)
router.put('/:id', authorize(['ADMIN', 'MANAGER']), upload.single('image'), updateProductValidation(), validate, productController.updateProduct)
router.delete('/:id', authorize(['ADMIN']), param('id').isUUID().withMessage('Invalid product ID'), validate, productController.deleteProduct)

function listProductsValidation() {
  return [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('per_page').optional().isInt({ min: 1, max: 100 }).withMessage('Per page must be 1-100'),
  ]
}

function updateProductValidation() {
  return [
    param('id').isUUID().withMessage('Invalid product ID'),
    body('price').optional().isFloat({ min: 0.01 }).withMessage('Price must be > 0'),
    body('cost_price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Cost price must be >= 0'),
    body('quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be >= 0'),
    body('low_stock_threshold').optional().isInt({ min: 0 }).withMessage('Threshold must be >= 0'),
  ]
}

module.exports = router
