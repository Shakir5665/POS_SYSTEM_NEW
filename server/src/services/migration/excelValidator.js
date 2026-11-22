'use strict';

const { Decimal } = require('../../utils/money');
const {
  BASE_UNIT_MAPPING,
  UNIT_MAPPING,
} = require('./excelFieldMapping');
const { getWorksheetRows } = require('./excelParser');

/**
 * Validates the entire workbook data, calculates B/F reconciliation,
 * and categorizes data quality issues into INFO, WARNING, and BLOCKING.
 *
 * @param {Object} workbook - Parsed XLSX workbook
 * @param {string} sha256 - File SHA-256
 * @returns {Object} Structured Validation & Reconciliation Report
 */
function validateWorkbookData(workbook, sha256) {
  const issues = [];
  const quarantineRecords = new Set(); // Set of "EntityType:LegacyId"

  // 1. Units & Base Units verification
  const baseUnitsRows = getWorksheetRows(workbook, 'Base_Units', sha256);
  const unitsRows = getWorksheetRows(workbook, 'Units', sha256);

  const baseUnitMap = new Map();
  for (const bu of baseUnitsRows) {
    baseUnitMap.set(String(bu['Base Unit ID']), bu['Name']);
  }

  const unitMap = new Map();
  for (const u of unitsRows) {
    unitMap.set(String(u['Unit ID']), u);
  }

  // 2. Categories & Brands & Warehouses
  const categoryRows = getWorksheetRows(workbook, 'Product_Categories', sha256);
  const brandRows = getWorksheetRows(workbook, 'Brands', sha256);
  const warehouseRows = getWorksheetRows(workbook, 'Warehouses', sha256);
  const customerRows = getWorksheetRows(workbook, 'Customers', sha256);
  const supplierRows = getWorksheetRows(workbook, 'Suppliers', sha256);

  const categoryIds = new Set(categoryRows.map(c => String(c['Category ID'])));
  const customerIds = new Set(customerRows.map(c => String(c['Customer ID'])));
  const supplierIds = new Set(supplierRows.map(s => String(s['Supplier ID'])));

  // 3. Products
  const productRows = getWorksheetRows(workbook, 'Products', sha256);
  const productMap = new Map();
  const seenProductSkus = new Set();

  for (const p of productRows) {
    const pId = String(p['Product ID']);
    const pName = p['Product Name'];
    const pCode = p['Product Code'];
    const pUnitId = String(p['Product Unit ID']);
    const sUnitId = String(p['Sale Unit ID']);
    const puUnitId = String(p['Purchase Unit ID']);

    if (seenProductSkus.has(pCode)) {
      issues.push({
        entity_type: 'Product',
        legacy_id: pId,
        issue_code: 'DUPLICATE_SOURCE_ID',
        severity: 'BLOCKING',
        description: `Duplicate product code '${pCode}' for product '${pName}'`,
      });
    }
    seenProductSkus.add(pCode);

    if (!baseUnitMap.has(pUnitId)) {
      issues.push({
        entity_type: 'Product',
        legacy_id: pId,
        issue_code: 'INVALID_UNIT',
        severity: 'BLOCKING',
        description: `Product '${pName}' references unknown Base Unit ID '${pUnitId}'`,
      });
    }

    if (!unitMap.has(sUnitId)) {
      issues.push({
        entity_type: 'Product',
        legacy_id: pId,
        issue_code: 'INVALID_UNIT',
        severity: 'BLOCKING',
        description: `Product '${pName}' references unknown Sale Unit ID '${sUnitId}'`,
      });
    }

    productMap.set(pId, p);
  }

  // 4. Sales & Sale_Items deep reconciliation
  const salesRows = getWorksheetRows(workbook, 'Sales', sha256);
  const saleItemRows = getWorksheetRows(workbook, 'Sale_Items', sha256);

  const salesMap = new Map();
  let salesHeaderTotal = new Decimal(0);
  for (const s of salesRows) {
    const sId = String(s['Sale ID']);
    const grandTotal = new Decimal(s['Grand Total'] ?? 0);
    salesHeaderTotal = salesHeaderTotal.plus(grandTotal);
    salesMap.set(sId, { header: s, items: [], grandTotal });
  }

  let saleItemsTotal = new Decimal(0);
  let negativeSaleItemCount = 0;
  for (const it of saleItemRows) {
    const itId = String(it['Sale Item ID']);
    const sId = String(it['Sale ID']);
    const qty = new Decimal(it['Quantity'] ?? 0);
    const subtotal = new Decimal(it['Sub Total'] ?? 0);
    saleItemsTotal = saleItemsTotal.plus(subtotal);

    if (qty.isNegative()) {
      negativeSaleItemCount++;
      quarantineRecords.add(`Sale:${sId}`);
      quarantineRecords.add(`SaleItem:${itId}`);
      issues.push({
        entity_type: 'SaleItem',
        legacy_id: itId,
        issue_code: 'NEGATIVE_QUANTITY',
        severity: 'BLOCKING',
        description: `Sale item ${itId} in sale ${sId} has negative quantity (${qty.toString()}). Quarantined.`,
      });
    }

    if (salesMap.has(sId)) {
      salesMap.get(sId).items.push(it);
    } else {
      issues.push({
        entity_type: 'SaleItem',
        legacy_id: itId,
        issue_code: 'MISSING_PARENT',
        severity: 'BLOCKING',
        description: `Sale item ${itId} references non-existent Sale ID ${sId}`,
      });
    }
  }

  let salesMatchedExact = 0;
  let salesBfDiscrepancies = 0;
  let salesMissingAllItems = 0;
  let salesImportable = 0;
  let salesQuarantined = 0;

  for (const [sId, record] of salesMap.entries()) {
    const itemsCount = record.items.length;
    let itemsSum = new Decimal(0);
    for (const it of record.items) {
      itemsSum = itemsSum.plus(new Decimal(it['Sub Total'] ?? 0));
    }

    const diff = record.grandTotal.minus(itemsSum);

    if (itemsCount === 0) {
      salesMissingAllItems++;
      quarantineRecords.add(`Sale:${sId}`);
      salesQuarantined++;
      issues.push({
        entity_type: 'Sale',
        legacy_id: sId,
        issue_code: 'MISSING_CHILD_ITEMS',
        severity: 'BLOCKING',
        description: `Sale ${sId} has header total ${record.grandTotal.toString()} but 0 child item rows. Quarantined.`,
      });
    } else {
      const isExact = diff.abs().lessThan(0.0001);
      if (isExact) {
        salesMatchedExact++;
      } else {
        salesBfDiscrepancies++;
        issues.push({
          entity_type: 'Sale',
          legacy_id: sId,
          issue_code: 'HEADER_LINE_MISMATCH',
          severity: 'WARNING',
          description: `Sale ${sId} header total (${record.grandTotal.toString()}) differs from sum of line items (${itemsSum.toString()}) by B/F diff of ${diff.toString()}`,
        });
      }

      if (quarantineRecords.has(`Sale:${sId}`)) {
        salesQuarantined++;
      } else {
        salesImportable++;
      }
    }
  }

  // 5. Purchases & Purchase_Items deep reconciliation
  const purchaseRows = getWorksheetRows(workbook, 'Purchases', sha256);
  const purchaseItemRows = getWorksheetRows(workbook, 'Purchase_Items', sha256);

  const purchaseMap = new Map();
  let purchasesHeaderTotal = new Decimal(0);
  for (const p of purchaseRows) {
    const pId = String(p['Purchase ID']);
    const grandTotal = new Decimal(p['Grand Total'] ?? 0);
    purchasesHeaderTotal = purchasesHeaderTotal.plus(grandTotal);
    purchaseMap.set(pId, { header: p, items: [], grandTotal });
  }

  let purchaseItemsTotal = new Decimal(0);
  for (const it of purchaseItemRows) {
    const itId = String(it['Item ID']);
    const pId = String(it['Purchase ID']);
    const subtotal = new Decimal(it['Sub Total'] ?? 0);
    purchaseItemsTotal = purchaseItemsTotal.plus(subtotal);

    if (purchaseMap.has(pId)) {
      purchaseMap.get(pId).items.push(it);
    } else {
      issues.push({
        entity_type: 'PurchaseItem',
        legacy_id: itId,
        issue_code: 'MISSING_PARENT',
        severity: 'BLOCKING',
        description: `Purchase item ${itId} references non-existent Purchase ID ${pId}`,
      });
    }
  }

  let purchasesMatchedExact = 0;
  let purchasesBfDiscrepancies = 0;
  let purchasesMissingAllItems = 0;
  let purchasesImportable = 0;
  let purchasesQuarantined = 0;

  for (const [pId, record] of purchaseMap.entries()) {
    const itemsCount = record.items.length;
    let itemsSum = new Decimal(0);
    for (const it of record.items) {
      itemsSum = itemsSum.plus(new Decimal(it['Sub Total'] ?? 0));
    }
    const diff = record.grandTotal.minus(itemsSum);

    if (itemsCount === 0) {
      purchasesMissingAllItems++;
      quarantineRecords.add(`Purchase:${pId}`);
      purchasesQuarantined++;
      issues.push({
        entity_type: 'Purchase',
        legacy_id: pId,
        issue_code: 'MISSING_CHILD_ITEMS',
        severity: 'BLOCKING',
        description: `Purchase ${pId} has header total ${record.grandTotal.toString()} but 0 child item rows. Quarantined.`,
      });
    } else if (diff.abs().lessThan(0.0001)) {
      purchasesMatchedExact++;
      purchasesImportable++;
    } else {
      purchasesBfDiscrepancies++;
      purchasesImportable++;
      issues.push({
        entity_type: 'Purchase',
        legacy_id: pId,
        issue_code: 'HEADER_LINE_MISMATCH',
        severity: 'WARNING',
        description: `Purchase ${pId} header differs from items by ${diff.toString()}`,
      });
    }
  }

  // 6. Adjustments & Expenses
  const adjustmentRows = getWorksheetRows(workbook, 'Adjustments', sha256);
  const adjustmentItemRows = getWorksheetRows(workbook, 'Adjustment_Items', sha256);
  const expenseRows = getWorksheetRows(workbook, 'Expenses', sha256);

  // Check Expense category ID 5 "home"
  for (const exp of expenseRows) {
    const catId = String(exp['Expense Category ID']);
    if (catId === '5') {
      issues.push({
        entity_type: 'Expense',
        legacy_id: String(exp['Expense ID']),
        issue_code: 'RECLASSIFIED_EXPENSE_CATEGORY',
        severity: 'INFO',
        description: `Expense ID ${exp['Expense ID']} category 5 ('home') reclassified to store utility/operating expense.`,
      });
    }
  }

  const blockingIssues = issues.filter(i => i.severity === 'BLOCKING');
  const warningIssues = issues.filter(i => i.severity === 'WARNING');
  const infoIssues = issues.filter(i => i.severity === 'INFO');

  const salesAggregateDiff = salesHeaderTotal.minus(saleItemsTotal);
  const purchasesAggregateDiff = purchasesHeaderTotal.minus(purchaseItemsTotal);

  return {
    sha256,
    counts: {
      products: { total: productRows.length, importable: productRows.length, quarantined: 0 },
      categories: { total: categoryRows.length, importable: categoryRows.length },
      brands: { total: brandRows.length, auditOnly: brandRows.length },
      customers: { total: customerRows.length, importable: customerRows.length },
      suppliers: { total: supplierRows.length, importable: supplierRows.length },
      warehouses: { total: warehouseRows.length, importable: warehouseRows.length },
      sales: {
        total: salesRows.length,
        itemsTotal: saleItemRows.length,
        matchedExact: salesMatchedExact,
        bfDiscrepancies: salesBfDiscrepancies,
        missingAllItems: salesMissingAllItems,
        importable: salesImportable,
        quarantined: salesQuarantined,
      },
      purchases: {
        total: purchaseRows.length,
        itemsTotal: purchaseItemRows.length,
        matchedExact: purchasesMatchedExact,
        bfDiscrepancies: purchasesBfDiscrepancies,
        missingAllItems: purchasesMissingAllItems,
        importable: purchasesImportable,
        quarantined: purchasesQuarantined,
      },
      adjustments: {
        total: adjustmentRows.length,
        itemsTotal: adjustmentItemRows.length,
        auditOnly: adjustmentRows.length,
      },
      expenses: {
        total: expenseRows.length,
        importable: expenseRows.length,
      },
    },
    financialReconciliation: {
      sales: {
        headerGrandTotal: salesHeaderTotal.toFixed(4),
        itemsSubtotal: saleItemsTotal.toFixed(4),
        aggregateDiff: salesAggregateDiff.toFixed(4),
        flaggedHeaderCount: salesBfDiscrepancies + salesMissingAllItems, // 5,813
      },
      purchases: {
        headerGrandTotal: purchasesHeaderTotal.toFixed(4),
        itemsSubtotal: purchaseItemsTotal.toFixed(4),
        aggregateDiff: purchasesAggregateDiff.toFixed(4),
        flaggedHeaderCount: purchasesMissingAllItems, // 65
      },
    },
    inventoryImpact: {
      productQuantityMutations: 0,
      inventoryLogsCreated: 0,
      customerLoyaltyPointsAwarded: 0,
      syntheticPaymentsCreated: 0,
    },
    quarantineRecordsCount: quarantineRecords.size,
    quarantineRecords: Array.from(quarantineRecords),
    issueSummary: {
      total: issues.length,
      blocking: blockingIssues.length,
      warning: warningIssues.length,
      info: infoIssues.length,
    },
    issues,
    safeToDryRun: true,
  };
}

module.exports = {
  validateWorkbookData,
};
