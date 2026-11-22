'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const WORKBOOK_PATH = path.resolve(__dirname, '../../NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx');

async function main() {
  console.log('Loading workbook for precise audit...');
  const fileBuffer = fs.readFileSync(WORKBOOK_PATH);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

  const getSheetData = (name) => {
    const s = workbook.Sheets[name];
    if (!s) return [];
    return XLSX.utils.sheet_to_json(s, { defval: null });
  };

  // Inspect Supplementary sheets
  const reconSummary = getSheetData('RECON_SUMMARY');
  const startHere = getSheetData('START_HERE');
  const sheetMapping = getSheetData('SHEET_MAPPING');
  const salesBf = getSheetData('SALES_BF');
  const purchasesBf = getSheetData('PURCHASES_BF');
  const exceptions = getSheetData('EXCEPTIONS');
  const negativeLines = getSheetData('NEGATIVE_LINES');

  // Master Data
  const products = getSheetData('Products');
  const customers = getSheetData('Customers');
  const suppliers = getSheetData('Suppliers');
  const categories = getSheetData('Product_Categories');
  const brands = getSheetData('Brands');
  const warehouses = getSheetData('Warehouses');
  const units = getSheetData('Units');
  const baseUnits = getSheetData('Base_Units');
  const expenses = getSheetData('Expenses');
  const expenseCategories = getSheetData('Expense_Categories');
  const users = getSheetData('Users');
  const roles = getSheetData('Roles_Permissions');
  const currencies = getSheetData('Currencies');
  const settings = getSheetData('Settings');

  // Transactions
  const sales = getSheetData('Sales');
  const saleItems = getSheetData('Sale_Items');
  const purchases = getSheetData('Purchases');
  const purchaseItems = getSheetData('Purchase_Items');
  const adjustments = getSheetData('Adjustments');
  const adjustmentItems = getSheetData('Adjustment_Items');

  console.log('\n--- 1. MASTER DATA DUPLICATE ID CHECK ---');
  function checkDuplicates(arr, idField, name) {
    const seen = new Set();
    const dupes = [];
    for (const r of arr) {
      const val = r[idField];
      if (seen.has(val)) dupes.push(val);
      seen.add(val);
    }
    console.log(`${name} (Key: ${idField}): total ${arr.length}, unique ${seen.size}, duplicates ${dupes.length}`);
    return dupes;
  }

  checkDuplicates(products, 'Product ID', 'Products');
  checkDuplicates(customers, 'Customer ID', 'Customers');
  checkDuplicates(suppliers, 'Supplier ID', 'Suppliers');
  checkDuplicates(categories, 'Category ID', 'Product_Categories');
  checkDuplicates(brands, 'Brand ID', 'Brands');
  checkDuplicates(warehouses, 'Warehouse ID', 'Warehouses');
  checkDuplicates(units, 'Unit ID', 'Units');
  checkDuplicates(baseUnits, 'Base Unit ID', 'Base_Units');
  checkDuplicates(expenses, 'Expense ID', 'Expenses');
  checkDuplicates(expenseCategories, 'Expense Category ID', 'Expense_Categories');
  checkDuplicates(sales, 'Sale ID', 'Sales');
  checkDuplicates(saleItems, 'Sale Item ID', 'Sale_Items');
  checkDuplicates(purchases, 'Purchase ID', 'Purchases');
  checkDuplicates(purchaseItems, 'Item ID', 'Purchase_Items');
  checkDuplicates(adjustments, 'Adjustment ID', 'Adjustments');
  checkDuplicates(adjustmentItems, 'Adjustment Item ID', 'Adjustment_Items');

  console.log('\n--- 2. SALES RECONCILIATION ---');
  const salesMap = new Map();
  let salesGrandTotalSum = 0;
  for (const s of sales) {
    const id = s['Sale ID'];
    const gt = parseFloat(s['Grand Total'] ?? 0);
    salesGrandTotalSum += gt;
    salesMap.set(id, { header: s, items: [], grandTotal: gt });
  }

  let saleItemsSubtotalSum = 0;
  let orphanSaleItemsCount = 0;
  let negativeQtyItemsCount = 0;

  for (const it of saleItems) {
    const saleId = it['Sale ID'];
    const subtotal = parseFloat(it['Sub Total'] ?? 0);
    const qty = parseFloat(it['Quantity'] ?? 0);
    saleItemsSubtotalSum += subtotal;
    if (qty < 0) negativeQtyItemsCount++;

    if (salesMap.has(saleId)) {
      salesMap.get(saleId).items.push(it);
    } else {
      orphanSaleItemsCount++;
    }
  }

  let salesMatchedExact = 0;
  let salesWithDiff = 0;
  let salesWithZeroItems = 0;
  let calculatedSalesBfSum = 0;

  for (const [sId, record] of salesMap.entries()) {
    const itemsCount = record.items.length;
    const itemsSubtotalSum = record.items.reduce((sum, item) => sum + parseFloat(item['Sub Total'] ?? 0), 0);
    const diff = Math.round((record.grandTotal - itemsSubtotalSum) * 10000) / 10000;

    if (itemsCount === 0) {
      salesWithZeroItems++;
    }
    if (Math.abs(diff) < 0.0001) {
      salesMatchedExact++;
    } else {
      salesWithDiff++;
      calculatedSalesBfSum += diff;
    }
  }

  console.log(`Sales Header Grand Total: ${salesGrandTotalSum.toFixed(4)}`);
  console.log(`Sale Items Sub Total Sum: ${saleItemsSubtotalSum.toFixed(4)}`);
  console.log(`Sales Aggregate Difference: ${(salesGrandTotalSum - saleItemsSubtotalSum).toFixed(4)}`);
  console.log(`Sales Matched Headers (exact match): ${salesMatchedExact}`);
  console.log(`Sales B/F Discrepancy Headers: ${salesWithDiff}`);
  console.log(`Sales Missing All Items: ${salesWithZeroItems}`);
  console.log(`Total Sales with Review Issues (Discrepancy + Missing): ${salesWithDiff + salesWithZeroItems}`);
  console.log(`Orphan Sale Items: ${orphanSaleItemsCount}`);
  console.log(`Negative Qty Sale Items: ${negativeQtyItemsCount}`);
  console.log(`SALES_BF sheet row count: ${salesBf.length}`);

  console.log('\n--- 3. PURCHASES RECONCILIATION ---');
  const purchasesMap = new Map();
  let purchasesGrandTotalSum = 0;
  for (const p of purchases) {
    const id = p['Purchase ID'];
    const gt = parseFloat(p['Grand Total'] ?? 0);
    purchasesGrandTotalSum += gt;
    purchasesMap.set(id, { header: p, items: [], grandTotal: gt });
  }

  let purchaseItemsSubtotalSum = 0;
  let orphanPurchaseItemsCount = 0;
  for (const it of purchaseItems) {
    const purchaseId = it['Purchase ID'];
    const subtotal = parseFloat(it['Sub Total'] ?? 0);
    purchaseItemsSubtotalSum += subtotal;

    if (purchasesMap.has(purchaseId)) {
      purchasesMap.get(purchaseId).items.push(it);
    } else {
      orphanPurchaseItemsCount++;
    }
  }

  let purchasesMatchedExact = 0;
  let purchasesWithDiff = 0;
  let purchasesWithZeroItems = 0;
  let calculatedPurchasesBfSum = 0;

  for (const [pId, record] of purchasesMap.entries()) {
    const itemsCount = record.items.length;
    const itemsSubtotalSum = record.items.reduce((sum, item) => sum + parseFloat(item['Sub Total'] ?? 0), 0);
    const diff = Math.round((record.grandTotal - itemsSubtotalSum) * 10000) / 10000;

    if (itemsCount === 0) {
      purchasesWithZeroItems++;
    }
    if (Math.abs(diff) < 0.0001) {
      purchasesMatchedExact++;
    } else {
      purchasesWithDiff++;
      calculatedPurchasesBfSum += diff;
    }
  }

  console.log(`Purchases Header Grand Total: ${purchasesGrandTotalSum.toFixed(4)}`);
  console.log(`Purchase Items Sub Total Sum: ${purchaseItemsSubtotalSum.toFixed(4)}`);
  console.log(`Purchases Aggregate Difference: ${(purchasesGrandTotalSum - purchaseItemsSubtotalSum).toFixed(4)}`);
  console.log(`Purchases Matched Headers: ${purchasesMatchedExact}`);
  console.log(`Purchases with Diff (where items > 0): ${purchasesWithDiff - purchasesWithZeroItems}`);
  console.log(`Purchases Missing All Items: ${purchasesWithZeroItems}`);
  console.log(`Total Purchases with Review Issues: ${purchasesWithDiff}`);
  console.log(`Orphan Purchase Items: ${orphanPurchaseItemsCount}`);
  console.log(`PURCHASES_BF sheet row count: ${purchasesBf.length}`);

  console.log('\n--- 4. UNIT MAPPING AUDIT ---');
  const baseUnitIds = new Set(baseUnits.map(u => String(u['Base Unit ID'])));
  const unitIds = new Set(units.map(u => String(u['Unit ID'])));
  console.log('Base Unit IDs:', Array.from(baseUnitIds));
  console.log('Unit IDs:', Array.from(unitIds));

  let invalidProductUnitRefs = 0;
  let invalidSaleUnitRefs = 0;
  let invalidPurchaseUnitRefs = 0;

  for (const p of products) {
    const pUnit = String(p['Product Unit ID']);
    const sUnit = String(p['Sale Unit ID']);
    const puUnit = String(p['Purchase Unit ID']);

    if (!baseUnitIds.has(pUnit)) invalidProductUnitRefs++;
    if (!unitIds.has(sUnit)) invalidSaleUnitRefs++;
    if (!unitIds.has(puUnit)) invalidPurchaseUnitRefs++;
  }
  console.log(`Invalid Product Unit ID refs (to Base_Units): ${invalidProductUnitRefs}`);
  console.log(`Invalid Sale Unit ID refs (to Units): ${invalidSaleUnitRefs}`);
  console.log(`Invalid Purchase Unit ID refs (to Units): ${invalidPurchaseUnitRefs}`);

  console.log('\n--- 5. EXCEPTIONS SHEET INSPECTION ---');
  console.log(`Exceptions count: ${exceptions.length}`);
  console.log('Sample Exception:', exceptions[0]);

  console.log('\n--- 6. NEGATIVE LINES SHEET INSPECTION ---');
  console.log(`Negative lines count: ${negativeLines.length}`);
  console.log('Negative line:', negativeLines[0]);

  // Write full audit result
  const result = {
    provenance: {
      sourceFilename: 'RJ_Food_POS_Database_Export.xlsx',
      originalSha256: 'e3d837e544b020f68c032575e40cc76fb0de8e4cca464d4fdc9bd64005f697f9',
      repairedFilename: 'NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx',
      repairedSha256: '6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7',
    },
    counts: {
      overview: 21,
      products: products.length,
      sales: sales.length,
      saleItems: saleItems.length,
      purchases: purchases.length,
      purchaseItems: purchaseItems.length,
      adjustments: adjustments.length,
      adjustmentItems: adjustmentItems.length,
      customers: customers.length,
      suppliers: suppliers.length,
      categories: categories.length,
      brands: brands.length,
      warehouses: warehouses.length,
      units: units.length,
      baseUnits: baseUnits.length,
      expenses: expenses.length,
      expenseCategories: expenseCategories.length,
      users: users.length,
      roles: roles.length,
      currencies: currencies.length,
      settings: settings.length,
      salesBf: salesBf.length,
      purchasesBf: purchasesBf.length,
      exceptions: exceptions.length,
      negativeLines: negativeLines.length,
      reconSummary: reconSummary.length,
      startHere: startHere.length,
      sheetMapping: sheetMapping.length,
    },
    financialReconciliation: {
      sales: {
        headerGrandTotal: salesGrandTotalSum,
        itemsSubtotal: saleItemsSubtotalSum,
        aggregateDiff: salesGrandTotalSum - saleItemsSubtotalSum,
        matchedExact: salesMatchedExact,
        discrepancyHeaders: salesWithDiff - salesWithZeroItems,
        missingAllItems: salesWithZeroItems,
        totalIssues: salesWithDiff,
      },
      purchases: {
        headerGrandTotal: purchasesGrandTotalSum,
        itemsSubtotal: purchaseItemsSubtotalSum,
        aggregateDiff: purchasesGrandTotalSum - purchaseItemsSubtotalSum,
        matchedExact: purchasesMatchedExact,
        discrepancyHeaders: purchasesWithDiff - purchasesWithZeroItems,
        missingAllItems: purchasesWithZeroItems,
        totalIssues: purchasesWithDiff,
      },
    },
  };

  fs.writeFileSync(path.resolve(__dirname, 'precise-audit-results.json'), JSON.stringify(result, null, 2));
  console.log('\nPrecise audit complete! Saved to server/scripts/precise-audit-results.json');
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
