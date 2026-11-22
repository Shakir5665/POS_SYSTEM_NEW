# NexTill POS — Phase 4B Field Mapping Specification

## 1. Overview & Data Types Policy
This document defines the strict, bidirectional field mappings between the RJ Food POS database export worksheets (`NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx`) and the NexTill POS PostgreSQL / Prisma schema.

### Guiding Principles
1. **Zero Stock Mutation**: No historical worksheet data mutates `Product.quantity` or writes to `InventoryLog`.
2. **Lossless Traceability**: Every imported record creates a corresponding `LegacyIdMap` row linking `legacy_id` and `nextill_id` within the `MigrationBatch`. Unmapped fields are stored in `LegacyIdMap.metadata`.
3. **Decimal Precision**: All monetary and quantity computations strictly use Decimal arithmetic. No float approximations.
4. **Unit Invariance**: Base units (`Base_Units`) and operational units (`Units`) are distinct reference domains and never conflated.

---

## 2. Worksheet Mapping Matrices

### 2.1 Products (`Products` Sheet -> `Product` Model)
| Source Column | Source Type | Target Prisma Model | Target Field | Conversion Rule | Status | Validation / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Product ID` | Integer | `LegacyIdMap` | `legacy_id` | `String(id)` | Required | Primary identifier; mapped via `LegacyIdMap` |
| `Product Name` | String | `Product` | `name` | Trim whitespace | Required | Max length 255 |
| `Code` / `Barcode` | String | `Product` | `barcode` | String or null | Optional | Product barcode for POS scanning |
| `Product Code` | String | `Product` | `sku` | String or fallback | Required | Unique SKU identifier |
| `Category ID` | Integer | `Product` | `category_id` | Foreign Key | Required | Resolves via Category LegacyIdMap |
| `Brand ID` | Integer | `LegacyIdMap` | `metadata.brand_id` | JSON metadata | Optional | NexTill core schema stores in legacy metadata |
| `Product Cost` | Numeric | `Product` | `cost_price` | `Decimal(val)` | Required | Historical purchase cost snapshot |
| `Selling Price` | Numeric | `Product` | `usual_price` | `Decimal(val)` | Required | Historical standard retail price |
| `Our Price` | Numeric | `Product` | `our_price` | `Decimal(val)` | Required | Special NexTill discounted price |
| `In Stock Quantity` | Numeric | `LegacyIdMap` | `metadata.in_stock` | Preserved | Read-Only | **NEVER** imported to `Product.quantity`. Quantity defaults to 0 |
| `Stock Alert Limit` | Numeric | `Product` | `alert_quantity` | `Decimal(val)` | Optional | Reorder notification threshold |
| `Product Unit ID` | Integer | `Product` | `unit` | Base_Units lookup | Required | Resolves to Base_Units (1–6: kg, pcs, etc.) |
| `Sale Unit ID` | Integer | `LegacyIdMap` | `metadata.sale_unit`| Units lookup | Optional | Operational POS sale packaging unit |
| `Purchase Unit ID` | Integer | `LegacyIdMap` | `metadata.purch_unit`| Units lookup | Optional | Operational vendor purchase unit |
| `Created At` | DateTime | `Product` | `created_at` | `new Date(val)` | Required | Historical creation timestamp |

### 2.2 Units Mapping Matrix (`Base_Units` & `Units` Sheets)
* **Base_Units (IDs 1–6):** Fundamental reference units:
  * `1` -> `kg` (Kilogram)
  * `2` -> `pcs` (Piece)
  * `3` -> `packet` (Packet)
  * `4` -> `m` (Meter)
  * `5` -> `litre` (Litre)
  * `6` -> `bundle` (Bundle)
* **Units (IDs 2, 6, 7, 8, 9, 10):** Operational transaction packaging units:
  * `2` -> `pcs` (Operator: `*`, Value: `1.000`)
  * `6` -> `packet` (Operator: `*`, Value: `1.000`)
  * `7` -> `box` (Operator: `*`, Value: `12.000` or per definition)
  * `8` -> `carton` (Operator: `*`, Value: `24.000`)
  * `9` -> `roll` (Operator: `*`, Value: `1.000`)
  * `10` -> `strip` (Operator: `*`, Value: `10.000`)

### 2.3 Sales (`Sales` Sheet -> `Sale` Model)
| Source Column | Source Type | Target Prisma Model | Target Field | Conversion Rule | Status | Validation / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Sale ID` | Integer | `LegacyIdMap` | `legacy_id` | `String(id)` | Required | Primary historical ID |
| `Reference Code` | String | `Sale` | `transaction_id` | `LEGACY-S{id}-{ref}`| Required | Unique reference string |
| `Date` | DateTime | `Sale` | `sale_date` | `new Date(val)` | Required | Preserves authentic business date |
| `Customer ID` | Integer | `Sale` | `customer_id` | Foreign Key | Optional | Resolves to Customer or Walk-in default |
| `Warehouse ID` | Integer | `Sale` | `warehouse_id` | Foreign Key | Required | Resolves to default warehouse (WH-001) |
| `Grand Total` | Numeric | `Sale` | `total_amount` | `Decimal(val)` | Required | Authoritative header grand total |
| `Paid Amount` | Numeric | `Sale` | `amount_paid` | `Decimal(val)` | Required | Recorded historical payment total |
| `Tax Amount` | Numeric | `Sale` | `tax_amount` | `Decimal(val)` | Optional | Header tax if specified |
| `Discount` | Numeric | `Sale` | `discount_amount` | `Decimal(val)` | Optional | Header level discount |
| `Payment Status` | String | `Sale` | `payment_status` | Normalize | Required | Default `COMPLETED` for settled sales |
| Flag | Internal | `Sale` | `is_legacy_import`| `true` | Required | Enforces historical read-only rules |

### 2.4 Sale_Items (`Sale_Items` Sheet -> `SaleItem` Model)
| Source Column | Source Type | Target Prisma Model | Target Field | Conversion Rule | Status | Validation / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Item ID` | Integer | `LegacyIdMap` | `legacy_id` | `String(id)` | Required | Historical line item ID |
| `Sale ID` | Integer | `SaleItem` | `sale_id` | Foreign Key | Required | Links to parent `Sale.id` |
| `Product ID` | Integer | `SaleItem` | `product_id` | Foreign Key | Required | Links to imported `Product.id` |
| `Product Name` | String | `SaleItem` | `product_name` | String | Required | Historical product title snapshot |
| `Product Code` | String | `SaleItem` | `product_sku` | String | Required | Historical SKU snapshot |
| `Quantity` | Numeric | `SaleItem` | `quantity` | `Decimal(val)` | Required | Must be > 0. Negative quarantined |
| `Net Unit Price` | Numeric | `SaleItem` | `unit_price` | `Decimal(val)` | Required | Historical selling price snapshot |
| `Sub Total` | Numeric | `SaleItem` | `total` | `Decimal(val)` | Required | Subtotal = quantity * unit_price |
| `Discount` | Numeric | `SaleItem` | `discount` | `Decimal(val)` | Optional | Line item discount |
| `Unit` | String | `SaleItem` | `unit` | Lowercase string | Required | Unit representation (pcs, kg, etc.) |

### 2.5 Purchases & Purchase_Items (`Purchases`, `Purchase_Items`)
* `Purchase`: Mapped to `Purchase` model with `is_legacy_import: true`, `purchase_number: LEGACY-P{id}-{ref}`, `status: RECEIVED`, `payment_status: COMPLETED`.
* `PurchaseItem`: Mapped to `PurchaseItem` model preserving `product_name`, `product_sku`, `unit_cost`, `quantity`, and `total_cost`.

### 2.6 Adjustments & Adjustment_Items
* Mapped strictly as historical audit records to `StockAdjustment` and `StockAdjustmentItem`.
* `is_legacy_import: true`.
* **NEVER** replayed against current inventory balances.

### 2.7 Expenses (`Expenses` Sheet)
* Legacy expense record `EX_113`: `Generator Fuel` (Category 5, amount 2,500.00).
* Target: `Expense` model, `is_legacy_import: true`.
* Category 5 ('home') reclassified to operational overhead with audit log in `MigrationIssue`.
