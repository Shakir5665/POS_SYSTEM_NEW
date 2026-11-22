'use strict';

/**
 * NexTill POS — Phase 4B Historical Excel Import Complete Field Mapping Specification
 *
 * Explicit mapping definitions for all 28 worksheets (21 original source sheets +
 * 7 supplementary reconciliation/exception sheets) in accordance with Section 4.
 */

const SHEET_DISPOSITIONS = {
  Overview: { disposition: 'AUDIT_ONLY', description: 'Informational workbook metadata; not imported as business records' },
  Products: { disposition: 'IMPORT', description: 'Master catalog records; Product.quantity stock figures isolated' },
  Sales: { disposition: 'IMPORT', description: 'Historical sales transactions (is_legacy_import: true)' },
  Sale_Items: { disposition: 'IMPORT', description: 'Historical sales line items with Decimal subtotal calculation' },
  Purchases: { disposition: 'IMPORT', description: 'Historical purchases (is_legacy_import: true)' },
  Purchase_Items: { disposition: 'IMPORT', description: 'Historical purchase line items with Decimal cost' },
  Adjustments: { disposition: 'IMPORT_AUDIT', description: 'Historical inventory adjustments (zero Product.quantity mutation, full audit preservation in StockAdjustment)' },
  Adjustment_Items: { disposition: 'IMPORT_AUDIT', description: 'Historical inventory adjustment line items (zero Product.quantity mutation, full audit preservation in StockAdjustmentItem)' },
  Customers: { disposition: 'IMPORT', description: 'Customer master records with legacy ID mapping' },
  Suppliers: { disposition: 'IMPORT', description: 'Supplier master records with legacy ID mapping' },
  Product_Categories: { disposition: 'IMPORT', description: 'Category master records' },
  Brands: { disposition: 'AUDIT_ONLY', description: 'Preserved in LegacyIdMap metadata for audit' },
  Warehouses: { disposition: 'IMPORT', description: 'Mapped to default warehouse (WH-001 / Main Warehouse)' },
  Units: { disposition: 'REFERENCE', description: 'Legacy transaction units referenced by Sale/Purchase Unit ID' },
  Base_Units: { disposition: 'REFERENCE', description: 'Product base units referenced by Product Unit ID' },
  Expenses: { disposition: 'IMPORT', description: 'Historical operating expenses (is_legacy_import: true)' },
  Expense_Categories: { disposition: 'IMPORT', description: 'Expense categories (Preserves authentic Category 5 "home"; proposed reclassification to store utility pending admin approval)' },
  Users: { disposition: 'AUDIT_ONLY', description: 'Reference only; no credentials or permissions imported' },
  Roles_Permissions: { disposition: 'AUDIT_ONLY', description: 'Reference only; no RBAC grants imported' },
  Currencies: { disposition: 'AUDIT_ONLY', description: 'Reference currency (LKR / Rs.)' },
  Settings: { disposition: 'AUDIT_ONLY', description: 'Reference system configuration' },
  START_HERE: { disposition: 'RECONCILIATION_ONLY', description: 'Control workbook metadata and provenance' },
  RECON_SUMMARY: { disposition: 'RECONCILIATION_ONLY', description: 'Control reconciliation benchmark figures' },
  SALES_BF: { disposition: 'RECONCILIATION_ONLY', description: '5,813 flagged sales with signed B/F difference' },
  PURCHASES_BF: { disposition: 'RECONCILIATION_ONLY', description: '65 flagged purchases with 0 line items' },
  EXCEPTIONS: { disposition: 'RECONCILIATION_ONLY', description: '145 exceptions requiring review/quarantine' },
  NEGATIVE_LINES: { disposition: 'RECONCILIATION_ONLY', description: '1 negative-quantity sale item (ID 141432)' },
  SHEET_MAPPING: { disposition: 'RECONCILIATION_ONLY', description: 'Source workbook mapping notes' },
};

const BASE_UNIT_MAPPING = {
  '1': { name: 'piece', base_unit: 'pcs', unit_category: 'COUNT' },
  '2': { name: 'METER', base_unit: 'm', unit_category: 'COUNT' },
  '3': { name: 'kilogram', base_unit: 'kg', unit_category: 'WEIGHT' },
  '4': { name: 'yard', base_unit: 'yd', unit_category: 'COUNT' },
  '5': { name: 'box', base_unit: 'box', unit_category: 'COUNT' },
  '6': { name: 'LITER', base_unit: 'l', unit_category: 'VOLUME' },
};

const UNIT_MAPPING = {
  '2': { name: 'Box', short_name: 'Box', baseUnitId: '1', factor: 1, uom: 'box' },
  '6': { name: 'peice', short_name: 'peice', baseUnitId: '1', factor: 1, uom: 'pcs' },
  '7': { name: 'WEIGHT', short_name: 'kg', baseUnitId: '3', factor: 1, uom: 'kg' },
  '8': { name: 'METER', short_name: 'M', baseUnitId: '2', factor: 1, uom: 'm' },
  '9': { name: 'LITER', short_name: 'L', baseUnitId: '6', factor: 1, uom: 'l' },
  '10': { name: 'GRAM', short_name: 'g', baseUnitId: '3', factor: 0.001, uom: 'g' },
};

const PRODUCT_FIELD_MAPPING = [
  { sourceCol: 'Product ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'legacy_id', required: true, conversion: 'String' },
  { sourceCol: 'Product Name', type: 'String', targetModel: 'Product', targetField: 'name', required: true, conversion: 'Trim' },
  { sourceCol: 'Product Code', type: 'String', targetModel: 'Product', targetField: 'sku', required: true, conversion: 'Trim' },
  { sourceCol: 'Code / Barcode', type: 'String', targetModel: 'Product', targetField: 'barcode', required: false, conversion: 'TrimNull' },
  { sourceCol: 'Category ID', type: 'Integer', targetModel: 'Product', targetField: 'category_id', required: false, conversion: 'ResolveCategoryFK' },
  { sourceCol: 'Brand ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'metadata.brand_id', required: false, conversion: 'StoreMetadata' },
  { sourceCol: 'Product Cost', type: 'Decimal', targetModel: 'Product', targetField: 'cost_price', required: false, conversion: 'ToDecimalOrNull' },
  { sourceCol: 'Product Price (Selling)', type: 'Decimal', targetModel: 'Product', targetField: 'price', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Our Price', type: 'Decimal', targetModel: 'Product', targetField: 'our_price', required: false, conversion: 'ToDecimalOrZero' },
  { sourceCol: 'In Stock Quantity', type: 'Decimal', targetModel: 'None', targetField: 'metadata.in_stock_quantity', required: false, conversion: 'AuditOnly_ZeroLiveStockDrift' },
  { sourceCol: 'Stock Alert Limit', type: 'Decimal', targetModel: 'Product', targetField: 'low_stock_threshold', required: false, conversion: 'ToDecimalOrDefault10' },
  { sourceCol: 'Product Unit ID', type: 'Integer', targetModel: 'Product', targetField: 'base_unit / unit_category', required: true, conversion: 'ResolveBaseUnit' },
  { sourceCol: 'Sale Unit ID', type: 'Integer', targetModel: 'Product', targetField: 'pricing_unit', required: false, conversion: 'ResolveSaleUnit' },
  { sourceCol: 'Purchase Unit ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'metadata.purchase_unit_id', required: false, conversion: 'StoreMetadata' },
  { sourceCol: 'Product Image URL', type: 'String', targetModel: 'Product', targetField: 'image_url', required: false, conversion: 'TrimNull' },
  { sourceCol: 'Created At', type: 'DateTime', targetModel: 'Product', targetField: 'created_at', required: false, conversion: 'ToDate' },
];

const SALE_FIELD_MAPPING = [
  { sourceCol: 'Sale ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'legacy_id', required: true, conversion: 'String' },
  { sourceCol: 'Reference Code', type: 'String', targetModel: 'Sale', targetField: 'sale_number', required: true, conversion: 'PrefixLEGACY' },
  { sourceCol: 'Date', type: 'DateTime', targetModel: 'Sale', targetField: 'sale_date', required: true, conversion: 'ToDate' },
  { sourceCol: 'Customer ID', type: 'Integer', targetModel: 'Sale', targetField: 'customer_id', required: false, conversion: 'ResolveCustomerFK' },
  { sourceCol: 'Warehouse ID', type: 'Integer', targetModel: 'Sale', targetField: 'warehouse_id', required: false, conversion: 'ResolveWarehouseFK' },
  { sourceCol: 'Grand Total', type: 'Decimal', targetModel: 'Sale', targetField: 'total_amount', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Paid Amount', type: 'Decimal', targetModel: 'Sale', targetField: 'amount_paid', required: false, conversion: 'ToDecimalOrZero' },
  { sourceCol: 'Due Amount', type: 'Decimal', targetModel: 'Sale', targetField: 'balance_due', required: false, conversion: 'ToDecimalOrZero' },
  { sourceCol: 'Tax Amount', type: 'Decimal', targetModel: 'Sale', targetField: 'tax_amount', required: false, conversion: 'ToDecimalOrZero' },
  { sourceCol: 'Discount', type: 'Decimal', targetModel: 'Sale', targetField: 'discount_amount', required: false, conversion: 'ToDecimalOrZero' },
  { sourceCol: 'Status', type: 'Integer', targetModel: 'Sale', targetField: 'status', required: false, conversion: 'MapSaleStatus' },
  { sourceCol: 'Created At', type: 'DateTime', targetModel: 'Sale', targetField: 'created_at', required: false, conversion: 'ToDate' },
];

const SALE_ITEM_FIELD_MAPPING = [
  { sourceCol: 'Sale Item ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'legacy_id', required: true, conversion: 'String' },
  { sourceCol: 'Sale ID', type: 'Integer', targetModel: 'SaleItem', targetField: 'sale_id', required: true, conversion: 'ResolveSaleParentFK' },
  { sourceCol: 'Product ID', type: 'Integer', targetModel: 'SaleItem', targetField: 'product_id', required: true, conversion: 'ResolveProductFK' },
  { sourceCol: 'Product Name', type: 'String', targetModel: 'SaleItem', targetField: 'product_name', required: true, conversion: 'Trim' },
  { sourceCol: 'Product Code', type: 'String', targetModel: 'SaleItem', targetField: 'product_sku', required: false, conversion: 'Trim' },
  { sourceCol: 'Net Unit Price', type: 'Decimal', targetModel: 'SaleItem', targetField: 'unit_price', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Quantity', type: 'Decimal', targetModel: 'SaleItem', targetField: 'quantity', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Unit', type: 'String', targetModel: 'SaleItem', targetField: 'unit', required: false, conversion: 'NormalizeUnit' },
  { sourceCol: 'Sub Total', type: 'Decimal', targetModel: 'SaleItem', targetField: 'total', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Tax Amount', type: 'Decimal', targetModel: 'SaleItem', targetField: 'tax_amount', required: false, conversion: 'ToDecimalOrZero' },
  { sourceCol: 'Discount Amount', type: 'Decimal', targetModel: 'SaleItem', targetField: 'discount_amount', required: false, conversion: 'ToDecimalOrZero' },
];

const PURCHASE_FIELD_MAPPING = [
  { sourceCol: 'Purchase ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'legacy_id', required: true, conversion: 'String' },
  { sourceCol: 'Reference Code', type: 'String', targetModel: 'Purchase', targetField: 'purchase_number', required: true, conversion: 'PrefixLEGACY' },
  { sourceCol: 'Date', type: 'DateTime', targetModel: 'Purchase', targetField: 'purchase_date', required: true, conversion: 'ToDate' },
  { sourceCol: 'Supplier ID', type: 'Integer', targetModel: 'Purchase', targetField: 'supplier_id', required: false, conversion: 'ResolveSupplierFK' },
  { sourceCol: 'Warehouse ID', type: 'Integer', targetModel: 'Purchase', targetField: 'warehouse_id', required: false, conversion: 'ResolveWarehouseFK' },
  { sourceCol: 'Grand Total', type: 'Decimal', targetModel: 'Purchase', targetField: 'total_amount', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Tax Amount', type: 'Decimal', targetModel: 'Purchase', targetField: 'tax_amount', required: false, conversion: 'ToDecimalOrZero' },
  { sourceCol: 'Status', type: 'Integer', targetModel: 'Purchase', targetField: 'status', required: false, conversion: 'MapPurchaseStatus' },
  { sourceCol: 'Created At', type: 'DateTime', targetModel: 'Purchase', targetField: 'created_at', required: false, conversion: 'ToDate' },
];

const PURCHASE_ITEM_FIELD_MAPPING = [
  { sourceCol: 'Item ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'legacy_id', required: true, conversion: 'String' },
  { sourceCol: 'Purchase ID', type: 'Integer', targetModel: 'PurchaseItem', targetField: 'purchase_id', required: true, conversion: 'ResolvePurchaseParentFK' },
  { sourceCol: 'Product ID', type: 'Integer', targetModel: 'PurchaseItem', targetField: 'product_id', required: true, conversion: 'ResolveProductFK' },
  { sourceCol: 'Product Name', type: 'String', targetModel: 'PurchaseItem', targetField: 'product_name', required: true, conversion: 'Trim' },
  { sourceCol: 'Product Code', type: 'String', targetModel: 'PurchaseItem', targetField: 'product_sku', required: false, conversion: 'Trim' },
  { sourceCol: 'Net Unit Cost', type: 'Decimal', targetModel: 'PurchaseItem', targetField: 'unit_cost', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Quantity', type: 'Decimal', targetModel: 'PurchaseItem', targetField: 'quantity', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Unit', type: 'String', targetModel: 'PurchaseItem', targetField: 'unit', required: false, conversion: 'NormalizeUnit' },
  { sourceCol: 'Sub Total', type: 'Decimal', targetModel: 'PurchaseItem', targetField: 'total_cost', required: true, conversion: 'ToDecimal' },
];

const ADJUSTMENT_FIELD_MAPPING = [
  { sourceCol: 'Adjustment ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'legacy_id', required: true, conversion: 'String' },
  { sourceCol: 'Reference Code', type: 'String', targetModel: 'StockAdjustment', targetField: 'adjustment_number', required: true, conversion: 'PrefixLEGACY' },
  { sourceCol: 'Date', type: 'DateTime', targetModel: 'StockAdjustment', targetField: 'adjustment_date', required: true, conversion: 'ToDate' },
  { sourceCol: 'Warehouse ID', type: 'Integer', targetModel: 'StockAdjustment', targetField: 'warehouse_id', required: false, conversion: 'ResolveWarehouseFK' },
  { sourceCol: 'Total Products', type: 'Integer', targetModel: 'StockAdjustment', targetField: 'notes', required: false, conversion: 'StoreMetadata' },
  { sourceCol: 'Created At', type: 'DateTime', targetModel: 'StockAdjustment', targetField: 'created_at', required: false, conversion: 'ToDate' },
];

const ADJUSTMENT_ITEM_FIELD_MAPPING = [
  { sourceCol: 'Adjustment Item ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'legacy_id', required: true, conversion: 'String' },
  { sourceCol: 'Adjustment ID', type: 'Integer', targetModel: 'StockAdjustmentItem', targetField: 'adjustment_id', required: true, conversion: 'ResolveAdjustmentParentFK' },
  { sourceCol: 'Product ID', type: 'Integer', targetModel: 'StockAdjustmentItem', targetField: 'product_id', required: true, conversion: 'ResolveProductFK' },
  { sourceCol: 'Quantity', type: 'Decimal', targetModel: 'StockAdjustmentItem', targetField: 'quantity_change', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Method Type', type: 'Integer', targetModel: 'StockAdjustmentItem', targetField: 'method_type', required: false, conversion: 'ToInteger' },
  { sourceCol: 'Method Description', type: 'String', targetModel: 'StockAdjustmentItem', targetField: 'notes', required: false, conversion: 'Trim' },
  { sourceCol: 'Sale Unit', type: 'String', targetModel: 'StockAdjustmentItem', targetField: 'unit', required: false, conversion: 'NormalizeUnit' },
  { sourceCol: 'Created At', type: 'DateTime', targetModel: 'StockAdjustmentItem', targetField: 'created_at', required: false, conversion: 'ToDate' },
];

const EXPENSE_FIELD_MAPPING = [
  { sourceCol: 'Expense ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'legacy_id', required: true, conversion: 'String' },
  { sourceCol: 'Reference Code', type: 'String', targetModel: 'Expense', targetField: 'reference', required: true, conversion: 'Trim' },
  { sourceCol: 'Date', type: 'DateTime', targetModel: 'Expense', targetField: 'expense_date', required: true, conversion: 'ToDate' },
  { sourceCol: 'Expense Category ID', type: 'Integer', targetModel: 'Expense', targetField: 'category_id', required: true, conversion: 'ResolveExpenseCategoryFK' },
  { sourceCol: 'Amount', type: 'Decimal', targetModel: 'Expense', targetField: 'amount', required: true, conversion: 'ToDecimal' },
  { sourceCol: 'Title', type: 'String', targetModel: 'Expense', targetField: 'notes', required: false, conversion: 'Trim' },
  { sourceCol: 'Created At', type: 'DateTime', targetModel: 'Expense', targetField: 'created_at', required: false, conversion: 'ToDate' },
];

const EXPENSE_CATEGORY_FIELD_MAPPING = [
  { sourceCol: 'Expense Category ID', type: 'Integer', targetModel: 'LegacyIdMap', targetField: 'legacy_id', required: true, conversion: 'String' },
  { sourceCol: 'Name', type: 'String', targetModel: 'ExpenseCategory', targetField: 'name', required: true, conversion: 'Trim' },
];

module.exports = {
  SHEET_DISPOSITIONS,
  BASE_UNIT_MAPPING,
  UNIT_MAPPING,
  PRODUCT_FIELD_MAPPING,
  SALE_FIELD_MAPPING,
  SALE_ITEM_FIELD_MAPPING,
  PURCHASE_FIELD_MAPPING,
  PURCHASE_ITEM_FIELD_MAPPING,
  ADJUSTMENT_FIELD_MAPPING,
  ADJUSTMENT_ITEM_FIELD_MAPPING,
  EXPENSE_FIELD_MAPPING,
  EXPENSE_CATEGORY_FIELD_MAPPING,
};
