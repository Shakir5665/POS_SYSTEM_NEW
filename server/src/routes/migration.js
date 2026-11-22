'use strict';

const express = require('express');
const { param } = require('express-validator');
const migrationController = require('../controllers/migrationController');
const universalMigrationController = require('../controllers/universalMigrationController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const uploadExcel = require('../middleware/uploadExcel');

const router = express.Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

// ---------------------------------------------------------------------------
// Universal Single-Table Excel Migration Endpoints (Section 16)
// ---------------------------------------------------------------------------
router.get('/excel/tables', universalMigrationController.listTables);
router.get('/excel/templates/:table', universalMigrationController.downloadTemplate);
router.get('/excel/schema/:table', universalMigrationController.getTableSchema);
router.post('/excel/inspect', uploadExcel.single('file'), universalMigrationController.inspectFile);
router.post('/excel/validate', universalMigrationController.validatePlan);
router.post('/excel/jobs', universalMigrationController.createJob);
router.post('/excel/jobs/:id/confirm', universalMigrationController.confirmJob);
router.get('/excel/jobs/:id/errors', universalMigrationController.getErrors);
router.post('/excel/jobs/:id/cancel', universalMigrationController.cancelImportJob);
router.get('/excel/jobs/:id', universalMigrationController.getJob);
router.get('/excel/jobs', universalMigrationController.listJobs);

// ---------------------------------------------------------------------------
// Existing / Legacy Migration Batch & Diagnostics Endpoints (Preserved per Rule 8-11)
// ---------------------------------------------------------------------------
router.get('/status', migrationController.getMigrationStatus);
router.get('/batches', migrationController.listBatches);
router.get('/batches/:id', param('id').isUUID(), validate, migrationController.getBatch);
router.get('/issues', migrationController.listIssues);

module.exports = router;

module.exports = router;
