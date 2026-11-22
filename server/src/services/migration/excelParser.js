'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const KNOWN_ORIGINAL_SHA256 = 'e3d837e544b020f68c032575e40cc76fb0de8e4cca464d4fdc9bd64005f697f9';
const KNOWN_REPAIRED_SHA256 = '6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7';

const EXPECTED_SHEETS = [
  'Overview',
  'Products',
  'Sales',
  'Sale_Items',
  'Purchases',
  'Purchase_Items',
  'Adjustments',
  'Adjustment_Items',
  'Customers',
  'Suppliers',
  'Product_Categories',
  'Brands',
  'Warehouses',
  'Units',
  'Base_Units',
  'Expenses',
  'Expense_Categories',
  'Users',
  'Roles_Permissions',
  'Currencies',
  'Settings',
  'START_HERE',
  'RECON_SUMMARY',
  'SALES_BF',
  'PURCHASES_BF',
  'EXCEPTIONS',
  'NEGATIVE_LINES',
  'SHEET_MAPPING',
];

/**
 * Calculates SHA-256 fingerprint of a file or buffer.
 */
function calculateSha256(input) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(input)) {
    hash.update(input);
  } else if (typeof input === 'string') {
    if (fs.existsSync(input)) {
      hash.update(fs.readFileSync(input));
    } else {
      hash.update(Buffer.from(input));
    }
  } else {
    throw new Error('Invalid input for SHA-256 calculation');
  }
  return hash.digest('hex').toLowerCase();
}

/**
 * Parses and inspects the workbook.
 *
 * @param {string|Buffer} source - File path or buffer
 * @param {Object} [options]
 * @returns {Object} Inspection result { sha256, size, sheetNames, sheets, isValidStructure }
 */
function parseWorkbook(source, options = {}) {
  let buffer;
  let filePath = null;

  if (Buffer.isBuffer(source)) {
    buffer = source;
  } else if (typeof source === 'string') {
    filePath = path.resolve(source);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Workbook file not found at ${filePath}`);
    }
    buffer = fs.readFileSync(filePath);
  } else {
    throw new Error('parseWorkbook expects a file path string or Buffer');
  }

  const sha256 = calculateSha256(buffer);
  const size = buffer.length;

  // Verify XLSX ZIP magic header (0x50, 0x4B, 0x03, 0x04)
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    const error = new Error('Corrupted or unreadable XLSX file: Invalid ZIP archive header');
    error.code = 'CORRUPTED_XLSX';
    throw error;
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    const error = new Error(`Corrupted or unreadable XLSX file: ${err.message}`);
    error.code = 'CORRUPTED_XLSX';
    throw error;
  }

  const sheetNames = workbook.SheetNames || [];
  const missingExpectedSheets = EXPECTED_SHEETS.filter(s => !sheetNames.includes(s));
  const isValidStructure = missingExpectedSheets.length === 0;

  const isApprovedRepaired = sha256 === KNOWN_REPAIRED_SHA256;
  const isOriginalExport = sha256 === KNOWN_ORIGINAL_SHA256;

  return {
    workbook,
    filePath,
    sha256,
    size,
    sheetNames,
    missingExpectedSheets,
    isValidStructure,
    provenance: {
      isApprovedRepaired,
      isOriginalExport,
      knownRepairedSha256: KNOWN_REPAIRED_SHA256,
      knownOriginalSha256: KNOWN_ORIGINAL_SHA256,
    },
  };
}

/**
 * Reads data rows from a specific worksheet with source traceability.
 *
 * @param {Object} workbook - Parsed XLSX workbook object
 * @param {string} sheetName - Target worksheet name
 * @param {string} sha256 - File SHA-256 for row-level audit traceability
 * @returns {Array<Object>} Rows with __trace metadata
 */
function getWorksheetRows(workbook, sheetName, sha256 = null) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Worksheet '${sheetName}' does not exist in workbook`);
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return rawRows.map((row, index) => {
    // Determine source primary entity ID
    const sourceId =
      row['Sale ID'] ??
      row['Sale Item ID'] ??
      row['Purchase ID'] ??
      row['Item ID'] ??
      row['Product ID'] ??
      row['Customer ID'] ??
      row['Supplier ID'] ??
      row['Adjustment ID'] ??
      row['Adjustment Item ID'] ??
      row['Expense ID'] ??
      row['User ID'] ??
      row['Role ID'] ??
      row['Category ID'] ??
      row['Brand ID'] ??
      row['Unit ID'] ??
      row['Base Unit ID'] ??
      row['Warehouse ID'] ??
      index + 1;

    return {
      ...row,
      __trace: {
        sha256,
        sheetName,
        sourceRow: index + 2, // 1-based, skipping header row
        sourceEntityId: String(sourceId),
      },
    };
  });
}

module.exports = {
  KNOWN_ORIGINAL_SHA256,
  KNOWN_REPAIRED_SHA256,
  EXPECTED_SHEETS,
  calculateSha256,
  parseWorkbook,
  getWorksheetRows,
};
