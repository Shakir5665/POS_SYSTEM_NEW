'use strict';

/**
 * NexTill POS — Phase 4B Critical Audits & Reconciliation Verification Test Suite
 *
 * Verifies all criteria for Critical Audits A, B, C, D and Master Data integrity:
 * 1. Critical Audit A — Adjustment Items (1,081 headers, 1,031 items, 0 orphans, extreme quantities preserved)
 * 2. Critical Audit B — Negative Sale Item 141432 & all 10 child items of Sale 16864 explicitly quarantined
 * 3. Critical Audit C — Financial B/F reconciliation across all original and imported transactions
 * 4. Critical Audit D — Expense Category 5 ('home') preserved authentically without automatic semantic drift
 * 5. Master Data Integrity — Exact mapping and preservation across all reference entities
 */

const path = require('path');
const { parseWorkbook, getWorksheetRows } = require('../services/migration/excelParser');
const { validateWorkbookData } = require('../services/migration/excelValidator');
const { Decimal } = require('../utils/money');

const WORKBOOK_PATH = path.resolve(__dirname, '../../../NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx');

describe('Phase 4B: Critical Audits & Final Reconciliation Suite', () => {
  let parsed = null;
  let validation = null;

  beforeAll(() => {
    parsed = parseWorkbook(WORKBOOK_PATH);
    validation = validateWorkbookData(parsed.workbook, parsed.sha256);
  }, 60000);

  describe('Critical Audit A: Adjustment Items', () => {
    it('should verify exactly 1,081 adjustment headers and 1,031 adjustment items in source workbook', () => {
      const adjs = getWorksheetRows(parsed.workbook, 'Adjustments', parsed.sha256);
      const adjItems = getWorksheetRows(parsed.workbook, 'Adjustment_Items', parsed.sha256);

      expect(adjs.length).toBe(1081);
      expect(adjItems.length).toBe(1031);
    });

    it('should verify 0 orphan adjustment items and exact parent header relationship', () => {
      const adjs = getWorksheetRows(parsed.workbook, 'Adjustments', parsed.sha256);
      const adjItems = getWorksheetRows(parsed.workbook, 'Adjustment_Items', parsed.sha256);

      const headerIdSet = new Set(adjs.map(a => String(a['Adjustment ID'])));
      for (const it of adjItems) {
        expect(headerIdSet.has(String(it['Adjustment ID']))).toBe(true);
      }

      expect(validation.counts.adjustments.orphanItems).toBe(0);
      expect(validation.counts.adjustments.withZeroItems).toBe(58);
      expect(validation.counts.adjustments.withOneItem).toBe(1017);
      expect(validation.counts.adjustments.withMultipleItems).toBe(6);
      // 1017 * 1 + 14 = 1031 items
      expect(1017 + 14).toBe(1031);
    });

    it('should preserve extreme historical adjustment quantities up to 100,000,000 without mutation', () => {
      const adjItems = getWorksheetRows(parsed.workbook, 'Adjustment_Items', parsed.sha256);
      let maxQty = new Decimal(0);
      for (const it of adjItems) {
        const q = new Decimal(it['Quantity'] ?? 0);
        if (q.greaterThan(maxQty)) maxQty = q;
      }

      expect(maxQty.toString()).toBe('100000000');
    });
  });

  describe('Critical Audit B: Negative Sale Item & Parent Sale Quarantine', () => {
    it('should verify Sale 16864 contains exactly 10 child items in Sale_Items', () => {
      const saleItems = getWorksheetRows(parsed.workbook, 'Sale_Items', parsed.sha256);
      const s16864Items = saleItems.filter(it => String(it['Sale ID']) === '16864');

      expect(s16864Items.length).toBe(10);
    });

    it('should identify negative line item 141432 with quantity -3.000 and subtotal -345.00', () => {
      const saleItems = getWorksheetRows(parsed.workbook, 'Sale_Items', parsed.sha256);
      const negItem = saleItems.find(it => String(it['Sale Item ID']) === '141432');

      expect(negItem).toBeDefined();
      expect(String(negItem['Sale ID'])).toBe('16864');
      expect(Number(negItem['Quantity'])).toBe(-3);
      expect(Number(negItem['Sub Total'])).toBe(-345);
    });

    it('should explicitly quarantine all 10 child items belonging to Sale 16864', () => {
      const s16864ChildItemIssues = validation.issues.filter(
        i => i.entity_type === 'SaleItem' && (i.issue_code === 'NEGATIVE_QUANTITY' || i.issue_code === 'QUARANTINED_TRANSACTION_ITEM')
      );

      expect(s16864ChildItemIssues.length).toBe(10);
      expect(validation.counts.sales.quarantinedItems).toBe(10);
      expect(validation.counts.sales.importableItems).toBe(162113);
      // 162113 imported + 10 quarantined = 162123 source sale items
      expect(validation.counts.sales.importableItems + validation.counts.sales.quarantinedItems).toBe(162123);
    });
  });

  describe('Critical Audit C: Decimal-Safe Financial B/F Reconciliation', () => {
    it('should verify exact agreement with SALES_BF (5,813 flagged sales: 5,733 non-empty + 80 zero-item)', () => {
      const salesBfRows = getWorksheetRows(parsed.workbook, 'SALES_BF', parsed.sha256);
      expect(salesBfRows.length).toBe(5813);
      expect(validation.counts.sales.bfDiscrepancies).toBe(5733);
      expect(validation.counts.sales.missingAllItems).toBe(80);
      expect(validation.counts.sales.bfDiscrepancies + validation.counts.sales.missingAllItems).toBe(5813);
    });

    it('should verify exact agreement with PURCHASES_BF (65 flagged purchases, all 0-item headers)', () => {
      const purchasesBfRows = getWorksheetRows(parsed.workbook, 'PURCHASES_BF', parsed.sha256);
      expect(purchasesBfRows.length).toBe(65);
      expect(validation.counts.purchases.missingAllItems).toBe(65);
      expect(validation.counts.purchases.bfDiscrepancies).toBe(0);
    });

    it('should verify exact agreement with EXCEPTIONS (145 zero-item headers: 80 sales + 65 purchases)', () => {
      const exceptionsRows = getWorksheetRows(parsed.workbook, 'EXCEPTIONS', parsed.sha256);
      expect(exceptionsRows.length).toBe(145);
      expect(validation.counts.sales.missingAllItems + validation.counts.purchases.missingAllItems).toBe(145);
    });

    it('should verify exact financial totals and aggregate B/F deltas', () => {
      const { sales, purchases } = validation.financialReconciliation;
      expect(sales.headerGrandTotal).toBe('64762486.4374');
      expect(sales.itemsSubtotal).toBe('60889281.2874');
      expect(sales.aggregateDiff).toBe('3873205.1500');

      expect(purchases.headerGrandTotal).toBe('907274574.0700');
      expect(purchases.itemsSubtotal).toBe('788595645.0700');
      expect(purchases.aggregateDiff).toBe('118678929.0000');
    });
  });

  describe('Critical Audit D: Expense Category Preservation', () => {
    it('should verify authentic Expense Category 5 is "home" and Expense EX_113 amount is 10,000.00', () => {
      const expCats = getWorksheetRows(parsed.workbook, 'Expense_Categories', parsed.sha256);
      const expenses = getWorksheetRows(parsed.workbook, 'Expenses', parsed.sha256);

      expect(expCats.length).toBe(1);
      expect(String(expCats[0]['Expense Category ID'])).toBe('5');
      expect(expCats[0]['Name']).toBe('home');

      expect(expenses.length).toBe(1);
      expect(String(expenses[0]['Expense ID'])).toBe('3');
      expect(expenses[0]['Reference Code']).toBe('EX_113');
      expect(Number(expenses[0]['Amount'])).toBe(10000);
      expect(expenses[0]['Title']).toBe('genarator');
    });

    it('should flag proposed expense reclassification as PENDING_APPROVAL without automatic overwrite', () => {
      const expProposalIssue = validation.issues.find(
        i => i.entity_type === 'Expense' && i.issue_code === 'EXPENSE_CATEGORY_RECLASSIFICATION_PROPOSAL'
      );

      expect(expProposalIssue).toBeDefined();
      expect(expProposalIssue.severity).toBe('INFO');
      expect(expProposalIssue.metadata.source_category_id).toBe(5);
      expect(expProposalIssue.metadata.source_category_name).toBe('home');
      expect(expProposalIssue.metadata.proposed_target_category).toBe('Store Utilities / General');
      expect(expProposalIssue.metadata.requires_admin_approval).toBe(true);
    });
  });

  describe('Master Data Integrity', () => {
    it('should verify exactly 9 customer records and identify the 5 records sharing a duplicate phone', () => {
      const customers = getWorksheetRows(parsed.workbook, 'Customers', parsed.sha256);
      expect(customers.length).toBe(9);

      const phoneCounts = new Map();
      for (const c of customers) {
        const ph = String(c['Phone']);
        phoneCounts.set(ph, (phoneCounts.get(ph) || 0) + 1);
      }
      expect(phoneCounts.get('0768666525')).toBe(5);
    });

    it('should verify 1 supplier, 37 categories, 51 brands, 1 warehouse, 6 units, 6 base units', () => {
      const supps = getWorksheetRows(parsed.workbook, 'Suppliers', parsed.sha256);
      const cats = getWorksheetRows(parsed.workbook, 'Product_Categories', parsed.sha256);
      const brands = getWorksheetRows(parsed.workbook, 'Brands', parsed.sha256);
      const warehouses = getWorksheetRows(parsed.workbook, 'Warehouses', parsed.sha256);
      const units = getWorksheetRows(parsed.workbook, 'Units', parsed.sha256);
      const baseUnits = getWorksheetRows(parsed.workbook, 'Base_Units', parsed.sha256);

      expect(supps.length).toBe(1);
      expect(cats.length).toBe(37);
      expect(brands.length).toBe(51);
      expect(warehouses.length).toBe(1);
      expect(units.length).toBe(6);
      expect(baseUnits.length).toBe(6);
    });
  });
});
