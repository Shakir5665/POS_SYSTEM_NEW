# NexTill POS — Phase 4A Dry-Run Validation Report
## Pre-Migration Audit, Invariant Verification, and Reference Resolution

**Date:** November 22, 2026  
**Git Branch:** `phase-4a/legacy-migration-engine`  
**Execution Mode:** Dry-Run Simulation (`--dry-run`, zero database writes)  
**Source Dataset:** `server/scripts/migration/data/legacy-dataset.json` (SHA-256: `b392557f09df3dd191aed9f178f89722d10a44b43294949c670e53f24bac03a4`)  
**Dataset Provenance:** `SYNTHETIC_FIXTURE` (Synthetic Test Fixture constructed from external audit counts and totals; NOT verified source extract)  
**Status:** **PASSED DRY-RUN (0 DB Mutations, 0 Stock Drift, 1 Quarantined Expense Pending Mapping)**

---

## 1. Executive Summary

A comprehensive pre-migration dry-run validation was executed using the Phase 4A Migration Engine. The dry run validated the dataset against NexTill schema constraints, reference mappings, and business invariants without modifying the PostgreSQL database.

### Key Results:
1. **Zero Database Modifications:** Confirmed 0 rows created, updated, or deleted across all database tables during dry run.
2. **Authoritative Stock Invariance:** Confirmed exactly 0 mutations to `Product.quantity` and 0 `InventoryLog` records generated.
3. **Financial Accounting Safety:** Confirmed 0 synthetic `Payment` rows, 0 customer payment allocations, and 0 supplier payment allocations fabricated.
4. **Loyalty Protection:** Confirmed 0 loyalty points awarded for historical transactions.
5. **Orphan & Anomaly Detection:** Successfully detected and cataloged all 9 orphan line items (4 purchase items and 5 adjustment items) and 1 unresolved expense category mapping into structured `MigrationIssue` records.
6. **Expense Category Correction:** Removed automatic fallback of category `home` (ID 5) to `Miscellaneous`. Preserved original ID 5 and name 'home', recorded `UNRESOLVED_CATEGORY_MAPPING` issue, and marked Expense #3 as **NOT ELIGIBLE** for import until an approved mapping is supplied.

---

## 2. Dataset Inventory & Dry-Run Validation Counts

| Entity Domain | Source Headers | Source Items | Dry-Run Valid | Valid Line Items | Detected Orphans / Quarantined | Validation Status |
|---|---|---|---|---|---|---|
| **Sales** | 3 | 19 embedded | 3 | 19 | 0 | **PASSED** |
| **Flattened Sale Items** | N/A | 5 flattened | N/A | 5 (subset) | 0 (deduplicated) | **PASSED** |
| **Purchases** | 4 | 4 embedded | 4 | 4 | 0 | **PASSED** |
| **Flattened Purchase Items** | N/A | 4 flattened | 0 | 0 | 4 (missing parents) | **CATALOGED** |
| **Stock Adjustments** | 5 | 5 embedded | 5 | 5 | 0 | **PASSED** |
| **Flattened Adjustment Items**| N/A | 5 flattened | 0 | 0 | 5 (missing parents) | **CATALOGED** |
| **Expenses** | 1 | N/A | 0 | N/A | 1 (not eligible - unapproved category) | **QUARANTINED** |
| **Total Transactions** | **13** | **28 embedded** | **12** | **28** | **9 orphans + 1 category** | **PASSED (CONDITIONAL)** |

---

## 3. Inventory & Financial Invariants

The migration engine enforced strict business safeguards during the dry-run simulation:

```text
=============================================================
--- Inventory & Accounting Invariants ---
Product.quantity mutations:       0 (Authoritative stock unchanged)
InventoryLog records created:     0 (Zero drift)
Loyalty points awarded:          0
Synthetic Payment rows created:   0
=============================================================
```

- **RISK-01 (Sale Stock Deductions):** Bypassed. Live stock counter `Product.quantity` is untouched.
- **RISK-02 (Loyalty Point Duplication):** Bypassed. All historical sales set `loyalty_points_earned = 0`.
- **RISK-04 & DEC-009 (Synthetic Payments):** Bypassed. `amount_paid` and `balance_due` are recorded directly on `Sale` and `Purchase` headers without fabricating synthetic payment events.
- **RISK-07 & RISK-08 (Purchase Receiving Stock):** Bypassed. Purchases are marked `status = RECEIVED` with historical timestamps without re-adding stock or altering `cost_price`.
- **RISK-10 & DEC-008 (Adjustment Stock Mutation):** Bypassed. Stock adjustments are recorded as historical documents (`is_legacy_import = true`) without applying old counts to current stock levels.

---

## 4. Detected Migration Issues Log

A total of **10 issues** were identified during the dry-run pass. All were categorized with severity `WARNING`, with zero blocking `ERROR` issues:

| # | Entity | Legacy ID | Issue Code | Severity | Description | Action / Resolution |
|---|---|---|---|---|---|---|
| 1 | `PurchaseItem` | `4353` | `ORPHAN_CHILD` | `WARNING` | Flattened item #4353 references missing parent purchase #4351 | Track in `MigrationIssue`; do not attach to supplied headers (DEC-006) |
| 2 | `PurchaseItem` | `4352` | `ORPHAN_CHILD` | `WARNING` | Flattened item #4352 references missing parent purchase #4350 | Track in `MigrationIssue` (DEC-006) |
| 3 | `PurchaseItem` | `4351` | `ORPHAN_CHILD` | `WARNING` | Flattened item #4351 references missing parent purchase #4349 | Track in `MigrationIssue` (DEC-006) |
| 4 | `PurchaseItem` | `4350` | `ORPHAN_CHILD` | `WARNING` | Flattened item #4350 references missing parent purchase #4348 | Track in `MigrationIssue` (DEC-006) |
| 5 | `StockAdjustmentItem` | `76` | `ORPHAN_CHILD` | `WARNING` | Flattened item #76 references missing parent adjustment #118 | Track in `MigrationIssue`; preserve October 2024 timestamp (DEC-007) |
| 6 | `StockAdjustmentItem` | `75` | `ORPHAN_CHILD` | `WARNING` | Flattened item #75 references missing parent adjustment #117 | Track in `MigrationIssue` (DEC-007) |
| 7 | `StockAdjustmentItem` | `74` | `ORPHAN_CHILD` | `WARNING` | Flattened item #74 references missing parent adjustment #116 | Track in `MigrationIssue` (DEC-007) |
| 8 | `StockAdjustmentItem` | `73` | `ORPHAN_CHILD` | `WARNING` | Flattened item #73 references missing parent adjustment #115 | Track in `MigrationIssue` (DEC-007) |
| 9 | `StockAdjustmentItem` | `72` | `ORPHAN_CHILD` | `WARNING` | Flattened item #72 references missing parent adjustment #114 | Track in `MigrationIssue` (DEC-007) |
| 10 | `Expense` | `3` | `UNRESOLVED_CATEGORY_MAPPING` | `WARNING` | Legacy category 'home' (ID: 5) has no approved mapping | Marked NOT ELIGIBLE for import; original ID/name preserved; awaiting approved mapping |

---

## 5. Execution Readiness Verdict

- **Dry-Run Status:** **`PASSED`** (Simulation verified with zero database mutations)
- **Engine Technical Integrity:** **`VERIFIED`**
- **Dataset Provenance:** **`SYNTHETIC_FIXTURE`** (Do NOT execute real legacy import with this fixture)
- **Live Phase 4B Authorization:** **`HOLD / CONDITIONAL`** (Requires verified source dataset extract and stakeholder approvals for expense category and master-data mappings)
