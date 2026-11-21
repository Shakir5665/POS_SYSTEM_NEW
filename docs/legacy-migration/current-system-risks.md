# Current System Risks for Legacy Migration

> [!IMPORTANT]
> This document records the precise code paths in the current NexTill application
> that could be affected by legacy data migration. No code has been changed.
> All mitigations are proposals for future phases.

---

## RISK-01: Sale Creation Triggers Stock Deduction

| Property | Detail |
|---|---|
| **File** | [salesService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/salesService.js#L320-L356) |
| **Function** | `createSale()` |
| **Current behavior** | Within a `$transaction`, decrements `Product.quantity` by `base_quantity` for each sale item. Creates `InventoryLog` entries with `change_type: 'SALE'`. Uses conditional `updateMany` with `quantity >= base_quantity` to prevent overselling. |
| **Migration risk** | Importing historical sales through `createSale()` would deduct stock again for items already sold. This would double-count inventory deductions. |
| **Severity** | 🔴 CRITICAL |
| **Mitigation** | Phase 4: Create a dedicated `importLegacySale()` function that inserts Sale + SaleItems without decrementing `Product.quantity` or creating inventory logs. |
| **Phase** | Phase 4 |

---

## RISK-02: Sale Creation Awards Loyalty Points

| Property | Detail |
|---|---|
| **File** | [salesService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/salesService.js#L248-L253) + [L358-L364](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/salesService.js#L358-L364) |
| **Function** | `createSale()` |
| **Current behavior** | Calculates loyalty points as `floor(totalAmount / loyaltyRate)` and increments `Customer.loyalty_points`. |
| **Migration risk** | Re-importing historical sales would award duplicate loyalty points. |
| **Severity** | 🟡 HIGH |
| **Mitigation** | Phase 4: Import function must set `loyalty_points_earned: 0` for legacy records and NOT increment customer points. |
| **Phase** | Phase 4 |

---

## RISK-03: Sale Creation Validates Stock Availability

| Property | Detail |
|---|---|
| **File** | [salesService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/salesService.js#L38-L50) |
| **Function** | `createSale()` |
| **Current behavior** | Checks `availableStock.lt(totalRequestedBase)` and throws if insufficient. |
| **Migration risk** | Historical sales may reference products that no longer have sufficient stock (or don't exist). Import would fail with ValidationError. |
| **Severity** | 🔴 CRITICAL |
| **Mitigation** | Phase 4: Import function must bypass stock validation entirely. |
| **Phase** | Phase 4 |

---

## RISK-04: Sale Creation Creates Payment Records

| Property | Detail |
|---|---|
| **File** | [salesService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/salesService.js#L304-L313) |
| **Function** | `createSale()` |
| **Current behavior** | Creates a `Payment` record with the payment method, amount, and change. |
| **Migration risk** | Historical sales would generate new Payment records that don't correspond to real payment events. |
| **Severity** | 🟡 HIGH |
| **Mitigation** | Phase 4: Decide whether to create synthetic Payment records for historical sales or skip payment creation for `is_legacy_import` sales. |
| **Phase** | Phase 4 |

---

## RISK-05: Sale Creation Validates Paystack Reference

| Property | Detail |
|---|---|
| **File** | [salesService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/salesService.js#L210-L245) |
| **Function** | `createSale()` |
| **Current behavior** | For CARD/MOBILE_MONEY payments, requires a Paystack reference, verifies it via API, and checks the amount matches. |
| **Migration risk** | Historical card payments have no valid Paystack references. Import via createSale() would fail. |
| **Severity** | 🟡 HIGH |
| **Mitigation** | Phase 4: Import function must bypass Paystack validation. Use CASH or CREDIT as historical payment method unless legacy data specifies otherwise. |
| **Phase** | Phase 4 |

---

## RISK-06: Sale Refund Restores Stock

| Property | Detail |
|---|---|
| **File** | [salesService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/salesService.js#L551-L604) |
| **Function** | `completeRefund()` |
| **Current behavior** | Increments `Product.quantity` by `base_quantity`, creates RETURN inventory logs, and reverses loyalty points. |
| **Migration risk** | If historical refunded sales are imported, refunding them again would incorrectly restore stock. |
| **Severity** | 🟡 HIGH |
| **Mitigation** | Phase 4: Import refunded sales with payment_status already set to REFUNDED. Do not trigger completeRefund(). |
| **Phase** | Phase 4 |

---

## RISK-07: Purchase Creation with Immediate Receiving

| Property | Detail |
|---|---|
| **File** | [purchaseService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/purchaseService.js#L219-L247) |
| **Function** | `createPurchase()` |
| **Current behavior** | If `status === 'RECEIVED'`, immediately increments `Product.quantity` and creates RESTOCK inventory logs. Also updates `Product.cost_price`. |
| **Migration risk** | Importing historical received purchases through createPurchase() would re-add stock and overwrite current cost prices. |
| **Severity** | 🔴 CRITICAL |
| **Mitigation** | Phase 4: Import function must insert Purchase with status=RECEIVED and received_at set, but NOT modify Product.quantity or cost_price. |
| **Phase** | Phase 4 |

---

## RISK-08: Purchase Receiving Modifies Inventory

| Property | Detail |
|---|---|
| **File** | [purchaseService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/purchaseService.js#L253-L310) |
| **Function** | `receivePurchase()` |
| **Current behavior** | Increments Product.quantity, updates cost_price, and creates RESTOCK inventory logs. |
| **Migration risk** | Calling receivePurchase() on imported historical purchases would double the stock increase. |
| **Severity** | 🔴 CRITICAL |
| **Mitigation** | Phase 4: Never call receivePurchase() for imported purchases. Import with final status and quantities directly. |
| **Phase** | Phase 4 |

---

## RISK-09: Purchase Creation Records Supplier Payment

| Property | Detail |
|---|---|
| **File** | [purchaseService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/purchaseService.js#L197-L217) |
| **Function** | `createPurchase()` |
| **Current behavior** | If `initial_payment > 0`, creates a SupplierPayment and SupplierPaymentAllocation record. |
| **Migration risk** | Importing historical purchases with paid amounts would create fabricated supplier payment records and corrupt supplier balance tracking. |
| **Severity** | 🔴 CRITICAL |
| **Mitigation** | Phase 4: Import function sets amount_paid and balance_due directly on Purchase without creating SupplierPayment records. Historical payments are a separate import concern (DEC-009). |
| **Phase** | Phase 4 |

---

## RISK-10: Stock Adjustment Changes Product.quantity

| Property | Detail |
|---|---|
| **File** | [inventoryService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/inventoryService.js#L100-L134) |
| **Function** | `adjustStock()`, `manualAdjust()` |
| **Current behavior** | Directly modifies Product.quantity and creates InventoryLog entries. |
| **Migration risk** | Importing historical adjustments through these functions would apply old adjustments to current stock levels. |
| **Severity** | 🔴 CRITICAL |
| **Mitigation** | Phase 4: Use direct Prisma inserts into proposed StockAdjustment/StockAdjustmentItem models. Do not call adjustStock(). Consider DEC-008 for authoritative stock snapshot. |
| **Phase** | Phase 4 |

---

## RISK-11: Product.quantity Direct Editing

| Property | Detail |
|---|---|
| **File** | [productService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/productService.js#L276-L296) |
| **Function** | `updateProduct()` |
| **Current behavior** | If `data.quantity !== undefined`, updates Product.quantity directly without inventory logging. |
| **Migration risk** | If migration scripts use updateProduct() to set opening balances, no audit trail is created. |
| **Severity** | 🟠 MEDIUM |
| **Mitigation** | Phase 4: Use adjustStock() with ADJUSTMENT type or a dedicated migration function that creates proper InventoryLog entries. |
| **Phase** | Phase 4 |

---

## RISK-12: Customer Balance Calculation

| Property | Detail |
|---|---|
| **File** | [customerService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/customerService.js#L30-L48) |
| **Function** | `listCustomers()`, `getCustomerById()` |
| **Current behavior** | Calculates outstanding_debt by aggregating `Sale.balance_due` where payment_status is PENDING or PARTIALLY_PAID. |
| **Migration risk** | If historical credit sales are imported with balance_due > 0, they would inflate current customer debt figures. If historical payments are not imported, the debt would be incorrect. |
| **Severity** | 🔴 CRITICAL |
| **Mitigation** | Phase 4: Import historical sales with correct final balance_due (should be 0 for fully paid sales). Do NOT fabricate CustomerPaymentAllocation records (DEC-009). |
| **Phase** | Phase 4 |

---

## RISK-13: Supplier Balance Calculation

| Property | Detail |
|---|---|
| **File** | [supplierService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/supplierService.js#L36-L55) |
| **Function** | `listSuppliers()`, `getSupplierById()` |
| **Current behavior** | Calculates outstanding_debt by aggregating `Purchase.balance_due` where payment_status is PENDING/PARTIALLY_PAID and status ≠ CANCELLED. |
| **Migration risk** | Same as customer debt — imported purchases with balance_due > 0 would inflate supplier payables. |
| **Severity** | 🔴 CRITICAL |
| **Mitigation** | Phase 4: Import with correct final balance_due. Do NOT fabricate SupplierPaymentAllocation records. |
| **Phase** | Phase 4 |

---

## RISK-14: Unit Conversion for Legacy Data

| Property | Detail |
|---|---|
| **File** | [uom.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/utils/uom.js#L1-L199) |
| **Function** | `toBaseUnitQuantity()`, `getConversionFactorToBase()` |
| **Current behavior** | COUNT units (pack, box, etc.) all have factor=1 except doz=12. WEIGHT uses g/kg (1000). VOLUME uses ml/L (1000). Unknown COUNT units default to factor 1. |
| **Migration risk** | Legacy data may have product-specific packaging factors (e.g., a "pack" of 24 items). The current system treats all packs as factor 1. Historical quantity totals would be incorrect. |
| **Severity** | 🟡 HIGH |
| **Mitigation** | Phase 2: Consider ProductUnit model with per-product conversion factors. Phase 4: Normalize legacy quantities using verified conversion factors. |
| **Phase** | Phase 2/4 |

---

## RISK-15: Report Date Filters Use created_at

| Property | Detail |
|---|---|
| **File** | [reportService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/reportService.js#L10-L27) |
| **Function** | `getSalesSummary()`, `getSalesByDay()`, `getProfitReport()`, `getFinancialStatement()` |
| **Current behavior** | All date-range queries filter on `created_at`, which is the database insertion timestamp. |
| **Migration risk** | Imported historical records will have `created_at` set to the import date, not the original business date. Reports would show all historical transactions on the import date. |
| **Severity** | 🔴 CRITICAL |
| **Mitigation** | Phase 2: Add `sale_date` / `purchase_date` fields. Phase 3: Update report queries to use business date when available, falling back to created_at. |
| **Phase** | Phase 2/3 |

---

## RISK-16: Profit and Cost Calculations

| Property | Detail |
|---|---|
| **File** | [reportService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/reportService.js#L163-L199) |
| **Function** | `getProfitReport()` |
| **Current behavior** | COGS uses `COALESCE(NULLIF(si.line_cost, 0), si.quantity * COALESCE(p.cost_price, 0))`. Falls back to current product cost_price if line_cost is 0. |
| **Migration risk** | Historical sale items imported without proper line_cost or cost_price_snapshot will use the current product cost_price, producing incorrect historical profit figures. |
| **Severity** | 🟡 HIGH |
| **Mitigation** | Phase 4: Ensure imported SaleItems have accurate line_cost and cost_price_snapshot from the legacy data. If cost data is unavailable, flag as `unrecorded_cost`. |
| **Phase** | Phase 4 |

---

## RISK-17: Paystack Payment Integration

| Property | Detail |
|---|---|
| **File** | [salesService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/salesService.js#L316-L318) |
| **Function** | `createSale()` — Paystack webhook linking |
| **Current behavior** | After sale creation, links PaystackPayment by reference if one arrived via webhook first. |
| **Migration risk** | Historical sales should never attempt to link Paystack references. No PaystackPayment records should be created for historical imports. |
| **Severity** | 🟠 MEDIUM |
| **Mitigation** | Phase 4: Import function must skip Paystack linking entirely. |
| **Phase** | Phase 4 |

---

## RISK-18: Inventory Logging Consistency

| Property | Detail |
|---|---|
| **File** | [inventoryService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/inventoryService.js#L100-L134) |
| **Function** | `adjustStock()` |
| **Current behavior** | Every inventory change creates an InventoryLog with previous_quantity and new_quantity forming a chain. |
| **Migration risk** | Importing historical inventory logs would break the chain because previous_quantity would not match the actual stock level at import time. |
| **Severity** | 🟡 HIGH |
| **Mitigation** | Phase 4: Do not import historical InventoryLog entries through adjustStock(). Either skip historical logs or insert them with a migration-specific change_type. |
| **Phase** | Phase 4 |

---

## RISK-19: Transaction ID Uniqueness

| Property | Detail |
|---|---|
| **File** | [salesService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/salesService.js#L257) |
| **Function** | `withUniqueTransactionId()` |
| **Current behavior** | Sale.transaction_id has a UNIQUE constraint. Generated via `generateTransactionId()`. |
| **Migration risk** | Legacy reference_code values could collide with existing or future transaction IDs. |
| **Severity** | 🟠 MEDIUM |
| **Mitigation** | Phase 4: Prefix legacy reference codes (e.g., `LEGACY-{reference_code}`) or validate uniqueness before import. |
| **Phase** | Phase 4 |

---

## RISK-20: Finance Summary Aggregation

| Property | Detail |
|---|---|
| **File** | [financeService.js](file:///C:/Users/shaki/Desktop/NexTill_POS/server/src/services/financeService.js#L360-L422) |
| **Function** | `getFinanceSummary()` |
| **Current behavior** | Aggregates all non-refunded sales, all expenses, all owner transactions — no date filtering. |
| **Migration risk** | Historical imports would immediately affect the financial summary dashboard: total revenue, COGS, retained earnings, and equity calculations would include legacy data. |
| **Severity** | 🟡 HIGH |
| **Mitigation** | Phase 3: Consider adding an `is_legacy_import` filter or date-aware financial summaries. Phase 4: Ensure imported financial data is accurate before it hits these aggregations. |
| **Phase** | Phase 3/4 |
