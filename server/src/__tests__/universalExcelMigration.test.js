'use strict';

/**
 * Universal Single-Table Excel Migration System Test Suite
 *
 * Covers:
 * 1. Automatic Schema & Table Detection
 * 2. Field Value Handling (Explicit UUID, Generated UUID, Timestamps, Enums, Decimals, Booleans, Nulls, Blank Cells, Formulas)
 * 3. Database Foreign Key Validation
 * 4. Import Modes (Insert Only, Update Existing, Upsert)
 * 5. Stock Safety & Historical Transaction Invariants
 * 6. Security (Authentication, Role Authorization, Restricted Tables, Protected Columns)
 * 7. Job Lifecycle, Progress Polling, Auditing, and CSV Error Reports
 * 8. Real PostgreSQL Integration against Isolated Database
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const app = require('../app');
const prisma = require('../utils/prismaClient');
const { detectTable } = require('../services/migration/tableDetector');
const { validateWorkbookData, isFormulaInjection } = require('../services/migration/universalExcelValidator');
const { generateTemplateWorkbook } = require('../services/migration/templateGenerator');
const { getApprovedTables, getRestrictedTables } = require('../services/migration/universalSchemaService');

// Verify isolated database safety
function assertIsolatedTestDatabase() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('neon.tech') || dbUrl.includes('DASHPOS') || dbUrl.includes('staging')) {
    throw new Error('FATAL SAFETY VIOLATION: Test suite attempted to run against AWS Neon staging/production!');
  }
}

describe('Universal Single-Table Excel Migration System', () => {
  let adminToken;
  let cashierToken;
  let testCategoryId;

  beforeAll(async () => {
    assertIsolatedTestDatabase();

    // Ensure test users exist
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const cashierUser = await prisma.user.findFirst({ where: { role: 'CASHIER' } });

    // Acquire tokens via login
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: adminUser ? adminUser.username : 'admin', password: 'password123' });
    adminToken = adminLogin.body.data?.accessToken;

    if (!adminToken) {
      // Fallback create admin if needed
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('password123', 10);
      await prisma.user.upsert({
        where: { username: 'test_universal_admin' },
        update: {},
        create: {
          username: 'test_universal_admin',
          email: 'univ_admin@example.com',
          password_hash: hash,
          full_name: 'Universal Admin',
          role: 'ADMIN',
        },
      });
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test_universal_admin', password: 'password123' });
      adminToken = loginRes.body.data?.accessToken;
    }

    const cashierLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: cashierUser ? cashierUser.username : 'cashier', password: 'password123' });
    cashierToken = cashierLogin.body.data?.accessToken;

    // Seed reference data for FK tests
    const cat = await prisma.category.upsert({
      where: { name: 'Universal Migration Test Category' },
      update: {},
      create: {
        name: 'Universal Migration Test Category',
        description: 'Test category for migration suite',
      },
    });
    testCategoryId = cat.id;
  });

  afterAll(async () => {
    // Clean up test migration records
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'UNIV-TEST-' } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: 'UNIV-CAT-' } } });
    await prisma.customer.deleteMany({ where: { name: { startsWith: 'UNIV-CUST-' } } });
  });

  // =========================================================================
  // 1. Automatic Schema & Table Detection
  // =========================================================================
  describe('1. Schema & Table Detection', () => {
    it('detects table with high confidence when exact headers and sheet name match', () => {
      const result = detectTable({
        headers: ['id', 'name', 'sku', 'price', 'quantity', 'created_at'],
        sheetName: 'Product',
        filename: 'Product.xlsx',
        rowCount: 10,
      });

      expect(result.detectedTable).toBe('Product');
      expect(result.modelName).toBe('Product');
      expect(result.confidence).toBe('HIGH');
      expect(result.isAmbiguous).toBe(false);
      expect(result.matchingColumns.length).toBe(6);
      expect(result.unknownColumns.length).toBe(0);
    });

    it('does NOT select a table based only on filename if headers do not match', () => {
      // Filename says Product.xlsx, but headers are Customer columns
      const result = detectTable({
        headers: ['name', 'phone', 'email', 'address'],
        sheetName: 'Sheet1',
        filename: 'Product.xlsx',
        rowCount: 5,
      });

      expect(result.detectedTable).toBe('Customer');
      expect(result.detectedTable).not.toBe('Product');
    });

    it('rejects uploaded files that do not match any approved table', () => {
      const result = detectTable({
        headers: ['random_column_a', 'unrelated_field_b', 'unknown_xyz'],
        sheetName: 'UnknownSheet',
        filename: 'random_data.xlsx',
        rowCount: 12,
      });

      expect(result.confidence).toBe('UNMATCHED');
      expect(result.detectedTable).toBeNull();
      expect(result.unknownColumns.length).toBe(3);
    });

    it('identifies missing required columns accurately', () => {
      // Product requires name, sku, price
      const result = detectTable({
        headers: ['barcode', 'description'],
        sheetName: 'Product',
        filename: 'Product.xlsx',
        rowCount: 2,
      });

      const missingNames = result.missingRequiredColumns.map((c) => c.columnName);
      expect(missingNames).toContain('name');
      expect(missingNames).toContain('sku');
      expect(missingNames).toContain('price');
    });

    it('returns allowlist of approved tables and restricted tables with clear reasons', () => {
      const approved = getApprovedTables();
      const restricted = getRestrictedTables();

      expect(approved.length).toBe(19);
      expect(restricted.length).toBe(13);

      const tableNames = approved.map((t) => t.tableName);
      expect(tableNames).toContain('Product');
      expect(tableNames).toContain('Category');
      expect(tableNames).toContain('Customer');
      expect(tableNames).toContain('Sale');

      const restrictedNames = restricted.map((r) => r.modelName);
      expect(restrictedNames).toContain('User');
      expect(restrictedNames).toContain('Settings');
      expect(restrictedNames).toContain('AuthLog');
    });
  });

  // =========================================================================
  // 2. Field Value Handling & Auto-Generation
  // =========================================================================
  describe('2. Field Value Handling & Auto-Generation', () => {
    it('preserves explicitly supplied UUIDs (Rule A)', async () => {
      const explicitUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = await validateWorkbookData({
        tableName: 'Category',
        headers: ['id', 'name', 'description'],
        rawRows: [{ id: explicitUuid, name: 'UNIV-CAT-UUID-TEST', description: 'Explicit UUID test' }],
        mode: 'INSERT',
      });

      expect(result.isValidPlan).toBe(true);
      expect(result.previewRecords[0].data.id).toBe(explicitUuid);
    });

    it('preserves explicitly supplied Integer IDs (e.g. 1001 or 42)', async () => {
      const explicitIntId = '1001';
      const result = await validateWorkbookData({
        tableName: 'Category',
        headers: ['id', 'name', 'description'],
        rawRows: [{ id: 1001, name: 'UNIV-CAT-INT-ID-TEST', description: 'Integer ID test' }],
        mode: 'INSERT',
      });

      expect(result.isValidPlan).toBe(true);
      expect(result.previewRecords[0].data.id).toBe(explicitIntId);
    });

    it('generates valid UUID v4 when ID column is omitted or blank (Rule B & Rule C)', async () => {
      const result = await validateWorkbookData({
        tableName: 'Category',
        headers: ['name', 'description'], // 'id' omitted
        rawRows: [{ name: 'UNIV-CAT-GEN-UUID', description: 'Generated UUID test' }],
        mode: 'INSERT',
      });

      expect(result.isValidPlan).toBe(true);
      const generatedId = result.previewRecords[0].data.id;
      expect(generatedId).toBeDefined();
      expect(generatedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('preserves explicit createdAt and updatedAt timestamps', async () => {
      const explicitDate = '2025-01-15T08:30:00.000Z';
      const result = await validateWorkbookData({
        tableName: 'Customer',
        headers: ['name', 'phone', 'created_at'],
        rawRows: [{ name: 'UNIV-CUST-TIME-1', phone: '0710009991', created_at: explicitDate }],
        mode: 'INSERT',
      });

      expect(result.isValidPlan).toBe(true);
      expect(result.previewRecords[0].data.created_at).toBe(explicitDate);
    });

    it('distinguishes blank cells from zero and false (Rule C)', async () => {
      const result = await validateWorkbookData({
        tableName: 'Product',
        headers: ['name', 'sku', 'price', 'is_active', 'cost_price'],
        rawRows: [
          {
            name: 'UNIV-TEST-ZERO',
            sku: 'UNIV-TEST-ZERO-1',
            price: 0, // valid numeric 0
            is_active: false, // valid boolean false
            cost_price: '', // blank cell on nullable field -> should evaluate to null
          },
        ],
        mode: 'INSERT',
      });

      const rowData = result.previewRecords[0].data;
      expect(rowData.price).toBe(0);
      expect(rowData.is_active).toBe(false);
      expect(rowData.cost_price).toBeNull();
    });

    it('detects and blocks spreadsheet formula injection attempts', () => {
      expect(isFormulaInjection('=SUM(A1:B2)')).toBe(true);
      expect(isFormulaInjection('@cmd|/c calc')).toBe(true);
      expect(isFormulaInjection('+cmd|/c calc')).toBe(true);
      expect(isFormulaInjection('-cmd|/c calc')).toBe(true);
      expect(isFormulaInjection('Normal Text')).toBe(false);
      expect(isFormulaInjection(1234)).toBe(false);
    });

    it('validates enum values against the schema definition', async () => {
      // Valid enum
      const validRes = await validateWorkbookData({
        tableName: 'Product',
        headers: ['name', 'sku', 'price', 'unit_category'],
        rawRows: [{ name: 'UNIV-TEST-ENUM', sku: 'UNIV-TEST-E1', price: 100, unit_category: 'WEIGHT' }],
        mode: 'INSERT',
      });
      expect(validRes.isValidPlan).toBe(true);

      // Invalid enum
      const invalidRes = await validateWorkbookData({
        tableName: 'Product',
        headers: ['name', 'sku', 'price', 'unit_category'],
        rawRows: [{ name: 'UNIV-TEST-ENUM-BAD', sku: 'UNIV-TEST-E2', price: 100, unit_category: 'INVALID_CATEGORY' }],
        mode: 'INSERT',
      });
      expect(invalidRes.isValidPlan).toBe(false);
      expect(invalidRes.summary.invalidRows).toBe(1);
      expect(invalidRes.rowIssues[0].code).toBe('INVALID_ENUM_VALUE');
    });
  });

  // =========================================================================
  // 3. Foreign Key Validation (Section 7)
  // =========================================================================
  describe('3. Database Foreign Key Validation', () => {
    it('accepts rows with valid foreign keys referencing existing parent records', async () => {
      const result = await validateWorkbookData({
        tableName: 'Product',
        headers: ['name', 'sku', 'price', 'category_id'],
        rawRows: [{ name: 'UNIV-TEST-FK-OK', sku: 'UNIV-TEST-FK-1', price: 50, category_id: testCategoryId }],
        mode: 'INSERT',
      });

      expect(result.summary.fkErrors).toBe(0);
      expect(result.isValidPlan).toBe(true);
    });

    it('rejects rows referencing non-existent parent records and does NOT fabricate fake parents', async () => {
      const fakeParentId = uuidv4();
      const result = await validateWorkbookData({
        tableName: 'Product',
        headers: ['name', 'sku', 'price', 'category_id'],
        rawRows: [{ name: 'UNIV-TEST-FK-BAD', sku: 'UNIV-TEST-FK-2', price: 50, category_id: fakeParentId }],
        mode: 'INSERT',
      });

      expect(result.summary.fkErrors).toBe(1);
      expect(result.isValidPlan).toBe(false);
      expect(result.rowIssues[0].code).toBe('FOREIGN_KEY_NOT_FOUND');
      expect(result.rowIssues[0].message).toContain('references a Category record');

      // Verify no fake Category was created
      const fakeCat = await prisma.category.findUnique({ where: { id: fakeParentId } });
      expect(fakeCat).toBeNull();
    });
  });

  // =========================================================================
  // 4. Import Modes & Write Execution (Insert, Update, Upsert)
  // =========================================================================
  describe('4. Import Modes & Database Execution', () => {
    const testSku = 'UNIV-TEST-EXEC-001';

    it('INSERT MODE: inserts new record and rejects existing conflicting records', async () => {
      // 1. Upload & Create Job
      const res1 = await request(app)
        .post('/api/migration/excel/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tableName: 'Product',
          mode: 'INSERT',
          headers: ['name', 'sku', 'price', 'category_id'],
          rawRows: [{ name: 'Universal Exec Product', sku: testSku, price: 150.0, category_id: testCategoryId }],
        });

      expect(res1.status).toBe(201);
      expect(res1.body.data.isValidPlan).toBe(true);
      const jobId1 = res1.body.data.jobId;

      // 2. Confirm execution
      const confirmRes1 = await request(app)
        .post(`/api/migration/excel/jobs/${jobId1}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(confirmRes1.status).toBe(200);

      // Wait for batch execution
      await new Promise((r) => setTimeout(r, 600));

      // Verify product was created in PostgreSQL
      const createdProd = await prisma.product.findUnique({ where: { sku: testSku } });
      expect(createdProd).not.toBeNull();
      expect(Number(createdProd.price)).toBe(150.0);

      // 3. Attempting to INSERT again should detect unique conflict
      const res2 = await request(app)
        .post('/api/migration/excel/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tableName: 'Product',
          mode: 'INSERT',
          headers: ['name', 'sku', 'price'],
          rawRows: [{ name: 'Duplicate Product', sku: testSku, price: 200.0 }],
          matchingKey: 'sku',
        });

      expect(res2.body.data.isValidPlan).toBe(false);
      expect(res2.body.data.validationSummary.uniqueConflicts).toBe(1);
    });

    it('UPDATE MODE: updates existing record by unique matching key without mutating primary key', async () => {
      const existing = await prisma.product.findUnique({ where: { sku: testSku } });
      expect(existing).not.toBeNull();
      const originalId = existing.id;

      const res = await request(app)
        .post('/api/migration/excel/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tableName: 'Product',
          mode: 'UPDATE',
          matchingKey: 'sku',
          headers: ['sku', 'price', 'name'],
          rawRows: [{ sku: testSku, price: 275.5, name: 'Universal Exec Product Updated' }],
        });

      expect(res.status).toBe(201);
      const jobId = res.body.data.jobId;

      await request(app)
        .post(`/api/migration/excel/jobs/${jobId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`);

      await new Promise((r) => setTimeout(r, 600));

      const updated = await prisma.product.findUnique({ where: { sku: testSku } });
      expect(updated.id).toBe(originalId); // Primary key remains unchanged
      expect(Number(updated.price)).toBe(275.5);
      expect(updated.name).toBe('Universal Exec Product Updated');
    });

    it('UPSERT MODE: updates when record exists and inserts when record is absent', async () => {
      const upsertNewSku = 'UNIV-TEST-UPSERT-NEW';

      const res = await request(app)
        .post('/api/migration/excel/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tableName: 'Product',
          mode: 'UPSERT',
          matchingKey: 'sku',
          headers: ['sku', 'name', 'price'],
          rawRows: [
            { sku: testSku, name: 'Upsert Existing Product', price: 300.0 },
            { sku: upsertNewSku, name: 'Upsert New Product', price: 99.0 },
          ],
        });

      expect(res.status).toBe(201);
      const summary = res.body.data.validationSummary;
      expect(summary.expectedUpdates).toBe(1);
      expect(summary.expectedInserts).toBe(1);

      const jobId = res.body.data.jobId;
      await request(app)
        .post(`/api/migration/excel/jobs/${jobId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`);

      await new Promise((r) => setTimeout(r, 800));

      // Verify existing updated
      const existing = await prisma.product.findUnique({ where: { sku: testSku } });
      expect(Number(existing.price)).toBe(300.0);

      // Verify new inserted
      const newlyCreated = await prisma.product.findUnique({ where: { sku: upsertNewSku } });
      expect(newlyCreated).not.toBeNull();
      expect(Number(newlyCreated.price)).toBe(99.0);

      // Clean up newly created
      await prisma.product.delete({ where: { sku: upsertNewSku } });
    });
  });

  // =========================================================================
  // 5. Stock Safety & Historical Transactions Invariants (Section 8)
  // =========================================================================
  describe('5. Stock Safety & Historical Transactions', () => {
    it('protects Product.quantity from generic modification and warns user', async () => {
      const report = await validateWorkbookData({
        tableName: 'Product',
        headers: ['name', 'sku', 'price', 'quantity'],
        rawRows: [{ name: 'UNIV-STOCK-TEST', sku: 'UNIV-STOCK-1', price: 10, quantity: 500 }],
        mode: 'INSERT',
      });

      expect(report.summary.protectedViolations).toBe(1);
      const issue = report.rowIssues.find((i) => i.code === 'PROTECTED_FIELD_VIOLATION');
      expect(issue).toBeDefined();
      expect(issue.message).toContain('Stock Adjustment');
    });

    it('enforces is_legacy_import = true on historical Sale imports without creating stock movements', async () => {
      const user = await prisma.user.findFirst();
      const testTxId = 'UNIV-SALE-TX-9901';

      const res = await request(app)
        .post('/api/migration/excel/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tableName: 'Sale',
          mode: 'INSERT',
          headers: ['transaction_id', 'user_id', 'subtotal', 'total_amount', 'payment_method'],
          rawRows: [
            {
              transaction_id: testTxId,
              user_id: user.id,
              subtotal: 100.0,
              total_amount: 100.0,
              payment_method: 'CASH',
            },
          ],
        });

      const jobId = res.body.data.jobId;
      await request(app)
        .post(`/api/migration/excel/jobs/${jobId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`);

      await new Promise((r) => setTimeout(r, 600));

      const importedSale = await prisma.sale.findUnique({ where: { transaction_id: testTxId } });
      expect(importedSale).not.toBeNull();
      expect(importedSale.is_legacy_import).toBe(true);

      // Verify zero automatic inventory logs were created for this sale
      const invLogs = await prisma.inventoryLog.findMany({ where: { notes: { contains: testTxId } } });
      expect(invLogs.length).toBe(0);

      // Clean up
      await prisma.sale.delete({ where: { transaction_id: testTxId } });
    });
  });

  // =========================================================================
  // 6. Security & Table Allowlists (Section 14)
  // =========================================================================
  describe('6. Security & Authorization', () => {
    it('blocks unauthenticated requests to migration endpoints', async () => {
      const res = await request(app).get('/api/migration/excel/tables');
      expect(res.status).toBe(401);
    });

    it('blocks non-admin users (e.g. CASHIER) from accessing migration endpoints', async () => {
      if (!cashierToken) return;
      const res = await request(app)
        .get('/api/migration/excel/tables')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });

    it('strictly blocks attempts to import into restricted tables (e.g. User, Settings, AuthLog)', async () => {
      const res = await request(app)
        .post('/api/migration/excel/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tableName: 'User',
          headers: ['username', 'email', 'password_hash'],
          rawRows: [{ username: 'hacker', email: 'h@evil.com', password_hash: '123' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('restricted');
    });

    it('rejects invalid or corrupted files', async () => {
      const fakeBuffer = Buffer.from('Not a real XLSX ZIP file');
      const res = await request(app)
        .post('/api/migration/excel/inspect')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', fakeBuffer, 'corrupted.xlsx');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CORRUPTED_XLSX');
    });

    it('successfully normalizes and processes workbooks with Excel full-column styling (e.g. !ref A1:Q1048576)', async () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['transaction_id', 'total_amount'],
        ['SALE-TEST-001', 120.5],
        ['SALE-TEST-002', 340.0],
      ]);
      // Artificially simulate Excel's full-column styling where !ref spans the entire 1,048,576 grid
      ws['!ref'] = 'A1:Q1048576';
      XLSX.utils.book_append_sheet(wb, ws, 'Sale');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/api/migration/excel/inspect')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', buffer, 'Sale_With_Full_Column_Style.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalRows).toBe(2);
      expect(res.body.data.detection.detectedTable).toBe('Sale');
    });
  });

  // =========================================================================
  // 7. Downloadable Templates & Schema Endpoints (Section 10)
  // =========================================================================
  describe('7. Downloadable Templates & Schema', () => {
    it('generates downloadable .xlsx templates with exact physical column names for minimal and full variants', async () => {
      // Direct generator verification
      const fullTpl = generateTemplateWorkbook('Product', 'full');
      expect(fullTpl.filename).toContain('Product_template_full.xlsx');
      const fullWb = XLSX.read(fullTpl.buffer, { type: 'buffer' });
      expect(fullWb.SheetNames).toContain('Product');
      const fullSheet = fullWb.Sheets['Product'];
      const fullRows = XLSX.utils.sheet_to_json(fullSheet, { header: 1 });
      expect(fullRows[0]).toContain('sku');
      expect(fullRows[0]).toContain('price');

      const minTpl = generateTemplateWorkbook('Product', 'minimal');
      const minWb = XLSX.read(minTpl.buffer, { type: 'buffer' });
      const minRows = XLSX.utils.sheet_to_json(minWb.Sheets['Product'], { header: 1 });
      expect(minRows[0]).toEqual(['name', 'sku', 'price']);

      // HTTP endpoint verification
      const fullRes = await request(app)
        .get('/api/migration/excel/templates/Product?variant=full')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(fullRes.status).toBe(200);
      expect(fullRes.headers['content-type']).toContain('spreadsheetml');
      expect(fullRes.headers['content-disposition']).toContain('Product_template_full.xlsx');
    });

    it('returns structured schema specification and guidance for a table', async () => {
      const res = await request(app)
        .get('/api/migration/excel/schema/Customer')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tableName).toBe('Customer');
      expect(res.body.data.columns.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 8. Auditing, Progress Polling & Error Reports (Section 13)
  // =========================================================================
  describe('8. Auditing, Progress & Error Reports', () => {
    it('records job execution in MigrationBatch and downloads CSV error report', async () => {
      // Create a job with deliberate invalid rows
      const res = await request(app)
        .post('/api/migration/excel/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tableName: 'Customer',
          mode: 'INSERT',
          headers: ['name', 'phone'],
          rawRows: [
            { name: '', phone: '0711112222' }, // Missing required name
          ],
        });

      const jobId = res.body.data.jobId;

      // Download CSV error report
      const errorRes = await request(app)
        .get(`/api/migration/excel/jobs/${jobId}/errors?format=csv`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(errorRes.status).toBe(200);
      expect(errorRes.headers['content-type']).toContain('text/csv');
      expect(errorRes.text).toContain('Row,Column,Code,Severity,Message');
      expect(errorRes.text).toContain('REQUIRED_FIELD_BLANK');

      // Verify job list reflects the batch
      const listRes = await request(app)
        .get('/api/migration/excel/jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      const foundJob = listRes.body.data.find((j) => j.tableName === 'Customer');
      expect(foundJob).toBeDefined();
    });
  });
});
