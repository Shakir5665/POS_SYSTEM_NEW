require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const path = require('path')
const fs = require('fs')

const { logger, morganStream } = require('./middleware/logger')
const errorHandler = require('./middleware/errorHandler')
const { authenticate } = require('./middleware/auth')
const salesController = require('./controllers/salesController')
const salesReturnController = require('./controllers/salesReturnController')
const authRoutes = require('./routes/auth')
const productRoutes = require('./routes/products')
const inventoryRoutes = require('./routes/inventory')
const salesRoutes = require('./routes/sales')
const customerRoutes = require('./routes/customers')
const reportRoutes = require('./routes/reports')
const userRoutes = require('./routes/users')
const settingsRoutes = require('./routes/settings')
const paymentRoutes = require('./routes/payments')
const supplierRoutes = require('./routes/suppliers')
const purchaseRoutes = require('./routes/purchases')
const financeRoutes = require('./routes/finance')
const warehouseRoutes = require('./routes/warehouses')
const migrationRoutes = require('./routes/migration')
const brandRoutes = require('./routes/brands')
const variationRoutes = require('./routes/variations')
const transferRoutes = require('./routes/transferRoutes')
const systemAdminRoutes = require('./routes/systemAdmin')

const app = express()

// Security headers
app.use(helmet())

// CORS — allow frontend origin with credentials (for cookies)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
)

// Request parsing. JSON bodies are small (product images are multipart, via
// multer), so keep the default limit low. Migration routes support large JSON payloads
// (up to 150mb) for validating and importing workbooks with large datasets.
const PAYSTACK_WEBHOOK_PATH = '/api/payments/paystack/webhook'
const defaultJsonParser = express.json({
  limit: '100kb',
  verify: (req, _res, buf) => {
    if (req.originalUrl.split('?')[0] === PAYSTACK_WEBHOOK_PATH) req.rawBody = buf.toString()
  },
})
const migrationJsonParser = express.json({
  limit: '150mb',
})

app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/migration')) {
    return migrationJsonParser(req, res, next)
  }
  return defaultJsonParser(req, res, next)
})
app.use(express.urlencoded({ extended: true, limit: '150mb' }))
app.use(cookieParser())

// HTTP request logging
app.use(morgan('combined', { stream: morganStream }))

// Static files for uploaded product images
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

// Health & Readiness Checks
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok', timestamp: new Date().toISOString() },
    message: 'Server is running',
  })
})

app.get(['/health/ready', '/api/health/ready'], async (req, res) => {
  try {
    const prisma = require('./utils/prismaClient')
    await prisma.$queryRaw`SELECT 1`
    res.status(200).json({
      success: true,
      data: { status: 'ready', database: 'connected', timestamp: new Date().toISOString() },
      message: 'Server and database ready',
    })
  } catch (err) {
    res.status(503).json({
      success: false,
      data: { status: 'unhealthy', database: 'disconnected', error: err.message },
      message: 'Database connection failed',
    })
  }
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/system-admin', systemAdminRoutes)
app.use('/api/products', productRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/sales', salesRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/users', userRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/purchases', purchaseRoutes)
app.use('/api/finance', financeRoutes)
app.use('/api/warehouses', warehouseRoutes)
app.use('/api/transfers', transferRoutes)
app.use('/api/migration', migrationRoutes)
app.use('/api/brands', brandRoutes)
app.use('/api/variations', variationRoutes)

// Direct PDF download compatibility routes
app.get('/api/sale-pdf-download/:id', authenticate, salesController.downloadInvoicePdf)
app.get('/api/sale-return-pdf-download/:id', authenticate, salesReturnController.downloadCreditNotePdf)

// Serve frontend SPA in production when client/dist exists
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next()
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  })
})

// Global error handler (must be last)
app.use(errorHandler)

// Start server only when run directly (not when imported in tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`)
  })
}

module.exports = app
