# NexTill POS — Phase 4B Critical Audit A: Adjustment Items Investigation & Reconciliation

**Document Version:** 1.0.0  
**Date:** November 22, 2026  
**Target Workbook:** `NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx`  
**Workbook SHA-256:** `6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7`  
**Database Target:** Isolated PostgreSQL 17 Database (`nextill_isolated_phase4b`)  

---

## 1. Audit Context & Discrepancy Discovery

The historical workbook contains:
- **`Adjustments` worksheet:** 1,081 rows.
- **`Adjustment_Items` worksheet:** 1,031 rows.

The previously reported Phase 4B result listed 1,081 imported adjustment headers but completely failed to account for the 1,031 adjustment items. This critical audit investigated whether the 1,031 child lines were lost, stored as metadata, or omitted, and implemented an authoritative, verifiable import and reconciliation.

### Investigation Findings:
1. **Omission in Previous Importer:** The previous importer created 1,081 `StockAdjustment` header records but skipped importing `Adjustment_Items`, claiming they were "audit only" without populating child records or creating `LegacyIdMap` entries.
2. **True Source Relationship:** The 1,031 adjustment items are direct child line items of the 1,081 adjustment headers.
3. **Exact Accounting Breakdown:**
   - **Adjustments with 0 child items:** 58 headers (zero-item adjustment events).
   - **Adjustments with exactly 1 child item:** 1,017 headers ($1,017 \times 1 = 1,017$ items).
   - **Adjustments with multiple child items:** 6 headers (containing 14 items total).
   - **Total child items:** $1,017 + 14 = 1,031$ items.
   - **Orphan adjustment items:** **0 (STRICTLY ZERO)**. Every single one of the 1,031 adjustment items references a valid, existing `Adjustment ID` in the `Adjustments` worksheet.

---

## 2. Technical Implementation & Data Model

To resolve this discrepancy without compromising inventory safety, the import engine was updated:

1. **Dedicated Target Model:**
   - Headers imported into `StockAdjustment` with `is_legacy_import: true` and `adjustment_number: 'LEGACY-ADJ-<id>'`.
   - Line items imported into `StockAdjustmentItem` linked by `adjustment_id` foreign key.
2. **Source Field Preservation:**
   - `Adjustment Item ID` $\rightarrow$ `LegacyIdMap` (`entity_type: 'StockAdjustmentItem'`).
   - `Adjustment ID` $\rightarrow$ resolved to target `StockAdjustment.id`.
   - `Product ID` $\rightarrow$ resolved to target `Product.id` via `LegacyIdMap` (or fallback match).
   - `Quantity` $\rightarrow$ `StockAdjustmentItem.quantity_change` (Decimal-safe).
   - `Method Type` $\rightarrow$ `StockAdjustmentItem.method_type` (e.g., 1 for addition, 2 for subtraction).
   - `Method Description` $\rightarrow$ `StockAdjustmentItem.notes` (e.g., "Addition", "Subtraction").
   - `Sale Unit` $\rightarrow$ `StockAdjustmentItem.unit` (e.g., "pcs", "kg").
   - Original business dates and creation timestamps preserved.
3. **Zero Stock Mutation Guarantee (Authoritative Invariant):**
   - The importer creates `StockAdjustment` and `StockAdjustmentItem` records using direct Prisma creation decoupled from `stockAdjustmentService.js`.
   - **No stock movement is triggered.**
   - Pre-existing `Product.quantity` before import === `Product.quantity` after import.
   - Newly imported products retain initial stock balance of 0.
   - Zero `InventoryLog` records created.
4. **Extreme Quantity Preservation:**
   - The source contains historical adjustment quantities as high as `100,000,000`.
   - These values are faithfully stored as `Decimal(100000000)` in `StockAdjustmentItem.quantity_change`.
   - Because stock mutation is bypassed, live operational stock is never distorted by these extreme historical records.

---

## 3. Exact Reconciliation Formula

$$\text{Source Adjustment Items (1,031)} = \text{Imported (1,031)} + \text{Quarantined (0)} + \text{Excluded (0)} + \text{Unaccounted (0)}$$

$$\text{Source Adjustment Headers (1,081)} = \text{Imported (1,081)} + \text{Quarantined (0)} + \text{Excluded (0)} + \text{Unaccounted (0)}$$

| Metric | Source Count | Target Count | Variance | Status |
|---|---|---|---|---|
| Adjustment Headers | 1,081 | 1,081 | 0 | **VERIFIED** |
| Adjustment Child Items | 1,031 | 1,031 | 0 | **VERIFIED** |
| Adjustments with 0 Items | 58 | 58 | 0 | **VERIFIED** |
| Adjustments with 1 Item | 1,017 | 1,017 | 0 | **VERIFIED** |
| Adjustments with Multi Items | 6 (14 items) | 6 (14 items) | 0 | **VERIFIED** |
| Orphan Items | 0 | 0 | 0 | **VERIFIED** |
| LegacyIdMap Header Mappings | 1,081 | 1,081 | 0 | **VERIFIED** |
| LegacyIdMap Item Mappings | 1,031 | 1,031 | 0 | **VERIFIED** |
| Product Stock Drift | 0.000 | 0.000 | 0.000 | **INVARIANT HELD** |

---

## 4. Idempotency & Rollback Verification

1. **Idempotency Rerun:**
   - Re-running the import with all 1,081 adjustments and 1,031 adjustment items already present in the database creates **0 duplicate headers** and **0 duplicate items**.
   - Verified via `server/scripts/run-isolated-dry-run.js` (Step 6/7) and `excelImportSafety.test.js`.
2. **Rollback Execution:**
   - Executing batch rollback cleanly deletes all 1,031 `StockAdjustmentItem` rows and all 1,081 `StockAdjustment` rows owned by the batch via cascading transaction.
   - Pre-existing operational records and stock balances remain 100% untouched.

---

## 5. Audit Conclusion

Critical Audit A is **FULLY RESOLVED**. All 1,031 adjustment items are faithfully imported into dedicated operational models with complete parent linkage, exact decimal precision, complete legacy ID tracking, and strictly zero inventory drift.
