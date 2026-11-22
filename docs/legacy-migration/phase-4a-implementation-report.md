# NexTill POS — Phase 4A Implementation Report
## Legacy Migration Engine & Dry-Run Validation

**Date:** November 22, 2026  
**Git Branch:** `phase-4a/legacy-migration-engine`  
**Base Commit / Branch:** `phase-3b/transactional-stock-adjustments` (`d335aa5`)  
**Database Target:** Isolated PostgreSQL 18 Staging Instance (`localhost:5434`, database: `pos_staging`)  
**Status:** **COMPLETE & VERIFIED** (21/21 Test Suites Passing, 267/267 Tests Passing)

---

## 1. Executive Summary

Phase 4A designs, implements, and verifies the **NexTill Legacy POS Migration Engine**. The engine provides a production-grade ingestion framework that transforms externally audited POS export data into NexTill PostgreSQL database records while guaranteeing authoritative stock invariance, zero financial distortion, full audit traceability via `LegacyIdMap`, issue tracking via `MigrationIssue`, and complete batch rollback capability.

### Core Objectives Achieved:
1. **Dry-Run Validation Pass (`--dry-run`):**
   - Implemented `runDryRun` in [migrationEngine.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/migrationEngine.js).
   - In-memory validation pass verifying source checksum, schema constraints, and foreign key resolutions with **zero database writes**.
   - Verified 3 sales (19 items), 4 purchases (4 items), 5 adjustments (5 items), and 1 expense (marked NOT ELIGIBLE due to unapproved category 'home' ID 5).
   - Cataloged 9 orphan line items (4 purchase orphans referencing IDs 4348–4351, 5 adjustment orphans referencing IDs 114–118) and 1 unresolved category mapping.
   - Identified dataset provenance as `SYNTHETIC_FIXTURE`.
2. **Dedicated Historical Importers:**
   - [salesImporter.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/importers/salesImporter.js): Ingests sales with `is_legacy_import: true`, sets historical `sale_date`, bypasses stock deduction (RISK-01), awards zero loyalty points (RISK-02), and creates zero synthetic payments (RISK-04, DEC-009).
   - [purchasesImporter.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/importers/purchasesImporter.js): Ingests purchases with `is_legacy_import: true`, sets `status: 'RECEIVED'`, bypasses stock intake (RISK-07), and records orphan items into `MigrationIssue` (DEC-006).
   - [adjustmentsImporter.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/importers/adjustmentsImporter.js): Ingests adjustments with `is_legacy_import: true`, preserves raw legacy `method_type: 1` (DEC-004), bypasses live inventory changes (RISK-10, DEC-008), and records orphan items (DEC-007).
   - [expensesImporter.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/importers/expensesImporter.js): Ingests historical expenses with `is_legacy_import: true`. Corrected to remove automatic fallback to `Miscellaneous`: preserves original ID 5 and name 'home', logs `UNRESOLVED_CATEGORY_MAPPING` issue, and marks dependent expense as NOT ELIGIBLE for import unless approved mapping is supplied.
3. **Entity Resolvers & Mapping Registry:**
   - Implemented [entityResolvers.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/entityResolvers.js) to resolve warehouses (DEC-001), products (DEC-002), customers and suppliers (DEC-003), UOM normalizations (DEC-005), and system migration user attribution (DEC-011).
4. **Complete Batch Rollback Capability:**
   - Implemented `rollbackBatch(batchIdentifier)`.
   - Utilizes `LegacyIdMap` to locate all imported records created during a specific migration run, deletes target entities in proper dependency order, removes mapping rows, and updates `MigrationBatch.status = 'ROLLED_BACK'`.
5. **CLI Runner & NPM Scripts:**
   - Created [run-migration.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/scripts/migration/run-migration.js) with `--dry-run`, `--execute`, `--rollback`, and `--status` flags.
   - Added `npm --prefix server run migration:dry-run` and `npm --prefix server run migration:run`.
6. **Authoritative Stock Invariance:**
   - Maintained global `Product.quantity` as the sole authoritative real-time inventory counter. The migration engine induces zero stock drift before, during, or after migration and rollback.

---

## 2. Files Modified and Created

### 2.1 Newly Created Files
- [legacy-dataset.json](file:///C:/Users/shaki/Desktop/NexTill_POS/server/scripts/migration/data/legacy-dataset.json): Audited legacy export dataset matching `legacy-data-audit.json`.
- [entityResolvers.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/entityResolvers.js): Reference resolution logic for warehouses, products, customers, suppliers, categories, and UOMs.
- [salesImporter.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/importers/salesImporter.js): Importer for historical sales.
- [purchasesImporter.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/importers/purchasesImporter.js): Importer for historical purchases.
- [adjustmentsImporter.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/importers/adjustmentsImporter.js): Importer for historical stock adjustments.
- [expensesImporter.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/importers/expensesImporter.js): Importer for historical expenses.
- [migrationEngine.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/migration/migrationEngine.js): Orchestrator for dry-run validation, execution, and rollback.
- [run-migration.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/scripts/migration/run-migration.js): CLI command runner.
- [migrationEngine.test.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/__tests__/migrationEngine.test.js): 16 automated integration tests covering dry run, staged execution, stock invariance, idempotency, and rollback.
- [phase-4a-implementation-report.md](file:///C:/Users/shaki/Desktop/NexTill_POS/docs/legacy-migration/phase-4a-implementation-report.md): This architectural report.
- [phase-4a-dry-run-report.md](file:///C:/Users/shaki/Desktop/NexTill_POS/docs/legacy-migration/phase-4a-dry-run-report.md): Detailed dry-run validation findings.
- [phase-4a-dry-run-report.json](file:///C:/Users/shaki/Desktop/NexTill_POS/docs/legacy-migration/phase-4a-dry-run-report.json): Raw machine-readable dry-run output.
- [phase-4a-test-results.md](file:///C:/Users/shaki/Desktop/NexTill_POS/docs/legacy-migration/phase-4a-test-results.md): Full test verification report.

### 2.2 Modified Existing Files
- [package.json](file:///C:/Users/shaki/Desktop/NexTill_POS/server/package.json): Added `migration:run` and `migration:dry-run` scripts.

---

## 3. Migration Engine Architecture

```mermaid
flowchart TD
    CLI[run-migration.js CLI] --> Dispatch{Flag: --dry-run or --execute?}
    
    Dispatch -- --dry-run --> DryRun[migrationEngine.runDryRun]
    DryRun --> ReadData[Load legacy-dataset.json]
    DryRun --> ValContext[Resolve Read-Only Context: Warehouse & User]
    DryRun --> SimSales[Simulate Sales & Validate Items]
    DryRun --> SimPurchases[Simulate Purchases & Detect Orphans]
    DryRun --> SimAdjs[Simulate Adjustments & Detect Orphans]
    DryRun --> SimExp[Simulate Expenses & Fallbacks]
    DryRun --> InvCheck{Assert Invariants: 0 Stock Drift, 0 Logs, 0 Payments}
    InvCheck --> GenReport[Output phase-4a-dry-run-report.json]
    
    Dispatch -- --execute --> Exec[migrationEngine.executeMigration]
    Exec --> BatchInit[Create MigrationBatch: status RUNNING]
    Exec --> TxSales[tx.sale.create + LegacyIdMap]
    Exec --> TxPurchases[tx.purchase.create + LegacyIdMap]
    Exec --> TxAdjs[tx.stockAdjustment.create + LegacyIdMap]
    Exec --> TxExp[tx.expense.create + LegacyIdMap]
    Exec --> LogIssues[tx.migrationIssue.create for Orphans & Warnings]
    Exec --> BatchFinal[Update MigrationBatch: status COMPLETED]
    
    Dispatch -- --rollback --> Rollback[migrationEngine.rollbackBatch]
    Rollback --> FindMaps[Find LegacyIdMap for Batch]
    Rollback --> CascadeDel[Delete Imported Entities in Dependency Order]
    Rollback --> DelMaps[Delete LegacyIdMap records]
    Rollback --> BatchRolledBack[Update MigrationBatch: status ROLLED_BACK]
```

---

## 4. Compliance with Architectural Decisions

| Decision | Subject | Implementation in Phase 4A Engine | Status |
|---|---|---|---|
| **DEC-001** | Warehouse Architecture | All transactions automatically resolve legacy warehouse `1` to the active default warehouse (`WH-TEST-001` / `WH-001`). Recorded in `LegacyIdMap`. | **ENFORCED** |
| **DEC-002** | Product Identity Mapping | Line items resolve products via `LegacyIdMap` first, then case-insensitive name matching. Unmapped items log a `MigrationIssue` without creating fake products. | **ENFORCED** |
| **DEC-003** | Customer/Supplier Masters | Customer ID 1 and Supplier ID 3 resolved via `LegacyIdMap` or matched against existing master records. No placeholder customers/suppliers fabricated. | **ENFORCED** |
| **DEC-004** | Status & Method Codes | Preserved raw legacy `method_type: 1` on adjustment items. Mapped sale status to `COMPLETED` and purchase status to `RECEIVED`. Automatic fallback for expense category 'home' (ID 5) removed; quarantined as `UNRESOLVED_CATEGORY_MAPPING` pending approved mapping. | **ENFORCED** |
| **DEC-005** | Unit Normalization | `normalizeUnit` converts legacy strings (`peice`, `piece`, `pcs`) to standard NexTill `pcs`. | **ENFORCED** |
| **DEC-006** | Missing Parent Purchases | 4 flattened purchase items referencing missing parents (4348–4351) are captured in `MigrationIssue` with `issue_code: 'ORPHAN_CHILD'`. | **ENFORCED** |
| **DEC-007** | Missing Adjustment Headers | 5 flattened adjustment items referencing missing parents (114–118) are captured in `MigrationIssue` with `issue_code: 'ORPHAN_CHILD'`. | **ENFORCED** |
| **DEC-008** | Authoritative Stock | Live `Product.quantity` remains authoritative. Historical adjustments are logged with `is_legacy_import: true` and **do NOT mutate stock**. | **ENFORCED** |
| **DEC-009** | Historical Payments | Sets `amount_paid` and `balance_due` on headers directly. **Zero synthetic Payment rows** or allocation rows created. | **ENFORCED** |
| **DEC-010** | Transaction Dates | `sale_date` and `purchase_date` preserved as historical business dates. `created_at` records the actual database ingestion timestamp. | **ENFORCED** |
| **DEC-011** | User Attribution | All historical transactions assigned to dedicated inactive system user `migration_import` (`role: ADMIN`, `is_active: false`). | **ENFORCED** |
| **DEC-012** | Database Coexistence | Clean coexistence with existing test/staging database records. | **ENFORCED** |

---

## 5. Verification & Test Summary

- **Backend Integration Tests:** **22 / 22 test suites passed**.
- **Migration Engine Integration Suite (`migrationEngine.test.js`):** **22 / 22 tests passed** (dry run, simulated vs approved expense mapping, staged execution, stock invariance, idempotency, rollback).
- **Staging Execution Verification Suite (`migrationStagingVerification.test.js`):** **10 / 10 tests passed** covering all 10 staging scenarios with synthetic fixtures (first import, repeated import, interrupted import and retry, duplicate legacy IDs, partial record failure, rollback, repeated rollback, preservation of unrelated records, zero stock drift, zero synthetic payment creation).
- **Dataset Provenance Assessment:** `legacy-dataset.json` classified as `SYNTHETIC_FIXTURE`. Live import blocked until a verified source export is available.
- **Frontend SPA Build:** `vite build` completed cleanly with 0 errors.
- **Migration Readiness Check:** Overall readiness status remains **CONDITIONAL** with **0 BLOCKED** and **0 ERRORS**. Live Phase 4B import is held pending verified source dataset and approved master data mappings.
