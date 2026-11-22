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
router.get('/excel/inspect', migrationController.inspectExcelWorkbook); // Backwards compat for Phase 4B
router.post('/excel/validate', (req, res, next) => {
  if (req.body && req.body.tableName && req.body.rawRows) {
    return universalMigrationController.validatePlan(req, res, next);
  }
  return migrationController.validateExcelWorkbook(req, res, next);
});
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

// Phase 4B Historical Endpoints (Preserved for backwards compatibility)
router.post('/excel/upload', uploadExcel.single('file'), migrationController.inspectExcelWorkbook);
router.post('/excel/dry-run', migrationController.dryRunExcelWorkbook);
router.post('/excel/execute', migrationController.executeExcelImport);
router.get('/excel/rollback-preview/:id', param('id').isUUID(), validate, migrationController.previewRollback);
router.post('/excel/rollback/:id', param('id').isUUID(), validate, migrationController.executeRollback);

module.exports = router;
