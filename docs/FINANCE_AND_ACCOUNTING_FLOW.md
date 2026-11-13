# NexTill POS — Complete Financial Architecture & Accounting Transaction Flow

This document provides a comprehensive, implementation-level explanation of how NexTill's financial calculations, database models, transaction flows, and reporting mechanisms operate. All documentation reflects the authoritative source code in `server/` and `client/`.

---

## 1. Introduction

NexTill is designed as a **retail business management and point-of-sale system** with integrated transactional financial tracking. It is built to support day-to-day retail operations (fast checkout, inventory replenishment, credit sales, expense control, and owner drawings) while upholding strict financial integrity.

### 1.1 Scope of the Finance Module
The Finance module in NexTill tracks:
1. **Gross and Net Sales Revenue** (Point-of-sale transactions, multi-tier pricing, predefined discounts, cart discounts).
2. **Cash Collections & Tender Flow** (Cash received at checkout, change given, digital payments via Paystack, partial payments).
3. **Customer Receivables** (Invoices sold on credit, outstanding customer debt, FIFO repayment allocations).
4. **Supplier Payables** (Inventory purchases on credit, partial vendor deposits, FIFO debt settlement).
5. **Inventory Valuation & Cost of Goods Sold (COGS)** (Quantity on hand, unit cost snapshots, cost capture upon sale).
6. **Operating Expenses** (Categorized overhead costs: rent, utilities, wages, logistics, maintenance).
7. **Business Asset Register** (Capital expenditure tracking, acquisition costs, current equipment valuation).
8. **Owner Equity & Drawings** (Capital injections/contributions and owner personal withdrawals).
9. **Cumulative Profit & Retained Earnings** (Gross profit, operating profit, net profit margin).

### 1.2 System Scope Distinction
NexTill is **not** a full double-entry general ledger package (like SAP or QuickBooks with arbitrary journal entries and nominal accounts). Instead, it implements a **transactional, event-driven accounting model** where every business event (a sale, a credit repayment, a purchase, an expense, an asset purchase, or an owner drawing) is atomically written to dedicated database tables with exact monetary snapshots, preserving historical audit trails without allowing retroactive data distortion.

---

## 2. System Architecture

NexTill's financial flow is architected across four distinct layers:

```
[ POS Checkout / Finance UI ]
             │ (HTTP REST / JSON)
             ▼
[ Express API Controllers & Input Validators ]
             │ (Validated DTOs & Auth Context)
             ▼
[ Backend Services (Atomic Prisma Transactions) ]
             │ (Decimal.js / Money Arithmetic & FIFO Allocation)
             ▼
[ PostgreSQL Database (Prisma ORM & Migration Engine) ]
             │ (Aggregations, Snapshots & Historical Views)
             ▼
[ Reporting & Executive Dashboard Services ]
```

### Key Source Files & Responsibilities:

| Layer | Primary Files | Responsibility |
| :--- | :--- | :--- |
| **Database Schema** | `server/prisma/schema.prisma` | Defines tables, relations, Decimal(10,2) precision, constraints, and audit log links. |
| **Sales Service** | `server/src/services/salesService.js` | Atomic checkout transactions, stock deduction, pricing calculations, line cost capture, payment records. |
| **Customer Service** | `server/src/services/customerService.js` | Customer profiles, credit balance calculations, FIFO debt repayment allocation. |
| **Supplier Service** | `server/src/services/supplierService.js` | Supplier ledger, purchase order management, FIFO supplier debt repayments. |
| **Finance Service** | `server/src/services/financeService.js` | Operating expense management, asset register, owner contributions & drawings, executive financial summary. |
| **Reports Service** | `server/src/services/reportService.js` | Profit & Loss statements, COGS aggregations, daily sales summaries, cashier performance. |
| **Money Utilities** | `server/src/utils/money.js`<br>`client/src/utils/money.js` | Decimal.js backend arithmetic; integer minor unit (pesewas/cents) frontend arithmetic to eliminate floating-point drift. |
| **Receipt Model** | `client/src/utils/receiptModel.js`<br>`client/src/components/ReceiptContent.jsx` | 5-column item table (`Items`, `Qty`, `Market Price`, `Our Price`, `Amount`), combined `Our Total Discount`, 58mm/80mm thermal rendering. |
| **Finance UI** | `client/src/pages/FinancePage.jsx` | Tabs for Financial Overview, Operating Expenses, Business Assets, and Owner Equity. |

---

## 3. Database Financial Models

All monetary values in NexTill's PostgreSQL database use `@db.Decimal(10, 2)` (or `@db.Decimal(10, 3)` for inventory weights/volumes) to eliminate floating-point inaccuracies.

### 3.1 `Sale` & `SaleItem`
- **`Sale`**:
  - `subtotal`: Sum of all items at line gross prices.
  - `discount_amount`: Additional cart-level discount.
  - `total_amount`: Final invoice amount due (`subtotal - discount_amount + tax_amount`).
  - `amount_paid`: Actual amount collected at POS.
  - `balance_due`: Outstanding receivable balance (`total_amount - amount_paid`).
  - `payment_status`: `COMPLETED`, `PARTIALLY_PAID`, `PENDING`, or `REFUNDED`.
- **`SaleItem`**:
  - `quantity`: Quantity sold in selling unit.
  - `unit_price`: Selling price applied per unit.
  - `cost_price_snapshot`: Catalog cost price at moment of sale (or `NULL` if untracked).
  - `unit_cost_snapshot`: Actual unit cost used for COGS.
  - `usual_price_snapshot`: Original Market Price per unit.
  - `our_price_snapshot`: Preferred Our Price per unit.
  - `predefined_discount_applied`: Boolean indicating if store discount was applied.
  - `predefined_discount_amount`: Line savings (`(usual_price - our_price) * qty`).
  - `line_cost`: Total cost of goods sold for this line (`pricing_qty * unit_cost`).
  - `discount`: Line-level manual discount.
  - `total`: Actual line total charged to customer.

### 3.2 `Payment`
Records every payment transaction at point-of-sale checkout:
- `sale_id`: Associated sale.
- `amount_paid`: Cash or card tender received.
- `change_given`: Excess cash returned to customer.
- `method`: `CASH`, `CARD`, `MOMO`, `CREDIT`, or `PAYSTACK`.

### 3.3 `CustomerPayment` & `CustomerPaymentAllocation`
- **`CustomerPayment`**: Unlinked cash collection from a customer settling outstanding credit debt.
- **`CustomerPaymentAllocation`**: Links the payment to one or more specific `Sale` records using First-In-First-Out (FIFO) logic, reducing `Sale.balance_due` and updating `Sale.payment_status` without altering historical sales revenue.

### 3.4 `Purchase`, `PurchaseItem`, `SupplierPayment` & `SupplierPaymentAllocation`
- **`Purchase`**: Vendor purchase order with `total_amount`, `amount_paid`, and `balance_due`.
- **`PurchaseItem`**: Goods received, capturing `quantity`, `unit_cost`, and incrementing inventory.
- **`SupplierPayment`** & **`SupplierPaymentAllocation`**: Debt payments to vendors allocated via FIFO to unpaid purchases.

### 3.5 `Expense` & `ExpenseCategory`
- Overhead operating costs (Rent, Utilities, Wages, Logistics).
- Each expense records `amount`, `payment_method`, `expense_date`, `payee`, and `reference`.
- Never capitalizes inventory or business assets.

### 3.6 `BusinessAsset`
- Fixed and operational capital assets (Freezers, computers, barcode scanners, display shelves).
- Tracks `acquisition_cost`, `acquisition_date`, `current_value`, `status` (`ACTIVE`, `DISPOSED`, `MAINTENANCE`), and `location`.

### 3.7 `OwnerTransaction`
- Direct equity transactions with business owners:
  - `type`: `CONTRIBUTION` (Capital injection into business) or `WITHDRAWAL` (Drawings / dividends).
  - `amount`: Monetary value.
  - `payment_method`: Channel (CASH, BANK, CARD).
  - `transaction_date`: Effective accounting date.

---

## 4. Complete Sales Accounting Flow

```
Product Selection -> Price Determination -> Predefined Discount -> Additional Cart Discount
       │
       ▼
Grand Total Calculation -> Payment Tendered -> Stock Deduction & COGS Capture
```

### 4.1 Price Determination & Hierarchy
1. If product has `usual_price` and `our_price`:
   - `Market Price` = `usual_price` (reference catalog price).
   - `Our Price` = `our_price` (preferred selling price).
2. If `predefined_discount_applied` is true:
   - Selling price is `Our Price`.
   - Predefined savings per unit = `Market Price - Our Price`.
   - Line predefined discount = `pricing_qty × (Market Price - Our Price)`.
3. If predefined discount is toggled OFF by cashier:
   - Selling price reverts to `Market Price`.

### 4.2 Cart Discount & Grand Total
- Additional Cart Discount is applied at the purchase level.
- **Formulas:**
  $$\text{Market Price Subtotal} = \sum (\text{pricing\_qty} \times \text{Market Price})$$
  $$\text{Our Total Discount} = \text{Total Predefined Discounts} + \text{Additional Cart Discount} + \text{Manual Item Discounts}$$
  $$\text{Grand Total} = \text{Market Price Subtotal} - \text{Our Total Discount} + \text{Applicable Taxes}$$

### 4.3 Worked Numerical Example
- Product A (Chilli): 2 kg @ Market Price LKR120.00, Our Price LKR100.00.
  - Market line gross = 2 × 120.00 = LKR240.00.
  - Predefined savings = 2 × (120.00 - 100.00) = LKR40.00.
  - Charged line amount = LKR200.00.
- Product B (Salt): 2 pcs @ Market Price LKR150.00, Our Price LKR120.00.
  - Market line gross = 2 × 150.00 = LKR300.00.
  - Predefined savings = 2 × (150.00 - 120.00) = LKR60.00.
  - Charged line amount = LKR240.00.
- Additional Cart Discount = LKR10.00.

**Financial Presentation:**
- **Market Price Subtotal:** LKR540.00
- **Our Total Discount:** LKR110.00 (LKR100.00 predefined + LKR10.00 cart)
- **Grand Total:** LKR430.00
- **Line Amounts:** Chilli LKR200.00, Salt LKR240.00 (Sum = LKR440.00 - LKR10.00 cart discount = LKR430.00).

---

## 5. Customer Credit and Repayment Flow

NexTill supports customer credit sales and partial payments with strict FIFO reconciliation:

### 5.1 Credit Sale Creation
1. Cashier selects a registered customer (Walk-in customers cannot purchase on credit).
2. Invoice Grand Total = LKR150.00.
3. Customer pays cash deposit of LKR50.00 at checkout:
   - `Sale.amount_paid` = LKR50.00.
   - `Sale.balance_due` = LKR100.00.
   - `Sale.payment_status` = `PARTIALLY_PAID`.
   - `Customer.outstanding_credit` increments by LKR100.00.
   - Cash collections increase by LKR50.00.
   - Revenue recognized = LKR150.00.

### 5.2 Customer Debt Repayment
When the customer later pays LKR100.00:
1. `customerService.recordCustomerPayment` executes an atomic database transaction.
2. Creates `CustomerPayment` record (LKR100.00, CASH).
3. Queries customer's unpaid sales ordered by `created_at ASC` (FIFO).
4. Allocates payment to `Sale`:
   - `CustomerPaymentAllocation` created for LKR100.00.
   - `Sale.balance_due` reduced from LKR100.00 to LKR0.00.
   - `Sale.amount_paid` increased from LKR50.00 to LKR150.00.
   - `Sale.payment_status` updated to `COMPLETED`.
5. `Customer.outstanding_credit` decrements by LKR100.00.
6. **Accounting Correctness Guarantee:**
   - **Cash collections** increase by LKR100.00 on the day of repayment.
   - **Sales revenue is NOT increased again** (prevents double revenue recognition).
   - **Customer receivables** decrease by LKR100.00.

---

## 6. Supplier and Purchase Accounting Flow

Inventory acquisition from vendors operates symmetrically with customer sales:

### 6.1 Purchase Order Receiving
1. A purchase order is received with 100 units of Sugar @ LKR30.00 unit cost = LKR3,000.00 total.
2. Store pays vendor deposit of LKR1,000.00:
   - `Purchase.total_amount` = LKR3,000.00.
   - `Purchase.amount_paid` = LKR1,000.00.
   - `Purchase.balance_due` = LKR2,000.00.
   - `Purchase.payment_status` = `PARTIALLY_PAID`.
   - `Supplier.outstanding_balance` increments by LKR2,000.00.
3. Inventory quantity increases by 100 units in `Product` table.
4. **Accounting Treatment:**
   - This is an **inventory acquisition**, NOT an operating expense.
   - Operating expenses do not increase.
   - COGS is not recognized until the sugar is sold.

### 6.2 Supplier Debt Settlement
When the business repays LKR2,000.00 to the supplier:
1. Creates `SupplierPayment` record (LKR2,000.00).
2. Creates `SupplierPaymentAllocation` allocating to the purchase invoice (FIFO).
3. Reduces `Purchase.balance_due` to LKR0.00 and marks status `COMPLETED`.
4. Decreases cash balance by LKR2,000.00.
5. Does not create an operating expense (prevents double expensing).

---

## 7. Inventory and Cost of Goods Sold (COGS)

### 7.1 Historical Cost Snapshots
When a product is sold:
1. `salesService.js` reads `product.cost_price`.
2. Computes line cost:
   $$\text{line\_cost} = \text{pricing\_qty} \times \text{cost\_price}$$
3. Persists `cost_price_snapshot` and `line_cost` directly in the `SaleItem` row.
4. If a supplier later raises the cost price in the product catalog, historical `SaleItem` records remain untouched.

### 7.2 Handling NULL or Zero Cost Prices
If a product has an unrecorded cost (`cost_price == NULL` or `0`):
- `SaleItem.cost_price_snapshot` is stored as `NULL`.
- `SaleItem.line_cost` is recorded as `0.00`.
- In `reportService.getProfitReport`:
  - Flag `has_unrecorded_cost = true`.
  - Profit margin is reported as `null` rather than a false 100% margin.
  - This prevents distorted financial reports when inventory costs have not yet been entered.

---

## 8. Expense and Asset Accounting

NexTill enforces strict separation between operational expenses and capital assets:

| Dimension | Operating Expenses (`Expense`) | Capital Assets (`BusinessAsset`) |
| :--- | :--- | :--- |
| **Examples** | Store rent, electricity bills, staff wages, dispatch fees | Display chillers, POS terminals, shelving, vehicles |
| **Accounting Effect** | Expensed immediately in the period incurred | Capitalized onto the Balance Sheet |
| **P&L Impact** | Deducted from Gross Profit to arrive at Net Profit | No immediate deduction from operating profit |
| **Balance Sheet Impact** | Reduces cash | Increases Fixed Assets valuation |
| **Valuation Tracking** | Fixed historical transaction amount | Tracks `acquisition_cost` and revalued `current_value` |

---

## 9. Owner Capital, Equity, and Audit Resolution

### 9.1 Why Did `Net Owner Capital (Equity)` Initially Display 0?

During the audit, the Finance section displayed `Net Owner Capital (Equity) = 0`. Our investigation traced the complete data pipeline and identified the root cause:

1. **Zero Database Records:**
   - In `server/prisma/seed.js`, initial seeding created products, categories, users, settings, and sales, but **did not insert any records into `OwnerTransaction`**.
   - Querying `prisma.ownerTransaction.count()` returned exactly `0`.
2. **Mathematical Accuracy of Direct Capital:**
   - NexTill calculates:
     $$\text{Net Owner Capital} = \sum \text{Contributions} - \sum \text{Withdrawals}$$
   - With 0 contributions and 0 withdrawals recorded, the calculation `0.00 - 0.00 = 0.00` is **mathematically and auditably correct**.
3. **Conceptual Accounting Ambiguity:**
   - The UI card was labeled `Net Owner Capital (Equity)` while only displaying `net_capital`.
   - In accounting:
     $$\text{Total Business Equity} = \text{Net Contributed Capital} + \text{Retained Earnings (Accumulated Profit)}$$
   - Because the system had not calculated or surfaced Retained Earnings, users perceived the metric as broken.
4. **Backend Filtering Bug:**
   - In `financeService.listOwnerTransactions`, date-range filters were applied to the transaction list, but `contribAgg` and `withdrAgg` used `{ type: 'CONTRIBUTION' }` without `{ ...where }`, ignoring date boundaries.

### 9.2 Resolution Implemented
1. **Separated Metrics in Backend (`financeService.getFinanceSummary`):**
   - Added calculation of `retained_earnings` ($\text{Net Sales} - \text{COGS} - \text{Operating Expenses}$).
   - Added calculation of `total_equity` ($\text{Net Contributed Capital} + \text{Retained Earnings}$).
2. **Clarified UI Overview Cards (`FinancePage.jsx`):**
   - **Net Owner Capital:** Direct funds invested by owners less drawings.
   - **Total Business Equity:** Net Owner Capital plus Retained Earnings.
   - **Balance Sheet Quick View:** Now displays Contributed Capital, Retained Earnings, and Total Business Equity separately.
3. **Fixed Date Filter in `listOwnerTransactions`:**
   - Applied `{ ...where, type: 'CONTRIBUTION' }` and `{ ...where, type: 'WITHDRAWAL' }`.
4. **Development Seed Enhancement (`seed.js`):**
   - Added an opening owner capital contribution (LKR25,000.00) in `seed.js` so fresh development databases demonstrate active owner equity immediately.

---

## 10. Profit and Loss (P&L) Calculation

NexTill's P&L statement follows retail industry accounting standards:

$$\begin{aligned}
\text{Gross Sales} &= \sum \text{Sale.total\_amount} \quad (\text{completed sales}) \\
\text{Less: Cost of Goods Sold (COGS)} &= \sum \text{SaleItem.line\_cost} \\
\hline
\mathbf{\text{Gross Profit}} &= \mathbf{\text{Gross Sales} - \text{COGS}} \\
\text{Gross Profit Margin} &= \left(\frac{\text{Gross Profit}}{\text{Gross Sales}}\right) \times 100\% \\
\hline
\text{Less: Operating Expenses} &= \sum \text{Expense.amount} \\
\hline
\mathbf{\text{Net Operating Profit}} &= \mathbf{\text{Gross Profit} - \text{Operating Expenses}} \\
\text{Net Profit Margin} &= \left(\frac{\text{Net Operating Profit}}{\text{Gross Sales}}\right) \times 100\%
\end{aligned}$$

---

## 11. Dashboard and Reports Synchronization

All reporting screens draw from authoritative database aggregates:

| Report Metric | API Route | Authoritative Database Source |
| :--- | :--- | :--- |
| **Today's Revenue** | `GET /api/reports/dashboard` | `Sale.aggregate` where `created_at` is today and `payment_status != 'REFUNDED'` |
| **Cash Collected Today** | `GET /api/reports/dashboard` | `Payment` (checkout tender) + `CustomerPayment` (credit repayments today) |
| **Customer Receivables** | `GET /api/reports/dashboard`<br>`GET /api/finance/summary` | `Sale.aggregate` where `balance_due > 0` |
| **Supplier Payables** | `GET /api/reports/dashboard`<br>`GET /api/finance/summary` | `Purchase.aggregate` where `balance_due > 0` and `status != 'CANCELLED'` |
| **Operating Expenses** | `GET /api/finance/summary`<br>`GET /api/reports/financial-statement` | `Expense.aggregate` where `expense_date` matches target range |
| **Net Owner Capital** | `GET /api/finance/summary` | `OwnerTransaction.aggregate` (`CONTRIBUTION` sum minus `WITHDRAWAL` sum) |

---

## 12. Accounting Reconciliation Checklist

To audit and reconcile NexTill financial figures:

1. **Reconcile Sales Revenue vs Cash & Receivables:**
   $$\sum \text{Sale.total\_amount} = \sum \text{Sale.amount\_paid} + \sum \text{Sale.balance\_due}$$
2. **Reconcile Customer Debt vs Ledger Allocations:**
   $$\text{Customer.outstanding\_credit} = \sum \text{Unpaid Sale.balance\_due}$$
3. **Reconcile Supplier Debt vs Purchase Invoices:**
   $$\text{Supplier.outstanding\_balance} = \sum \text{Unpaid Purchase.balance\_due}$$
4. **Reconcile Inventory Movement vs COGS:**
   $$\text{Inventory Deduction} = \sum \text{SaleItem.quantity}$$
   $$\text{COGS Recognized} = \sum \text{SaleItem.line\_cost}$$
5. **Reconcile Owner Capital:**
   $$\text{Net Owner Capital} = \sum \text{Contributions} - \sum \text{Withdrawals}$$
   $$\text{Total Business Equity} = \text{Net Owner Capital} + \text{Retained Earnings}$$

---

## 13. Known Limitations & Future Roadmap

To preserve documentation integrity, the following advanced accounting capabilities are intentionally **outside the current implementation scope**:
1. **Automated Asset Depreciation:** Assets track current valuation; automated straight-line or declining-balance depreciation schedules are not currently run via cron.
2. **Nominal Double-Entry Journal Postings:** Debit/Credit general ledger journals are not exposed; transactions use dedicated operational models.
3. **Bank Statement Feed Reconciliation:** Digital payments are verified via Paystack webhooks; automated bank statement CSV reconciliation is not implemented.
4. **Accrual Basis Expense Timing:** Operating expenses are recognized on the expense transaction date, not amortized over multi-month prepayment periods.

---

## 14. Financial Calculation Reference Table

| Formula Name | Authoritative Expression | Implementation Function |
| :--- | :--- | :--- |
| **Line Gross (Market)** | `pricing_qty × usual_price` | `receiptModel.js:formatReceiptItem` |
| **Line Gross (Selling)** | `pricing_qty × unit_price` | `salesService.js:calculateLineGross` |
| **Line Predefined Savings** | `pricing_qty × (usual_price - our_price)` | `salesService.js:createSale` |
| **Line Cost (COGS)** | `pricing_qty × unit_cost_snapshot` | `salesService.js:calculateLineCost` |
| **Our Total Discount** | `Predefined Discounts + Cart Discount + Line Discounts` | `receiptModel.js:calculateReceiptSummary` |
| **Grand Total** | `Market Price Subtotal - Our Total Discount + Tax` | `salesService.js:createSale` |
| **Customer Receivables** | `Total Credit Sales - FIFO Customer Allocations` | `customerService.js:recordCustomerPayment` |
| **Supplier Payables** | `Total Credit Purchases - FIFO Supplier Allocations` | `supplierService.js:recordSupplierPayment` |
| **Gross Profit** | `Net Sales - COGS` | `reportService.js:getProfitReport` |
| **Net Operating Profit** | `Gross Profit - Operating Expenses` | `reportService.js:getFinancialStatement` |
| **Net Owner Capital** | `Total Contributions - Total Withdrawals` | `financeService.js:getFinanceSummary` |
| **Total Business Equity** | `Net Owner Capital + Retained Earnings` | `financeService.js:getFinanceSummary` |

---

## 15. Example End-to-End Business Scenario

This worked walkthrough illustrates how ten consecutive transactions impact NexTill's records:

1. **Owner Contribution:** Owner deposits LKR20,000.00 opening capital (`OwnerTransaction: CONTRIBUTION`).
   - Net Owner Capital = LKR20,000.00. Cash in hand = LKR20,000.00.
2. **Asset Purchase:** Shop buys a digital scale for LKR2,000.00 (`BusinessAsset`).
   - Business Assets = LKR2,000.00. Cash in hand = LKR18,000.00. Operating expenses = LKR0.00.
3. **Inventory Purchase on Credit:** Buys 100 kg Rice @ LKR10.00 cost = LKR1,000.00. Pays LKR400.00 deposit (`Purchase`).
   - Inventory stock = 100 kg. Supplier Payables = LKR600.00. Cash in hand = LKR17,600.00.
4. **Product Sale (Cash):** Sells 20 kg Rice @ LKR15.00 selling price = LKR300.00 cash (`Sale`).
   - Cash received = LKR300.00. Revenue = LKR300.00. Stock = 80 kg.
   - COGS recorded = 20 × LKR10.00 = LKR200.00. Gross Profit = LKR100.00.
5. **Product Sale (Credit):** Sells 10 kg Rice to registered customer Kofi for LKR150.00. Customer pays LKR50.00 deposit (`Sale: PARTIALLY_PAID`).
   - Cash received = LKR50.00. Customer Receivables = LKR100.00. Stock = 70 kg.
   - COGS = 10 × LKR10.00 = LKR100.00. Gross Profit = LKR50.00. Total Revenue = LKR450.00.
6. **Operating Expense:** Pays store electricity bill of LKR80.00 (`Expense: Utilities`).
   - Operating Expenses = LKR80.00. Cash in hand reduced by LKR80.00.
7. **Customer Debt Repayment:** Kofi repays remaining LKR100.00 debt (`CustomerPayment`).
   - Cash received = LKR100.00. Customer Receivables = LKR0.00. Revenue does NOT increase.
8. **Supplier Debt Settlement:** Shop pays remaining LKR600.00 to vendor (`SupplierPayment`).
   - Cash in hand reduced by LKR600.00. Supplier Payables = LKR0.00. Expenses do NOT increase.
9. **Owner Drawing:** Owner withdraws LKR500.00 for personal use (`OwnerTransaction: WITHDRAWAL`).
   - Net Owner Capital = LKR20,000.00 - LKR500.00 = LKR19,500.00.
10. **Financial Statement Reconciliation:**
    - **Gross Sales:** LKR450.00
    - **Total COGS:** LKR300.00
    - **Gross Profit:** LKR150.00
    - **Operating Expenses:** LKR80.00
    - **Net Profit (Retained Earnings):** LKR70.00
    - **Net Owner Capital:** LKR19,500.00
    - **Total Business Equity:** LKR19,500.00 + LKR70.00 = LKR19,570.00.
    - **Outstanding Receivables:** LKR0.00 | **Outstanding Payables:** LKR0.00.
