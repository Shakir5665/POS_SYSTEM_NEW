const express = require('express')
const { authenticate, authorize } = require('../middleware/auth')
const settingsController = require('../controllers/settingsController')

const router = express.Router()

router.use(authenticate)

router.get('/', settingsController.getSettings)
router.put('/', authorize(['ADMIN']), settingsController.updateSettings)

module.exports = router
