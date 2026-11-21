# NexTill POS — Phase 3B Stock Adjustment Service Design
## Architectural Specification & Transactional Interface Design

**Date:** November 22, 2026  
**Document Status:** Architecture & Implementation Plan for Phase 3B  
**Target Schema Models:** `StockAdjustment`, `StockAdjustmentItem`, `InventoryLog`, `Product`, `LegacyIdMap`  
**Prerequisite Decisions:** DEC-004 (Adjustment Representation), DEC-008 (Authoritative Stock Counter)

---

## 1. Schema Model Inspection

Phase 2 established two models in `server/prisma/schema.prisma` to support stock adjustments:

```prisma
model StockAdjustment {
  id                String   @id @default(uuid())
  adjustment_number String?  @unique
  adjustment_date   DateTime
  warehouse_id      String?
  user_id           String
  reason            String?
  notes             String?
  is_legacy_import  Boolean  @default(false)
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  user      User                  @relation(fields: [user_id], references: [id])
  warehouse Warehouse?            @relation(fields: [warehouse_id], references: [id])
  items     StockAdjustmentItem[]

  @@index([adjustment_date])
  @@index([warehouse_id])
}

model StockAdjustmentItem {
  id              String   @id @default(uuid())
  adjustment_id   String
  product_id      String?               // Optional product mapping for unresolved items
  quantity_change Decimal  @db.Decimal(14, 3)
  method_type     Int?                  // Raw unresolved legacy method code
  unit            String   @default("pcs")
  notes           String?
  created_at      DateTime @default(now())

  adjustment StockAdjustment @relation(fields: [adjustment_id], references: [id], onDelete: Cascade)
  product    Product?        @relation(fields: [product_id], references: [id], onDelete: Restrict)

  @@index([adjustment_id])
  @@index([product_id])
}
```

### Key Architectural Characteristics
1. **Multi-Item Adjustment Headers:** An adjustment header (`StockAdjustment`) groups multiple line items (`StockAdjustmentItem`), sharing a common business date (`adjustment_date`), optional warehouse (`warehouse_id`), and audit reason.
2. **Nullable Product IDs on Line Items:** Supports legacy data rows where the product mapping is incomplete or unresolved without breaking database integrity.
3. **Preservation of Raw Legacy Method Codes:** The `method_type` column (integer) preserves the original legacy system's movement codes (e.g., damaged, stock count variance, expired) until semantic mappings are finalized.
4. **Decoupled from Stock Mutation:** Inserting rows into `StockAdjustment` or `StockAdjustmentItem` does not trigger automatic database triggers or hidden middleware stock mutations.

---

## 2. Proposed Service Interface

The service will be implemented in `server/src/services/stockAdjustmentService.js` in Phase 3B:

```javascript
/**
 * Create a transactional stock adjustment.
 *
 * @param {Object} params
 * @param {string} params.warehouse_id - Target warehouse ID (defaults to default warehouse if omitted)
 * @param {string|Date} [params.adjustment_date] - Effective business date (defaults to now)
 * @param {string} [params.reason] - High-level reason (e.g., 'PHYSICAL_COUNT', 'DAMAGE', 'EXPIRY')
 * @param {string} [params.notes] - Freeform audit notes
 * @param {boolean} [params.is_legacy_import=false] - When true, bypasses live stock mutations
 * @param {string} [params.adjustment_number] - Optional explicit adjustment number
 * @param {Array<Object>} params.items - Adjustment line items
 * @param {string} params.items[].product_id - Target product UUID
 * @param {number|Decimal} params.items[].quantity_change - Net change (positive or negative)
 * @param {string} [params.items[].unit] - UOM for quantity_change (converted to base_unit)
 * @param {number} [params.items[].method_type] - Legacy method code
 * @param {string} [params.items[].notes] - Line item notes
 * @param {string} userId - ID of the user authoring or importing the adjustment
 * @returns {Promise<StockAdjustment>} Complete adjustment record with items and relations
 */
async function createStockAdjustment(params, userId);

/**
 * Get stock adjustment by ID with relations.
 */
async function getStockAdjustmentById(id);

/**
 * List stock adjustments with pagination, date, warehouse, and search filters.
 */
async function listStockAdjustments(filters);

/**
 * Reverse a live stock adjustment (creates an offsetting adjustment transaction).
 */
async function reverseStockAdjustment(adjustmentId, reason, userId);
```

---

## 3. Core Business Semantics & Rules

### 3.1 Positive vs Negative Adjustment Semantics
- **Positive Adjustment (`quantity_change > 0`):**
  - Represents discovered stock, audit surplus, or supplier bonus.
  - Increases `Product.quantity` by `quantity_change` in base units.
  - Maps to `InventoryLog.change_type = 'RESTOCK'` or `'ADJUSTMENT'`.
- **Negative Adjustment (`quantity_change < 0`):**
  - Represents shrinkage, theft, breakage, spoilage, or audit deficit.
  - Decreases `Product.quantity` by `|quantity_change|` in base units.
  - Maps to `InventoryLog.change_type = 'DAMAGE'`, `'WASTE'`, or `'ADJUSTMENT'`.

### 3.2 Product Validation & Active Status
- For live adjustments (`is_legacy_import: false`):
  - All referenced products must exist and be active (`is_active: true`).
  - Products must have valid units compatible with their `unit_category`.
- For historical legacy imports (`is_legacy_import: true`):
  - Inactive products are permitted to allow historical records for discontinued lines.
  - Unmapped line items (`product_id: null`) are permitted and recorded alongside a `MigrationIssue`.

### 3.3 Exact Decimal Quantity Handling
- Floating-point arithmetic (`Number`) is strictly prohibited.
- All quantities and calculations must use `Decimal.js` (via `server/src/utils/money.js` and `server/src/utils/uom.js`).
- Unit conversion to `base_unit` is performed via `toBaseUnitQuantity(quantity, unit, unit_category, base_unit)`.
- Line items are stored with 3 decimal places (`Decimal(14, 3)`), consistent with `Product.quantity` and `InventoryLog.quantity_change`.

### 3.4 Inventory Log Generation
For live adjustments, every modified product generates an `InventoryLog` entry atomically within the database transaction:
- `product_id`: Product UUID.
- `change_type`: Derived from reason or legacy method type.
- `unit`: Product's `base_unit`.
- `quantity_change`: Converted base quantity change.
- `previous_quantity`: Balance before adjustment.
- `new_quantity`: Balance after adjustment.
- `user_id`: Authenticated user executing the change.
- `notes`: Reference to adjustment number (`Adjustment ADJ-XXXXXX`).

### 3.5 Stock Sufficiency Checks
- Negative adjustments must not drive inventory below zero unless a specific system override setting (`allow_negative_inventory = true`) is enabled.
- The check is evaluated against `availableStock.plus(changeInBase).gte(0)`.
- If insufficient stock exists, a structured `ValidationError` is thrown with field details.

### 3.6 Concurrency Protection
To prevent race conditions during concurrent adjustments and point-of-sale checkout:
- Product row updates must use conditional atomic SQL updates:
  ```javascript
  const { count } = await tx.product.updateMany({
    where: {
      id: item.product_id,
      quantity: { gte: decrementAmount },
    },
    data: {
      quantity: { decrement: decrementAmount },
    },
  });
  if (count === 0) {
    throw new ValidationError('Insufficient stock due to concurrent activity');
  }
  ```
- Transactions must execute with bounded timeouts (`maxWait: 10000`, `timeout: 30000`).

### 3.7 Idempotency & Batch Tracking
- An adjustment number generator (`generateAdjustmentNumber()`) produces format `ADJ-YYYYMMDD-XXXX`.
- If an adjustment number is supplied externally (e.g. during legacy migration batch import), a unique constraint check prevents double-creation.
- Legacy imports record entry in `LegacyIdMap`:
  ```javascript
  await tx.legacyIdMap.create({
    data: {
      source_system: 'EXCEL_LEGACY',
      entity_type: 'STOCK_ADJUSTMENT',
      legacy_id: legacyDocNumber,
      target_model: 'StockAdjustment',
      target_id: newAdjustment.id,
      batch_id: batchId,
    },
  });
  ```

### 3.8 Historical Adjustment Behavior (`is_legacy_import = true`)
- When importing historical stock adjustments:
  - `is_legacy_import` is set to `true`.
  - The live `Product.quantity` is **NOT** modified.
  - `InventoryLog` records are **NOT** generated.
  - The historical business date (`adjustment_date`) is preserved as originally recorded.
  - This preserves historical audit trails without distorting the currently verified physical stock balance.

---

## 4. Warehouse Attribution Limitations

> [!WARNING] Critical Architectural Invariant
> In NexTill POS, `Product.quantity` is a single company-wide stock counter. `Warehouse` attribution on `StockAdjustment` records the site where an adjustment occurred, but does **NOT** divide inventory into distinct physical warehouse balances.

1. **Transaction-Level Attribution:** Assigning an adjustment to a warehouse (`warehouse_id`) tags the audit record with that warehouse, allowing reporting and filtering by warehouse.
2. **No Warehouse Inventory Ledger:** NexTill does not maintain a multi-tenant `ProductStock` ledger in Phase 2 or Phase 3. Warehouse-specific stock cannot be computed by filtering past transactions unless opening physical stock per warehouse is established.
3. **Phase 4 Multi-Warehouse Roadmap:** Once the legacy migration is complete, a future phase can introduce a `ProductStock` model (`product_id`, `warehouse_id`, `quantity`) if physical multi-location tracking is desired.

---

## 5. Implementation Roadmap for Phase 3B

1. Implement `generateAdjustmentNumber.js` in `server/src/utils/`.
2. Implement `stockAdjustmentService.js` with `createStockAdjustment` adhering to the transactional specification above.
3. Implement `stockAdjustmentController.js` and mount `POST /api/inventory/adjustments`.
4. Add unit and integration tests covering positive adjustments, negative adjustments, insufficient stock rejection, concurrency rollback, and legacy import isolation.
