# NexTill POS — Universal Excel Migration Dependency Audit & Cleanup Report

## 1. Dependency Audit Overview

In accordance with Section 15 of the specification, a complete dependency audit of migration-related frontend and backend files was conducted prior to modifying code.

### Guiding Principles:
1. **Rule 1 — Reference Graph First**: Build a reference graph of all migration consumers before deleting any file or function.
2. **Rule 3 — Shared Services**: Preserve all shared utilities (e.g. `prismaClient.js`, `money.js`, `errors.js`).
3. **Rule 5 & 6 — Migration & Schema Preservation**: Never delete or mutate applied Prisma migrations in `prisma/migrations/`.
4. **Rule 7 — Table Preservation**: Never drop existing database tables.
5. **Rule 8 — Phase 4B Historical Invariants**: Preserve Phase 4B historical Excel import engine and dry-run routes for existing regression workflows.
6. **Rule 9 & 10 — Rollbacks and Inventory Safeguards**: Retain all existing rollback previews and inventory stock checks.
7. **Rule 11 — Proven Dead Code Only**: Remove or clean up only code proven obsolete and unused.

---

## 2. Inventory of Audited Components & Resolution

| Path / Component | Status | Analysis & Resolution |
| :--- | :--- | :--- |
| `client/src/pages/MigrationPage.jsx` | **Redesigned** | Replaced the single-workbook hardcoded Phase 4B view with the Universal Single-Table Excel Migration interface. Preserved tabs for historical Migration Batches and Issues so existing audit workflows and tests (`phase5Frontend.test.jsx`) continue to function cleanly. Removed unused state variables and unused handlers. |
| `client/src/services/migration.js` | **Enhanced** | Added client methods for universal tables, template downloads, schema inspections, validation plans, and job execution while retaining legacy Phase 4B API methods. |
| `server/src/routes/migration.js` | **Enhanced** | Added universal endpoints under `/excel/...` (`/tables`, `/templates/:table`, `/jobs`, `/inspect`, etc.) while retaining legacy endpoints (`/status`, `/batches`, `/dry-run`, `/execute`, `/rollback`). |
| `server/src/controllers/migrationController.js` | **Preserved** | Kept intact for historical batch management, issue querying, and Phase 4B verification. Added companion controller `universalMigrationController.js` for clean separation of concerns. |
| `server/src/services/migration/excelImportEngine.js` | **Preserved** | Retained for Phase 4B multi-sheet reconciliation and historical test suites. Built modular `universalExcelImportEngine.js` for single-table execution. |
| `server/src/services/migration/excelParser.js` | **Preserved** | Retained for Phase 4B 28-sheet workbook verification. Created `universalExcelParser.js` for universal single-table workbooks. |
| `server/src/services/migration/excelValidator.js` | **Preserved** | Retained for Phase 4B historical B/F calculations. Built `universalExcelValidator.js` for single-table schema and foreign-key validation. |

---

## 3. Database Schema Integrity

- **Additive & Backward-Compatible**: No tables, columns, or constraints were dropped or mutated.
- **Migration History**: All 12 versioned migrations in `server/prisma/migrations/` remain intact and applied.
- **Audit Logging**: Existing `MigrationBatch` and `MigrationIssue` models were reused to record universal import jobs, with structured parameters stored in JSON notes for 100% schema compatibility without requiring breaking schema migrations.
