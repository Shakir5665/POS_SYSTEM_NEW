# NexTill POS — Phase 4A Data Contract
## Source-to-Target Data Specification, Validation Rules, and Eligibility Criteria

**Date:** November 22, 2026  
**Git Branch:** `phase-4a/legacy-migration-engine`  
**Document Status:** Authoritative Data Migration Contract  
**Source Specification:** `docs/legacy-migration/legacy-data-audit.json`  
**Dataset Reference:** `server/scripts/migration/data/legacy-dataset.json` (SHA-256: `b392557f09df3dd191aed9f178f89722d10a44b43294949c670e53f24bac03a4`)

---

## 1. Overview & Data Architecture

This contract establishes the formal schema, data types, transformation rules, master data resolution policies, and quarantine criteria for ingesting legacy POS export data into NexTill PostgreSQL database models.

### Key Principles
1. **Preserve Audited Realities:** Strictly adhere to the external audit findings. No invented data or unverified row joins.
2. **Deterministic Deduplication:** Embedded line items represent the authoritative child records. Flattened items matching embedded IDs are deduplicated.
3. **Orphan Quarantine:** Flattened child items lacking parent headers are quarantined into `MigrationIssue` records. They are never attached to arbitrary parent headers by row order.
4. **Authoritative Stock Invariance:** Historical transactions must never mutate `Product.quantity` or create live operational `InventoryLog` records.
5. **No Synthetic Payments:** Historical balances are stored directly on transaction headers (`amount_paid`, `balance_due`). No synthetic `Payment` rows are fabricated.

---

## 2. Dataset Entity Specifications

### 2.1 Sales Header Contract (`sales`)

| Field Name | Type | Constraints / Validation | Transformation / Target Model Field |
|---|---|---|---|
| `legacy_id` | Integer | Required, Unique across sales | Mapped to `LegacyIdMap` (`entity_type: "Sale"`) |
| `reference_code` | String | e.g., `"REF-20816"` | Transformed to `Sale.transaction_id = "LEGACY-" + reference_code` |
| `sale_date` | ISO-8601 Date | Valid timestamp (e.g., `"2026-11-07T10:00:00.000Z"`) | Stored in `Sale.sale_date`. `Sale.created_at` remains current timestamp. |
| `customer_id` | Integer | Nullable or maps to Customer ID 1 | Resolved via `resolveCustomer(legacy_id)`. If unmapped, `Sale.customer_id = null`. |
| `warehouse_id` | Integer | Legacy warehouse ID 1 | Resolved via `resolveWarehouse(1)` to default warehouse (`WH-TEST-001` / `WH-001`). |
| `grand_total` | Decimal | Required, Decimal(10, 2) | Stored in `Sale.total_amount` |
| `subtotal` | Decimal | Optional, defaults to grand_total | Stored in `Sale.subtotal` |
| `paid_amount` | Decimal | Required, Decimal(10, 2) | Stored in `Sale.amount_paid` |
| `due_amount` | Decimal | Required, Decimal(10, 2) | Stored in `Sale.balance_due` |
| `tax_amount` | Decimal | Optional, default 0.00 | Stored in `Sale.tax_amount` |
| `discount` | Decimal | Optional, default 0.00 | Stored in `Sale.discount_amount` |
| `status` | Integer | Legacy status code 1 | Mapped to `Sale.payment_status = 'COMPLETED'` |
| `notes` | String | Optional | Appended with `"Legacy POS Sale #<id>"` |
| `is_legacy_import`| Boolean | Always forced to `true` | `Sale.is_legacy_import = true` |
| `loyalty_points_earned` | Integer | Always forced to `0` | `Sale.loyalty_points_earned = 0` (RISK-02) |

### 2.2 Sale Items Contract (`sales.items` / `sales_sale_items`)

| Field Name | Type | Constraints / Validation | Transformation / Target Model Field |
|---|---|---|---|
| `legacy_id` | Integer | Unique item ID | Mapped to `LegacyIdMap` (`entity_type: "SaleItem"`) |
| `product_id` | Integer | Required legacy product ID | Resolved via `resolveProduct(legacy_id, name)`. Mapped to `SaleItem.product_id`. |
| `product_name` | String | Snapshot product name | Stored in `SaleItem.product_name` |
| `quantity` | Decimal | Decimal(10, 3), positive | Stored in `SaleItem.quantity` |
| `unit` | String | e.g., `"kg"`, `"pcs"`, `"peice"` | Normalized via `normalizeUnit()`: `"peice"` -> `"pcs"`. Stored in `SaleItem.unit`. |
| `base_quantity`| Decimal | Decimal(14, 3) | Computed via `toBaseUnitQuantity()`. Stored in `SaleItem.base_quantity`. |
| `unit_price` | Decimal | Decimal(10, 2) | Stored in `SaleItem.unit_price` |
| `total` | Decimal | Decimal(10, 2) | Stored in `SaleItem.total` |
| `line_cost` | Decimal | Decimal(10, 2), default 0 | Stored in `SaleItem.line_cost` |
| `cost_price_snapshot`| Decimal | Optional | Stored in `SaleItem.cost_price_snapshot` |

#### Deduplication Invariant:
- Source contains **19 embedded sale items** and **5 flattened items** (IDs: `176656`, `176657`, `176658`, `176653`, `176654`).
- The 5 flattened items are an exact subset of the 19 embedded items.
- The migration engine imports exactly **19 unique sale items**, deduplicating the flattened items to prevent double-counting.

---

### 2.3 Purchases Contract (`purchases`)

| Field Name | Type | Constraints / Validation | Transformation / Target Model Field |
|---|---|---|---|
| `legacy_id` | Integer | Required, Unique across purchases | Mapped to `LegacyIdMap` (`entity_type: "Purchase"`) |
| `reference_code` | String | e.g., `"PO-1778"` | Transformed to `Purchase.purchase_number = "LEGACY-PO-" + id` |
| `purchase_date` | ISO-8601 Date | Valid timestamp (e.g., `"2024-11-20T10:00:00.000Z"`) | Stored in `Purchase.purchase_date`. `received_at` set to purchase date. |
| `supplier_id` | Integer | Legacy supplier ID 3 | Resolved via `resolveSupplier(3)`. Stored in `Purchase.supplier_id`. |
| `warehouse_id` | Integer | Legacy warehouse ID 1 | Resolved via `resolveWarehouse(1)` to default warehouse. |
| `grand_total` | Decimal | Required, Decimal(10, 2) | Stored in `Purchase.total_amount` |
| `paid_amount` | Decimal | Required | Stored in `Purchase.amount_paid` |
| `due_amount` | Decimal | Required | Stored in `Purchase.balance_due` |
| `status` | Integer | Legacy status code 1 | Mapped to `Purchase.status = 'RECEIVED'`, `payment_status = 'COMPLETED'` |
| `is_legacy_import`| Boolean | Always forced to `true` | `Purchase.is_legacy_import = true` |

### 2.4 Quarantined Purchase Items (`flattened_purchase_items`)

The 4 flattened purchase items reference parent purchase header IDs that do not exist in the workbook:
- Item `4353` -> Parent `4351` (Sugar, 500 kg)
- Item `4352` -> Parent `4350` (Salt, 300 kg)
- Item `4351` -> Parent `4349` (Chilli, 150 kg)
- Item `4350` -> Parent `4348` (Basmathi Rice, 200 kg)

**Quarantine Policy (DEC-006):**
- These records are **excluded from live import eligibility**.
- Stored as `MigrationIssue` records with `issue_code: 'ORPHAN_CHILD'`, `severity: 'WARNING'`.
- Retain full source payload in `metadata` for future header matching.

---

### 2.5 Stock Adjustments Contract (`adjustments`)

| Field Name | Type | Constraints / Validation | Transformation / Target Model Field |
|---|---|---|---|
| `legacy_id` | Integer | Header IDs: `1117`–`1121` | Mapped to `LegacyIdMap` (`entity_type: "StockAdjustment"`) |
| `adjustment_number` | String | Generated unique string | Stored as `"LEGACY-ADJ-" + legacy_id` |
| `adjustment_date` | ISO-8601 Date | Valid dates (May 2026) | Stored in `StockAdjustment.adjustment_date` |
| `warehouse_id` | Integer | Legacy ID 1 | Mapped to default warehouse |
| `reason` | String | e.g., `"PHYSICAL_COUNT"`, `"DAMAGE"`| Stored in `StockAdjustment.reason` |
| `items.quantity_change`| Decimal | Signed Decimal(14, 3) | Stored in `StockAdjustmentItem.quantity_change` |
| `items.method_type` | Integer | Legacy method code `1` | Preserved as raw integer in `StockAdjustmentItem.method_type` (DEC-004) |
| `is_legacy_import` | Boolean | Always forced to `true` | **Bypasses Product.quantity and InventoryLog** (DEC-008, RISK-10) |

### 2.6 Quarantined Adjustment Items (`flattened_adjustment_items`)

The 5 flattened adjustment items reference parent adjustment header IDs not in the workbook:
- Item `76` -> Parent `118` (-3.0 kg Sugar, Oct 2024)
- Item `75` -> Parent `117` (+4.0 kg Salt, Oct 2024)
- Item `74` -> Parent `116` (-0.5 kg Chilli, Oct 2024)
- Item `73` -> Parent `115` (+8.0 kg Basmathi Rice, Oct 2024)
- Item `72` -> Parent `114` (-2.0 pcs ALA, Oct 2024)

**Quarantine Policy (DEC-007):**
- Quarantined into `MigrationIssue` (`issue_code: 'ORPHAN_CHILD'`).
- Preserved with October 2024 audit timestamps and raw `method_type: 1`.

---

### 2.7 Expenses Contract (`expenses`)

| Field Name | Type | Constraints / Validation | Transformation / Target Model Field |
|---|---|---|---|
| `legacy_id` | Integer | Header ID `3` | Mapped to `LegacyIdMap` (`entity_type: "Expense"`) |
| `amount` | Decimal | Required Decimal(10, 2) (`10000.00`)| Stored in `Expense.amount` |
| `expense_date` | ISO-8601 Date | Valid timestamp (`"2024-09-08"`) | Stored in `Expense.expense_date` |
| `category_id` | Integer | Category ID `5` | Resolved via `resolveExpenseCategory()`. Automatic fallback removed: requires approved mapping; otherwise original ID and name are preserved and expense is quarantined. |
| `is_legacy_import` | Boolean | Always forced to `true` | Stored in `Expense.is_legacy_import` |

---

## 3. Master Data Resolution Rules

| Entity Type | Resolution Order | Missing Mapping Action |
|---|---|---|
| **Warehouse** | 1. `LegacyIdMap` lookup<br/>2. Active default warehouse (`WH-001`) | Cannot fail if seed-phase2.js was run. If no warehouse exists, throws fatal error. |
| **User** | Dedicated inactive user `migration_import` (`role: ADMIN`, `is_active: false`) | Auto-seeded if missing (DEC-011). Never attributes to interactive cashiers. |
| **Product** | 1. `LegacyIdMap` lookup<br/>2. Case-insensitive exact name match | If unmapped: Logs `MigrationIssue` (`MISSING_PRODUCT`). Excluded from import eligibility unless explicit fallback approved (DEC-002). |
| **Customer** | 1. `LegacyIdMap` lookup<br/>2. Active customer match | If unmapped: `Sale.customer_id = null` and logs `MigrationIssue` (DEC-003). |
| **Supplier** | 1. `LegacyIdMap` lookup<br/>2. Active supplier match (`SS-MART`) | If unmapped: Logs `MigrationIssue` (`MISSING_SUPPLIER`). Purchase cannot import without supplier FK. |
| **Expense Category** | 1. Approved mapping options (`approvedCategoryMappings`)<br/>2. `LegacyIdMap` lookup<br/>3. Exact name match in `ExpenseCategory` | Automatic fallback to `Miscellaneous` REMOVED. If unmapped: preserves original ID and name, logs `MigrationIssue` (`UNRESOLVED_CATEGORY_MAPPING`, `WARNING`), and marks expense NOT ELIGIBLE for import. |
| **Units (UOM)** | Normalized dictionary lookup (`peice` -> `pcs`) | Preserves standard conversion factors to `base_unit` (DEC-005). |

---

## 4. Import Eligibility & Rejection Conditions

A record is **ELIGIBLE** for staged import if:
1. It is a supported entity type (`Sale`, `Purchase`, `StockAdjustment`, `Expense`).
2. All non-nullable foreign keys (`user_id`, `warehouse_id`, `supplier_id`, `category_id`) resolve to valid database records.
3. It has valid decimal monetary amounts and quantities.
4. Its legacy ID is unique and not already mapped in `LegacyIdMap`.
5. It is not an orphaned child record.
6. For expenses, an approved category mapping exists.

A record is **QUARANTINED / EXCLUDED** if:
1. It is an orphaned child record lacking parent headers (the 9 quarantined items).
2. It is an expense record lacking an approved expense category mapping (e.g. legacy category ID 5 "home").
3. Required foreign keys fail resolution.
4. Checksum or schema structure validation fails.
