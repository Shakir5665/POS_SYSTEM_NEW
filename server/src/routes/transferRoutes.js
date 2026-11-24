const express = require('express')
const router = express.Router()
const transferController = require('../controllers/transferController')
const { authenticate, authorize } = require('../middleware/auth')

router.use(authenticate)

router.get('/', authorize(['ADMIN', 'MANAGER', 'CASHIER']), transferController.listTransfers)
router.get('/:id', authorize(['ADMIN', 'MANAGER', 'CASHIER']), transferController.getTransferById)
router.post('/', authorize(['ADMIN', 'MANAGER']), transferController.createTransfer)
router.post('/:id/receive', authorize(['ADMIN', 'MANAGER']), transferController.receiveTransfer)

module.exports = router
