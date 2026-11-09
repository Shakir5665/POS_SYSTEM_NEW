# NexTill POS — Database Migration, Setup & Local Testing Guide (Windows CMD)

This guide provides step-by-step instructions and copy-pasteable Windows Command Prompt (`cmd.exe`) commands for running database migrations, setting up the environment, seeding sample data, running the application, and executing tests.

---

## 1. Quick Command Reference (CMD Cheat Sheet)

All commands can be run directly in Windows Command Prompt (`cmd.exe`). You can either run them from the project root (`NexTill_POS`) or inside the `server` directory.

### From Project Root (`C:\Users\shaki\Desktop\NexTill_POS`):

| Action | Windows CMD Command |
| :--- | :--- |
| **Apply all pending migrations** | `npm run db:deploy` |
| **Create & apply new migration (Dev)** | `npm run db:migrate` |
| **Regenerate Prisma Client** | `npm --prefix server run prisma:generate` |
| **Seed initial database (Admin, Settings)** | `npm run db:seed` |
| **Open Prisma Studio (Visual DB GUI)** | `npm run db:studio` |
| **Run both Backend + Frontend** | `npm run dev` |
| **Run Backend Tests (Jest - 160 tests)** | `npm run test` |
| **Run Frontend Tests (Vitest - 130 tests)** | `npm --prefix client test -- run` |
| **Build Frontend for Production** | `npm run build` |

### Directly inside Server Directory (`cd server`):

| Action | Windows CMD Command |
| :--- | :--- |
| **Apply pending migrations** | `npx prisma migrate deploy` |
| **Create new migration** | `npx prisma migrate dev --name <migration_name>` |
| **Check migration status** | `npx prisma migrate status` |
| **Regenerate Prisma Client** | `npx prisma generate` |
| **Reset database & re-run migrations** | `npx prisma migrate reset` |
| **Seed sample data** | `npx prisma db seed` |
| **Launch Prisma Studio** | `npx prisma studio` |

---

## 2. Environment Setup

### 2.1 Server Configuration (`server/.env`)

Before running database migrations, ensure your PostgreSQL connection URL is configured in `server/.env`.

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
   - **Cloud PostgreSQL (Neon / Supabase / Render / AWS RDS):**
     ```env
     DATABASE_URL="postgresql://user:password@ep-sample-pool.neon.tech/neondb?sslmode=require"
     ```
5. Ensure JWT secrets are defined (or generate a random 32-byte hex):
   ```cmd
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

### 2.2 Client Configuration (`client/.env`)

1. Navigate to the `client` directory:
   ```cmd
   cd C:\Users\shaki\Desktop\NexTill_POS\client
   ```
2. If `.env` does not exist, copy from `.env.example`:
   ```cmd
   copy .env.example .env
   ```

---

## 3. Database Migration Procedures

NexTill uses Prisma ORM with versioned SQL migrations stored in `server/prisma/migrations/`.

### 3.1 Applying Migrations to an Existing or New Database

Use `prisma migrate deploy` to apply all unapplied migration files without prompting or altering schema files. This is the safest command for local testing, staging, and production.

```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma migrate deploy
```
*Or from the root directory:*
```cmd
npm run db:deploy
```

**What this does:**
1. Connects to PostgreSQL using `DATABASE_URL`.
2. Inspects `_prisma_migrations` table.
3. Applies any pending migrations in chronological order:
   - `0_init`
   - `20261010000000_add_sale_refund_request`
   - `20261012000000_add_sale_loyalty_points_earned`
   - `20261025000000_add_paystack_payment`
   - `20261107000000_add_uom_support`
   - `20261109000000_add_product_pricing_architecture`
   - `20261109010000_add_customer_credit_and_payments`
   - `20261109020000_add_suppliers_and_purchases`
   - `20261109030000_add_business_finance_models`
   - `20261109040000_make_product_category_nullable_set_null`

### 3.2 Checking Migration Status

To inspect which migrations are already applied and which are pending:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma migrate status
```

### 3.3 Regenerating Prisma Client

Whenever the database schema changes, regenerate the TypeScript/JavaScript client bindings:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma generate
```

### 3.4 Creating a New Migration (Development Only)

When you make changes to `server/prisma/schema.prisma` and need to generate a new migration:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma migrate dev --name <describe_your_change>
```
*Example:*
```cmd
npx prisma migrate dev --name add_barcode_scanner_preference
```
This will:
1. Compare `schema.prisma` against your database schema.
2. Generate a new SQL migration file under `server/prisma/migrations/<timestamp>_add_barcode_scanner_preference/migration.sql`.
3. Apply the SQL to your database.
4. Automatically run `prisma generate`.

### 3.5 Seeding Initial & Sample Data

To populate the database with default store settings, admin/manager/cashier accounts, test categories, products, and customers:

```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma db seed
```
*Or from root:*
```cmd
npm run db:seed
```

> **Default Seed Accounts:**
> - **Admin:** username `admin` | password `admin123` | role `ADMIN`
> - **Manager:** username `manager` | password `manager123` | role `MANAGER`
> - **Cashier:** username `cashier` | password `cashier123` | role `CASHIER`

*(Note: The seed script contains a safety guard preventing accidental data wipes when `NODE_ENV=production`.)*

### 3.6 Inspecting Data with Prisma Studio

To visually explore, query, and edit database records in your web browser:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npx prisma studio
```
*Or from root:*
```cmd
npm run db:studio
```
Prisma Studio opens automatically at `http://localhost:5555`.

---

## 4. Local Development Workflow

### 4.1 Running Both Server and Client Concurrently

From the root workspace directory, run:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS
npm run dev
```
This boots:
- **Backend API:** `http://localhost:3001`
- **Frontend Vite Client:** `http://localhost:5173`

### 4.2 Running Backend and Frontend in Separate CMD Terminals

If you prefer dedicated terminal windows for cleaner log separation:

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

## 5. Local Testing Guide

NexTill includes full automated test coverage for both backend business logic and frontend UI components.

### 5.1 Running Backend Tests (Jest)

The backend test suite covers authentication, sales transactions, credit sales, customer repayments, supplier purchases, finance transactions (expenses, assets, capital), audit logs, and reports.

```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\server
npm test
```
*Or to run in watch mode during development:*
```cmd
npm run test:watch
```
*Or to run a specific test suite:*
```cmd
npx jest src/tests/sales.test.js
npx jest src/tests/finance.test.js
npx jest src/tests/purchases.test.js
npx jest src/tests/customers.test.js
```

### 5.2 Running Frontend Tests (Vitest)

The frontend test suite covers cart calculations, keyboard shortcuts (`F1`-`F9`, Arrow keys), customer quick registration, credit checkout modal, thermal receipt rendering, and finance management.

```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\client
npx vitest run
```
*Or to run Vitest in interactive watch mode:*
```cmd
npm test
```
*Or to run Vitest with the UI dashboard:*
```cmd
npm run test:ui
```
*Or to run a specific frontend test file:*
```cmd
npx vitest run src/tests/cartCalculations.test.js
npx vitest run src/tests/receiptModel.test.js
npx vitest run src/tests/usePOSKeyboard.test.js
```

### 5.3 Verifying Frontend Production Build

Always test that the Vite production build succeeds with zero errors before committing or deploying:
```cmd
cd C:\Users\shaki\Desktop\NexTill_POS\client
npm run build
```

---

## 6. Troubleshooting Common Windows CMD Issues

### 6.1 `Environment variable not found: DATABASE_URL`
- **Cause:** Running `npx prisma ...` from the workspace root where `.env` is not present, or `server/.env` is missing.
- **Solution:** Always run Prisma commands inside `server` (`cd server && npx prisma ...`), or run the root npm scripts (`npm run db:deploy`, `npm run db:migrate`) which set `--prefix server`.

### 6.2 `Can't reach database server at localhost:5432`
- **Cause:** PostgreSQL Windows service is not running.
- **Solution:** 
  1. Open Windows Run dialog (`Win + R`), type `services.msc`, and press Enter.
  2. Locate `postgresql-x64-<version>`, right-click, and click **Start**.
  3. Alternatively, in CMD as Administrator:
     ```cmd
     net start postgresql-x64-16
     ```

### 6.3 Schema Drift or Out-of-Sync Migration History
- **Cause:** Database tables were manually altered without a migration file.
- **Solution:**
  To view differences:
  ```cmd
  cd server
  npx prisma migrate status
  ```
  In a local development environment, you can reset and recreate all tables cleanly:
  ```cmd
  npx prisma migrate reset
  ```
  *(Caution: `migrate reset` deletes all data and re-runs all migrations followed by seed).*

### 6.4 `PrismaClientKnownRequestError` after Schema Change
- **Cause:** `@prisma/client` artifacts in `node_modules` were not updated after schema edit.
- **Solution:** Run:
  ```cmd
  cd server
  npx prisma generate
  ```
