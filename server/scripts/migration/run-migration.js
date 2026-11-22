#!/usr/bin/env node
/**
 * NexTill POS — Legacy Migration Runner & Dry-Run CLI
 *
 * Usage:
 *   node server/scripts/migration/run-migration.js --dry-run
 *   node server/scripts/migration/run-migration.js --execute
 *   node server/scripts/migration/run-migration.js --rollback <batch_id_or_number>
 *   node server/scripts/migration/run-migration.js --status
 */
'use strict'

const path = require('path')
const fs = require('fs')

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') })
const {
  runDryRun,
  executeMigration,
  rollbackBatch,
  getBatchStatus,
  listBatches,
} = require('../../src/services/migration/migrationEngine')

const DOCS_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'legacy-migration')
const DRY_RUN_REPORT_FILE = path.join(DOCS_DIR, 'phase-4a-dry-run-report.json')

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run') || (!args.includes('--execute') && !args.includes('--rollback') && !args.includes('--status'))
  const isExecute = args.includes('--execute')
  const isStatus = args.includes('--status')
  const rollbackIdx = args.indexOf('--rollback')
  const rollbackTarget = rollbackIdx !== -1 ? args[rollbackIdx + 1] : null

  console.log('\n=============================================================')
  console.log('       NexTill POS — Legacy POS Migration Engine CLI         ')
  console.log('=============================================================\n')

  if (isStatus) {
    console.log('Fetching Migration Batches status...\n')
    const batches = await listBatches()
    if (batches.length === 0) {
      console.log('No migration batches found in database.')
      return
    }
    console.table(batches.map((b) => ({
      Batch: `#${b.batch_number}`,
      ID: b.id,
      Status: b.status,
      Records: b.record_count,
      Success: b.success_count,
      Errors: b.error_count,
      Mappings: b._count.legacy_id_maps,
      Issues: b._count.issues,
      Started: b.started_at ? new Date(b.started_at).toLocaleString() : '-',
    })))
    return
  }

  if (rollbackTarget) {
    console.log(`Initiating rollback for batch: ${rollbackTarget}...\n`)
    try {
      const summary = await rollbackBatch(rollbackTarget)
      console.log('✓ Rollback completed successfully!')
      console.log(JSON.stringify(summary, null, 2))
    } catch (err) {
      console.error(`✗ Rollback failed: ${err.message}`)
      process.exit(1)
    }
    return
  }

  if (isDryRun) {
    console.log('Executing DRY-RUN Validation Pass (0 database mutations)...\n')
    try {
      const report = await runDryRun()

      console.log('--- Dry-Run Summary ---')
      console.log(`Status:          ${report.status === 'PASSED' ? '✓ PASSED' : '✗ BLOCKED'}`)
      console.log(`Provenance:      ${report.metadata.dataset_provenance || 'SYNTHETIC_FIXTURE'} (${report.metadata.is_synthetic_fixture ? 'Synthetic Test Fixture' : 'Verified Source'})`)
      console.log(`Source File:     ${report.metadata.source_file}`)
      console.log(`SHA-256:         ${report.metadata.source_sha256}`)
      console.log(`Duration:        ${report.duration_ms} ms`)
      console.log('\n--- Entity Record Counts ---')
      console.log(`Sales:           ${report.counts.sales.valid} / ${report.counts.sales.total} valid (${report.counts.sales.items} items)`)
      console.log(`Purchases:       ${report.counts.purchases.valid} / ${report.counts.purchases.total} valid (${report.counts.purchases.items} items, ${report.counts.purchases.orphans} orphan children)`)
      console.log(`Adjustments:     ${report.counts.adjustments.valid} / ${report.counts.adjustments.total} valid (${report.counts.adjustments.items} items, ${report.counts.adjustments.orphans} orphan children)`)
      console.log(`Expenses:        ${report.counts.expenses.valid} / ${report.counts.expenses.total} valid (${report.counts.expenses.not_eligible || 0} not eligible - pending approved category mapping)`)

      console.log('\n--- Inventory & Accounting Invariants ---')
      console.log(`Product.quantity mutations:       ${report.inventory_impact.product_quantity_mutations} (Authoritative stock unchanged)`)
      console.log(`InventoryLog records created:     ${report.inventory_impact.inventory_logs_created} (Zero drift)`)
      console.log(`Loyalty points awarded:          ${report.inventory_impact.customer_loyalty_points_awarded}`)
      console.log(`Synthetic Payment rows created:   ${report.inventory_impact.synthetic_payments_created}`)

      console.log(`\n--- Detected Migration Issues: ${report.issues.length} ---`)
      for (const issue of report.issues) {
        const icon = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ'
        console.log(`  ${icon} [${issue.severity}] [${issue.issue_code || 'ISSUE'}] ${issue.entity_type} #${issue.legacy_id}: ${issue.description}`)
      }

      // Write report to docs
      fs.writeFileSync(DRY_RUN_REPORT_FILE, JSON.stringify(report, null, 2), 'utf-8')
      console.log(`\n✓ Dry-run report written to: ${DRY_RUN_REPORT_FILE}`)

      if (!report.safe_to_execute) {
        console.error('\n✗ Dry-run validation failed with blocking errors. Migration cannot proceed.')
        process.exit(1)
      } else {
        console.log('\n✓ Dry-run validation passed. System is ready for staged execution (--execute).')
      }
    } catch (err) {
      console.error(`\n✗ Dry-run error: ${err.message}`)
      process.exit(1)
    }
    return
  }

  if (isExecute) {
    console.log('Executing REAL Migration Batch against Database...\n')
    try {
      const execResult = await executeMigration({
        notes: 'Audited Legacy POS Batch v4 via run-migration CLI',
      })
      console.log('✓ Migration execution completed!')
      console.log(`Batch ID:       ${execResult.batch.id}`)
      console.log(`Batch Number:   #${execResult.batch.batch_number}`)
      console.log(`Status:         ${execResult.status}`)
      console.log(`Success Count:  ${execResult.success_count}`)
      console.log(`Error Count:    ${execResult.error_count}`)
      console.log(`Issues Logged:  ${execResult.issue_count}`)
    } catch (err) {
      console.error(`✗ Migration execution failed: ${err.message}`)
      process.exit(1)
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal CLI Error:', err)
    process.exit(1)
  })
}

module.exports = { main }
