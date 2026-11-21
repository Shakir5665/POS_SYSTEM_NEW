'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const { runReadinessCheck, VALID_MAPPING_STATUSES, REQUIRED_DOCS } = require('../check-readiness')

/**
 * Create a temporary directory with synthetic Phase 1 fixtures for testing.
 */
function createTestFixtures(overrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextill-readiness-'))
  const docsDir = path.join(tmpDir, 'docs', 'legacy-migration')
  fs.mkdirSync(docsDir, { recursive: true })

  // Create a minimal Prisma schema
  const schemaDir = path.join(tmpDir, 'server', 'prisma')
  fs.mkdirSync(schemaDir, { recursive: true })
  const schemaContent = overrides.schema || `
    generator client { provider = "prisma-client-js" }
    datasource db { provider = "postgresql" url = env("DATABASE_URL") }
    model User { id String @id }
    model Sale { id String @id transaction_id String @unique user_id String total_amount Decimal subtotal Decimal amount_paid Decimal balance_due Decimal tax_amount Decimal discount_amount Decimal payment_method String payment_status String notes String? created_at DateTime }
    model SaleItem { id String @id sale_id String product_id String quantity Decimal unit_price Decimal total Decimal discount Decimal }
    model Purchase { id String @id purchase_number String @unique supplier_id String user_id String status String payment_status String total_amount Decimal subtotal Decimal amount_paid Decimal balance_due Decimal tax_amount Decimal notes String? created_at DateTime }
    model PurchaseItem { id String @id purchase_id String product_id String quantity Decimal unit_cost Decimal total_cost Decimal }
    model Product { id String @id name String sku String @unique quantity Decimal }
    model Customer { id String @id name String }
    model Supplier { id String @id name String }
    model Expense { id String @id category_id String user_id String amount Decimal expense_date DateTime reference String? notes String? }
    model ExpenseCategory { id String @id name String @unique }
    model Payment { id String @id sale_id String }
    model InventoryLog { id String @id product_id String }
  `
  fs.writeFileSync(path.join(schemaDir, 'schema.prisma'), schemaContent)

  // Create minimal doc files
  const defaults = {
    'baseline.md': '# Baseline\nCommit: abc123',
    'baseline-test-results.md': '# Baseline Test Results\nAll tests passed.',
    'database-safety.md': '# Database Safety\nStatus: NOT VERIFIED — blocked by access.',
    'legacy-field-mapping.md': '# Field Mapping\n| Source | Target | Status |\n|---|---|---|\n| sales.id | LegacyIdMap | `REQUIRES_SCHEMA_CHANGE` |\n| sales.grand_total | Sale.total_amount | `EXISTS` |\n| sales.payment_type | Sale.payment_method | `UNRESOLVED` |',
    'current-system-risks.md': '# System Risks\nDocumented.',
    'migration-decisions.md': '# Migration Decisions\nAll OPEN.',
    'phase-2-handoff.md': '# Phase 2 Handoff\nProposed models documented.',
  }

  const auditData = overrides.audit || {
    metadata: { audit_type: 'externally_analyzed_source' },
    worksheet_inventory: {
      total_worksheets_documented: 10,
      worksheets: [
        { name: 'sales', populated_records: 3 },
        { name: 'sales_sale_items', populated_records: 5 },
        { name: 'purchases', populated_records: 4 },
        { name: 'purchases_purchase_items', populated_records: 4 },
        { name: 'sales_returns', populated_records: 0 },
        { name: 'purchase_returns', populated_records: 0 },
        { name: 'adjustments', populated_records: 5 },
        { name: 'adjustments_adjustment_items', populated_records: 5 },
        { name: 'transfers', populated_records: 0 },
        { name: 'expenses', populated_records: 1 },
      ],
      total_populated_records: 27,
    },
    nested_child_records: {
      sales: { embedded_item_count: 19, flattened_item_count: 5, flattened_is_subset: true },
      purchases: { embedded_item_count: 4, flattened_item_count: 4, flattened_is_subset: false, parent_mismatch: true },
      adjustments: { embedded_item_count: 5, flattened_item_count: 5, flattened_is_subset: false, parent_mismatch: true },
    },
    financial_profiles: { sales: { record_count: 3 }, purchases: { record_count: 4 } },
    missing_master_datasets: {
      products: { complete_master_data: false },
      customers: { complete_master_data: false },
      suppliers: { complete_master_data: false },
    },
    missing_parent_references: {
      flattened_purchase_items: { status: 'ORPHAN', orphan_count: 4 },
      flattened_adjustment_items: { status: 'ORPHAN', orphan_count: 5 },
    },
    confirmed_data_integrity_issues: [],
  }

  for (const [file, content] of Object.entries(defaults)) {
    if (!overrides.skipFiles || !overrides.skipFiles.includes(file)) {
      fs.writeFileSync(path.join(docsDir, file), content)
    }
  }
  fs.writeFileSync(path.join(docsDir, 'legacy-data-audit.json'), JSON.stringify(auditData, null, 2))

  return { tmpDir, docsDir, schemaPath: path.join(schemaDir, 'schema.prisma') }
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

describe('Migration Readiness Checker', () => {
  let tmpDir, docsDir, schemaPath

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir)
  })

  it('passes all checks with complete fixtures', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    expect(result.summary).toBeDefined()
    expect(result.checks.length).toBeGreaterThan(0)
    // Should not be BLOCKED with complete fixtures
    expect(result.summary.BLOCKED).toBe(0)
  })

  it('reports BLOCKED when documentation files are missing', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures({ skipFiles: ['baseline.md'] }))
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const docCheck = result.checks.find((c) => c.id === 'DOC-001')
    expect(docCheck.status).toBe('BLOCKED')
    expect(docCheck.detail).toContain('baseline.md')
  })

  it('validates audit JSON structure', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const auditCheck = result.checks.find((c) => c.id === 'AUDIT-001')
    expect(auditCheck.status).toBe('PASS')
  })

  it('warns on bad audit_type', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures({
      audit: {
        metadata: { audit_type: 'wrong_type' },
        worksheet_inventory: { total_worksheets_documented: 0, worksheets: [], total_populated_records: 0 },
        nested_child_records: { sales: { embedded_item_count: 19, flattened_item_count: 5, flattened_is_subset: true } },
        financial_profiles: {},
        missing_master_datasets: {},
        missing_parent_references: { flattened_purchase_items: { status: 'ORPHAN' }, flattened_adjustment_items: { status: 'ORPHAN' } },
        confirmed_data_integrity_issues: [],
      },
    }))
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const auditCheck = result.checks.find((c) => c.id === 'AUDIT-001')
    expect(auditCheck.status).toBe('WARNING')
  })

  it('validates sale-item duplicate accounting', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const saleCheck = result.checks.find((c) => c.id === 'AUDIT-003')
    expect(saleCheck.status).toBe('PASS')
    expect(saleCheck.detail).toContain('19 embedded')
  })

  it('verifies missing parent references are preserved', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const orphanCheck = result.checks.find((c) => c.id === 'AUDIT-004')
    expect(orphanCheck.status).toBe('PASS')
  })

  it('detects proposed models not yet in schema', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const schemaCheck = result.checks.find((c) => c.id === 'MAP-002')
    expect(schemaCheck.status).toBe('SCHEMA_CHANGE_REQUIRED')
    expect(schemaCheck.detail).toContain('LegacyIdMap')
  })

  it('detects proposed new fields on existing models', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const fieldCheck = result.checks.find((c) => c.id === 'MAP-003')
    expect(fieldCheck.status).toBe('SCHEMA_CHANGE_REQUIRED')
    expect(fieldCheck.detail).toContain('sale_date')
  })

  it('warns about unresolved status code mappings', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const statusCheck = result.checks.find((c) => c.id === 'MAP-004')
    expect(statusCheck.status).toBe('WARNING')
    expect(statusCheck.detail).toContain('UNRESOLVED')
  })

  it('warns about missing master data', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const masterCheck = result.checks.find((c) => c.id === 'MAP-005')
    expect(masterCheck.status).toBe('WARNING')
    expect(masterCheck.detail).toContain('products')
  })

  it('reports NOT_VERIFIED for backup restoration', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    const backupCheck = result.checks.find((c) => c.id === 'BACKUP-001')
    expect(backupCheck.status).toBe('NOT_VERIFIED')
  })

  it('generates a deterministic summary', () => {
    ;({ tmpDir, docsDir, schemaPath } = createTestFixtures())
    const result1 = runReadinessCheck({ docsDir, prismaSchema: schemaPath })
    const result2 = runReadinessCheck({ docsDir, prismaSchema: schemaPath })

    expect(result1.checks.map((c) => c.status)).toEqual(result2.checks.map((c) => c.status))
    expect(result1.summary.overall_status).toEqual(result2.summary.overall_status)
  })

  it('exports valid mapping statuses', () => {
    expect(VALID_MAPPING_STATUSES).toContain('EXISTS')
    expect(VALID_MAPPING_STATUSES).toContain('REQUIRES_SCHEMA_CHANGE')
    expect(VALID_MAPPING_STATUSES).toContain('UNRESOLVED')
    expect(VALID_MAPPING_STATUSES.length).toBe(6)
  })

  it('exports required doc list', () => {
    expect(REQUIRED_DOCS).toContain('baseline.md')
    expect(REQUIRED_DOCS).toContain('legacy-data-audit.json')
    expect(REQUIRED_DOCS.length).toBe(8)
  })
})
