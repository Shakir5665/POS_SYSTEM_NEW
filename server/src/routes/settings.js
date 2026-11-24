const express = require('express')
const multer = require('multer')
const { authenticate, authorize } = require('../middleware/auth')
const settingsController = require('../controllers/settingsController')

const router = express.Router()

// Multer memory storage for logo uploads up to 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, SVG, GIF) under 10MB are allowed'))
    }
  },
})

router.use(authenticate)

router.get('/', settingsController.getSettings)
router.put('/', authorize(['ADMIN']), settingsController.updateSettings)
router.post('/logo', authorize(['ADMIN']), upload.single('logo'), settingsController.uploadLogo)
router.delete('/logo', authorize(['ADMIN']), settingsController.removeLogo)

module.exports = router
