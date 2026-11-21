# NexTill POS — Baseline Test Results

> [!IMPORTANT]
> This document records the **actual execution results** of all baseline commands run on the existing codebase.
> No application code was altered to make failing tests or linters pass.
> Execution date: **2026-11-21T22:20:00+05:30**
> Git branch: `phase-1/legacy-migration-baseline` (base commit `3801ebd`)

---

## 1. Summary of Baseline Execution

| Command | Working Dir | Exit Code | Status | Suites Passed / Total | Tests Passed / Total | Details |
|---|---|---|---|---|---|---|
| `npx prisma validate` | `server/` | `0` | **PASS** | N/A | N/A | Schema valid |
| `npm run build` | repo root | `0` | **PASS** | N/A | N/A | Vite client production build succeeded |
| `npm test` | repo root (`server/`) | `0` | **PASS** | 17 / 17 | 190 / 190 | All backend tests passed after resolving test fixture isolation |
| `npm --prefix client exec vitest run` | `client/` | `1` | **FAIL** | 0 / 0 | 0 / 0 | No test files found in client |
| `npm --prefix server run lint` | `server/` | `1` | **FAIL** | N/A | N/A | Missing ESLint configuration |
| `npm --prefix client run lint` | `client/` | `1` | **FAIL** | N/A | N/A | 1 error, 2 warnings |
| `npx jest scripts/migration/__tests__` | `server/` | `0` | **PASS** | 2 / 2 | 31 / 31 | Migration unit tests passed |

---

## 2. Detailed Command Results

### 2.1 Prisma Schema Validation
- **Command:** `npx prisma validate` (executed in `server/`)
- **Exit Code:** `0`
- **Status:** **PASS**
- **Output:**
  ```text
  Environment variables loaded from .env
  Prisma schema loaded from prisma\schema.prisma
  The schema at prisma\schema.prisma is valid 🚀
  ```
- **Environmental Limitations:** None. Validated against current `server/prisma/schema.prisma` containing 22 models and 8 enums.

---

### 2.2 Client Production Build
- **Command:** `npm run build` (`npm --prefix client run build` -> `vite build`)
- **Exit Code:** `0`
- **Status:** **PASS**
- **Build Duration:** 2.92s
- **Modules Transformed:** 681 modules
- **Output Artifacts:**
  ```text
  dist/index.html                   0.77 kB │ gzip:   0.42 kB
  dist/assets/index-Db3_-UVE.css   34.32 kB │ gzip:   6.57 kB
  dist/assets/index-CHy8jYJJ.js   936.66 kB │ gzip: 256.95 kB
  ```
- **Warnings:**
  - `Browserslist: browsers data (caniuse-lite) is 8 months old.`
  - `(!) Some chunks are larger than 500 kB after minification.` (Main bundle is 936.66 kB).

---

### 2.3 Backend Test Suite (`npm test`)
- **Command:** `npm test` (`npm --prefix server test` -> `jest --coverage --forceExit --runInBand`)
- **Exit Code:** `0`
- **Status:** **PASS**
- **Test Suites:** 17 total (17 passed, 0 failed)
- **Tests:** 190 total (190 passed, 0 failed, 0 skipped)
- **Execution Time:** 305.054s (~5.1 minutes)
- **Root Cause Analysis of Initial 5 Failures:**
  - Initial run experienced 5 failures in `server/src/__tests__/sales.test.js`.
  - Investigation revealed stale test data in the database with static unique constraints:
    1. Static payment references (`MOMO-REF-12345`, `CARD-TEST-001`, `MOMO-REUSE-TEST-001`) previously persisted under user `admin`.
    2. Static SKU (`SALES-TEST-LAST`) left orphaned with `category_id: null` after prior category deletion.
  - The `beforeAll` cleanup in `sales.test.js` only checked `['SALES-TEST-A', 'SALES-TEST-B']` and only deleted sales belonging to `sales_test_cashier`/`sales_test_manager`.
  - After updating `sales.test.js` test fixture cleanup to include all test-created SKUs and payment references, all 43 tests in `sales.test.js` and all 190 tests across all 17 test suites passed cleanly without modifying any business logic or weakening any assertions.
- **Passing Suites (17/17):**
  1. `server/src/__tests__/sales.test.js` (43 tests passed)
  2. `server/src/__tests__/auth.test.js`
  3. `server/src/__tests__/businessFinance.test.js`
  4. `server/src/__tests__/customerCreditSales.test.js`
  5. `server/src/__tests__/inventory.test.js`
  6. `server/src/__tests__/paystackSignature.test.js`
  7. `server/src/__tests__/productPricing.test.js`
  8. `server/src/__tests__/requestLimits.test.js`
  9. `server/src/__tests__/salesDiscounts.test.js`
  10. `server/src/__tests__/salesUom.test.js`
  11. `server/src/__tests__/seedGuard.test.js`
  12. `server/src/__tests__/settings.test.js`
  13. `server/src/__tests__/suppliersAndPurchases.test.js`
  14. `server/src/__tests__/uom.test.js`
  15. `server/src/__tests__/users.test.js`
  16. `server/scripts/migration/__tests__/preflight.test.js`
  17. `server/scripts/migration/__tests__/check-readiness.test.js`
- **Code Coverage Summary:**
  - Statements: 67.43%
  - Branches: 48.71%
  - Functions: 64.93%
  - Lines: 69.51%
- **Rule Adherence:** As required by Phase 1 guidelines, no application logic was modified to force tests in `sales.test.js` to pass.

---

### 2.4 Frontend Unit Tests (`npm --prefix client exec vitest run`)
- **Command:** `npm --prefix client exec vitest run` / `cd client && npx vitest run`
- **Exit Code:** `1`
- **Status:** **FAIL (NO TESTS CONFIGURED)**
- **Test Suites:** 0
- **Tests:** 0
- **Output:**
  ```text
  No test files found, exiting with code 1
  include: **/*.{test,spec}.?(c|m)[jt]s?(x)
  exclude: **/node_modules/**, **/.git/**
  ```
- **Analysis:**
  - Vitest v5.0.3 is installed in `client/package.json`.
  - There are currently zero test files matching `*.test.*` or `*.spec.*` anywhere in `client/src`.
  - When executed from repository root without directory scoping, Vitest erroneously scans `server/src/__tests__` and fails with `ReferenceError: jest is not defined` because server tests use Jest syntax.
  - When executed inside `client/`, it correctly identifies that no frontend test files exist.

---

### 2.5 Server Linter (`npm --prefix server run lint`)
- **Command:** `npm --prefix server run lint` (`eslint src/`)
- **Exit Code:** `1`
- **Status:** **FAIL (CONFIG MISSING)**
- **Output:**
  ```text
  ESLint: 8.57.1
  ESLint couldn't find a configuration file. To set up a configuration file for this project, please run:
      npm init @eslint/config
  ```
- **Analysis:**
  - `eslint` v8.57.1 is declared in `server/package.json` devDependencies.
  - No `.eslintrc`, `.eslintrc.js`, `.eslintrc.json`, or `eslint.config.js` exists in the `server` directory or repository root.
  - Lint configuration is absent from the existing repository baseline.

---

### 2.6 Client Linter (`npm --prefix client run lint`)
- **Command:** `npm --prefix client run lint` (`eslint src/`)
- **Exit Code:** `1`
- **Status:** **FAIL (LINT ERRORS PRESENT)**
- **Output:**
  ```text
  client\src\pages\InventoryPage.jsx
    46:6  warning  React Hook useEffect has a missing dependency: 'activeTab'  react-hooks/exhaustive-deps

  client\src\pages\POSPage.jsx
    754:9  error  'ourPrice' is assigned a value but never used  no-unused-vars

  client\src\pages\SalesPage.jsx
    42:6  warning  React Hook useEffect has missing dependencies: 'endDate' and 'startDate'  react-hooks/exhaustive-deps

  ✖ 3 problems (1 error, 2 warnings)
  ```
- **Analysis:**
  - Client uses ESLint v9 flat config.
  - One unused variable error in `POSPage.jsx` line 754 and two missing useEffect hook dependency warnings.
  - Unmodified per Phase 1 non-interference rules.

---

### 2.7 Migration Tooling Unit Tests
- **Command:** `npx jest scripts/migration/__tests__ --forceExit` (in `server/`)
- **Exit Code:** `0`
- **Status:** **PASS**
- **Test Suites:** 2 passed, 2 total
- **Tests:** 31 passed, 31 total
- **Execution Time:** 2.357s
- **Suites:**
  - `preflight.test.js`: 13 tests covering connection parsing, host masking, credential redaction, production pattern detection, and target safety gating.
  - `check-readiness.test.js`: 18 tests covering audit validation, schema gap detection, missing parent reference verification, doc presence, and deterministic status calculation using in-memory synthetic fixtures.
- **Database Dependency:** Zero database calls. 100% pure unit tests.

---

## 3. Environmental State & Discrepancy Record

| Component | Documented Expectation | Actual Verified State | Status |
|---|---|---|---|
| Server Tests | Passing | 17/17 suites passed; 190/190 tests passed | Verified |
| Client Tests | Documented as Vitest | Vitest installed, 0 test files exist | Discrepancy documented |
| Server Lint | Documented as ESLint | ESLint installed, config file missing | Discrepancy documented |
| Client Lint | Documented as ESLint | 1 error + 2 warnings in existing pages | Discrepancy documented |
| Prisma Schema | 22 models | Validated: 22 models, 8 enums | Verified |
| Client Build | Vite build | Validated: builds clean in 2.92s | Verified |
