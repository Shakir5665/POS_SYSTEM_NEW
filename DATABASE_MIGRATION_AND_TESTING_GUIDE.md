# NexTill POS — Database Migration, Setup & Local Testing Guide (Windows CMD)

This guide provides step-by-step instructions, architectural best practices, and copy-pasteable Windows Command Prompt (`cmd.exe`) commands for running Prisma database migrations, setting up local/cloud environments (including AWS Neon PostgreSQL), executing the legacy POS Excel migration pipeline, seeding sample data, running backend/frontend services, and executing automated test suites.

---

## 1. Quick Command Reference (CMD Cheat Sheet)

All commands can be run directly in Windows Command Prompt (`cmd.exe`). You can either execute them from the project root (`NexTill_POS`) or inside the `server` directory.

### From Project Root (`C:\Users\shaki\Desktop\NexTill_POS`):

| Action | Windows CMD Command | Description |
| :--- | :--- | :--- |
| **Apply all pending migrations** | `npm run db:deploy` | Executes `prisma migrate deploy` across all pending SQL migrations. |
| **Create new migration (Dev)** | `npm run db:migrate` | Runs `prisma migrate dev` comparing `schema.prisma` to active DB. |
| **Regenerate Prisma Client** | `npm --prefix server run prisma:generate` | Updates `@prisma/client` bindings in `node_modules`. |
| **Seed default data** | `npm run db:seed` | Populates default admin/manager accounts, settings, and base data. |
| **Open Prisma Studio (GUI)** | `npm run db:studio` | Launches web-based visual database inspector at `http://localhost:5555`. |
| **Create Database Backup** | `npm --prefix server run db:backup` | Generates a binary `.dump` backup under `server/backups/`. |
| **Run Migration Readiness Check** | `npm run migration:readiness` | Audits foreign keys, required categories, and warehouse defaults. |
| **Run Migration Dry-Run** | `npm run migration:dry-run` | Validates historical Excel ingestion without writing to target DB. |
| **Run Live Migration** | `npm run migration:run` | Ingests historical Excel records with safety guard validation. |
| **Run both Server + Client** | `npm run dev` | Concurrently boots backend on `:3001` and Vite client on `:5173`. |
| **Run Backend Tests (Jest)** | `npm run test` | Executes full backend test suite (~200+ unit, integration & migration tests). |
| **Run Frontend Tests (Vitest)**| `npm --prefix client test -- run` | Executes frontend tests for cart, receipts, POS shortcuts, and UI. |
| **Build Frontend for Production**| `npm run build` | Compiles client application into `client/dist/`. |

### Directly inside Server Directory (`cd server`):

| Action | Windows CMD Command |
| :--- | :--- |
| **Apply pending migrations** | `npx prisma migrate deploy` |
| **Create new migration** | `npx prisma migrate dev --name <migration_name>` |
| **Check migration status** | `npx prisma migrate status` |
| **Regenerate Prisma Client** | `npx prisma generate` |
| **Reset DB & re-run all migrations** | `npx prisma migrate reset` *(Deletes all data - dev only)* |
| **Seed sample data** | `npx prisma db seed` |
| **Launch Prisma Studio** | `npx prisma studio` |
| **Take Database Dump** | `node scripts/backup.js` |
| **Run Preflight Target Check** | `node scripts/migration/preflight.js --target=development` |
| **Check Readiness Gate** | `node scripts/migration/check-readiness.js` |
| **Run Isolated Dry-Run** | `node scripts/run-isolated-dry-run.js` |

---

## 2. Environment Setup

### 2.1 Server Configuration (`server/.env`)

Configure your PostgreSQL connection and application secrets in `server/.env`.

1. Navigate to the `server` directory:
   ```cmd
   cd C:\Users\shaki\Desktop\NexTill_POS\server
   ```
2. If `.env` does not exist, copy from `.env.example`:
   ```cmd
   copy .env.example .env
   ```
3. Open `server\.env` in Notepad or your preferred editor:
   ```cmd
   notepad .env
   ```
4. Verify or update the `DATABASE_URL`:
   - **Local PostgreSQL:**
     ```env
     DATABASE_URL="postgresql://postgres:your_password@localhost:5432/nextill_pos?schema=public"
     ```
   - **AWS Neon PostgreSQL (Cloud / DASHPOS):**
     ```env
     DATABASE_URL="postgresql://neondb_owner:<password>@ep-dry-heart-aob4tqn2.c-2.ap-southeast-1.aws.neon.tech/DASHPOS?sslmode=require&channel_binding=require"
     ```
5. Configure Migration Safety Guards (Optional / Advanced):
   ```env
   # Set to 'true' only when authorized to execute historical Excel migrations against staging
   ALLOW_STAGING_IMPORT=false

   # Set to 'true' when executing against an isolated local scratch database
   ALLOW_ISOLATED_IMPORT=false
   ```
6. Ensure JWT secrets are defined (generate random 32-byte hex if needed):
   ```cmd
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

### 2.2 Client Configuration (`client/.env`)

1. Navigate to the `client` directory:
   ```cmd
   cd C:\Users\shaki\Desktop\NexTill_POS\client
   ```
2. Ensure the API endpoint points to your server:
   ```env
   VITE_API_URL=http://localhost:3001/api
   ```

---

## 3. Database Migration Procedures

NexTill uses Prisma ORM with versioned SQL migrations stored in `server/prisma/migrations/`.

### 3.1 Applying Migrations to an Existing or New Database

Use `prisma migrate deploy` to apply all unapplied migration files safely without interactive prompts. This is the recommended command for local setups, staging, and production.

```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma migrate deploy
```
*Or from the workspace root:*
```cmd
npm run db:deploy
```

**Complete Migration Sequence (Chronological Order):**
1. `0_init`: Base POS schema (Users, Products, Categories, Sales, SaleItems, InventoryLogs, AuthLogs, Settings).
2. `20261010000000_add_sale_refund_request`: Refund request tracking fields on sales.
3. `20261012000000_add_sale_loyalty_points_earned`: Customer loyalty points calculation and tracking.
4. `20261025000000_add_paystack_payment`: Paystack webhook reconciliation and online payment model.
5. `20261107000000_add_uom_support`: Units of measure (UOM) architecture, decimal quantity precision (`Decimal(14,3)`).
6. `20261109000000_add_product_pricing_architecture`: Dual pricing (`usual_price`, `our_price`, `wholesale_price`), cost price, and historical snapshot fields.
7. `20261109010000_add_customer_credit_and_payments`: Accounts Receivable (AR), `CustomerPayment`, and `CustomerPaymentAllocation` ledger.
8. `20261109020000_add_suppliers_and_purchases`: Procurement module (`Supplier`, `Purchase`, `PurchaseItem`, `SupplierPayment`, `SupplierPaymentAllocation`).
9. `20261109030000_add_business_finance_models`: General ledger models (`ExpenseCategory`, `Expense`, `BusinessAsset`, `OwnerTransaction`).
10. `20261109040000_make_product_category_nullable_set_null`: Decoupled category deletion from product inventory (`onDelete: SetNull`).
11. `20261122000000_add_legacy_migration_models`: Multi-warehouse support (`Warehouse`), transactional stock adjustments (`StockAdjustment`, `StockAdjustmentItem`), historical date overrides (`sale_date`, `purchase_date`, `is_legacy_import`), and legacy migration tracking (`LegacyIdMap`, `MigrationBatch`, `MigrationIssue`).
12. `20261122010000_add_sales_and_purchase_returns`: Full reverse logistics architecture (`SalesReturn`, `SalesReturnItem`, `PurchaseReturn`, `PurchaseReturnItem`) with idempotency keys and warehouse routing.

### 3.2 Checking Migration Status

To inspect which migrations are already applied and which are pending:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma migrate status
```

### 3.3 Regenerating Prisma Client

Whenever the database schema changes, regenerate the Prisma Client bindings:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma generate
```

### 3.4 Creating a New Migration (Development Only)

When you modify `server/prisma/schema.prisma` and need to generate a new migration:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma migrate dev --name <describe_your_change>
```
*Example:*
```cmd
npx prisma migrate dev --name add_customer_tax_id
```

### 3.5 Seeding Initial & Sample Data

To populate the database with default store settings, admin/manager/cashier accounts, test categories, products, and a default warehouse:

```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma db seed
```
*Or from root:*
```cmd
npm run db:seed
```

> [!NOTE]
> **Default Seed Accounts:**
> - **Admin:** username `admin` | password `admin123` | role `ADMIN`
> - **Manager:** username `manager` | password `manager123` | role `MANAGER`
> - **Cashier:** username `cashier` | password `cashier123` | role `CASHIER`
> 
> *The seed script includes an environment safety guard preventing accidental data wipes when `NODE_ENV=production`.*

### 3.6 Inspecting Data with Prisma Studio

To visually browse, query, and edit records in your web browser:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma studio
```
Prisma Studio opens at `http://localhost:5555`.

### 3.7 Database Backup & Point-in-Time Dump

To create an immediate binary dump of your database before migrations or wipes:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
node scripts/backup.js
```
Backups are saved to `server/backups/pos_backup_<timestamp>.dump`.

---

## 4. Legacy POS Migration & Safe Excel Ingestion Pipeline

NexTill includes an enterprise-grade migration pipeline capable of ingesting legacy multi-sheet POS exports (`.xlsx`) containing historical categories, inventory master items, historical sales, purchases, expenses, and cycle stock adjustments.

### 4.1 Migration Pipeline Architecture

```
  [ Legacy POS Excel Export ]
               |
               v
  1. Preflight Target Classifier (preflight.js)
     - Detects cloud hosts (AWS Neon, RDS, Supabase)
     - Blocks destructive actions on production
               |
               v
  2. Safety Backup (backup.js)
     - Generates automated pg_dump snapshot
               |
               v
  3. Readiness Gate (check-readiness.js)
     - Verifies schema, migrations, default warehouse & fallback user
               |
               v
  4. Isolated Dry-Run Verification (run-isolated-dry-run.js)
     - Audits workbook sheets (Audits A-D)
     - Reconciles financial balances, prices, and quantities
     - Simulates import with zero DB modifications
               |
               v
  5. Live Migration Execution (run-excel-migration.js / migrationGuard.js)
     - Requires ALLOW_STAGING_IMPORT=true or ALLOW_ISOLATED_IMPORT=true
     - Populates LegacyIdMap for lossless cross-system foreign key resolution
     - Stamped with is_legacy_import=true and historical sale_date/purchase_date
```

### 4.2 Executing Migration Readiness Checks

Verify that the target database satisfies all foreign key and schema dependencies:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS
npm run migration:readiness
```

### 4.3 Running an Isolated Dry-Run Verification

Before any live data is written, perform an automated dry-run validation against your spreadsheet:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS
npm run migration:dry-run
```
This runs parsing, schema mapping, and audit calculations, outputting diagnostic reconciliation summaries without mutating the database.

### 4.4 Running Live Migration with Safety Controls

To run a live ingestion against an authorized database:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
set ALLOW_STAGING_IMPORT=true
node scripts/migration/run-excel-migration.js
```

> [!WARNING]
> Live migration execution is strictly locked by `migrationGuard.js`. Ingestion will fail with error `STAGING_IMPORT_LOCKED` unless `ALLOW_STAGING_IMPORT=true` is explicitly provided in the execution environment.

---

## 5. Local Development Workflow

### 5.1 Running Both Server and Client Concurrently

From the root workspace directory:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS
npm run dev
```
This boots:
- **Backend API:** `http://localhost:3001`
- **Frontend Vite Client:** `http://localhost:5173`

### 5.2 Running Backend and Frontend in Dedicated CMD Terminals

For cleaner logging during development:

**Terminal 1 (Backend Server):**
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npm run dev
```

**Terminal 2 (Frontend Client):**
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\client
npm run dev
```

---

## 6. Automated Testing Guide

NexTill POS features comprehensive automated test coverage spanning backend business logic, database constraints, migration parsing, and frontend UI interactions.

### 6.1 Running Backend Tests (Jest)

The backend test suite covers authentication, sales, credit accounts, inventory safety, financial ledgers, reverse logistics (returns), and legacy migration engines:

```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npm test
```

#### Running Specific Test Suites:

- **Sales & Checkout:**
  ```cmd
  npx jest src/tests/sales.test.js
  ```
- **Sales & Purchase Returns (Reverse Logistics):**
  ```cmd
  npx jest src/tests/salesReturn.test.js
  npx jest src/tests/purchaseReturn.test.js
  ```
- **Finance, Expenses & Fixed Assets:**
  ```cmd
  npx jest src/tests/finance.test.js
  ```
- **Inventory & Stock Adjustments:**
  ```cmd
  npx jest src/tests/stockAdjustment.test.js
  npx jest src/tests/inventory.test.js
  ```
- **Excel Migration Engine & Reconciliation:**
  ```cmd
  npx jest src/__tests__/excelWorkbookParsing.test.js
  npx jest src/__tests__/excelReferenceMapping.test.js
  npx jest src/__tests__/excelImportSafety.test.js
  npx jest src/__tests__/excelFinancialValidation.test.js
  npx jest src/__tests__/excelAuditsReconciliation.test.js
  npx jest src/__tests__/migrationStagingVerification.test.js
  ```

### 6.2 Running Frontend Tests (Vitest)

The frontend test suite covers cart calculations, keyboard shortcuts (`F1`-`F9`, Arrow keys), customer registration, thermal receipt rendering, return flows, and migration controls:

```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\client
npx vitest run
```
*Or with interactive UI:*
```cmd
npm run test:ui
```

### 6.3 Verifying Frontend Production Build

Always ensure the Vite production bundle builds cleanly with zero errors:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\client
npm run build
```

---

## 7. Troubleshooting Common Windows CMD Issues

### 7.1 `Environment variable not found: DATABASE_URL`
- **Cause:** Running Prisma commands from workspace root without setting `--prefix server`, or missing `server/.env`.
- **Solution:** Always run `cd server` before `npx prisma ...`, or run root scripts (`npm run db:deploy`, `npm run db:migrate`).

### 7.2 `Can't reach database server at localhost:5432`
- **Cause:** Local PostgreSQL Windows service is stopped.
- **Solution:** Open Windows Run (`Win + R`), type `services.msc`, locate `postgresql-x64-<version>`, and click **Start**. Or run as Administrator:
  ```cmd
  net start postgresql-x64-16
  ```

### 7.3 `STAGING_IMPORT_LOCKED` Error
- **Cause:** `migrationGuard.js` detected a cloud production/staging database (e.g. AWS Neon `.neon.tech`) and blocked mutation.
- **Solution:** If you are authorized to run a live import on staging, set `ALLOW_STAGING_IMPORT=true` in your environment or `server/.env`:
  ```cmd
  set ALLOW_STAGING_IMPORT=true
  node scripts/migration/run-excel-migration.js
  ```

### 7.4 Cloud PostgreSQL SSL Connection Errors (Neon)
- **Cause:** Missing SSL parameters in PostgreSQL connection string.
- **Solution:** Ensure `server/.env` appends `?sslmode=require&channel_binding=require` to the Neon `DATABASE_URL`.

### 7.5 Schema Drift or Out-of-Sync Migration History
- **Cause:** Database tables were manually altered or truncated without recording in `_prisma_migrations`.
- **Solution:** Inspect status:
  ```cmd
  cd server
  npx prisma migrate status
  ```
  In local development, you can completely reset the database:
  ```cmd
  npx prisma migrate reset
  ```
  *(Caution: `migrate reset` deletes all tables and re-applies migrations from scratch).*

### 7.6 `PrismaClientKnownRequestError` after Schema Change
- **Cause:** `@prisma/client` code artifacts were not regenerated following a schema modification.
- **Solution:** Run:
  ```cmd
  cd server
  npx prisma generate
  ```
