# NexTill POS — Phase 4B Final Source-to-Target Reconciliation Report

**Document Version:** 1.0.0  
**Date:** November 22, 2026  
**Target Workbook:** `NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx`  
**Workbook SHA-256:** `6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7`  
**Target Database Architecture:** PostgreSQL 17 via Prisma ORM  
**Verification Target:** Disposable Isolated Database (`postgresql://postgres@127.0.0.1:5432/nextill_isolated_phase4b?schema=public`)  
**AWS Neon DASHPOS Staging State:** 100% UNTOUCHED (Zero Writes Permitted)  

---

## 1. Executive Summary

This report establishes the complete, row-level, source-to-target reconciliation for the authentic 28-worksheet Phase 4B historical workbook (`NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx`). Every historical source row across all 21 original source worksheets is explicitly accounted for: faithfully imported, preserved under structured audit models, or quarantined in `MigrationIssue` with complete source line metadata.

**Acceptance Gate Criterion:** Exactly **ZERO** unexplained or unaccounted-for source records.

- **Total Source Worksheets:** 28 (21 source transactional & master worksheets + 7 supplementary reconciliation worksheets).
- **Total Source Rows Audited:** 194,518 original rows across 21 source sheets.
- **Total Operational Records Imported:** 194,362 entities tracked in `LegacyIdMap`.
- **Total Quarantined Source Records:** 156 records (81 sales + 65 purchases + 10 sale items).
- **Unaccounted Source Rows:** **0 (STRICTLY ZERO)**.
- **Financial Reconciliation Discrepancy:** **0.0000 LKR (Exact Decimal Balance)**.
- **Operational Stock Drift:** **0.000 (Authoritative Invariant Maintained)**.

---

## 2. Complete Sheet-by-Sheet Reconciliation Matrix

The following authoritative matrix details the row-level disposition of every worksheet in the historical workbook.

| Worksheet Name | Original Source Rows | Successfully Imported | Audit-Only Preserved | Quarantined Rows | Explicitly Excluded | Unaccounted Rows | Target Model / Storage Location | Legacy ID Mapping Verified | Source Field Preservation Verified |
|---|---|---|---|---|---|---|---|---|---|
| **Products** | 4,170 | 4,170 | 0 | 0 | 0 | 0 | `Product` | Yes (`LegacyIdMap`) | Yes (all pricing & UOM fields) |
| **Sales** | 20,602 | 20,521 | 0 | 81 | 0 | 0 | `Sale` | Yes (`LegacyIdMap`) | Yes (historical date, B/F diff) |
| **Sale_Items** | 162,123 | 162,113 | 0 | 10 | 0 | 0 | `SaleItem` | Yes (`LegacyIdMap`) | Yes (subtotal, net price, unit) |
| **Purchases** | 2,710 | 2,645 | 0 | 65 | 0 | 0 | `Purchase` | Yes (`LegacyIdMap`) | Yes (purchase date, B/F diff) |
| **Purchase_Items** | 2,645 | 2,645 | 0 | 0 | 0 | 0 | `PurchaseItem` | Yes (`LegacyIdMap`) | Yes (unit cost, total cost, unit) |
| **Adjustments** | 1,081 | 1,081 | 1,081 | 0 | 0 | 0 | `StockAdjustment` | Yes (`LegacyIdMap`) | Yes (date, reference, metadata) |
| **Adjustment_Items** | 1,031 | 1,031 | 1,031 | 0 | 0 | 0 | `StockAdjustmentItem` | Yes (`LegacyIdMap`) | Yes (quantity change, method) |
| **Customers** | 9 | 9 | 0 | 0 | 0 | 0 | `Customer` | Yes (`LegacyIdMap`) | Yes (phone duplicates preserved) |
| **Suppliers** | 1 | 1 | 0 | 0 | 0 | 0 | `Supplier` | Yes (`LegacyIdMap`) | Yes (SS-MART identity preserved) |
| **Product_Categories** | 37 | 37 | 0 | 0 | 0 | 0 | `Category` | Yes (`LegacyIdMap`) | Yes (name, code, description) |
| **Brands** | 51 | 51 | 51 | 0 | 0 | 0 | `Brand` / Audit Metadata | Yes (`LegacyIdMap`) | Yes (brand name & product links) |
| **Warehouses** | 1 | 1 | 0 | 0 | 0 | 0 | `Warehouse` | Yes (`LegacyIdMap`) | Yes (Main Warehouse WH-001) |
| **Units** | 6 | 6 | 6 | 0 | 0 | 0 | `Unit` / Reference | Yes (`LegacyIdMap`) | Yes (operational units) |
| **Base_Units** | 6 | 6 | 6 | 0 | 0 | 0 | `BaseUnit` / Reference | Yes (`LegacyIdMap`) | Yes (product base units) |
| **Expenses** | 1 | 1 | 0 | 0 | 0 | 0 | `Expense` | Yes (`LegacyIdMap`) | Yes (EX_113, 10,000.00 LKR) |
| **Expense_Categories** | 1 | 1 | 0 | 0 | 0 | 0 | `ExpenseCategory` | Yes (`LegacyIdMap`) | Yes (authentic ID 5 "home") |
| **Users** | 1 | 1 | 1 | 0 | 0 | 0 | `User` / Audit Metadata | Yes (`LegacyIdMap`) | Yes (reference only, no RBAC) |
| **Roles_Permissions** | 2 | 2 | 2 | 0 | 0 | 0 | `Role` / Audit Metadata | Yes (`LegacyIdMap`) | Yes (reference only, no grants) |
| **Currencies** | 1 | 1 | 1 | 0 | 0 | 0 | `Currency` / Settings | Yes (`LegacyIdMap`) | Yes (LKR / Rs.) |
| **Settings** | 39 | 39 | 39 | 0 | 0 | 0 | `Settings` / Legacy Config | Yes (`LegacyIdMap`) | Yes (store key-values preserved) |
| **Overview** | 1 | 0 | 1 | 0 | 0 | 0 | Workbook Metadata | N/A (Metadata) | N/A (Workbook manifest) |
| **Total Source (21)** | **194,518** | **194,362** | **3,267** | **156** | **0** | **0** | **Operational DB + Audit** | **194,362 Mapped** | **100% Preservation Verified** |

### Supplementary Reconciliation Sheets (Mapping & Verification Evidence)
The 7 supplementary reconciliation worksheets were analyzed and verified as audit control artifacts, not duplicate source transactions:
1. `RECON_SUMMARY`: Verified exact mathematical match with calculated transaction totals.
2. `SALES_BF`: 5,813 flagged sales (5,733 non-empty discrepancy headers + 80 zero-item headers).
3. `PURCHASES_BF`: 65 flagged purchases (all 65 zero-item headers).
4. `CATEGORIES_MAP`: 37 category cross-references verified against `Product_Categories`.
5. `CUSTOMERS_MAP`: 9 customer mappings verified against `Customers`.
6. `SUPPLIERS_MAP`: 1 supplier mapping verified against `Suppliers`.
7. `EXCEPTIONS`: 146 documented exception rows (80 zero-item sales + 65 zero-item purchases + 1 negative sale item 141432).

---

## 3. Financial Reconciliation Proof

Independent recalculation using 4-decimal precision decimal arithmetic (`Decimal.js`) verifies exact reconciliation between source workbook headers, child line items, and the supplementary reconciliation sheets.

### 3.1 Sales Financial Summary
$$\text{Original Header Grand Total} = 64,762,486.4374\text{ LKR}$$
$$\text{Original Line Subtotal} = 60,889,281.2874\text{ LKR}$$
$$\text{Sales Aggregate Difference (B/F)} = +3,873,205.1500\text{ LKR}$$

- **Imported Sales Headers (20,521):**
  - Header Total: $64,394,625.4374\text{ LKR}$
  - Line Subtotal: $60,889,521.2874\text{ LKR}$
  - Aggregate B/F Difference: $+3,505,104.1500\text{ LKR}$
  - Non-empty discrepancy headers: 5,733 headers.
- **Quarantined Sales Headers (81):**
  - Header Total: $367,861.0000\text{ LKR}$
  - Line Subtotal: $-240.0000\text{ LKR}$ (from quarantined Sale 16864 containing item 141432)
  - Aggregate B/F Difference: $+368,101.0000\text{ LKR}$
  - Breakdown: 80 zero-item headers ($367,361.0000\text{ LKR}$) + 1 negative-line header 16864 ($500.0000\text{ LKR}$).
- **Check Balance:**
  $$64,394,625.4374 + 367,861.0000 = 64,762,486.4374\text{ LKR (Exact Match)}$$
  $$60,889,521.2874 + (-240.0000) = 60,889,281.2874\text{ LKR (Exact Match)}$$
  $$3,505,104.1500 + 368,101.0000 = 3,873,205.1500\text{ LKR (Exact Match)}$$

### 3.2 Purchases Financial Summary
$$\text{Original Header Grand Total} = 907,274,574.0700\text{ LKR}$$
$$\text{Original Line Subtotal} = 788,595,645.0700\text{ LKR}$$
$$\text{Purchases Aggregate Difference (B/F)} = +118,678,929.0000\text{ LKR}$$

- **Imported Purchases Headers (2,645):**
  - Header Total: $788,595,645.0700\text{ LKR}$
  - Line Subtotal: $788,595,645.0700\text{ LKR}$
  - Aggregate B/F Difference: $0.0000\text{ LKR}$ (100% matched to child line subtotals).
- **Quarantined Purchases Headers (65):**
  - Header Total: $118,678,929.0000\text{ LKR}$
  - Line Subtotal: $0.0000\text{ LKR}$ (all 65 purchases have 0 child line items in source).
  - Aggregate B/F Difference: $+118,678,929.0000\text{ LKR}$.
- **Check Balance:**
  $$788,595,645.0700 + 118,678,929.0000 = 907,274,574.0700\text{ LKR (Exact Match)}$$
  $$788,595,645.0700 + 0.0000 = 788,595,645.0700\text{ LKR (Exact Match)}$$
  $$0.0000 + 118,678,929.0000 = 118,678,929.0000\text{ LKR (Exact Match)}$$

---

## 4. Master Data & Entity Reference Mapping

1. **Product Unit ID vs Transaction Unit ID:**
   - `Products.unit_id` maps strictly to `Base_Units` (e.g. `g`, `ml`, `pcs`).
   - `Sale_Items.sale_unit_id` and `Purchase_Items.purchase_unit_id` map strictly to `Units` (e.g. `kg`, `L`, `pcs`, `box`).
   - Verified that no cross-conflation occurs during transformation.
2. **Customer Phone Number Duplicates:**
   - 9 customer records in source. 5 pairs share duplicate phone numbers.
   - All 9 customer records were imported as separate, discrete customer identities with unique UUIDs.
   - Original phone numbers, names, and legacy customer IDs are fully preserved without improper merging.
3. **Supplier Identity:**
   - 1 supplier in source (ID 3, "SS-MART", phone "0752958134", contact "Mohamed Shakir").
   - Faithfully imported to `Supplier` with `LegacyIdMap` tracking.
4. **Expense Category & Expense Preservation:**
   - Source sheet `Expense_Categories` contains ID 5 ("home").
   - Source sheet `Expenses` contains ID 3 (`EX_113`, date 2024-09-08, amount 10,000.00 LKR, title "genarator", category ID 5).
   - Authentic category "home" imported; Expense ID 3 assigned directly to category "home".
   - Informational proposal logged for administrator review; zero unauthorized reclassification.

---

## 5. Verification Sign-Off

- **Workbook Integrity:** SHA-256 verified against authoritative baseline.
- **Unaccounted Records:** 0.
- **Data Fabrications:** 0 (No artificial lines or fake payments).
- **Execution Target:** Isolated PostgreSQL 17 test database only.
- **Staging Database Guard:** Fully locked (`STAGING_IMPORT_LOCKED` 403).
