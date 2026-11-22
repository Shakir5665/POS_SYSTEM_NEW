'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { detectTable } = require('./tableDetector');

const MAX_CELL_LIMIT = 3000000; // Safeguard against ZIP bomb / decompression bomb
const MAX_ROW_LIMIT = 150000;
const MAX_COL_LIMIT = 200;

/**
 * Accurately calculate the populated bounding range of a worksheet.
 * Fixes Microsoft Excel / LibreOffice full-column styling where !ref is artificially
 * inflated to the bottom of the worksheet grid (e.g. A1:Q1048576).
 */
function getActualSheetRange(worksheet) {
  let minR = Infinity;
  let maxR = -1;
  let minC = Infinity;
  let maxC = -1;

  for (const key of Object.keys(worksheet)) {
    if (key.startsWith('!')) continue;
    const cell = worksheet[key];
    if (
      !cell ||
      cell.v === undefined ||
      cell.v === null ||
      (typeof cell.v === 'string' && cell.v.trim() === '')
    ) {
      continue;
    }
    const decoded = XLSX.utils.decode_cell(key);
    if (decoded.r < minR) minR = decoded.r;
    if (decoded.r > maxR) maxR = decoded.r;
    if (decoded.c < minC) minC = decoded.c;
    if (decoded.c > maxC) maxC = decoded.c;
  }

  if (maxR === -1 || maxC === -1) {
    return null;
  }

  return {
    s: { r: minR, c: minC },
    e: { r: maxR, c: maxC },
  };
}

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
 * Parse a single-table Excel workbook, extract headers & rows, and run automatic table detection.
 *
 * @param {string|Buffer} source - File path or buffer
 * @param {Object} [options]
 * @param {string} [options.filename] - Original file name
 * @param {string} [options.sheetName] - Selected sheet name (defaults to first sheet)
 * @param {string} [options.overrideTable] - User manual table override
 * @returns {Object} Parsed file and table detection metadata
 */
function parseSingleTableWorkbook(source, options = {}) {
  let buffer;
  let filePath = null;
  const originalFilename = options.filename || (typeof source === 'string' ? path.basename(source) : 'uploaded_file.xlsx');

  if (Buffer.isBuffer(source)) {
    buffer = source;
  } else if (typeof source === 'string') {
    filePath = path.resolve(source);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Workbook file not found at ${filePath}`);
    }
    buffer = fs.readFileSync(filePath);
  } else {
    throw new Error('parseSingleTableWorkbook expects a file path string or Buffer');
  }

  const fileHash = calculateSha256(buffer);
  const fileSize = buffer.length;

  // Validate ZIP magic numbers (0x50, 0x4B, 0x03, 0x04)
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    const error = new Error('Corrupted or invalid XLSX file: Invalid ZIP archive header.');
    error.code = 'CORRUPTED_XLSX';
    throw error;
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellFormula: false, // Do not evaluate formulas for security
    });
  } catch (err) {
    const error = new Error(`Corrupted or unreadable XLSX file: ${err.message}`);
    error.code = 'CORRUPTED_XLSX';
    throw error;
  }

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    const error = new Error('The uploaded Excel workbook contains no worksheets.');
    error.code = 'EMPTY_WORKBOOK';
    throw error;
  }

  // Select target sheet
  const selectedSheetName = options.sheetName && sheetNames.includes(options.sheetName) ? options.sheetName : sheetNames[0];
  const worksheet = workbook.Sheets[selectedSheetName];
  if (!worksheet) {
    const error = new Error(`Worksheet "${selectedSheetName}" not found in workbook.`);
    error.code = 'WORKSHEET_NOT_FOUND';
    throw error;
  }

  // Recalculate true populated bounds (fixes Excel's unbounded full-column styling A1:Q1048576)
  const actualRange = getActualSheetRange(worksheet);
  if (actualRange) {
    worksheet['!ref'] = XLSX.utils.encode_range(actualRange);
  }

  // Check bounds against actual populated dimensions
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  const numRows = range.e.r - range.s.r + 1;
  const numCols = range.e.c - range.s.c + 1;

  if (numRows * numCols > MAX_CELL_LIMIT || numRows > MAX_ROW_LIMIT || numCols > MAX_COL_LIMIT) {
    const error = new Error(
      `File exceeds maximum processing dimensions (rows: ${numRows}, columns: ${numCols}). Potential decompression risk.`
    );
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }

  // Convert worksheet to array of arrays (AOA) with header on row 0
  const aoa = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: false,
    dateNF: 'yyyy-mm-dd hh:mm:ss',
  });

  if (aoa.length === 0) {
    const error = new Error('Worksheet has no data or header rows.');
    error.code = 'EMPTY_SHEET';
    throw error;
  }

  // Header row (Row 0)
  const rawHeaders = aoa[0] || [];
  const headers = rawHeaders.map((h) => String(h || '').trim()).filter(Boolean);

  if (headers.length === 0) {
    const error = new Error('Worksheet has an empty header row. Row 1 must contain exact database column names.');
    error.code = 'NO_HEADERS_FOUND';
    throw error;
  }

  // Extract data rows
  const rawRows = [];
  for (let r = 1; r < aoa.length; r++) {
    const rowArray = aoa[r];
    if (!rowArray || rowArray.length === 0) continue;

    // Check if entire row is empty
    const hasValues = rowArray.some((c) => c !== null && c !== undefined && String(c).trim() !== '');
    if (!hasValues) continue;

    const rowObj = {};
    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      const val = rowArray[c];
      rowObj[colName] = val !== undefined ? val : null;
    }
    rawRows.push(rowObj);
  }

  // Run automatic table detection
  const detectionResult = detectTable({
    headers,
    sheetName: selectedSheetName,
    filename: originalFilename,
    rowCount: rawRows.length,
    overrideTable: options.overrideTable,
  });

  return {
    filename: originalFilename,
    fileHash,
    fileSize,
    sheetName: selectedSheetName,
    sheetNames,
    hasMultipleSheets: sheetNames.length > 1,
    headers,
    totalRows: rawRows.length,
    detection: detectionResult,
    previewRows: rawRows.slice(0, 50),
    rawRows,
  };
}

module.exports = {
  parseSingleTableWorkbook,
  calculateSha256,
};
