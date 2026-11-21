# Phase 2 Summary — Database Schema Development

> [!IMPORTANT]
> Phase 2 Database Schema Development is complete and verified.
> All new migration models and backward-compatible fields have been applied to PostgreSQL via Prisma migration `20261122000000_add_legacy_migration_models`.
> Execution date: **2026-11-21T23:03:00+05:30**

---

## 1. Summary of Changes

Phase 2 established the core database foundations required to ingest historical POS data safely without corrupting existing business logic, inventory counters, or financial allocations.

### 1.1 New Models (8)

| Model | Purpose | Key Fields | Constraints / Indexes |
|---|---|---|---|
| **`LegacyIdMap`** | Maps legacy numeric primary keys to NexTill UUIDs | `entity_type`, `legacy_id`, `nextill_id`, `batch_id`, `metadata` | `@@unique([entity_type, legacy_id])`, `@@index([entity_type, nextill_id])`, `@@index([batch_id])` |
| **`MigrationBatch`** | Tracks batch execution, record counts, and rollback status | `batch_number`, `source_file`, `source_sha256`, `entity_type`, `status`, `record_count` | `batch_number @unique`, `@@index([entity_type])`, `@@index([status])` |
| **`MigrationIssue`** | Preserves orphan child records and field anomalies | `batch_id`, `entity_type`, `legacy_id`, `severity`, `issue_type`, `description`, `source_data` | `@@index([batch_id])`, `@@index([entity_type, legacy_id])`, `@@index([severity])` |
| **`Warehouse`** | Warehouse entities (DEC-001 Option B) | `name`, `code`, `address`, `is_default`, `is_active` | `name @unique`, `code @unique`, `@@index([is_default])` |
| **`ProductStock`** | Per-warehouse stock balance foundation | `product_id`, `warehouse_id`, `quantity` | `@@unique([product_id, warehouse_id])`, `@@index([warehouse_id])` |
| **`StockAdjustment`** | Inventory adjustment headers | `adjustment_date`, `warehouse_id`, `user_id`, `reason`, `notes`, `is_legacy_import` | `@@index([adjustment_date])`, `@@index([warehouse_id])` |
| **`StockAdjustmentItem`** | Line-item inventory adjustments | `adjustment_id`, `product_id`, `quantity_change`, `method_type`, `unit` | `@@index([adjustment_id])`, `@@index([product_id])` |
| **`ProductUnit`** | Per-product custom packaging unit conversions | `product_id`, `unit_name`, `conversion_factor`, `is_default` | `@@unique([product_id, unit_name])`, `@@index([product_id])` |

---

### 1.2 Enhancements to Existing Models

| Model | Added Fields | Purpose | Impact on Existing Code |
|---|---|---|---|
| **`Sale`** | `sale_date` (DateTime?), `warehouse_id` (String?), `is_legacy_import` (Boolean default false) | Historical business date preservation and warehouse attribution | **Non-breaking**. All fields are nullable or have safe defaults. |
| **`Purchase`** | `purchase_date` (DateTime?), `warehouse_id` (String?), `is_legacy_import` (Boolean default false) | Historical purchasing date preservation and warehouse attribution | **Non-breaking**. All fields are nullable or have safe defaults. |
| **`Expense`** | `is_legacy_import` (Boolean default false) | Discriminator for imported historical expenses | **Non-breaking**. Default `false`. |
| **`User`** | `stock_adjustments` relation | Links users who performed stock adjustments | **Non-breaking** Prisma relation array. |
| **`Product`** | `product_stocks`, `product_units`, `stock_adjustment_items` relations | Links products to warehouse stock, units, and adjustment lines | **Non-breaking** Prisma relation arrays. |

---

## 2. Migration Artifacts

* **Migration Directory**: `server/prisma/migrations/20261122000000_add_legacy_migration_models/`
* **Migration SQL**: `server/prisma/migrations/20261122000000_add_legacy_migration_models/migration.sql`
* **Status**: Applied to target PostgreSQL database (`prisma migrate deploy`). Verified up-to-date with `npx prisma migrate status`.
* **Prisma Client**: Re-generated with `npx prisma generate` (v5.22.0).

---

## 3. Seed & Backfill Operations

An idempotent initialization script was created at `server/scripts/migration/seed-phase2.js`.

Execution results:
1. **Default Warehouse**:
   * Name: `"Main Warehouse"`
   * Code: `"WH-001"`
   * Default: `true`
   * ID: `13cc3d1c-fa46-455d-b901-41ce190ab00a`
2. **Migration System User**:
   * Username: `"migration_import"`
   * Email: `"migration_import@system.internal"`
   * Role: `ADMIN`
   * Is Active: `false` (locked against interactive login)
   * ID: `a2e9ce66-ae2b-4862-a712-5ab75ebb68cd`
3. **Data Backfills**:
   * `Sale`: Backfilled **89 existing sale records** with `warehouse_id = 13cc3d1c-fa46-455d-b901-41ce190ab00a`.
   * `Purchase`: Backfilled **2 existing purchase records** with `warehouse_id = 13cc3d1c-fa46-455d-b901-41ce190ab00a`.

---

## 4. Verification & Testing

* **Migration Unit Tests**: `server/scripts/migration/__tests__/schema-phase2.test.js` verified:
  * Exposure of all 8 models on Prisma client.
  * Existence and attributes of Default Warehouse and Migration User.
  * CRUD and cascading relation behavior across `MigrationBatch`, `LegacyIdMap`, and `MigrationIssue`.
  * Unique constraint enforcement on `[entity_type, legacy_id]`.
* **Readiness Validator**: `npm --prefix server run migration:readiness` confirmed:
  * `MAP-002` (30 models present, 0 missing proposed models): **PASS**
  * `MAP-003` (All proposed fields exist): **PASS**
  * Overall: `SCHEMA_CHANGE_REQUIRED` count dropped to **0**.
