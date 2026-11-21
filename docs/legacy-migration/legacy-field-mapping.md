# Legacy-to-NexTill Field Mapping Contract

> [!NOTE]
> This mapping contract documents every known source field from the legacy POS workbook
> (`POS_Complete_Export_v4.xlsx`) and its proposed target in the current NexTill Prisma schema.
> Fields marked REQUIRES_SCHEMA_CHANGE depend on Phase 2 models.

## Mapping Status Legend

| Status                       | Meaning                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `EXISTS`                     | Target field exists in current schema; direct or trivial map |
| `REQUIRES_SCHEMA_CHANGE`     | A new model or field must be added in Phase 2               |
| `REQUIRES_TRANSFORMATION`    | Field exists but value must be converted                    |
| `REQUIRES_REFERENCE_MAPPING` | A foreign key must be resolved (numeric ID → UUID)          |
| `UNRESOLVED`                 | Cannot be mapped without additional data or decisions       |
| `NOT_APPLICABLE`             | No target needed in NexTill                                 |

---

## 1. Sales (`sales` worksheet → `Sale` model)

| Source field | Target Model | Target Field | Transformation | Validation | Missing Ref Policy | Status |
|---|---|---|---|---|---|---|
| `sales.id` | LegacyIdMap (proposed) | `legacy_id` | Store as integer in new mapping table | Unique per entity type | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `sales.reference_code` | Sale | `transaction_id` | Direct copy if unique and compatible with format | Validate uniqueness against existing Sale.transaction_id values | N/A | `REQUIRES_TRANSFORMATION` |
| `sales.date` | Sale | (proposed) `sale_date` | Parse to DateTime; store as historical business date | Must be valid date | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `sales.customer_id` | Sale | `customer_id` | Map legacy int ID → NexTill Customer UUID via LegacyIdMap | Must resolve to existing Customer | Reject or create placeholder (decision DEC-003) | `REQUIRES_REFERENCE_MAPPING` |
| `sales.grand_total` | Sale | `total_amount` | Direct Decimal copy | Decimal(10,2) precision | N/A | `EXISTS` |
| `sales.paid_amount` | Sale | `amount_paid` | Direct Decimal copy | Decimal(10,2) precision | N/A | `EXISTS` |
| `sales.due_amount` | Sale | `balance_due` | Direct Decimal copy | Decimal(10,2); verify grand_total = paid + due | N/A | `EXISTS` |
| `sales.tax_amount` | Sale | `tax_amount` | Direct Decimal copy | Decimal(10,2) | N/A | `EXISTS` |
| `sales.discount` | Sale | `discount_amount` | Direct Decimal copy | Validate meaning: is this cart-level or item-level? | N/A | `REQUIRES_TRANSFORMATION` |
| `sales.payment_type` | Sale | `payment_method` | Map legacy code 1 → PaymentMethod enum | Code meanings unknown (DEC-004) | N/A | `UNRESOLVED` |
| `sales.payment_status` | Sale | `payment_status` | Map legacy code 1 → PaymentStatus enum | Code meanings unknown (DEC-004) | N/A | `UNRESOLVED` |
| `sales.status` | Sale | (no direct field) | Determine if this maps to payment_status or is separate | Code meanings unknown | N/A | `UNRESOLVED` |
| `sales.received_amount` | Sale | (none) | All values are null in source data | N/A | N/A | `NOT_APPLICABLE` |
| `sales.warehouse_id` | Sale | (proposed) `warehouse_id` | Map legacy int 1 → Warehouse UUID | Requires Warehouse model (Phase 2) | Decision DEC-001 | `REQUIRES_SCHEMA_CHANGE` |
| `sales.user_id` (implicit) | Sale | `user_id` | Required FK — Sale.user_id is NOT NULL | Must assign an approved migration user | Decision DEC-011 | `REQUIRES_REFERENCE_MAPPING` |
| `sales.subtotal` | Sale | `subtotal` | Direct or calculated from items | Decimal(10,2) | N/A | `EXISTS` |
| `sales.notes` | Sale | `notes` | Direct copy if present | Optional String | N/A | `EXISTS` |

## 2. Sale Items (`sales_sale_items` / embedded → `SaleItem` model)

| Source field | Target Model | Target Field | Transformation | Validation | Missing Ref Policy | Status |
|---|---|---|---|---|---|---|
| `sale_items.id` | LegacyIdMap (proposed) | `legacy_id` | Store original ID | Unique per entity type | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `sale_items.sale_id` | SaleItem | `sale_id` | Resolve legacy sale int → NexTill Sale UUID | Must match imported sale | N/A | `REQUIRES_REFERENCE_MAPPING` |
| `sale_items.product_id` | SaleItem | `product_id` | Map legacy product int → NexTill Product UUID | Required FK (NOT NULL) | Decision DEC-002 | `REQUIRES_REFERENCE_MAPPING` |
| `sale_items.product_name` | SaleItem | `product_name` | Direct copy as snapshot | String default "" | N/A | `EXISTS` |
| `sale_items.product_sku` | SaleItem | `product_sku` | Direct copy as snapshot if available | String default "" | N/A | `EXISTS` |
| `sale_items.quantity` | SaleItem | `quantity` | Preserve numeric precision | Decimal(10,3) | N/A | `EXISTS` |
| `sale_items.unit` | SaleItem | `unit` | Normalize legacy unit name (e.g., "peice" → "pcs") | Valid unit for category | Decision DEC-005 | `REQUIRES_TRANSFORMATION` |
| `sale_items.unit_price` | SaleItem | `unit_price` | Direct Decimal copy | Decimal(10,2) | N/A | `EXISTS` |
| `sale_items.sub_total` | SaleItem | `total` | Direct or validate qty × unit_price − discount | Decimal(10,2) | N/A | `EXISTS` |
| `sale_items.discount` | SaleItem | `discount` | Direct Decimal copy | Decimal(10,2) default 0 | N/A | `EXISTS` |
| `sale_items.base_quantity` | SaleItem | `base_quantity` | Calculate from quantity and unit conversion | Decimal(14,3) | N/A | `REQUIRES_TRANSFORMATION` |
| `sale_items.base_unit` | SaleItem | `base_unit` | Derive from product's base unit | String default "pcs" | N/A | `REQUIRES_TRANSFORMATION` |
| `sale_items.pricing_unit` | SaleItem | `pricing_unit` | Derive from product | String default "pcs" | N/A | `REQUIRES_TRANSFORMATION` |
| `sale_items.cost_price` | SaleItem | `cost_price_snapshot` | Snapshot of cost at time of sale | Decimal(10,2) nullable | N/A | `EXISTS` |
| `sale_items.unit_cost_snapshot` | SaleItem | `unit_cost_snapshot` | Direct or derive from cost_price | Decimal(10,2) default 0 | N/A | `EXISTS` |
| `sale_items.line_cost` | SaleItem | `line_cost` | Direct or calculate qty × cost | Decimal(10,2) default 0 | N/A | `EXISTS` |
| `sale_items.usual_price_snapshot` | SaleItem | `usual_price_snapshot` | From product catalog at import time or legacy data | Decimal(10,2) default 0 | N/A | `REQUIRES_TRANSFORMATION` |
| `sale_items.our_price_snapshot` | SaleItem | `our_price_snapshot` | From product catalog or legacy data | Decimal(10,2) default 0 | N/A | `REQUIRES_TRANSFORMATION` |
| `sale_items.wholesale_price_snapshot` | SaleItem | `wholesale_price_snapshot` | Default 0 unless legacy data provides it | Decimal(10,2) default 0 | N/A | `EXISTS` |
| `sale_items.is_wholesale` | SaleItem | `is_wholesale` | Default false unless legacy data indicates | Boolean default false | N/A | `EXISTS` |
| `sale_items.predefined_discount_applied` | SaleItem | `predefined_discount_applied` | Default false for legacy imports | Boolean default false | N/A | `EXISTS` |
| `sale_items.predefined_discount_amount` | SaleItem | `predefined_discount_amount` | Default 0 for legacy imports | Decimal(10,2) default 0 | N/A | `EXISTS` |

## 3. Purchases (`purchases` worksheet → `Purchase` model)

| Source field | Target Model | Target Field | Transformation | Validation | Missing Ref Policy | Status |
|---|---|---|---|---|---|---|
| `purchases.id` | LegacyIdMap (proposed) | `legacy_id` | Store as integer | Unique per entity type | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `purchases.reference_code` | Purchase | `purchase_number` | Direct copy if unique | Validate against existing purchase_number unique constraint | N/A | `REQUIRES_TRANSFORMATION` |
| `purchases.supplier_id` | Purchase | `supplier_id` | Map legacy int 3 → NexTill Supplier UUID | Required FK (NOT NULL) | Decision DEC-003 | `REQUIRES_REFERENCE_MAPPING` |
| `purchases.user_id` (implicit) | Purchase | `user_id` | Required FK — Purchase.user_id is NOT NULL | Must assign approved migration user | Decision DEC-011 | `REQUIRES_REFERENCE_MAPPING` |
| `purchases.date` | Purchase | (proposed) `purchase_date` | Parse to DateTime; preserve as business date | Must be valid date | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `purchases.grand_total` | Purchase | `total_amount` | Direct Decimal copy | Decimal(10,2) | N/A | `EXISTS` |
| `purchases.subtotal` | Purchase | `subtotal` | Direct Decimal copy | Decimal(10,2) default 0 | N/A | `EXISTS` |
| `purchases.tax_amount` | Purchase | `tax_amount` | Direct Decimal copy | Decimal(10,2) default 0 | N/A | `EXISTS` |
| `purchases.paid_amount` | Purchase | `amount_paid` | Direct Decimal copy | Decimal(10,2) default 0 | N/A | `EXISTS` |
| `purchases.due_amount` | Purchase | `balance_due` | Direct Decimal copy | Decimal(10,2) default 0 | N/A | `EXISTS` |
| `purchases.status` | Purchase | `status` | Map legacy code 1 → PurchaseStatus enum | Code meaning unknown (DEC-004) | N/A | `UNRESOLVED` |
| `purchases.payment_status` | Purchase | `payment_status` | Map legacy code → PaymentStatus enum | Code meaning unknown | N/A | `UNRESOLVED` |
| `purchases.received_amount` | Purchase | (none) | All values null | N/A | N/A | `NOT_APPLICABLE` |
| `purchases.warehouse_id` | Purchase | (proposed) `warehouse_id` | Map legacy int 1 → Warehouse UUID | Phase 2 model | Decision DEC-001 | `REQUIRES_SCHEMA_CHANGE` |
| `purchases.received_at` | Purchase | `received_at` | Null for ORDERED, date for RECEIVED | DateTime nullable | N/A | `EXISTS` |
| `purchases.notes` | Purchase | `notes` | Direct copy | Optional String | N/A | `EXISTS` |

## 4. Purchase Items (`purchases_purchase_items` / embedded → `PurchaseItem` model)

| Source field | Target Model | Target Field | Transformation | Validation | Missing Ref Policy | Status |
|---|---|---|---|---|---|---|
| `purchase_items.id` | LegacyIdMap (proposed) | `legacy_id` | Store original ID | Unique per entity type | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `purchase_items.purchase_id` | PurchaseItem | `purchase_id` | Resolve legacy purchase int → NexTill Purchase UUID | Required FK; some parents MISSING (DEC-006) | Preserve orphans with issue tracking | `REQUIRES_REFERENCE_MAPPING` |
| `purchase_items.product_id` | PurchaseItem | `product_id` | Map legacy product int → Product UUID | Required FK (NOT NULL) | Decision DEC-002 | `REQUIRES_REFERENCE_MAPPING` |
| `purchase_items.product_name` | PurchaseItem | `product_name` | Direct snapshot copy | String default "" | N/A | `EXISTS` |
| `purchase_items.product_sku` | PurchaseItem | `product_sku` | Direct snapshot copy | String default "" | N/A | `EXISTS` |
| `purchase_items.quantity` | PurchaseItem | `quantity` | Preserve numeric precision | Decimal(10,3) | N/A | `EXISTS` |
| `purchase_items.unit` | PurchaseItem | `unit` | Normalize unit name | String default "pcs" | Decision DEC-005 | `REQUIRES_TRANSFORMATION` |
| `purchase_items.unit_cost` | PurchaseItem | `unit_cost` | Direct Decimal copy | Decimal(10,2) | N/A | `EXISTS` |
| `purchase_items.total_cost` | PurchaseItem | `total_cost` | Direct or validate qty × unit_cost | Decimal(10,2) | N/A | `EXISTS` |
| `purchase_items.base_quantity` | PurchaseItem | `base_quantity` | Calculate from unit conversion | Decimal(14,3) default 1 | N/A | `REQUIRES_TRANSFORMATION` |

## 5. Adjustments (`adjustments` → Proposed `StockAdjustment` model)

| Source field | Target Model | Target Field | Transformation | Validation | Missing Ref Policy | Status |
|---|---|---|---|---|---|---|
| `adjustments.id` | LegacyIdMap + StockAdjustment (proposed) | `legacy_id` / `id` | New model required | Unique | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `adjustments.date` | StockAdjustment (proposed) | `adjustment_date` | Parse to DateTime | Valid date | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `adjustments.warehouse_id` | StockAdjustment (proposed) | `warehouse_id` | Map legacy int 1 → Warehouse UUID | Phase 2 model | Decision DEC-001 | `REQUIRES_SCHEMA_CHANGE` |
| `adjustments.notes` | StockAdjustment (proposed) | `notes` | Direct copy | Optional | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `adjustment_items.id` | StockAdjustmentItem (proposed) | `id` | New model required | Unique | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `adjustment_items.adjustment_id` | StockAdjustmentItem (proposed) | `adjustment_id` | Resolve to parent; some ORPHAN (DEC-007) | FK | Preserve orphans | `REQUIRES_SCHEMA_CHANGE` |
| `adjustment_items.product_id` | StockAdjustmentItem (proposed) | `product_id` | Map legacy int → Product UUID | Required FK | Decision DEC-002 | `REQUIRES_REFERENCE_MAPPING` |
| `adjustment_items.quantity` | StockAdjustmentItem (proposed) | `quantity` | Preserve numeric value | Decimal | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `adjustment_items.method_type` | StockAdjustmentItem (proposed) | `method_type` | Preserve raw code 1; do NOT guess meaning | Integer | N/A | `REQUIRES_SCHEMA_CHANGE` |

## 6. Expenses (`expenses` → `Expense` model)

| Source field | Target Model | Target Field | Transformation | Validation | Missing Ref Policy | Status |
|---|---|---|---|---|---|---|
| `expenses.id` | LegacyIdMap (proposed) | `legacy_id` | Store as integer | Unique | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `expenses.expense_category_id` | Expense | `category_id` | Map legacy int 5 → NexTill ExpenseCategory UUID | Required FK (NOT NULL) | Match by name or create | `REQUIRES_REFERENCE_MAPPING` |
| `expenses.amount` | Expense | `amount` | Direct Decimal copy | Decimal(10,2) | N/A | `EXISTS` |
| `expenses.date` | Expense | `expense_date` | Parse to DateTime | Existing DateTime field | N/A | `EXISTS` |
| `expenses.reference_code` | Expense | `reference` | Direct copy | Optional String | N/A | `EXISTS` |
| `expenses.notes` | Expense | `notes` | Direct copy | Optional String | N/A | `EXISTS` |
| `expenses.warehouse_id` | Expense | (proposed) `warehouse_id` or ignore | Map to Warehouse if multi-warehouse adopted | Decision DEC-001 | N/A | `REQUIRES_SCHEMA_CHANGE` |
| `expenses.user_id` (implicit) | Expense | `user_id` | Required FK — Expense.user_id is NOT NULL | Must assign migration user | Decision DEC-011 | `REQUIRES_REFERENCE_MAPPING` |
| `expenses.payment_method` | Expense | `payment_method` | Default CASH or map if source provides it | PaymentMethod enum | N/A | `REQUIRES_TRANSFORMATION` |
| `expenses.payee` | Expense | `payee` | Direct copy if available | Optional String | N/A | `EXISTS` |
| `expenses.category_name` | ExpenseCategory | `name` | "home" — may need to create or match | Unique constraint | N/A | `REQUIRES_REFERENCE_MAPPING` |

---

## 7. Required New Models Summary (Phase 2)

| Proposed Model | Purpose | Mandatory |
|---|---|---|
| `Warehouse` | Multi-warehouse support | Conditional (DEC-001) |
| `ProductStock` | Per-warehouse stock levels | Conditional (DEC-001) |
| `StockAdjustment` | Adjustment headers | Yes — legacy data exists |
| `StockAdjustmentItem` | Adjustment line items | Yes — legacy data exists |
| `LegacyIdMap` | Legacy numeric ID ↔ NexTill UUID mapping | Yes |
| `MigrationBatch` | Migration run tracking | Yes |
| `MigrationIssue` | Per-record issue tracking | Yes |

## 8. Required New Fields on Existing Models (Phase 2)

| Model | Proposed Field | Type | Purpose |
|---|---|---|---|
| `Sale` | `sale_date` | `DateTime?` | Historical business date vs import timestamp |
| `Sale` | `warehouse_id` | `String?` | Warehouse FK (conditional) |
| `Sale` | `is_legacy_import` | `Boolean` default false | Flag imported records |
| `Purchase` | `purchase_date` | `DateTime?` | Historical business date |
| `Purchase` | `warehouse_id` | `String?` | Warehouse FK (conditional) |
| `Purchase` | `is_legacy_import` | `Boolean` default false | Flag imported records |
| `Expense` | `is_legacy_import` | `Boolean` default false | Flag imported records |

## 9. Critical Mapping Gaps

> [!WARNING]
> The following mappings CANNOT be resolved without additional input:
> 1. **Product identity** — no product master table in workbook (DEC-002)
> 2. **Customer identity** — only ID 1 referenced, no master (DEC-003)
> 3. **Supplier identity** — only ID 3 referenced, no master (DEC-003)
> 4. **Status code meanings** — codes are all 1, no legend (DEC-004)
> 5. **User attribution** — Sale.user_id and Purchase.user_id are NOT NULL (DEC-011)
> 6. **Warehouse scope** — single warehouse ID 1 everywhere (DEC-001)
