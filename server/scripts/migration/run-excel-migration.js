#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { runExcelImport, rollbackExcelBatch } = require('../../src/services/migration/excelImportEngine');

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isRollback = args.includes('--rollback');
  const rollbackIdx = args.indexOf('--rollback');
  const rollbackBatchId = rollbackIdx !== -1 ? args[rollbackIdx + 1] : null;

  const defaultWorkbookPath = path.resolve(__dirname, '..', '..', '..', 'NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx');
  const fileIdx = args.indexOf('--file');
  const workbookPath = fileIdx !== -1 ? path.resolve(process.cwd(), args[fileIdx + 1]) : defaultWorkbookPath;

  console.log('\n=============================================================');
  console.log('       NexTill POS — Phase 4B Excel Migration CLI            ');
  console.log('=============================================================\n');

  if (isRollback) {
    if (!rollbackBatchId) {
      console.error('Error: --rollback requires a batch ID.');
      process.exit(1);
    }
    console.log(`Executing rollback for batch: ${rollbackBatchId}...`);
    const res = await rollbackExcelBatch(rollbackBatchId);
    console.log('Rollback completed:', res);
    return;
  }

  const dryRun = !isExecute;
  console.log(`Mode: ${dryRun ? 'DRY-RUN (Zero Database Mutations)' : 'LIVE IMPORT EXECUTION'}`);
  console.log(`Target Database: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@') : 'UNSET'}`);
  console.log(`Workbook: ${workbookPath}\n`);

  const result = await runExcelImport({
    source: workbookPath,
    dryRun,
    onProgress: p => console.log(`[${p.percent}%] ${p.phase}: ${p.message}`)
  });

  console.log('\nResult Status:', result.status);
  if (result.batchId) console.log('Batch ID:', result.batchId);
  if (result.importedCounts) console.log('Imported Entity Counts:\n', JSON.stringify(result.importedCounts, null, 2));
}

main().catch(err => {
  console.error('\nMigration Error:', err.message);
  process.exit(1);
});
