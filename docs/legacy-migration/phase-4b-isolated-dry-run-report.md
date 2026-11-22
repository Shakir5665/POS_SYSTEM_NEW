# NexTill POS — Phase 4B Isolated Database Dry-Run & Verification Report

## 1. Executive Summary & Verdict
* **Final Verdict**: `PHASE_4B_DRY_RUN_VERIFIED — AWAITING_STAGING_APPROVAL`
* **Execution Timestamp**: `2026-11-22T08:31:31.985Z`
* **Test Environment**: Disposable isolated PostgreSQL 17 database (`postgresql://postgres@127.0.0.1:5432/nextill_isolated_phase4b`)
* **Source Provenance**: `NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx`
  * SHA-256: `6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7`
  * File Size: 13,789,816 bytes (13.15 MB, 28 worksheets)

---

## 2. Seven-Stage Execution Protocol Results

### Stage 1: Database Isolation Assertion
* Verified connection string targets local disposable PostgreSQL (`127.0.0.1:5432/nextill_isolated_phase4b`).
* Confirmed AWS Neon staging and production patterns are strictly barred.
* Guard check: `ALLOW_ISOLATED_IMPORT === 'true'`.

### Stage 2: Authentic Workbook Parsing & Validation
* ZIP integrity confirmed: 28 worksheets parsed in 17.69 seconds.
* Sales grand total: `64,762,486.4374` (Items subtotal: `60,889,281.2874`, B/F Diff: `+3,873,205.1500`).
* Purchases grand total: `907,274,574.0700` (Items subtotal: `788,595,645.0700`, B/F Diff: `+118,678,929.0000`).
* Quarantined count: 147 entities (81 sales, 65 purchases, 1 sale item).

### Stage 3: Baseline Initialization
* Clean schema initialized.
* Pre-existing baseline record created: `Product` (`PRE-EXISTING-001`) with authoritative inventory `quantity = 100.000`.

### Stage 4: Authentic Historical Import Run 1
* Execution Duration: 120.96 seconds (Peak memory heap delta: 524.43 MB).
* Entities Imported:
  * Categories: 37
  * Customers: 9
  * Suppliers: 1
  * Products: 4,170
  * Sales: 20,521 (81 quarantined)
  * Sale Items: 162,113 (1 quarantined)
  * Purchases: 2,645 (65 quarantined)
  * Purchase Items: 2,645
  * Stock Adjustments: 1,081
  * Expenses: 1
* Total Primary Records Imported: 193,223 records across 10 models.

### Stage 5: Invariant Assertions
* **INVARIANT 1 (Pre-existing Stock)**: `baselineProduct.quantity === 100.000` (ZERO DRIFT).
* **INVARIANT 2 (Imported Stock)**: All 4,170 imported products have `quantity === 0.000` (ZERO STOCK MUTATION).
* **INVARIANT 3 (Synthetic Payments)**: `Payment` table row count === 0 (ZERO SYNTHETIC PAYMENTS).
* **INVARIANT 4 (Inventory Logs)**: `InventoryLog` table row count === 0 (ZERO INVENTORY LOGS).
* Migration issues logged in database:
  * `HEADER_LINE_MISMATCH`: 5,733 (`WARNING`, unresolved audit delta)
  * `MISSING_CHILD_ITEMS`: 145 (`BLOCKING`, quarantined)
  * `NEGATIVE_QUANTITY`: 1 (`BLOCKING`, quarantined)
  * `RECLASSIFIED_EXPENSE_CATEGORY`: 1 (`INFO`, category 5 reclassified)

### Stage 6: Idempotency Rerun (Run 2)
* Executed full import second time over the same database without truncating.
* Post-rerun record counts:
  * Sales: 20,521 (0 duplicates created)
  * Sale Items: 162,113 (0 duplicates created)
  * Purchases: 2,645 (0 duplicates created)
  * Products: 4,171 (4,170 imported + 1 baseline; 0 duplicates created)
* **IDEMPOTENCY CONFIRMED**.

### Stage 7: Batch Rollback Capability
* Rollback Preview: Correctly identified all 193,223 batch-associated records across 10 models without altering baseline entities.
* Rollback Execution: Fully executed within transaction timeout; all batch transactions, line items, and audit maps removed.
* Post-Rollback Invariant:
  * Legacy sales in DB: 0
  * Legacy purchases in DB: 0
  * Baseline product `PRE-EXISTING-001` intact with `quantity === 100.000`.
* **ROLLBACK SAFETY CONFIRMED**.
