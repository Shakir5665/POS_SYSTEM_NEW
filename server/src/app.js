require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const path = require('path')

const { logger, morganStream } = require('./middleware/logger')
const errorHandler = require('./middleware/errorHandler')
const authRoutes = require('./routes/auth')
const productRoutes = require('./routes/products')
const inventoryRoutes = require('./routes/inventory')
const salesRoutes = require('./routes/sales')
const customerRoutes = require('./routes/customers')
const reportRoutes = require('./routes/reports')
const userRoutes = require('./routes/users')
const settingsRoutes = require('./routes/settings')
const paymentRoutes = require('./routes/payments')

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
// multer), so keep the limit low. Only the Paystack webhook needs the exact
// raw body, to check its signature.
const PAYSTACK_WEBHOOK_PATH = '/api/payments/paystack/webhook'
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buf) => {
    if (req.originalUrl.split('?')[0] === PAYSTACK_WEBHOOK_PATH) req.rawBody = buf.toString()
  },
}))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// HTTP request logging
app.use(morgan('combined', { stream: morganStream }))

// Static files for uploaded product images
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok', timestamp: new Date().toISOString() },
    message: 'Server is running',
  })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/sales', salesRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/users', userRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/payments', paymentRoutes)

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
