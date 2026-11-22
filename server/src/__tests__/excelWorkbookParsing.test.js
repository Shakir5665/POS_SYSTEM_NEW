'use strict';

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const {
  parseWorkbook,
  calculateSha256,
  getWorksheetRows,
  KNOWN_ORIGINAL_SHA256,
  KNOWN_REPAIRED_SHA256,
} = require('../services/migration/excelParser');

const WORKBOOK_PATH = path.resolve(__dirname, '../../../NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx');

describe('Phase 4B: Excel Workbook Parsing & Provenance Suite', () => {
  it('should verify the authentic repaired workbook SHA-256 fingerprint and file size', () => {
    expect(fs.existsSync(WORKBOOK_PATH)).toBe(true);
    const stat = fs.statSync(WORKBOOK_PATH);
    expect(stat.size).toBe(13789816);

    const sha256 = calculateSha256(WORKBOOK_PATH);
    expect(sha256).toBe(KNOWN_REPAIRED_SHA256);
    expect(sha256).toBe('6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7');
  });

  it('should parse the authentic workbook and verify all 28 sheets are present', () => {
    const result = parseWorkbook(WORKBOOK_PATH);
    expect(result.isValidStructure).toBe(true);
    expect(result.missingExpectedSheets.length).toBe(0);
    expect(result.sheetNames.length).toBe(28);
    expect(result.provenance.isApprovedRepaired).toBe(true);
    expect(result.provenance.isOriginalExport).toBe(false);
  });

  it('should detect when an expected sheet is missing from a workbook', () => {
    // Create an in-memory workbook with a missing sheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID', 'Name']]), 'Products');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = parseWorkbook(buf);
    expect(result.isValidStructure).toBe(false);
    expect(result.missingExpectedSheets).toContain('Sales');
    expect(result.missingExpectedSheets).toContain('Sale_Items');
  });

  it('should throw CORRUPTED_XLSX when given invalid or corrupted XLSX data', () => {
    const invalidBuffer = Buffer.from('NOT_A_VALID_XLSX_ZIP_ARCHIVE');
    expect(() => parseWorkbook(invalidBuffer)).toThrow(/Corrupted or unreadable XLSX file/);
  });

  it('should extract worksheet rows with row-level traceability metadata', () => {
    const result = parseWorkbook(WORKBOOK_PATH);
    const customers = getWorksheetRows(result.workbook, 'Customers', result.sha256);

    expect(customers.length).toBe(9);
    for (const c of customers) {
      expect(c.__trace).toBeDefined();
      expect(c.__trace.sha256).toBe(KNOWN_REPAIRED_SHA256);
      expect(c.__trace.sheetName).toBe('Customers');
      expect(typeof c.__trace.sourceRow).toBe('number');
      expect(typeof c.__trace.sourceEntityId).toBe('string');
    }
  });

  it('should correctly extract exact data rows for all master reference sheets', () => {
    const result = parseWorkbook(WORKBOOK_PATH);
    const warehouses = getWorksheetRows(result.workbook, 'Warehouses', result.sha256);
    const suppliers = getWorksheetRows(result.workbook, 'Suppliers', result.sha256);
    const categories = getWorksheetRows(result.workbook, 'Product_Categories', result.sha256);
    const brands = getWorksheetRows(result.workbook, 'Brands', result.sha256);
    const baseUnits = getWorksheetRows(result.workbook, 'Base_Units', result.sha256);
    const units = getWorksheetRows(result.workbook, 'Units', result.sha256);

    expect(warehouses.length).toBe(1);
    expect(suppliers.length).toBe(1);
    expect(categories.length).toBe(37);
    expect(brands.length).toBe(51);
    expect(baseUnits.length).toBe(6);
    expect(units.length).toBe(6);
  });
});
