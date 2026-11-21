# Phase 2 Schema Decisions & Architectural Discrepancy Analysis

> [!NOTE]
> This document records the architectural rationale, final decisions, and discrepancy analysis between the preliminary Phase 1 handoff proposals and the approved Phase 2 schema implementation.

---

## 1. Decision Status Register (Post-Phase 2)

| Decision ID | Subject | Approved Approach | Implementation Status | Phase Gate |
|---|---|---|---|---|
| **DEC-001** | Warehouse Architecture | **Option B**: Single default warehouse (`Main Warehouse`, `WH-001`). `Product.quantity` remains live source of truth. Optional `warehouse_id` on `Sale` and `Purchase`. | **RESOLVED & IMPLEMENTED** | Phase 2 |
| **DEC-002** | Product Identity Mapping | **Option A / C**: Require master export (A) or match existing with manual verification (C). No auto-creation of placeholder products. | **STRATEGY APPROVED** | Phase 4 |
| **DEC-003** | Missing Customer/Supplier Masters | **Option A / B**: Request master exports (A) or match existing records in NexTill (B). | **STRATEGY APPROVED** | Phase 4 |
| **DEC-004** | Status & Payment Codes | **Option A / C**: Obtain official code legend or preserve raw numeric codes. Never guess business semantics. | **OPEN** | Phase 4 |
| **DEC-005** | Unit Conversion | **Option A**: Normalize unit spellings (`peice` → `pcs`) in code mapping table. Do not alter `uom.js`. Defer `ProductUnit` model. | **RESOLVED & IMPLEMENTED** | Phase 2 |
| **DEC-006** | Missing Parent Purchases | **Option A / C**: Request missing headers (A) or track in `MigrationIssue` (C). Never invent fake purchase headers. | **OPEN** | Phase 4 |
| **DEC-007** | Missing Adjustment Headers | **Option A / C**: Same as DEC-006. Track in `MigrationIssue`. | **OPEN** | Phase 4 |
| **DEC-008** | Historical Stock | **Option A**: Live `Product.quantity` remains authoritative. Historical adjustments are logged but do NOT mutate stock balances. | **RESOLVED & IMPLEMENTED** | Phase 2 / 4 |
| **DEC-009** | Historical Payments | **Option A**: Record `amount_paid` and `balance_due` on `Sale` / `Purchase`. Do NOT fabricate synthetic `Payment` or allocation rows. | **STRATEGY APPROVED** | Phase 4 |
| **DEC-010** | Historical Transaction Dates | **Option A**: Added `sale_date` to `Sale` and `purchase_date` to `Purchase`. Preserved `created_at` as database insertion timestamp. | **RESOLVED & IMPLEMENTED** | Phase 2 |
| **DEC-011** | Historical User Attribution | **Option A**: Created dedicated inactive system user `migration_import` (`role: ADMIN`, `is_active: false`, locked password hash). | **RESOLVED & IMPLEMENTED** | Phase 2 |
| **DEC-012** | Existing Database Records Scope | Owner confirmed existing database records are disposable test data. Full backward-compatibility maintained. | **CONFIRMED** | Phase 2 |

---

## 2. Discrepancy Analysis (Phase 1 Proposals vs. Approved Implementation)

### 2.1 Deferral of `ProductStock` (Multi-Warehouse Inventory)
* **Phase 1 Handoff Proposal**: Section 2.5 of `phase-2-handoff.md` proposed introducing a `ProductStock` model (`product_id`, `warehouse_id`, `quantity`) as part of DEC-001 Option A.
* **Approved Phase 2 Implementation**: Per owner instructions, **`ProductStock` was deferred**.
* **Rationale**:
  1. NexTill's active POS sales and purchasing services (`salesService.js`, `purchaseService.js`, `inventoryService.js`) decrement and increment stock directly on `Product.quantity`.
  2. Introducing `ProductStock` during Phase 2 would require either a risky dual-write synchronization engine or a full checkout refactoring, which violates the Phase 2 boundary ("No live sales/purchases/refunds refactoring during Phase 2").
  3. Instead, DEC-001 Option B was adopted: `Warehouse` exists with a default `"Main Warehouse"`, `Sale` and `Purchase` have optional `warehouse_id` foreign keys, and `Product.quantity` remains the authoritative live stock balance. Multi-warehouse inventory balances will be addressed in a future dedicated phase.

### 2.2 Deferral of `ProductUnit` (Custom Packaging Conversion Factors)
* **Phase 1 Handoff Proposal**: Section 2.8 proposed a `ProductUnit` model (`product_id`, `unit_name`, `conversion_factor`) for per-product packaging conversion factors.
* **Approved Phase 2 Implementation**: Per owner instructions, **`ProductUnit` was deferred**.
* **Rationale**:
  1. The legacy POS workbook (`POS_Complete_Export_v4.xlsx`) contains packaging strings like `"peice"` (a misspelling of `"pcs"`), but does not establish product-specific packaging ratios (e.g., whether a carton is 12 or 24 pieces).
  2. Unit normalization rules are handled cleanly in code mapping:
     * `"peice"` → `"pcs"`
     * `"pcs"` → `"pcs"`
     * `"box"` → `"box"`
     * `"carton"` → `"carton"`
  3. Existing `server/src/utils/uom.js` conversion functions (`COUNT`, `WEIGHT`, `VOLUME`) were left completely untouched. `ProductUnit` can be added in a future phase if specific legacy products require customized fractional conversions.

### 2.3 `LegacyIdMap.legacy_id` Type: Integer vs. String
* **Phase 1 Handoff Proposal**: Proposed `legacy_id` as an `Int`.
* **Approved Phase 2 Implementation**: Implemented as **`String`**.
* **Rationale**:
  1. Real-world legacy POS exports often mix numeric IDs (e.g. `20816`) with alphanumeric invoice identifiers (e.g. `INV-20816` or `REF-001`).
  2. Using `String` guarantees that alphanumeric IDs, leading zeroes, and compound keys can be stored without truncation or loss of precision.
  3. Added `source_system` (`default: "legacy_pos"`) to the composite unique index `@@unique([source_system, entity_type, legacy_id])` to support future imports from multiple legacy sources.

---

## 3. Detailed Model Design Decisions

### 3.1 Migration Issue Tracking (`MigrationIssue`)
To handle the 4 orphan purchase items and 5 orphan adjustment items discovered during the Phase 1 audit:
* `batch_id` was made nullable so pre-import or out-of-band anomalies can be logged prior to batch execution.
* Added `issue_code String?` (indexed) for programmatic categorization (`ORPHAN_CHILD_RECORD`, `UNMAPPED_FIELD`, `DATA_INTEGRITY_VIOLATION`).
* Added `resolution_status String @default("UNRESOLVED")` to support audit workflows (`UNRESOLVED`, `RESOLVED`, `IGNORED`).
* `metadata` column uses PostgreSQL `JSONB` for safe diagnostic storage (worksheet name, row index, raw fragment), with strict policies prohibiting credentials or connection strings.

### 3.2 Historical Stock Adjustments (`StockAdjustment` & `StockAdjustmentItem`)
* `StockAdjustmentItem.product_id` was made **nullable** to accommodate legacy adjustment rows whose product identity cannot be resolved from the legacy export without a master table.
* `method_type Int?` preserves the raw legacy numeric method code (e.g. `1`) observed in the audit without guessing whether `1` represents an addition or deduction.
* Zero triggers, hooks, or service listeners exist to modify `Product.quantity` upon `StockAdjustment` creation. Live stock is preserved.

### 3.3 Historical User Attribution (`migration_import`)
* Foreign key constraints on `Sale.user_id` and `Purchase.user_id` are `NOT NULL`.
* Created a dedicated user:
  * `username`: `"migration_import"`
  * `email`: `"migration_import@system.internal"`
  * `role`: `Role.ADMIN`
  * `is_active`: `false` (API authentication middleware rejects inactive users immediately)
  * `password_hash`: generated with `bcrypt` using an unguessable runtime UUID, preventing interactive or credential-stuffing logins.
