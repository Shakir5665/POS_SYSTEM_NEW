const express = require('express')
const { param, query } = require('express-validator')
const migrationController = require('../controllers/migrationController')
const { authenticate, authorize } = require('../middleware/auth')
const validate = require('../middleware/validate')

const router = express.Router()

router.use(authenticate)
router.use(authorize(['ADMIN']))

router.get('/status', migrationController.getMigrationStatus)
router.get('/batches', migrationController.listBatches)
router.get('/batches/:id', param('id').isUUID(), validate, migrationController.getBatch)
router.get('/issues', migrationController.listIssues)

module.exports = router
