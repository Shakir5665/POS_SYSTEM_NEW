'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const WORKBOOK_PATH = path.resolve(__dirname, '../../NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx');

async function main() {
  console.log('--- Phase 4B Workbook Inspection ---');
  if (!fs.existsSync(WORKBOOK_PATH)) {
    console.error(`ERROR: Workbook not found at ${WORKBOOK_PATH}`);
    process.exit(1);
  }

  const stat = fs.statSync(WORKBOOK_PATH);
  console.log(`File: ${WORKBOOK_PATH}`);
  console.log(`Size: ${stat.size} bytes (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);

  // Calculate SHA-256
  const fileBuffer = fs.readFileSync(WORKBOOK_PATH);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  console.log(`SHA-256: ${sha256}`);

  // Test ZIP / XLSX readability
  console.log('Reading workbook...');
  const t0 = Date.now();
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  console.log(`Workbook loaded in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  console.log(`Total sheets: ${workbook.SheetNames.length}`);
  console.log('Sheet names:', workbook.SheetNames);

  const sheetInventory = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Get range
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const rowCount = range.e.r; // e.r is max row index (0-based)
    // Read header row
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
      headers.push(cell ? String(cell.v).trim() : `COL_${c}`);
    }

    // Convert sheet to json to count exact non-empty data rows
    const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
    sheetInventory.push({
      sheetName,
      headerCount: headers.length,
      headers: headers.slice(0, 15), // sample
      allHeaders: headers,
      jsonRowCount: data.length,
      rawRowCount: rowCount,
    });

    console.log(`Sheet [${sheetName}]: ${data.length} data rows, ${headers.length} columns`);
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'workbook-inventory.json'),
    JSON.stringify({ sha256, size: stat.size, sheetInventory }, null, 2)
  );
  console.log('Inspection saved to server/scripts/workbook-inventory.json');
}

main().catch(err => {
  console.error('Fatal inspection error:', err);
  process.exit(1);
});
