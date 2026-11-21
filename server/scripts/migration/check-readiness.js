#!/usr/bin/env node
/**
 * Migration Readiness Checker
 *
 * Validates Phase 1 deliverables and reports migration readiness.
 * Runs without reading Excel or modifying PostgreSQL.
 *
 * Usage:
 *   node server/scripts/migration/check-readiness.js
 *   node server/scripts/migration/check-readiness.js --json
 *   npm --prefix server run migration:readiness
 */
'use strict'

const path = require('path')
const fs = require('fs')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs', 'legacy-migration')
const PRISMA_SCHEMA = path.join(PROJECT_ROOT, 'server', 'prisma', 'schema.prisma')
const REPORT_OUTPUT = path.join(DOCS_DIR, 'readiness-report.json')

const VALID_MAPPING_STATUSES = [
  'EXISTS',
  'REQUIRES_SCHEMA_CHANGE',
  'REQUIRES_TRANSFORMATION',
  'REQUIRES_REFERENCE_MAPPING',
  'UNRESOLVED',
  'NOT_APPLICABLE',
]

const REQUIRED_DOCS = [
  'baseline.md',
  'baseline-test-results.md',
  'database-safety.md',
  'legacy-data-audit.json',
  'legacy-field-mapping.md',
  'current-system-risks.md',
  'migration-decisions.md',
  'phase-2-handoff.md',
]

/**
 * Check a single requirement and return a check result.
 */
function check(id, name, fn) {
  try {
    const result = fn()
    return { id, name, ...result }
  } catch (err) {
    return { id, name, status: 'BLOCKED', detail: `Error: ${err.message}` }
  }
}

/**
 * Run all readiness checks.
 * @param {object} [options]
 * @param {string} [options.docsDir] - override docs directory (for testing)
 * @param {string} [options.prismaSchema] - override schema path (for testing)
 * @returns {{ checks: object[], summary: object }}
 */
function runReadinessCheck(options = {}) {
  const docsDir = options.docsDir || DOCS_DIR
  const prismaSchema = options.prismaSchema || PRISMA_SCHEMA
  const checks = []

  // 1. Verify required Phase 1 documentation files exist
  checks.push(check('DOC-001', 'Required documentation files', () => {
    const missing = REQUIRED_DOCS.filter((f) => !fs.existsSync(path.join(docsDir, f)))
    if (missing.length > 0) {
      return { status: 'BLOCKED', detail: `Missing files: ${missing.join(', ')}` }
    }
    return { status: 'PASS', detail: `All ${REQUIRED_DOCS.length} required files present` }
  }))

  // 2. Validate legacy-data-audit.json structure
  checks.push(check('AUDIT-001', 'Audit JSON structure', () => {
    const auditPath = path.join(docsDir, 'legacy-data-audit.json')
    if (!fs.existsSync(auditPath)) {
      return { status: 'BLOCKED', detail: 'legacy-data-audit.json not found' }
    }
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'))
    const requiredKeys = ['metadata', 'worksheet_inventory', 'nested_child_records', 'financial_profiles', 'missing_master_datasets', 'confirmed_data_integrity_issues']
    const missingKeys = requiredKeys.filter((k) => !audit[k])
    if (missingKeys.length > 0) {
      return { status: 'BLOCKED', detail: `Missing audit keys: ${missingKeys.join(', ')}` }
    }
    if (audit.metadata?.audit_type !== 'externally_analyzed_source') {
      return { status: 'WARNING', detail: `Unexpected audit_type: "${audit.metadata?.audit_type}"` }
    }
    return { status: 'PASS', detail: 'Audit JSON structure valid' }
  }))

  // 3. Validate worksheet count consistency
  checks.push(check('AUDIT-002', 'Worksheet count consistency', () => {
    const auditPath = path.join(docsDir, 'legacy-data-audit.json')
    if (!fs.existsSync(auditPath)) {
      return { status: 'BLOCKED', detail: 'Audit file not found' }
    }
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'))
    const inv = audit.worksheet_inventory
    if (!inv || !inv.worksheets) {
      return { status: 'BLOCKED', detail: 'No worksheet inventory' }
    }
    const counted = inv.worksheets.length
    const declared = inv.total_worksheets_documented
    if (counted !== declared) {
      return { status: 'WARNING', detail: `Declared ${declared} worksheets but found ${counted} entries` }
    }
    const sumRecords = inv.worksheets.reduce((s, w) => s + (w.populated_records || 0), 0)
    if (sumRecords !== inv.total_populated_records) {
      return { status: 'WARNING', detail: `Sum of populated records (${sumRecords}) ≠ declared total (${inv.total_populated_records})` }
    }
    return { status: 'PASS', detail: `${counted} worksheets, ${sumRecords} total records` }
  }))

  // 4. Validate sale-item duplicate accounting
  checks.push(check('AUDIT-003', 'Sale-item duplicate accounting', () => {
    const auditPath = path.join(docsDir, 'legacy-data-audit.json')
    if (!fs.existsSync(auditPath)) {
      return { status: 'BLOCKED', detail: 'Audit file not found' }
    }
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'))
    const sales = audit.nested_child_records?.sales
    if (!sales) {
      return { status: 'BLOCKED', detail: 'No nested_child_records.sales' }
    }
    if (sales.flattened_is_subset !== true) {
      return { status: 'WARNING', detail: 'flattened_is_subset should be true for sales' }
    }
    if (sales.embedded_item_count !== 19) {
      return { status: 'WARNING', detail: `Expected 19 embedded sale items, got ${sales.embedded_item_count}` }
    }
    if (sales.flattened_item_count !== 5) {
      return { status: 'WARNING', detail: `Expected 5 flattened sale items, got ${sales.flattened_item_count}` }
    }
    return { status: 'PASS', detail: '19 embedded, 5 flattened (subset), no double-counting' }
  }))

  // 5. Verify missing-parent findings are preserved
  checks.push(check('AUDIT-004', 'Missing parent references preserved', () => {
    const auditPath = path.join(docsDir, 'legacy-data-audit.json')
    if (!fs.existsSync(auditPath)) {
      return { status: 'BLOCKED', detail: 'Audit file not found' }
    }
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'))
    const missing = audit.missing_parent_references
    if (!missing) {
      return { status: 'BLOCKED', detail: 'No missing_parent_references section' }
    }
    const issues = []
    if (!missing.flattened_purchase_items || missing.flattened_purchase_items.status !== 'ORPHAN') {
      issues.push('flattened_purchase_items not marked ORPHAN')
    }
    if (!missing.flattened_adjustment_items || missing.flattened_adjustment_items.status !== 'ORPHAN') {
      issues.push('flattened_adjustment_items not marked ORPHAN')
    }
    if (issues.length > 0) {
      return { status: 'WARNING', detail: issues.join('; ') }
    }
    return { status: 'PASS', detail: 'Purchase and adjustment orphans documented' }
  }))

  // 6. Verify mapping status values
  checks.push(check('MAP-001', 'Mapping status values valid', () => {
    const mappingPath = path.join(docsDir, 'legacy-field-mapping.md')
    if (!fs.existsSync(mappingPath)) {
      return { status: 'BLOCKED', detail: 'legacy-field-mapping.md not found' }
    }
    const content = fs.readFileSync(mappingPath, 'utf-8')
    // Extract all backtick-quoted status values from mapping tables
    const statusMatches = content.match(/`([A-Z_]+)`/g) || []
    const foundStatuses = [...new Set(statusMatches.map((s) => s.replace(/`/g, '')))]
    const invalid = foundStatuses.filter(
      (s) => VALID_MAPPING_STATUSES.includes(s) === false &&
        !['MANDATORY', 'CONDITIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL',
          'OPEN', 'APPROVED', 'PASS', 'WARNING', 'BLOCKED'].includes(s)
    )
    if (invalid.length > 0) {
      return { status: 'WARNING', detail: `Non-standard values found: ${invalid.join(', ')}` }
    }
    // Check that at least some valid mapping statuses are present
    const usedMappingStatuses = foundStatuses.filter((s) => VALID_MAPPING_STATUSES.includes(s))
    if (usedMappingStatuses.length === 0) {
      return { status: 'WARNING', detail: 'No valid mapping statuses found in document' }
    }
    return { status: 'PASS', detail: `Found ${usedMappingStatuses.length} valid mapping statuses` }
  }))

  // 7. Check mapping targets against current Prisma schema
  checks.push(check('MAP-002', 'Mapping targets vs Prisma schema', () => {
    if (!fs.existsSync(prismaSchema)) {
      return { status: 'BLOCKED', detail: 'Prisma schema not found' }
    }
    const schema = fs.readFileSync(prismaSchema, 'utf-8')
    const existingModels = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1])

    // Known proposed models that don't exist yet
    const proposedModels = ['LegacyIdMap', 'MigrationBatch', 'MigrationIssue', 'Warehouse', 'ProductStock', 'StockAdjustment', 'StockAdjustmentItem', 'ProductUnit']
    const missingProposed = proposedModels.filter((m) => !existingModels.includes(m))

    return {
      status: missingProposed.length > 0 ? 'SCHEMA_CHANGE_REQUIRED' : 'PASS',
      detail: `${existingModels.length} existing models. Proposed models not yet created: ${missingProposed.join(', ')}`,
    }
  }))

  // 8. Flag proposed fields that don't currently exist
  checks.push(check('MAP-003', 'Proposed new fields on existing models', () => {
    if (!fs.existsSync(prismaSchema)) {
      return { status: 'BLOCKED', detail: 'Prisma schema not found' }
    }
    const schema = fs.readFileSync(prismaSchema, 'utf-8')
    const proposedFields = [
      { model: 'Sale', field: 'sale_date' },
      { model: 'Sale', field: 'warehouse_id' },
      { model: 'Sale', field: 'is_legacy_import' },
      { model: 'Purchase', field: 'purchase_date' },
      { model: 'Purchase', field: 'warehouse_id' },
      { model: 'Purchase', field: 'is_legacy_import' },
      { model: 'Expense', field: 'is_legacy_import' },
    ]
    const missing = proposedFields.filter((pf) => {
      // Simple heuristic: check if the field name appears in the schema near the model
      const modelRegex = new RegExp(`model\\s+${pf.model}\\s*\\{([^}]+)\\}`, 's')
      const match = schema.match(modelRegex)
      if (!match) return true
      return !match[1].includes(pf.field)
    })
    return {
      status: missing.length > 0 ? 'SCHEMA_CHANGE_REQUIRED' : 'PASS',
      detail: missing.length > 0
        ? `Missing fields (Phase 2): ${missing.map((f) => `${f.model}.${f.field}`).join(', ')}`
        : 'All proposed fields exist',
    }
  }))

  // 9. Detect unresolved required status mappings
  checks.push(check('MAP-004', 'Unresolved status code mappings', () => {
    const mappingPath = path.join(docsDir, 'legacy-field-mapping.md')
    if (!fs.existsSync(mappingPath)) {
      return { status: 'BLOCKED', detail: 'Mapping file not found' }
    }
    const content = fs.readFileSync(mappingPath, 'utf-8')
    const unresolvedCount = (content.match(/`UNRESOLVED`/g) || []).length
    if (unresolvedCount > 0) {
      return { status: 'WARNING', detail: `${unresolvedCount} UNRESOLVED mappings remain (acceptable for Phase 1)` }
    }
    return { status: 'PASS', detail: 'No unresolved mappings' }
  }))

  // 10. Detect unresolved required master-data mappings
  checks.push(check('MAP-005', 'Master data mapping gaps', () => {
    const auditPath = path.join(docsDir, 'legacy-data-audit.json')
    if (!fs.existsSync(auditPath)) {
      return { status: 'BLOCKED', detail: 'Audit file not found' }
    }
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'))
    const masters = audit.missing_master_datasets
    if (!masters) {
      return { status: 'BLOCKED', detail: 'No missing_master_datasets section' }
    }
    const incomplete = Object.entries(masters).filter(([, v]) => v.complete_master_data === false)
    if (incomplete.length > 0) {
      return {
        status: 'WARNING',
        detail: `${incomplete.length} master datasets missing: ${incomplete.map(([k]) => k).join(', ')}. NOT ready for production migration.`,
      }
    }
    return { status: 'PASS', detail: 'All master datasets available' }
  }))

  // 11. Report incomplete baseline checks
  checks.push(check('BASE-001', 'Baseline test results recorded', () => {
    const resultsPath = path.join(docsDir, 'baseline-test-results.md')
    if (!fs.existsSync(resultsPath)) {
      return { status: 'BLOCKED', detail: 'baseline-test-results.md not found' }
    }
    const content = fs.readFileSync(resultsPath, 'utf-8')
    if (content.includes('NOT EXECUTED') || content.includes('SKIPPED')) {
      return { status: 'WARNING', detail: 'Some baseline checks were not executed' }
    }
    return { status: 'PASS', detail: 'Baseline test results documented' }
  }))

  // 12. Report unverified backup restoration
  checks.push(check('BACKUP-001', 'Backup restoration verified', () => {
    const safetyPath = path.join(docsDir, 'database-safety.md')
    if (!fs.existsSync(safetyPath)) {
      return { status: 'BLOCKED', detail: 'database-safety.md not found' }
    }
    const content = fs.readFileSync(safetyPath, 'utf-8')
    if (content.includes('NOT VERIFIED')) {
      return { status: 'NOT_VERIFIED', detail: 'Backup restoration has not been verified against an isolated database' }
    }
    return { status: 'PASS', detail: 'Backup restoration verified' }
  }))

  // 13. Generate summary
  const statusCounts = { PASS: 0, WARNING: 0, BLOCKED: 0, NOT_VERIFIED: 0, SCHEMA_CHANGE_REQUIRED: 0 }
  for (const c of checks) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1
  }

  let overallStatus
  if (statusCounts.BLOCKED > 0) {
    overallStatus = 'BLOCKED'
  } else if (statusCounts.NOT_VERIFIED > 0 || statusCounts.WARNING > 0) {
    overallStatus = 'CONDITIONAL'
  } else {
    overallStatus = 'READY'
  }

  const summary = {
    overall_status: overallStatus,
    phase: 'Phase 1',
    timestamp: new Date().toISOString(),
    total_checks: checks.length,
    ...statusCounts,
    note: overallStatus === 'CONDITIONAL'
      ? 'Phase 1 deliverables are present but some items need verification or resolution before Phase 4 migration. Schema changes are expected for Phase 2.'
      : overallStatus === 'BLOCKED'
        ? 'Critical Phase 1 deliverables are missing or incomplete.'
        : 'All Phase 1 checks passed.',
  }

  return { checks, summary }
}

/**
 * Write the readiness report to disk.
 */
function writeReport(result, outputPath) {
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2)
  const isJson = args.includes('--json')

  const result = runReadinessCheck()
  writeReport(result, REPORT_OUTPUT)

  if (isJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('\n=== NexTill Migration Readiness Report ===\n')

    for (const c of result.checks) {
      const icon = c.status === 'PASS' ? '✓' : c.status === 'WARNING' ? '⚠' : c.status === 'SCHEMA_CHANGE_REQUIRED' ? '⬡' : '✗'
      console.log(`  ${icon} [${c.id}] ${c.name}: ${c.status}`)
      if (c.detail) console.log(`    ${c.detail}`)
    }

    console.log()
    console.log(`Overall: ${result.summary.overall_status}`)
    console.log(`  PASS: ${result.summary.PASS}, WARNING: ${result.summary.WARNING}, BLOCKED: ${result.summary.BLOCKED}, NOT_VERIFIED: ${result.summary.NOT_VERIFIED}, SCHEMA_CHANGE: ${result.summary.SCHEMA_CHANGE_REQUIRED}`)
    console.log()
    console.log(`Report written to: ${REPORT_OUTPUT}`)
  }

  // Exit 0 even for warnings — only BLOCKED is a hard failure
  process.exit(result.summary.BLOCKED > 0 ? 1 : 0)
}

module.exports = { runReadinessCheck, writeReport, VALID_MAPPING_STATUSES, REQUIRED_DOCS }
