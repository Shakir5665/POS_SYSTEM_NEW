'use strict';

const path = require('path');
const { parseWorkbook } = require('../services/migration/excelParser');
const { validateWorkbookData } = require('../services/migration/excelValidator');

const WORKBOOK_PATH = path.resolve(__dirname, '../../../NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx');

describe('Phase 4B: Excel Financial Validation & B/F Reconciliation Suite', () => {
  let validation = null;

  beforeAll(() => {
    const parsed = parseWorkbook(WORKBOOK_PATH);
    validation = validateWorkbookData(parsed.workbook, parsed.sha256);
  }, 60000);

  it('should independently verify the authentic sales financial totals and aggregate B/F difference', () => {
    const { sales } = validation.financialReconciliation;
    expect(sales.headerGrandTotal).toBe('64762486.4374');
    expect(sales.itemsSubtotal).toBe('60889281.2874');
    expect(sales.aggregateDiff).toBe('3873205.1500');
    expect(sales.flaggedHeaderCount).toBe(5813);
  });

  it('should independently verify the authentic purchases financial totals and aggregate B/F difference', () => {
    const { purchases } = validation.financialReconciliation;
    expect(purchases.headerGrandTotal).toBe('907274574.0700');
    expect(purchases.itemsSubtotal).toBe('788595645.0700');
    expect(purchases.aggregateDiff).toBe('118678929.0000');
    expect(purchases.flaggedHeaderCount).toBe(65);
  });

  it('should accurately verify exact matched sales vs B/F discrepancies vs quarantined missing-lines', () => {
    const { sales } = validation.counts;
    expect(sales.total).toBe(20602);
    expect(sales.itemsTotal).toBe(162123);
    expect(sales.matchedExact).toBe(14789);
    expect(sales.bfDiscrepancies).toBe(5733);
    expect(sales.missingAllItems).toBe(80);
    // 5733 discrepancies + 80 missing = 5813 flagged sales in SALES_BF
    expect(sales.bfDiscrepancies + sales.missingAllItems).toBe(5813);
  });

  it('should accurately verify exact matched purchases vs quarantined purchases missing items', () => {
    const { purchases } = validation.counts;
    expect(purchases.total).toBe(2710);
    expect(purchases.itemsTotal).toBe(2645);
    expect(purchases.matchedExact).toBe(2645);
    expect(purchases.bfDiscrepancies).toBe(0);
    expect(purchases.missingAllItems).toBe(65);
    // 2645 matched + 65 missing = 2710 total purchases
    expect(purchases.matchedExact + purchases.missingAllItems).toBe(2710);
  });

  it('should detect and quarantine the exactly 1 negative-quantity sale item', () => {
    const negativeIssues = validation.issues.filter(i => i.issue_code === 'NEGATIVE_QUANTITY');
    expect(negativeIssues.length).toBe(1);
    expect(negativeIssues[0].entity_type).toBe('SaleItem');
    expect(negativeIssues[0].legacy_id).toBe('141432');
    expect(negativeIssues[0].severity).toBe('BLOCKING');
  });

  it('should verify exactly 0 orphan sale items and 0 orphan purchase items exist in the workbook', () => {
    const orphanIssues = validation.issues.filter(i => i.issue_code === 'MISSING_PARENT');
    expect(orphanIssues.length).toBe(0);
  });

  it('should verify zero inventory and loyalty impact in dry-run validation', () => {
    const { inventoryImpact } = validation;
    expect(inventoryImpact.productQuantityMutations).toBe(0);
    expect(inventoryImpact.inventoryLogsCreated).toBe(0);
    expect(inventoryImpact.customerLoyaltyPointsAwarded).toBe(0);
    expect(inventoryImpact.syntheticPaymentsCreated).toBe(0);
  });
});
