'use strict';

const path = require('path');
const { parseWorkbook, getWorksheetRows } = require('../services/migration/excelParser');
const {
  BASE_UNIT_MAPPING,
  UNIT_MAPPING,
  SHEET_DISPOSITIONS,
} = require('../services/migration/excelFieldMapping');

const WORKBOOK_PATH = path.resolve(__dirname, '../../../NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx');

describe('Phase 4B: Excel Reference & Unit Mapping Suite', () => {
  let workbook = null;
  let sha256 = null;

  beforeAll(() => {
    const parsed = parseWorkbook(WORKBOOK_PATH);
    workbook = parsed.workbook;
    sha256 = parsed.sha256;
  }, 60000);

  it('should verify all 28 sheets have explicit mapping dispositions', () => {
    for (const sheet of workbook.SheetNames) {
      expect(SHEET_DISPOSITIONS[sheet]).toBeDefined();
      expect(typeof SHEET_DISPOSITIONS[sheet].disposition).toBe('string');
    }
  });

  it('should verify Product Unit ID references Base_Units while Sale/Purchase Unit ID references Units', () => {
    const products = getWorksheetRows(workbook, 'Products', sha256);
    const baseUnits = getWorksheetRows(workbook, 'Base_Units', sha256);
    const units = getWorksheetRows(workbook, 'Units', sha256);

    const validBaseUnitIds = new Set(baseUnits.map(b => String(b['Base Unit ID'])));
    const validUnitIds = new Set(units.map(u => String(u['Unit ID'])));

    expect(validBaseUnitIds.size).toBe(6);
    expect(validUnitIds.size).toBe(6);

    let invalidBaseUnitRefs = 0;
    let invalidSaleUnitRefs = 0;
    let invalidPurchaseUnitRefs = 0;

    for (const p of products) {
      const pUnit = String(p['Product Unit ID']);
      const sUnit = String(p['Sale Unit ID']);
      const puUnit = String(p['Purchase Unit ID']);

      if (!validBaseUnitIds.has(pUnit)) invalidBaseUnitRefs++;
      if (!validUnitIds.has(sUnit)) invalidSaleUnitRefs++;
      if (!validUnitIds.has(puUnit)) invalidPurchaseUnitRefs++;
    }

    expect(invalidBaseUnitRefs).toBe(0);
    expect(invalidSaleUnitRefs).toBe(0);
    expect(invalidPurchaseUnitRefs).toBe(0);
  });

  it('should correctly define base unit mappings without inventing conversion factors', () => {
    expect(BASE_UNIT_MAPPING['1'].base_unit).toBe('pcs');
    expect(BASE_UNIT_MAPPING['1'].unit_category).toBe('COUNT');

    expect(BASE_UNIT_MAPPING['3'].base_unit).toBe('kg');
    expect(BASE_UNIT_MAPPING['3'].unit_category).toBe('WEIGHT');

    expect(BASE_UNIT_MAPPING['6'].base_unit).toBe('l');
    expect(BASE_UNIT_MAPPING['6'].unit_category).toBe('VOLUME');
  });

  it('should enforce that Users, Roles_Permissions, and Settings are AUDIT_ONLY', () => {
    expect(SHEET_DISPOSITIONS['Users'].disposition).toBe('AUDIT_ONLY');
    expect(SHEET_DISPOSITIONS['Roles_Permissions'].disposition).toBe('AUDIT_ONLY');
    expect(SHEET_DISPOSITIONS['Settings'].disposition).toBe('AUDIT_ONLY');
    expect(SHEET_DISPOSITIONS['Currencies'].disposition).toBe('AUDIT_ONLY');
  });

  it('should verify expense category ID 5 ("home") maps to a store operating expense category', () => {
    const expCats = getWorksheetRows(workbook, 'Expense_Categories', sha256);
    const expenses = getWorksheetRows(workbook, 'Expenses', sha256);

    expect(expCats.length).toBe(1);
    expect(String(expCats[0]['Expense Category ID'])).toBe('5');
    expect(expCats[0]['Name']).toBe('home');

    expect(expenses.length).toBe(1);
    expect(String(expenses[0]['Expense Category ID'])).toBe('5');
    expect(expenses[0]['Title']).toBe('genarator');
    expect(Number(expenses[0]['Amount'])).toBe(10000);
  });
});
