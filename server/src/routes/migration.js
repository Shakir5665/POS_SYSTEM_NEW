'use strict';

const express = require('express');
const { param } = require('express-validator');
const migrationController = require('../controllers/migrationController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const uploadExcel = require('../middleware/uploadExcel');

const router = express.Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

// Batch & Issue exploration
router.get('/status', migrationController.getMigrationStatus);
router.get('/batches', migrationController.listBatches);
router.get('/batches/:id', param('id').isUUID(), validate, migrationController.getBatch);
router.get('/issues', migrationController.listIssues);

// Phase 4B Excel historical import endpoints
router.post('/excel/upload', uploadExcel.single('file'), migrationController.inspectExcelWorkbook);
router.get('/excel/inspect', migrationController.inspectExcelWorkbook);
router.post('/excel/validate', migrationController.validateExcelWorkbook);
router.post('/excel/dry-run', migrationController.dryRunExcelWorkbook);
router.post('/excel/execute', migrationController.executeExcelImport);
router.get('/excel/rollback-preview/:id', param('id').isUUID(), validate, migrationController.previewRollback);
router.post('/excel/rollback/:id', param('id').isUUID(), validate, migrationController.executeRollback);

module.exports = router;
