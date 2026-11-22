# NexTill POS - Complete Database Design & Architecture Specification

**Database Engine**: PostgreSQL 15+  
**ORM**: Prisma ORM (v5.22.0)  
**Primary Key Convention**: UUID v4 (`@default(uuid())`) across all primary entities  
**Currency & Precision Handling**: `Decimal(10, 2)` for monetary values, `Decimal(14, 3)` for fractional quantities (weight, volume, count)  
**Specification Version**: 3.0  
**Last Updated**: November 2026  
**Total Models**: 32  

---

## Table of Contents

1. [Architectural Overview](#1-architectural-overview)
2. [Entity Relationship Diagram (ERD)](#2-entity-relationship-diagram-erd)
3. [Global Enums](#3-global-enums)
4. [Functional Domain Modules](#4-functional-domain-modules)
   - [4.1 Identity, Access Management & Security](#41-identity-access-management--security)
   - [4.2 Catalog, Products & Multi-Unit System](#42-catalog-products--multi-unit-system)
   - [4.3 Point of Sale (POS) & Customer Billing](#43-point-of-sale-pos--customer-billing)
   - [4.4 Customer Credit, Accounts Receivable (AR) & Loyalty](#44-customer-credit-accounts-receivable-ar--loyalty)
   - [4.5 Online Payment Gateways (Paystack Reconciliation)](#45-online-payment-gateways-paystack-reconciliation)
   - [4.6 Procurement, Suppliers & Accounts Payable (AP)](#46-procurement-suppliers--accounts-payable-ap)
   - [4.7 Inventory Tracking & Stock Movement Audit](#47-inventory-tracking--stock-movement-audit)
   - [4.8 Financial Accounting: Expenses, Fixed Assets & Owner Equity](#48-financial-accounting-expenses-fixed-assets--owner-equity)
   - [4.9 Application Configuration](#49-application-configuration)
   - [4.10 Multi-Warehouse Architecture & Stock Adjustments](#410-multi-warehouse-architecture--stock-adjustments)
   - [4.11 Returns Management & Reverse Logistics](#411-returns-management--reverse-logistics)
   - [4.12 Legacy POS Migration Engine & Reconciliation Tracking](#412-legacy-pos-migration-engine--reconciliation-tracking)
5. [Complete Table Dictionary & Field Specifications](#5-complete-table-dictionary--field-specifications)
   - [5.1 User](#51-user)
   - [5.2 Category](#52-category)
   - [5.3 Product](#53-product)
   - [5.4 Customer](#54-customer)
   - [5.5 Sale](#55-sale)
   - [5.6 SaleItem](#56-saleitem)
   - [5.7 Payment](#57-payment)
   - [5.8 CustomerPayment](#58-customerpayment)
   - [5.9 CustomerPaymentAllocation](#59-customerpaymentallocation)
   - [5.10 InventoryLog](#510-inventorylog)
   - [5.11 AuthLog](#511-authlog)
   - [5.12 Settings](#512-settings)
   - [5.13 PaystackPayment](#513-paystackpayment)
   - [5.14 Supplier](#514-supplier)
   - [5.15 Purchase](#515-purchase)
   - [5.16 PurchaseItem](#516-purchaseitem)
   - [5.17 SupplierPayment](#517-supplierpayment)
   - [5.18 SupplierPaymentAllocation](#518-supplierpaymentallocation)
   - [5.19 ExpenseCategory](#519-expensecategory)
   - [5.20 Expense](#520-expense)
   - [5.21 BusinessAsset](#521-businessasset)
   - [5.22 OwnerTransaction](#522-ownertransaction)
   - [5.23 LegacyIdMap](#523-legacyidmap)
   - [5.24 MigrationBatch](#524-migrationbatch)
   - [5.25 MigrationIssue](#525-migrationissue)
   - [5.26 Warehouse](#526-warehouse)
   - [5.27 StockAdjustment](#527-stockadjustment)
   - [5.28 StockAdjustmentItem](#528-stockadjustmentitem)
   - [5.29 SalesReturn](#529-salesreturn)
   - [5.30 SalesReturnItem](#530-salesreturnitem)
   - [5.31 PurchaseReturn](#531-purchasereturn)
   - [5.32 PurchaseReturnItem](#532-purchasereturnitem)
6. [Entity Relationships & Integrity Rules](#6-entity-relationships--integrity-rules)
7. [Key Business Logic & Database Design Decisions](#7-key-business-logic--database-design-decisions)
8. [Indexes & Performance Optimizations](#8-indexes--performance-optimizations)

---

## 1. Architectural Overview

The NexTill POS database architecture is engineered for high-concurrency retail operations, multi-warehouse inventory management, fractional quantity measurement, double-entry financial reconciliation, reverse logistics, and lossless legacy system data migration.

```
       +-----------------------------------------------------------------------+
       |                     NexTill POS Core Architecture                     |
       +-----------------------------------------------------------------------+
            |                        |                       |              |
            v                        v                       v              v
 [ Sales & Billing ]      [ Inventory & Warehouses ] [ Finance & AP/AR ] [ Migration & Audit ]
  - Cash / Card / MoMo     - Decimal(14,3) Precision  - Customer AR Ledger- Excel Ingestion Engine
  - Paystack Gateway       - Multi-Warehouse Routing  - Supplier AP Ledger- Legacy ID Preserving
  - Sales & Purchase Return- Stock Adjustments Audit  - Operating Expenses- Migration Batches/Issues
  - Historical Snapshots   - Immutable Inventory Log  - Assets & Equity   - Rollback Capable
```

### Core Design Standards
- **Strong Referential Integrity**: Strict foreign key constraints with explicit delete behaviors (`Cascade`, `Restrict`, `SetNull`). Financial and operational documents prevent deletion of parent products or suppliers (`Restrict`).
- **Audit Immutability**: Historical financial records snapshot pricing, cost, product metadata, and SKU at the exact moment of sale, purchase, or return. Catalog edits never distort past financial statements.
- **Fractional Unit Support**: All inventory quantities use `Decimal(14, 3)`, facilitating precision sales by piece, weight (kg/g), or volume (L/ml).
- **Accounts Receivable & Payable via Allocation Tables**: Credit sales and bulk/installment payments are linked via dedicated junction allocation records (`CustomerPaymentAllocation` and `SupplierPaymentAllocation`), ensuring FIFO or targeted invoice balance tracking.
- **Multi-Warehouse Routing & Stock Auditing**: Inventory transactions link to physical warehouses with a system default fallback (`is_default = true`). Stock variations outside sales/purchases flow through audited `StockAdjustment` records.
- **Bidirectional Reverse Logistics**: Complete lifecycle tracking for returns (`SalesReturn`, `SalesReturnItem` and `PurchaseReturn`, `PurchaseReturnItem`) with idempotency guarantees and restocking disposition controls.
- **Lossless Legacy Migration Engine**: Dedicated migration tracking models (`LegacyIdMap`, `MigrationBatch`, `MigrationIssue`) preserve original system identifiers, track data provenance, and record reconciliation discrepancies without polluting operational tables.

---

## 2. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    User ||--o{ Sale : "processes"
    User ||--o{ InventoryLog : "logs"
    User ||--o{ AuthLog : "generates"
    User ||--o{ CustomerPayment : "collects"
    User ||--o{ Purchase : "creates"
    User ||--o{ SupplierPayment : "issues"
    User ||--o{ Expense : "records"
    User ||--o{ OwnerTransaction : "authorizes"
    User ||--o{ StockAdjustment : "executes"
    User ||--o{ SalesReturn : "authorizes"
    User ||--o{ PurchaseReturn : "initiates"

    Warehouse ||--o{ Sale : "fulfills"
    Warehouse ||--o{ Purchase : "receives_into"
    Warehouse ||--o{ InventoryLog : "tracks_location"
    Warehouse ||--o{ StockAdjustment : "adjusts_at"
    Warehouse ||--o{ SalesReturn : "restocks_into"
    Warehouse ||--o{ PurchaseReturn : "returns_from"

    Category ||--o{ Product : "categorizes"

    Product ||--o{ SaleItem : "sold_in"
    Product ||--o{ PurchaseItem : "purchased_in"
    Product ||--o{ InventoryLog : "stock_changes"
    Product ||--o{ StockAdjustmentItem : "adjusted_in"
    Product ||--o{ SalesReturnItem : "returned_in"
    Product ||--o{ PurchaseReturnItem : "returned_in"

    Customer ||--o{ Sale : "places"
    Customer ||--o{ CustomerPayment : "pays"
    Customer ||--o{ SalesReturn : "requests_return"

    Sale ||--|{ SaleItem : "contains"
    Sale ||--o{ Payment : "tenders"
    Sale ||--o| PaystackPayment : "links"
    Sale ||--o{ CustomerPaymentAllocation : "settled_by"
    Sale ||--o{ SalesReturn : "returned_by"

    SaleItem ||--o{ SalesReturnItem : "credited_in"
    SalesReturn ||--|{ SalesReturnItem : "contains"

    CustomerPayment ||--|{ CustomerPaymentAllocation : "allocates"

    Supplier ||--o{ Purchase : "supplies"
    Supplier ||--o{ SupplierPayment : "receives_payment"
    Supplier ||--o{ PurchaseReturn : "accepts_return"

    Purchase ||--|{ PurchaseItem : "contains"
    Purchase ||--o{ SupplierPaymentAllocation : "settled_by"
    Purchase ||--o{ PurchaseReturn : "returned_by"

    PurchaseItem ||--o{ PurchaseReturnItem : "credited_in"
    PurchaseReturn ||--|{ PurchaseReturnItem : "contains"

    SupplierPayment ||--|{ SupplierPaymentAllocation : "allocates"

    StockAdjustment ||--|{ StockAdjustmentItem : "contains"

    ExpenseCategory ||--o{ Expense : "categorizes"

    MigrationBatch ||--o{ LegacyIdMap : "records_ids"
    MigrationBatch ||--o{ MigrationIssue : "logs_issues"
```

---

## 3. Global Enums

| Enum Name | Allowed Values | Usage / Functional Scope |
|---|---|---|
| `Role` | `ADMIN`, `MANAGER`, `CASHIER` | Role-based access control (RBAC) governing application routes and administrative actions. |
| `PaymentMethod` | `CASH`, `MOBILE_MONEY`, `CARD`, `CREDIT` | Settlement method for sales, customer AR payments, supplier AP payments, expenses, returns, and owner equity transactions. |
| `PaymentStatus` | `COMPLETED`, `PARTIALLY_PAID`, `REFUNDED`, `PENDING` | Payment lifecycle status of sales and purchase orders. |
| `PurchaseStatus` | `ORDERED`, `RECEIVED`, `CANCELLED` | Procurement fulfillment lifecycle. |
| `InventoryChangeType` | `SALE`, `RESTOCK`, `ADJUSTMENT`, `RETURN` | Audit category for physical and digital inventory movements. |
| `UnitCategory` | `COUNT`, `WEIGHT`, `VOLUME` | Classifies how a product is measured and priced. |
| `AssetStatus` | `ACTIVE`, `IN_REPAIR`, `DISPOSED`, `DEPRECIATED` | Lifecycle tracking for capital business equipment and company assets. |
| `OwnerTxType` | `CONTRIBUTION`, `WITHDRAWAL` | Distinguishes owner equity injections from owner drawings. |

---

## 4. Functional Domain Modules

### 4.1 Identity, Access Management & Security
- **`User`**: System operators with designated permissions (`ADMIN`, `MANAGER`, `CASHIER`). Features automated brute-force protection with `failed_login_attempts` tracking and `locked_until` lockouts.
- **`AuthLog`**: Security audit log recording IP address, user agent, event type (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`), and contextual details.

### 4.2 Catalog, Products & Multi-Unit System
- **`Category`**: Hierarchical grouping for products with `onDelete: SetNull` decoupling.
- **`Product`**: Central item master. Supports multi-tier retail pricing (`price`, `usual_price`, `our_price`, `wholesale_price`), cost accounting (`cost_price`), multi-unit classifications (`COUNT`, `WEIGHT`, `VOLUME`), barcode scanning, low-stock alerts (`low_stock_threshold`), and soft-deletion (`is_active = false`).

### 4.3 Point of Sale (POS) & Customer Billing
- **`Sale`**: Master checkout record containing invoice number (`transaction_id`), cashier link, customer link, warehouse link (`warehouse_id`), operational sale date (`sale_date`), legacy migration provenance (`is_legacy_import`), subtotal, discounts, tax, amounts paid/due, and loyalty points awarded.
- **`SaleItem`**: Individual invoice line item. Takes an immutable snapshot of item prices (`unit_price`, `unit_cost_snapshot`, `cost_price_snapshot`, `usual_price_snapshot`, `our_price_snapshot`, `predefined_discount_applied`, `wholesale_price_snapshot`), base quantities, and units.
- **`Payment`**: Multi-tender cash register records. Captures exact cash tender, change given, and external reference tokens.

### 4.4 Customer Credit, Accounts Receivable (AR) & Loyalty
- **`Customer`**: Client registry managing personal info, contact numbers, credit balances, and accumulated `loyalty_points`.
- **`CustomerPayment`**: Payments made by a customer to clear outstanding credit balances or advance deposits.
- **`CustomerPaymentAllocation`**: Ledger junction linking customer payments directly to specific unpaid credit `Sale` records, recalculating `amount_paid` and `balance_due`.

### 4.5 Online Payment Gateways (Paystack Reconciliation)
- **`PaystackPayment`**: Captures external webhook events (`charge.success`). Maintains currency, pesewas/cents amounts, customer emails, and payment matching against POS sales to handle interrupted network sessions or browser closures.

### 4.6 Procurement, Suppliers & Accounts Payable (AP)
- **`Supplier`**: Vendor master data including contact person, business details, credit terms, and active status.
- **`Purchase`**: Purchase Order (PO) tracking incoming vendor shipments, receiving warehouse (`warehouse_id`), operational purchase date (`purchase_date`), legacy migration provenance (`is_legacy_import`), total invoice amounts, and payable balances.
- **`PurchaseItem`**: Purchase invoice lines capturing product unit costs, quantities, and units at time of arrival.
- **`SupplierPayment`**: Outgoing payments made to suppliers for inventory restocks.
- **`SupplierPaymentAllocation`**: Maps outgoing supplier payments directly against open `Purchase` invoices.

### 4.7 Inventory Tracking & Stock Movement Audit
- **`InventoryLog`**: Immutable audit ledger recording every stock variation. Captures `previous_quantity`, `quantity_change`, `new_quantity`, the cashier/manager responsible, physical warehouse (`warehouse_id`), and operational reason (`SALE`, `RESTOCK`, `ADJUSTMENT`, `RETURN`).

### 4.8 Financial Accounting: Expenses, Fixed Assets & Owner Equity
- **`ExpenseCategory`**: Operating expenditure classification (e.g., Utilities, Rent, Salaries, Marketing).
- **`Expense`**: Daily operational overhead cash outflows linked to payees, payment methods, and legacy import flags (`is_legacy_import`).
- **`BusinessAsset`**: Fixed asset register tracking equipment, computers, furniture, acquisition cost, and current depreciated book value.
- **`OwnerTransaction`**: Captures capital investments and owner drawings for balance sheet reconciliation.

### 4.9 Application Configuration
- **`Settings`**: Dynamic system configuration key-value storage (e.g., store name, tax rates, receipt headers, currency formatting, loyalty conversion rate).

### 4.10 Multi-Warehouse Architecture & Stock Adjustments
- **`Warehouse`**: Physical locations and storage branches. Supports a designated default warehouse (`is_default = true`) for automatic fallback routing during checkouts and restocks.
- **`StockAdjustment`**: Administrative batch stock adjustments capturing adjustment date, executing user, target warehouse, and operational justifications.
- **`StockAdjustmentItem`**: Individual item-level stock modifications (`quantity_change`), preserving legacy adjustment method codes (`method_type`) and adjustment reasons.

### 4.11 Returns Management & Reverse Logistics
- **`SalesReturn`**: Customer returns against existing POS sales. Records unique return numbers, reason, refund amount, refund method, idempotency keys, and legacy import flags.
- **`SalesReturnItem`**: Line item detail linked directly to original `SaleItem`. Manages return quantities, refund subtotals, restock toggles (`restock`), and item disposition states (`RESTOCKED`, `DAMAGED`, `DISCARDED`).
- **`PurchaseReturn`**: Outgoing returns to vendors against purchase orders. Tracks supplier debit balances, settlement statuses (`PENDING`, `COMPLETED`, `CREDITED`), and settlement channels.
- **`PurchaseReturnItem`**: Product line item returned to vendor, linking to parent `PurchaseItem` with exact unit cost and reversal quantities.

### 4.12 Legacy POS Migration Engine & Reconciliation Tracking
- **`LegacyIdMap`**: High-performance mapping table connecting legacy primary keys (e.g. from Excel spreadsheets or legacy SQL) to newly generated NexTill UUIDs across all entity types (`Sale`, `Product`, `Customer`, `Supplier`, `Purchase`, etc.).
- **`MigrationBatch`**: Ingestion batch tracking recording source filenames, SHA-256 hashes, entity scopes, record counters (total, success, errors), execution duration, and rollback timestamps.
- **`MigrationIssue`**: Granular exception audit log capturing non-blocking validation warnings, legacy syntax anomalies, unmapped references, and financial rounding discrepancies with resolution statuses.

---

## 5. Complete Table Dictionary & Field Specifications

### 5.1 `User`
Maintains credentials and authorization levels for all POS operators.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique user identifier |
| `username` | `String` | Unique, Not Null | Unique login username |
| `email` | `String` | Unique, Not Null | Unique corporate/staff email |
| `password_hash` | `String` | Not Null | Bcrypt encrypted hash (cost factor 12) |
| `full_name` | `String` | Not Null | Staff member full name |
| `role` | `Role` | Enum, Default: `CASHIER` | `ADMIN`, `MANAGER`, or `CASHIER` |
| `is_active` | `Boolean` | Default: `true` | Soft-deactivation toggle |
| `failed_login_attempts` | `Int` | Default: `0` | Consecutive failed attempts counter |
| `locked_until` | `DateTime` | Nullable | Expiry timestamp for security lockouts |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.2 `Category`
Product category classification.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique category identifier |
| `name` | `String` | Unique, Not Null | Category label |
| `description` | `String` | Nullable | Optional category details |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.3 `Product`
Inventory catalog item master.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique product identifier |
| `name` | `String` | Not Null | Product commercial name |
| `sku` | `String` | Unique, Indexed | Stock Keeping Unit code |
| `barcode` | `String` | Unique, Indexed, Nullable | EAN/UPC barcode string |
| `category_id` | `String` | FK → `Category.id`, Nullable | Linked category (`onDelete: SetNull`) |
| `unit_category` | `UnitCategory` | Default: `COUNT` | `COUNT`, `WEIGHT`, or `VOLUME` |
| `base_unit` | `String` | Default: `"pcs"` | Storage unit (e.g., pcs, kg, l) |
| `pricing_unit` | `String` | Default: `"pcs"` | Selling unit displayed on shelf/receipt |
| `price` | `Decimal(10,2)` | Not Null | Standard active retail price |
| `usual_price` | `Decimal(10,2)` | Default: `0.00` | Regular retail price before store promo |
| `our_price` | `Decimal(10,2)` | Default: `0.00` | Discounted / special retail price |
| `wholesale_price` | `Decimal(10,2)` | Default: `0.00` | Bulk / wholesale commercial price |
| `cost_price` | `Decimal(10,2)` | Nullable | Current average purchasing/cost price |
| `quantity` | `Decimal(14,3)` | Default: `0.000` | Current on-hand stock |
| `low_stock_threshold`| `Decimal(14,3)` | Default: `10.000` | Alert threshold for reordering |
| `image_url` | `String` | Nullable | Asset path for product thumbnail |
| `is_active` | `Boolean` | Default: `true` | Soft-deletion flag |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.4 `Customer`
Customer relationship and loyalty account.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique customer identifier |
| `name` | `String` | Not Null | Customer full name |
| `phone` | `String` | Unique, Indexed, Nullable | Primary contact mobile number |
| `email` | `String` | Unique, Nullable | Customer email address |
| `address` | `String` | Nullable | Physical/delivery address |
| `loyalty_points` | `Int` | Default: `0` | Accumulated reward points balance |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.5 `Sale`
Sales transaction header.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique sale identifier |
| `transaction_id` | `String` | Unique, Indexed | Formatted receipt ID (`TXN-YYYYMMDD-NNNN`) |
| `user_id` | `String` | FK → `User.id` | Cashier who handled the sale |
| `customer_id` | `String` | FK → `Customer.id`, Nullable | Linked customer (`onDelete: SetNull`) |
| `warehouse_id` | `String` | FK → `Warehouse.id`, Nullable | Warehouse fulfilling the order |
| `subtotal` | `Decimal(10,2)` | Not Null | Net sum before discount and tax |
| `discount_amount`| `Decimal(10,2)` | Default: `0.00` | Cart-level discount applied |
| `tax_amount` | `Decimal(10,2)` | Default: `0.00` | Total tax applied |
| `total_amount` | `Decimal(10,2)` | Not Null | Final grand total due |
| `amount_paid` | `Decimal(10,2)` | Default: `0.00` | Cumulative amount settled |
| `balance_due` | `Decimal(10,2)` | Default: `0.00` | Remaining credit balance (`total - paid`) |
| `payment_method` | `PaymentMethod` | Not Null | Initial settlement mode (`CASH`, `CARD`, etc.) |
| `payment_status` | `PaymentStatus` | Default: `COMPLETED` | `COMPLETED`, `PARTIALLY_PAID`, `REFUNDED`, `PENDING` |
| `notes` | `String` | Nullable | Order notes or special instructions |
| `sale_date` | `DateTime` | Nullable, Indexed | Historical or operational checkout timestamp |
| `is_legacy_import`| `Boolean` | Default: `false` | True if ingested from historical legacy POS data |
| `loyalty_points_earned` | `Int` | Default: `0` | Points awarded by this transaction |
| `refund_requested_at` | `DateTime` | Nullable | Timestamp if refund is pending approval |
| `refund_requested_by` | `String` | Nullable | Staff ID requesting the refund |
| `created_at` | `DateTime` | Default: `now()`, Indexed | Record creation timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.6 `SaleItem`
Line item within a sale, snapshotting exact commercial terms.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique line identifier |
| `sale_id` | `String` | FK → `Sale.id`, Indexed | Parent sale (`onDelete: Cascade`) |
| `product_id` | `String` | FK → `Product.id`, Indexed | Target product (`onDelete: Restrict`) |
| `product_name` | `String` | Default: `""` | Name snapshot at time of checkout |
| `product_sku` | `String` | Default: `""` | SKU snapshot at time of checkout |
| `unit` | `String` | Default: `"pcs"` | Transaction unit sold |
| `quantity` | `Decimal(10,3)` | Not Null | Quantity sold |
| `base_quantity` | `Decimal(14,3)` | Default: `1.000` | Conversion quantity for stock reduction |
| `base_unit` | `String` | Default: `"pcs"` | Product's base storage unit |
| `pricing_unit` | `String` | Default: `"pcs"` | Selling unit of measure |
| `unit_price` | `Decimal(10,2)` | Not Null | Actual unit price charged |
| `unit_cost_snapshot` | `Decimal(10,2)` | Default: `0.00` | Item unit cost at time of sale |
| `cost_price_snapshot`| `Decimal(10,2)` | Nullable | Product's registered cost price |
| `usual_price_snapshot`| `Decimal(10,2)`| Default: `0.00` | Regular catalogue price snapshot |
| `our_price_snapshot` | `Decimal(10,2)` | Default: `0.00` | Promotion catalogue price snapshot |
| `predefined_discount_applied` | `Boolean` | Default: `false` | True if promotional discount was used |
| `predefined_discount_amount` | `Decimal(10,2)` | Default: `0.00` | Price difference (`usual_price - our_price`) |
| `is_wholesale` | `Boolean` | Default: `false` | True if sold under wholesale pricing terms |
| `wholesale_price_snapshot` | `Decimal(10,2)` | Default: `0.00` | Wholesale price snapshot at time of checkout |
| `line_cost` | `Decimal(10,2)` | Default: `0.00` | Total cost of line (`quantity * cost`) |
| `discount` | `Decimal(10,2)` | Default: `0.00` | Manual line-level discount |
| `total` | `Decimal(10,2)` | Not Null | Final line total (`(qty * price) - discount`) |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.7 `Payment`
Payment tender record for a specific sale.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique payment identifier |
| `sale_id` | `String` | FK → `Sale.id` | Parent sale (`onDelete: Cascade`) |
| `method` | `PaymentMethod` | Not Null | Settlement method used |
| `amount_paid` | `Decimal(10,2)` | Not Null | Actual tender handed by customer |
| `change_given` | `Decimal(10,2)` | Default: `0.00` | Change returned to customer |
| `reference` | `String` | Unique, Nullable | Transaction reference (Card auth, MoMo ref) |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of payment |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.8 `CustomerPayment`
Standalone payment collected from a customer against accounts receivable.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique payment identifier |
| `customer_id` | `String` | FK → `Customer.id`, Indexed | Customer making payment (`onDelete: Cascade`) |
| `user_id` | `String` | FK → `User.id` | Cashier who received the money |
| `amount` | `Decimal(10,2)` | Not Null | Total payment amount collected |
| `payment_method` | `PaymentMethod` | Default: `CASH` | Settlement method |
| `reference` | `String` | Nullable | Receipt or bank deposit reference |
| `notes` | `String` | Nullable | Remarks |
| `created_at` | `DateTime` | Default: `now()`, Indexed | Timestamp of payment |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.9 `CustomerPaymentAllocation`
Junction mapping customer credit settlements directly to outstanding sales.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique allocation identifier |
| `customer_payment_id` | `String` | FK → `CustomerPayment.id`, Indexed | Source payment (`onDelete: Cascade`) |
| `sale_id` | `String` | FK → `Sale.id`, Indexed | Target credit sale (`onDelete: Cascade`) |
| `amount` | `Decimal(10,2)` | Not Null | Portioned amount applied to this sale |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of allocation |

---

### 5.10 `InventoryLog`
Audit log of every stock alteration.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique log entry identifier |
| `product_id` | `String` | FK → `Product.id` | Product altered (`onDelete: Restrict`) |
| `change_type` | `InventoryChangeType` | Not Null | `SALE`, `RESTOCK`, `ADJUSTMENT`, `RETURN` |
| `unit` | `String` | Default: `"pcs"` | Unit of measurement for the change |
| `quantity_change` | `Decimal(14,3)` | Not Null | Delta change (+ for stock-in, - for stock-out) |
| `previous_quantity` | `Decimal(14,3)` | Not Null | Balance prior to modification |
| `new_quantity` | `Decimal(14,3)` | Not Null | Resulting balance |
| `user_id` | `String` | FK → `User.id` | User accountable for the change |
| `warehouse_id` | `String` | FK → `Warehouse.id`, Nullable, Indexed | Warehouse where inventory changed |
| `notes` | `String` | Nullable | Reason for stock adjustment |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of adjustment |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.11 `AuthLog`
Security and login attempt audit trail.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique log entry identifier |
| `user_id` | `String` | FK → `User.id`, Nullable | Linked operator (`onDelete: SetNull`) |
| `event_type` | `String` | Not Null | Event identifier (`LOGIN_SUCCESS`, `LOGIN_FAILED`) |
| `ip_address` | `String` | Nullable | Remote client IP address |
| `user_agent` | `String` | Nullable | Browser / Device user agent string |
| `details` | `String` | Nullable | JSON string or contextual details |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of event |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.12 `Settings`
Key-value application runtime configuration.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique setting identifier |
| `key` | `String` | Unique, Not Null | Configuration key identifier |
| `value` | `String` | Not Null | Serialized string or JSON value |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

*Standard Keys*: `store_name`, `store_address`, `store_phone`, `currency_symbol`, `tax_rate`, `loyalty_points_rate`, `receipt_footer`, `default_warehouse_code`.

---

### 5.13 `PaystackPayment`
Reconciliation and webhook capture for online Paystack transactions.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique record identifier |
| `reference` | `String` | Unique, Not Null | Paystack transaction reference |
| `amount` | `Int` | Not Null | Value in smallest currency units (Pesewas / Cents) |
| `currency` | `String` | Not Null | ISO currency code (e.g., GHS, USD) |
| `channel` | `String` | Nullable | Gateway channel (card, mobile_money, bank) |
| `customer_email` | `String` | Nullable | Payer's email address |
| `paid_at` | `DateTime` | Nullable | Gateway settlement timestamp |
| `sale_id` | `String` | Unique, Nullable, FK → `Sale.id` | Associated POS sale (`onDelete: SetNull`) |
| `refund_requested_at` | `DateTime` | Nullable | Refund request initiation timestamp |
| `refunded_at` | `DateTime` | Nullable | Webhook confirmed refund timestamp |
| `created_at` | `DateTime` | Default: `now()` | Record creation timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.14 `Supplier`
Vendor and creditor directory.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique supplier identifier |
| `name` | `String` | Indexed, Not Null | Vendor business name |
| `phone` | `String` | Indexed, Nullable | Contact phone number |
| `email` | `String` | Nullable | Contact email address |
| `address` | `String` | Nullable | Warehouse or office physical address |
| `contact_person` | `String` | Nullable | Sales representative / Account manager |
| `notes` | `String` | Nullable | Terms of credit or remarks |
| `is_active` | `Boolean` | Default: `true` | Soft-deactivation toggle |
| `created_at` | `DateTime` | Default: `now()` | Record creation timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.15 `Purchase`
Purchase order and inventory receiving record.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique purchase identifier |
| `purchase_number`| `String` | Unique, Indexed | Formal order tracking code (`PO-YYYYMMDD-NNNN`) |
| `supplier_id` | `String` | FK → `Supplier.id`, Indexed | Vendor supplier (`onDelete: Restrict`) |
| `user_id` | `String` | FK → `User.id` | Staff member receiving goods |
| `warehouse_id` | `String` | FK → `Warehouse.id`, Nullable, Indexed | Target destination warehouse |
| `status` | `PurchaseStatus` | Default: `ORDERED` | `ORDERED`, `RECEIVED`, or `CANCELLED` |
| `payment_status` | `PaymentStatus` | Default: `PENDING` | `PENDING`, `PARTIALLY_PAID`, `COMPLETED` |
| `subtotal` | `Decimal(10,2)` | Default: `0.00` | Net purchase cost |
| `tax_amount` | `Decimal(10,2)` | Default: `0.00` | Supplier tax charged |
| `total_amount` | `Decimal(10,2)` | Not Null | Gross cost payable |
| `amount_paid` | `Decimal(10,2)` | Default: `0.00` | Sum settled towards this PO |
| `balance_due` | `Decimal(10,2)` | Default: `0.00` | Remaining Accounts Payable balance |
| `received_at` | `DateTime` | Nullable | Physical stock receiving timestamp |
| `notes` | `String` | Nullable | Supplier invoice or consignment notes |
| `purchase_date` | `DateTime` | Nullable, Indexed | Operational/historical order date |
| `is_legacy_import`| `Boolean` | Default: `false` | True if ingested from legacy POS data |
| `created_at` | `DateTime` | Default: `now()`, Indexed | Record creation timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.16 `PurchaseItem`
Individual item lines inside a purchase order.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique line item identifier |
| `purchase_id` | `String` | FK → `Purchase.id`, Indexed | Parent purchase order (`onDelete: Cascade`) |
| `product_id` | `String` | FK → `Product.id`, Indexed | Catalog product (`onDelete: Restrict`) |
| `product_name` | `String` | Default: `""` | Name snapshot at time of purchase |
| `product_sku` | `String` | Default: `""` | SKU snapshot at time of purchase |
| `unit` | `String` | Default: `"pcs"` | Purchasing unit of measure |
| `quantity` | `Decimal(10,3)` | Not Null | Quantity purchased |
| `base_quantity` | `Decimal(14,3)` | Default: `1.000` | Standardized stock increment quantity |
| `unit_cost` | `Decimal(10,2)` | Not Null | Price paid per unit |
| `total_cost` | `Decimal(10,2)` | Not Null | Line total (`quantity * unit_cost`) |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |

---

### 5.17 `SupplierPayment`
Outflow payment made to a supplier.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique payment identifier |
| `supplier_id` | `String` | FK → `Supplier.id`, Indexed | Vendor recipient (`onDelete: Cascade`) |
| `user_id` | `String` | FK → `User.id` | Manager authorizing payment |
| `amount` | `Decimal(10,2)` | Not Null | Disbursed payment amount |
| `payment_method` | `PaymentMethod` | Default: `CASH` | Mode of disbursement |
| `reference` | `String` | Nullable | Bank transfer ref / Cheque number |
| `notes` | `String` | Nullable | Explanatory notes |
| `created_at` | `DateTime` | Default: `now()`, Indexed | Timestamp of payment |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.18 `SupplierPaymentAllocation`
Junction mapping supplier disbursements to open purchase invoices.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique allocation identifier |
| `supplier_payment_id` | `String` | FK → `SupplierPayment.id`, Indexed | Payment source (`onDelete: Cascade`) |
| `purchase_id` | `String` | FK → `Purchase.id`, Indexed | Target purchase invoice (`onDelete: Cascade`) |
| `amount` | `Decimal(10,2)` | Not Null | Portion credited to this purchase invoice |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of allocation |

---

### 5.19 `ExpenseCategory`
General ledger operating expense categories.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique category identifier |
| `name` | `String` | Unique, Not Null | Category name (e.g., Rent, Utilities, Wages) |
| `description` | `String` | Nullable | Category description |
| `is_active` | `Boolean` | Default: `true` | Soft-deactivation flag |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.20 `Expense`
Operating overhead expense records.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique expense identifier |
| `category_id` | `String` | FK → `ExpenseCategory.id`, Indexed | Expense category (`onDelete: Restrict`) |
| `user_id` | `String` | FK → `User.id` | User recording the expense |
| `amount` | `Decimal(10,2)` | Not Null | Cash expense value |
| `payment_method` | `PaymentMethod` | Default: `CASH` | Settlement channel |
| `expense_date` | `DateTime` | Default: `now()`, Indexed | Date of expense incurred |
| `payee` | `String` | Nullable | Beneficiary entity or person |
| `reference` | `String` | Nullable | Bill/receipt voucher reference |
| `notes` | `String` | Nullable | Details regarding expense purpose |
| `is_legacy_import`| `Boolean` | Default: `false` | True if ingested from legacy POS data |
| `created_at` | `DateTime` | Default: `now()`, Indexed | Record timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.21 `BusinessAsset`
Fixed capital assets tracking.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique asset identifier |
| `name` | `String` | Not Null | Description/name of asset |
| `asset_code` | `String` | Unique, Nullable | Tag or barcode code on physical equipment |
| `category` | `String` | Indexed, Not Null | Grouping (e.g. Vehicle, Furniture, Electronics) |
| `acquisition_cost`| `Decimal(10,2)`| Not Null | Initial purchase price |
| `acquisition_date`| `DateTime` | Default: `now()` | Date acquired |
| `current_value` | `Decimal(10,2)` | Not Null | Current amortized book value |
| `status` | `AssetStatus` | Indexed, Default: `ACTIVE` | `ACTIVE`, `IN_REPAIR`, `DISPOSED`, `DEPRECIATED` |
| `location` | `String` | Nullable | Physical location in branch |
| `notes` | `String` | Nullable | Warranty or maintenance details |
| `created_at` | `DateTime` | Default: `now()` | Record creation timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.22 `OwnerTransaction`
Owner equity contributions and drawings.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique transaction identifier |
| `user_id` | `String` | FK → `User.id` | Authenticated user logging the entry |
| `type` | `OwnerTxType` | Indexed, Not Null | `CONTRIBUTION` (Capital in) or `WITHDRAWAL` (Drawing) |
| `amount` | `Decimal(10,2)` | Not Null | Transaction sum |
| `payment_method` | `PaymentMethod` | Default: `CASH` | Settlement channel |
| `transaction_date`| `DateTime` | Default: `now()`, Indexed | Date of capital movement |
| `reference` | `String` | Nullable | Bank slip / wire reference |
| `notes` | `String` | Nullable | Justification or comments |
| `created_at` | `DateTime` | Default: `now()` | Record creation timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.23 `LegacyIdMap`
Cross-system primary key lookup preserving legacy ID provenance for imported entities.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique map record identifier |
| `source_system` | `String` | Default: `"legacy_pos"` | Originating legacy application identifier |
| `entity_type` | `String` | Not Null, Indexed | Entity type (`Sale`, `Product`, `Customer`, etc.) |
| `legacy_id` | `String` | Not Null | Original legacy ID (stored as string to preserve alphanumerics/formatting) |
| `target_model` | `String` | Not Null, Indexed | Target Prisma model name |
| `nextill_id` | `String` | Not Null, Indexed | Generated NexTill UUID primary key |
| `batch_id` | `String` | FK → `MigrationBatch.id`, Nullable, Indexed | Associated migration ingestion batch |
| `metadata` | `Json` | Nullable | Safe diagnostic metadata (no raw passwords) |
| `created_at` | `DateTime` | Default: `now()` | Creation timestamp |

*Unique Index*: `@@unique([source_system, entity_type, legacy_id])`

---

### 5.24 `MigrationBatch`
Audit header for Excel spreadsheet or SQL legacy data ingestion executions.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique batch identifier |
| `batch_number` | `Int` | Unique, Autoincrement | Sequential batch execution identifier |
| `source_file` | `String` | Nullable | Source filename (e.g., `Historical_Import.xlsx`) |
| `source_sha256`| `String` | Nullable | Cryptographic hash of ingested source file |
| `entity_type` | `String` | Indexed, Not Null | Primary entity scope of batch |
| `record_count` | `Int` | Default: `0` | Total records parsed |
| `success_count`| `Int` | Default: `0` | Successfully committed records |
| `error_count` | `Int` | Default: `0` | Records rejected or logged as errors |
| `status` | `String` | Indexed, Default: `"PENDING"` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `ROLLED_BACK` |
| `started_at` | `DateTime` | Nullable | Batch execution start timestamp |
| `completed_at` | `DateTime` | Nullable | Batch execution finish timestamp |
| `rollback_at` | `DateTime` | Nullable | Timestamp if batch was rolled back |
| `notes` | `String` | Nullable | Operator notes or diagnostic summary |
| `created_at` | `DateTime` | Default: `now()` | Record creation timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.25 `MigrationIssue`
Granular validation anomalies, unmapped references, and non-blocking warnings during ingestion.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique issue log identifier |
| `batch_id` | `String` | FK → `MigrationBatch.id`, Nullable, Indexed | Parent migration batch |
| `entity_type` | `String` | Indexed, Not Null | Target entity (`Sale`, `Product`, etc.) |
| `legacy_id` | `String` | Nullable, Indexed | Associated legacy record identifier |
| `issue_code` | `String` | Nullable, Indexed | Machine-readable issue code (e.g. `UNKNOWN_CUSTOMER`, `ROUNDING_DISCREPANCY`) |
| `severity` | `String` | Indexed, Not Null | `ERROR`, `WARNING`, `INFO` |
| `description` | `String` | Not Null | Detailed human-readable anomaly description |
| `resolution_status`| `String`| Default: `"UNRESOLVED"` | `UNRESOLVED`, `AUTO_RESOLVED`, `MANUALLY_RESOLVED` |
| `resolution` | `String` | Nullable | Corrective action taken |
| `resolved_at` | `DateTime` | Nullable | Resolution timestamp |
| `metadata` | `Json` | Nullable | Structured diagnostic context |
| `created_at` | `DateTime` | Default: `now()` | Timestamp logged |

---

### 5.26 `Warehouse`
Physical inventory stocking locations and branches.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique warehouse identifier |
| `code` | `String` | Unique, Not Null | Short warehouse code (e.g. `MAIN`, `ACCRA-01`) |
| `name` | `String` | Unique, Not Null | Warehouse name |
| `address` | `String` | Nullable | Physical address |
| `is_active` | `Boolean` | Default: `true` | Soft-deactivation toggle |
| `is_default` | `Boolean` | Indexed, Default: `false` | System-wide fallback warehouse flag |
| `created_at` | `DateTime` | Default: `now()` | Record creation timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.27 `StockAdjustment`
Administrative stock reconciliation document.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique adjustment identifier |
| `adjustment_number`| `String`| Unique, Nullable | Tracking identifier (`ADJ-YYYYMMDD-NNNN`) |
| `adjustment_date` | `DateTime` | Indexed, Not Null | Date stock adjustment took place |
| `warehouse_id` | `String` | FK → `Warehouse.id`, Nullable, Indexed | Warehouse where stock was verified |
| `user_id` | `String` | FK → `User.id` | Staff member responsible for count |
| `reason` | `String` | Nullable | Operational reason (e.g. Shrinkage, Cycle Count) |
| `notes` | `String` | Nullable | Additional explanatory remarks |
| `is_legacy_import` | `Boolean`| Default: `false` | True if imported from legacy POS historical logs |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of adjustment |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.28 `StockAdjustmentItem`
Item lines within a stock adjustment.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique line item identifier |
| `adjustment_id` | `String` | FK → `StockAdjustment.id`, Indexed | Parent adjustment (`onDelete: Cascade`) |
| `product_id` | `String` | FK → `Product.id`, Nullable, Indexed | Target product (`onDelete: Restrict`) |
| `quantity_change`| `Decimal(14,3)`| Not Null | Stock difference (+ for found stock, - for missing stock) |
| `method_type` | `Int` | Nullable | Raw legacy adjustment method code |
| `unit` | `String` | Default: `"pcs"` | Unit of measurement |
| `notes` | `String` | Nullable | Specific line notes |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of line creation |

---

### 5.29 `SalesReturn`
Customer return and credit note header.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique sales return identifier |
| `return_number` | `String` | Unique, Not Null | Formatted return code (`RET-YYYYMMDD-NNNN`) |
| `sale_id` | `String` | FK → `Sale.id`, Indexed | Original sale referenced (`onDelete: Restrict`) |
| `customer_id` | `String` | FK → `Customer.id`, Nullable, Indexed | Returning customer (`onDelete: SetNull`) |
| `user_id` | `String` | FK → `User.id` | Cashier/Manager handling the return |
| `warehouse_id` | `String` | FK → `Warehouse.id`, Nullable, Indexed | Receiving warehouse for restocked goods |
| `return_date` | `DateTime` | Indexed, Default: `now()` | Return transaction timestamp |
| `reason` | `String` | Not Null | Operational reason for return |
| `refund_status` | `String` | Default: `"COMPLETED"` | `COMPLETED`, `PENDING`, `FAILED` |
| `refund_method` | `PaymentMethod` | Default: `CASH` | Settlement method (`CASH`, `MOBILE_MONEY`, `CARD`, `CREDIT`) |
| `refund_amount` | `Decimal(10,2)` | Not Null | Total cash/credit value refunded |
| `notes` | `String` | Nullable | Staff comments |
| `idempotency_key`| `String` | Unique, Nullable | Client idempotency token preventing double-refunds |
| `is_legacy_import`| `Boolean` | Default: `false` | True if imported from legacy historical records |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.30 `SalesReturnItem`
Individual item lines within a customer sales return.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique return line identifier |
| `sales_return_id`| `String` | FK → `SalesReturn.id`, Indexed | Parent return header (`onDelete: Cascade`) |
| `sale_item_id` | `String` | FK → `SaleItem.id`, Indexed | Original sale line item (`onDelete: Restrict`) |
| `product_id` | `String` | FK → `Product.id`, Indexed | Returned product (`onDelete: Restrict`) |
| `product_name` | `String` | Default: `""` | Name snapshot at time of return |
| `product_sku` | `String` | Default: `""` | SKU snapshot at time of return |
| `unit` | `String` | Default: `"pcs"` | Selling unit of measure |
| `quantity` | `Decimal(10,3)` | Not Null | Quantity returned |
| `base_quantity` | `Decimal(14,3)` | Default: `1.000` | Standardized stock return quantity |
| `unit_price` | `Decimal(10,2)` | Not Null | Unit price credited |
| `refund_subtotal`| `Decimal(10,2)` | Not Null | Total line refund (`quantity * unit_price`) |
| `restock` | `Boolean` | Default: `true` | True if goods returned to saleable stock |
| `disposition` | `String` | Default: `"RESTOCKED"` | `RESTOCKED`, `DAMAGED`, `DISCARDED` |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of line creation |

---

### 5.31 `PurchaseReturn`
Procurement return to vendor (debit note header).

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique purchase return identifier |
| `return_number` | `String` | Unique, Not Null | Formatted return code (`PRET-YYYYMMDD-NNNN`) |
| `purchase_id` | `String` | FK → `Purchase.id`, Indexed | Referenced purchase order (`onDelete: Restrict`) |
| `supplier_id` | `String` | FK → `Supplier.id`, Indexed | Target vendor (`onDelete: Restrict`) |
| `user_id` | `String` | FK → `User.id` | Manager authorizing procurement return |
| `warehouse_id` | `String` | FK → `Warehouse.id`, Nullable, Indexed | Origin warehouse shipping returned goods |
| `return_date` | `DateTime` | Indexed, Default: `now()` | Timestamp of return |
| `reason` | `String` | Not Null | Reason for vendor return |
| `settlement_status`| `String` | Default: `"PENDING"` | `PENDING`, `COMPLETED`, `CREDITED` |
| `settlement_method`| `PaymentMethod` | Default: `CASH` | Settlement channel |
| `total_amount` | `Decimal(10,2)` | Not Null | Total value claimed from vendor |
| `notes` | `String` | Nullable | Supplier RMA or dispatch notes |
| `idempotency_key`| `String` | Unique, Nullable | Idempotency token preventing duplicate debit notes |
| `is_legacy_import`| `Boolean`| Default: `false` | True if imported from legacy POS logs |
| `created_at` | `DateTime` | Default: `now()` | Record creation timestamp |
| `updated_at` | `DateTime` | Auto-update | Timestamp of last modification |

---

### 5.32 `PurchaseReturnItem`
Item lines within a vendor purchase return.

| Column | Type | Constraints | Description / Default |
|---|---|---|---|
| `id` | `String` | PK, UUID | Unique return line identifier |
| `purchase_return_id`| `String` | FK → `PurchaseReturn.id`, Indexed | Parent return order (`onDelete: Cascade`) |
| `purchase_item_id` | `String` | FK → `PurchaseItem.id`, Indexed | Referenced purchase line (`onDelete: Restrict`) |
| `product_id` | `String` | FK → `Product.id`, Indexed | Target product returned (`onDelete: Restrict`) |
| `product_name` | `String` | Default: `""` | Name snapshot at time of return |
| `product_sku` | `String` | Default: `""` | SKU snapshot at time of return |
| `unit` | `String` | Default: `"pcs"` | Purchase unit of measure |
| `quantity` | `Decimal(10,3)` | Not Null | Quantity returned to supplier |
| `base_quantity` | `Decimal(14,3)` | Default: `1.000` | Standardized stock decrement quantity |
| `unit_cost` | `Decimal(10,2)` | Not Null | Cost per unit claimed from supplier |
| `total_cost` | `Decimal(10,2)` | Not Null | Line total claimed (`quantity * unit_cost`) |
| `created_at` | `DateTime` | Default: `now()` | Timestamp of creation |

---

## 6. Entity Relationships & Integrity Rules

| Parent Entity | Child Entity | Foreign Key Field | Cascade Policy (`onDelete`) | Business Reasoning |
|---|---|---|---|---|
| `Category` | `Product` | `category_id` | `SetNull` | Preserves products in catalogue if a category is deleted. |
| `User` | `Sale` | `user_id` | `Restrict` | Prevents deleting cashiers who have registered sales. |
| `Customer` | `Sale` | `customer_id` | `SetNull` | Retains sales historical records if a customer profile is removed. |
| `Warehouse` | `Sale` | `warehouse_id` | `SetNull` | Retains historical sales even if a physical warehouse is deactivated. |
| `Sale` | `SaleItem` | `sale_id` | `Cascade` | Deleting/rolling back an unconfirmed sale cascades to its line items. |
| `Product` | `SaleItem` | `product_id` | `Restrict` | Hard-deleting a product that has been sold is strictly forbidden. |
| `Sale` | `Payment` | `sale_id` | `Cascade` | Payment tender rows are children of the sale checkout session. |
| `Customer` | `CustomerPayment` | `customer_id` | `Cascade` | Purging customer accounts cleans up their payment log. |
| `CustomerPayment` | `CustomerPaymentAllocation` | `customer_payment_id` | `Cascade` | Deleting a payment deletes its distribution allocations. |
| `Sale` | `CustomerPaymentAllocation` | `sale_id` | `Cascade` | Removing a credit sale clears its allocation links. |
| `Product` | `InventoryLog` | `product_id` | `Restrict` | Protects stock movement audit trail from accidental catalog deletion. |
| `Warehouse` | `InventoryLog` | `warehouse_id` | `SetNull` | Preserves inventory log audit history if a warehouse record is deleted. |
| `User` | `AuthLog` | `user_id` | `SetNull` | Retains login security logs even if user accounts are purged. |
| `Sale` | `PaystackPayment` | `sale_id` | `SetNull` | Preserves financial webhook transactions if a POS order is cancelled. |
| `Supplier` | `Purchase` | `supplier_id` | `Restrict` | Suppliers with recorded purchase orders cannot be hard-deleted. |
| `Warehouse` | `Purchase` | `warehouse_id` | `SetNull` | Preserves purchase order history if a destination warehouse is archived. |
| `Purchase` | `PurchaseItem` | `purchase_id` | `Cascade` | Deleting a draft purchase order cascades to its line items. |
| `Product` | `PurchaseItem` | `product_id` | `Restrict` | Protects purchase history for active products. |
| `Supplier` | `SupplierPayment` | `supplier_id` | `Cascade` | Cascades vendor payments upon supplier removal. |
| `SupplierPayment` | `SupplierPaymentAllocation` | `supplier_payment_id` | `Cascade` | Allocation lines depend directly on parent payment. |
| `Purchase` | `SupplierPaymentAllocation` | `purchase_id` | `Cascade` | Allocation lines clear if a purchase order is voided. |
| `ExpenseCategory` | `Expense` | `category_id` | `Restrict` | Forbids deletion of expense categories with existing expense transactions. |
| `Warehouse` | `StockAdjustment` | `warehouse_id` | `SetNull` | Preserves adjustment documents if a warehouse is removed. |
| `User` | `StockAdjustment` | `user_id` | `Restrict` | Prevents removing users accountable for inventory adjustments. |
| `StockAdjustment` | `StockAdjustmentItem` | `adjustment_id` | `Cascade` | Deleting a stock adjustment removes its associated items. |
| `Product` | `StockAdjustmentItem` | `product_id` | `Restrict` | Forbids deleting products linked to adjustment history. |
| `Sale` | `SalesReturn` | `sale_id` | `Restrict` | A sale with an approved customer return cannot be deleted. |
| `Customer` | `SalesReturn` | `customer_id` | `SetNull` | Preserves return audit record if customer profile is removed. |
| `User` | `SalesReturn` | `user_id` | `Restrict` | Prevents removing staff members who authorized returns. |
| `Warehouse` | `SalesReturn` | `warehouse_id` | `SetNull` | Preserves returns history if warehouse is deactivated. |
| `SalesReturn` | `SalesReturnItem` | `sales_return_id` | `Cascade` | Deleting a return record cascades to its line items. |
| `SaleItem` | `SalesReturnItem` | `sale_item_id` | `Restrict` | Forbids removing sold line items linked to return credits. |
| `Product` | `SalesReturnItem` | `product_id` | `Restrict` | Protects products linked to historical return lines. |
| `Purchase` | `PurchaseReturn` | `purchase_id` | `Restrict` | Purchase orders with active vendor returns cannot be deleted. |
| `Supplier` | `PurchaseReturn` | `supplier_id` | `Restrict` | Vendors with active return claims cannot be hard-deleted. |
| `Warehouse` | `PurchaseReturn` | `warehouse_id` | `SetNull` | Preserves return history if warehouse is deactivated. |
| `PurchaseReturn` | `PurchaseReturnItem` | `purchase_return_id` | `Cascade` | Deleting a vendor return cascades to its line items. |
| `PurchaseItem` | `PurchaseReturnItem` | `purchase_item_id` | `Restrict` | Protects purchase order lines associated with debit notes. |
| `Product` | `PurchaseReturnItem` | `product_id` | `Restrict` | Protects catalog products associated with debit notes. |
| `MigrationBatch` | `LegacyIdMap` | `batch_id` | `SetNull` | Preserves legacy identifier cross-references even if batch header is archived. |
| `MigrationBatch` | `MigrationIssue` | `batch_id` | `SetNull` | Retains audit issues and resolutions if batch headers are purged. |

---

## 7. Key Business Logic & Database Design Decisions

### 7.1 Historical Pricing & Cost Snapshots
In standard relational models, storing only a `product_id` inside invoice lines creates serious financial inaccuracies when product prices or costs update later.
- `SaleItem` snapshots `unit_price`, `cost_price_snapshot`, `usual_price_snapshot`, `our_price_snapshot`, and `line_cost`.
- Gross profit and margin reporting remain mathematically exact regardless of future retail price updates or supplier cost fluctuations.

### 7.2 Decimal Precision for Fractional Inventory
Retail businesses dealing in weight, volume, or count (e.g. 0.350 kg cheese or 1.250 liters of oil) suffer floating-point roundoff issues under standard integer or float data types.
- Quantities are stored as `Decimal(14, 3)` (up to 3 decimal places).
- Financial amounts use `Decimal(10, 2)`.

### 7.3 Credit Accounts & Dual-Ledger Allocation Architecture
Credit sales (`PaymentMethod.CREDIT`) leave an open balance (`balance_due > 0`, `payment_status = PENDING` or `PARTIALLY_PAID`).
- Customers can make lump-sum payments (`CustomerPayment`).
- The application creates `CustomerPaymentAllocation` records to distribute this lump sum across specific open sales (e.g., oldest invoice first / FIFO).
- The same allocation pattern is mirrored in Accounts Payable (`SupplierPaymentAllocation` across open `Purchase` records).

### 7.4 Atomic Checkout Transactions (`$transaction`)
The checkout flow must never leave the database in an inconsistent state. A single Prisma interactive transaction guarantees:
1. Verification of inventory levels.
2. Creation of the `Sale` record with `warehouse_id`.
3. Creation of all `SaleItem` records with price snapshots.
4. Creation of tender `Payment` records.
5. Deduction of `Product.quantity`.
6. Insertion of `InventoryLog` audit entries linked to the fulfilling warehouse.
7. Increment of `Customer.loyalty_points`.
*If any validation or network call fails, the entire transaction rolls back completely.*

### 7.5 Brute-Force Authentication Defense
The `User` table features an internal lock mechanism:
- On bad password: `failed_login_attempts` increments.
- When `failed_login_attempts >= 5`: `locked_until` is set to `NOW() + 30 minutes`.
- Successful login resets `failed_login_attempts = 0` and clears `locked_until`.
- System administrators can manually unlock locked users via dedicated endpoints.

### 7.6 Multi-Warehouse Routing & Default Warehouse Logic
All stock movements support multi-location routing:
- `Warehouse` defines physical inventory depots, with exactly one warehouse designated as `is_default = true`.
- If an operational transaction (sale, purchase, or adjustment) does not specify a target warehouse, the application automatically queries and resolves the default warehouse (`WHERE is_default = true`).
- Inventory logs track location at the warehouse level (`InventoryLog.warehouse_id`).

### 7.7 Transactional Stock Adjustments & Dual Inventory Auditing
Physical stock takes and inventory corrections flow through `StockAdjustment`:
- Executed atomically in an interactive `$transaction`.
- Line items calculate delta `quantity_change`.
- Direct product stock is updated, while an immutable `InventoryLog` of type `ADJUSTMENT` is created with `previous_quantity`, `quantity_change`, and `new_quantity`.
- For legacy historical imports, the raw method code is preserved in `StockAdjustmentItem.method_type`.

### 7.8 Idempotent Returns Processing & Restocking Dispositions
Customer and supplier returns implement financial and inventory integrity:
- **Idempotency**: `idempotency_key` ensures that repeated network retries or double clicks cannot create duplicate refund disbursements or restock items twice.
- **Restocking Controls**: `SalesReturnItem.restock = true` re-increments product stock and records an `InventoryLog` of type `RETURN`. When `restock = false` (e.g. goods expired or damaged), inventory balances remain untouched and disposition is marked as `DAMAGED` or `DISCARDED`.
- **Payment Settlement**: Refunds can be issued via original tender (`CASH`, `MOBILE_MONEY`, `CARD`) or credited back against customer credit balances.

### 7.9 Historical Migration Provenance & Legacy ID Mapping
The database supports seamless ingestion of legacy POS datasets:
- **`is_legacy_import` Flag**: Stamped on `Sale`, `Purchase`, `Expense`, `StockAdjustment`, `SalesReturn`, and `PurchaseReturn` to differentiate legacy imported data from modern live POS transactions.
- **Operational Date Overrides**: `Sale.sale_date`, `Purchase.purchase_date`, and `Expense.expense_date` preserve the original historical timestamp while keeping `created_at` as the database ingestion timestamp.
- **Lossless ID Cross-Referencing**: `LegacyIdMap` indexes the tuple `(source_system, entity_type, legacy_id)` to the generated NexTill UUID, allowing subsequent migration batches or related child items (e.g. sales items, payments) to resolve parent foreign keys in `O(1)` time.
- **Safety Gate**: Migration mutations are safeguarded by runtime environment guards (`migrationGuard.js`), requiring explicit administrative flags (`ALLOW_STAGING_IMPORT=true` or `ALLOW_ISOLATED_IMPORT=true`) to prevent accidental writes against live cloud production databases.

---

## 8. Indexes & Performance Optimizations

To maintain sub-10ms response times in busy point-of-sale environments, explicit composite and single-column indexes are declared across frequently queried columns:

| Model | Indexed Fields | Optimization Purpose |
|---|---|---|
| `Product` | `barcode` (Unique), `sku` (Unique) | Rapid hardware barcode scanner lookups during checkout. |
| `Customer` | `phone` (Unique) | Fast cashier lookup by mobile number on the POS screen. |
| `Sale` | `transaction_id` (Unique), `created_at`, `sale_date`, `warehouse_id` | Rapid receipt retrieval, warehouse sales filtering, and date-range P&L reporting. |
| `SaleItem` | `sale_id`, `product_id` | High-speed checkout line joins and product velocity reporting. |
| `CustomerPayment` | `customer_id`, `created_at` | Customer statement generation and AR reconciliation. |
| `CustomerPaymentAllocation` | `customer_payment_id`, `sale_id` | Join acceleration during invoice settlement calculations. |
| `Purchase` | `purchase_number` (Unique), `supplier_id`, `created_at`, `purchase_date`, `warehouse_id` | PO lookups, warehouse procurement filtering, and AP aging reports. |
| `PurchaseItem` | `purchase_id`, `product_id` | Line item aggregation and product purchase history lookups. |
| `SupplierPayment` | `supplier_id`, `created_at` | Supplier statement and ledger queries. |
| `SupplierPaymentAllocation` | `supplier_payment_id`, `purchase_id` | Allocation joins for supplier payment reconciliations. |
| `Expense` | `category_id`, `expense_date`, `created_at` | Monthly income statement (P&L) aggregation. |
| `BusinessAsset` | `category`, `status` | Balance sheet fixed asset depreciation schedules. |
| `OwnerTransaction` | `type`, `transaction_date` | Equity statement generation. |
| `Warehouse` | `code` (Unique), `name` (Unique), `is_default` | Instant default warehouse resolution and branch lookups. |
| `InventoryLog` | `product_id`, `warehouse_id`, `created_at` | Rapid stock card generation and location-based audit queries. |
| `StockAdjustment` | `adjustment_number` (Unique), `adjustment_date`, `warehouse_id` | Audit tracking of manual stock reconciliations. |
| `StockAdjustmentItem` | `adjustment_id`, `product_id` | Rapid line item lookups during inventory variance checks. |
| `SalesReturn` | `return_number` (Unique), `idempotency_key` (Unique), `sale_id`, `customer_id`, `return_date`, `warehouse_id` | Idempotent return lookups, customer credit note history, and returns reporting. |
| `SalesReturnItem` | `sales_return_id`, `sale_item_id`, `product_id` | Fast join on credit note details and product return tracking. |
| `PurchaseReturn` | `return_number` (Unique), `idempotency_key` (Unique), `purchase_id`, `supplier_id`, `return_date`, `warehouse_id` | Vendor debit note queries, supplier reconciliation, and warehouse return audits. |
| `PurchaseReturnItem`| `purchase_return_id`, `purchase_item_id`, `product_id` | Item-level procurement return audits and supplier cost matching. |
| `LegacyIdMap` | `(source_system, entity_type, legacy_id)` (Unique), `(entity_type, nextill_id)`, `(target_model, nextill_id)`, `batch_id` | Instant `O(1)` legacy ID resolution across migration batches. |
| `MigrationBatch` | `batch_number` (Unique), `entity_type`, `status` | Migration status monitoring and batch execution tracking. |
| `MigrationIssue` | `batch_id`, `(entity_type, legacy_id)`, `severity`, `issue_code` | Rapid filtering of migration validation errors and unresolved reconciliation items. |
