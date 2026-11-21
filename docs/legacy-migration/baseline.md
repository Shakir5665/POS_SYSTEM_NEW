# NexTill POS — Migration Baseline

## 1. Source Commit

| Property       | Value                                      |
| -------------- | ------------------------------------------ |
| Branch         | `main`                                     |
| HEAD commit    | `3801ebd` ("bill")                         |
| Phase 1 branch | `phase-1/legacy-migration-baseline`        |
| Recorded at    | 2026-11-21T22:03:00+05:30                  |

## 2. Repository Stack

| Component      | Version / Technology           |
| -------------- | ------------------------------ |
| Runtime        | Node.js (CommonJS backend)     |
| Framework      | Express 4.x                    |
| Database       | PostgreSQL 15+ (via Docker)    |
| ORM            | Prisma 5.22.x                  |
| Frontend       | React 19 + Vite 8              |
| Backend tests  | Jest 29                        |
| Frontend tests | Vitest 5                       |
| CSS            | Tailwind CSS 3                 |
| Deployment     | Render (render.yaml)           |

## 3. Prisma Migration State

The migration directory `server/prisma/migrations/` contains **10 applied migrations** plus the lock file:

| # | Migration name                                           | Purpose                              |
|---|----------------------------------------------------------|--------------------------------------|
| 1 | `0_init`                                                 | Initial schema                       |
| 2 | `20261010000000_add_sale_refund_request`                 | Refund request fields on Sale        |
| 3 | `20261012000000_add_sale_loyalty_points_earned`          | Loyalty points tracking              |
| 4 | `20261025000000_add_paystack_payment`                    | PaystackPayment model                |
| 5 | `20261107000000_add_uom_support`                         | UnitCategory enum, unit fields       |
| 6 | `20261109000000_add_product_pricing_architecture`        | Multi-price product fields           |
| 7 | `20261109010000_add_customer_credit_and_payments`        | Customer payment allocation system   |
| 8 | `20261109020000_add_suppliers_and_purchases`             | Supplier and purchase models         |
| 9 | `20261109030000_add_business_finance_models`             | Expense, Asset, Owner transactions   |
| 10| `20261109040000_make_product_category_nullable_set_null` | Nullable product category FK         |

**Lock file:** `migration_lock.toml` (provider: `postgresql`)

### Database migration status

> [!NOTE]
> `prisma migrate status` has NOT been run against any database in this phase.
> Running it requires a confirmed development database connection.
> Status: **NOT VERIFIED** — blocked by database access confirmation.

## 4. Current Prisma Models (22)

User, Category, Product, Customer, Sale, SaleItem, Payment, CustomerPayment,
CustomerPaymentAllocation, InventoryLog, AuthLog, Settings, PaystackPayment,
Supplier, Purchase, PurchaseItem, SupplierPayment, SupplierPaymentAllocation,
ExpenseCategory, Expense, BusinessAsset, OwnerTransaction.

## 5. Enums (8)

Role, PaymentMethod, PaymentStatus, PurchaseStatus, InventoryChangeType,
UnitCategory, AssetStatus, OwnerTxType.

## 6. Deployment Targets

### Render (Production)
- Database: `nextill-db` (PostgreSQL, free plan)
- Web service: `nextill` (Node.js)
- Build: `npm run render:build` → Start: `npm run render:start`
- Health check: `/api/health`

### Docker Compose (Local Development)
- PostgreSQL 15 on host port `5433`
- Credentials: `pos:pos` / database `pos_db`
- API on port `3001`, Web on port `5173`

### Local `.env`
- Database URL configured in `server/.env`
- `.env.example` documents all required variables

## 7. Existing Backup Infrastructure

- Script: `server/scripts/backup.js`
- Format: PostgreSQL custom-format dump (`pg_dump -Fc`)
- Output: `server/backups/pos_backup_<timestamp>.dump`
- Auto-detects PostgreSQL 17/18 binaries on Windows

## 8. Schema Not Modified

> [!IMPORTANT]
> `server/prisma/schema.prisma` has NOT been modified in Phase 1.
> All schema changes are proposed in `phase-2-handoff.md`.
