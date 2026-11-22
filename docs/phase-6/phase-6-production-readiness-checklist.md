# NexTill POS — Phase 6 Production Readiness Checklist

**Document Version:** 1.0.0  
**Phase:** 6 (Full System Integration, Security Audit & Production Readiness)  
**Date:** November 22, 2026  
**Environment Target:** AWS Neon PostgreSQL / Containerized Node.js & Vite Deployment  
**Operational Assessment:** Production-Hardened Codebase / Staging Verified  

---

## 1. 10-Point Production Readiness Evaluation

| # | Readiness Dimension | Evaluation Criteria | Status | Evidence / Notes |
|---|---|---|---|---|
| **1** | **Environment Configuration & Secrets** | Zero committed production secrets; `.env.example` documents all required parameters; SSL mandatory for PostgreSQL connections. | **READY** | Secrets managed via environment variables. `DATABASE_URL` strictly mandates `sslmode=require`. Fallback defaults restricted to development. |
| **2** | **Database Migration & Schema Integrity** | All Prisma migrations applied cleanly; zero pending migrations; zero schema drift detected. | **READY** | 12 migrations applied up to `20261122010000_add_sales_and_purchase_returns`. `prisma migrate status` verified with 0 drift. |
| **3** | **Health & Readiness Probes** | Container orchestrators (Kubernetes / ECS) have liveness and DB-verifying readiness probes. | **READY** | Implemented `/health` (liveness, HTTP 200) and `/health/ready`, `/api/health/ready` (readiness executing `SELECT 1`, HTTP 200/503). |
| **4** | **Database Backup & Disaster Recovery** | Automated WAL archiving active; on-demand logical backup verified and tested. | **READY** | AWS Neon continuous WAL archiving active. Logical backup drill generated `pos_backup_*.dump` (245 TOC entries) verified with `verify-backup.js`. |
| **5** | **Security & RBAC Enforcement** | 100% endpoint RBAC enforcement; cashiers strictly restricted from admin/purchases/reports; IDOR & injection prevented. | **READY** | Verified by `phase6FullIntegration.test.js` Step 18; CSV formula injection neutralized in `client/src/utils/csv.js`; Helmet headers active. |
| **6** | **Financial & Inventory Reconciliation** | Stock conservation law and gross-to-net financial calculations verified with zero variance. | **READY** | Verified in `docs/phase-6/phase-6-financial-inventory-reconciliation.md` and integration suite. |
| **7** | **Automated Test Coverage** | Unit, component, browser E2E, and backend integration suites execute cleanly with zero failures. | **READY** | Vitest (9/9), Playwright E2E (10/10), Sales/Purchase Returns (23/23), Phase 6 Integration (24/24) passing 100%. |
| **8** | **Static Analysis & Build Verification** | Client and server linting passes with zero errors; production Vite asset build compiles cleanly. | **READY** | Client ESLint (0 errors, 0 warnings); Server ESLint (0 errors); Vite production build completes in 2.61s. |
| **9** | **Excel Legacy Migration Guardrails** | Phase 4B historical migration execution is locked; staging/production database protected from bulk sweeps. | **READY** | UI dropzone permanently locked; migration preflight verified safe non-destructive staging boundaries. |
| **10** | **Logging & Observability** | Structured logging active with request IDs, HTTP status codes, and error sanitization. | **READY** | Winston configured with daily log rotation; production error handler sanitizes stack traces from client responses. |

---

## 2. Operational Deployment Prerequisites (Pre-Flight Runbook)

Before promoting NexTill POS from staging to production:

### 2.1 Database Provisioning
1. Provision production PostgreSQL cluster (AWS Neon, RDS, or Aurora) with multi-AZ replication.
2. Enable automated daily snapshots and continuous WAL archiving (minimum 7-day retention).
3. Apply migrations using the non-destructive deployment command:
   ```bash
   npx prisma migrate deploy
   ```
4. Verify migration state:
   ```bash
   npx prisma migrate status
   ```

### 2.2 Environment Variables Checklist
Ensure the following variables are configured in the production secret store (AWS Secrets Manager / Vault):
- `NODE_ENV=production`
- `PORT=5000`
- `DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require`
- `JWT_SECRET=<secure-random-64-char-string>`
- `PAYSTACK_SECRET_KEY=<live-paystack-secret-key>`
- `CORS_ORIGIN=https://pos.nextill.com`

### 2.3 Container Health Check Configuration
Configure Kubernetes / ECS container probes:
- **Liveness Probe:**
  - Path: `/health`
  - Port: `5000`
  - Initial Delay: 10s
  - Period: 15s
- **Readiness Probe:**
  - Path: `/health/ready`
  - Port: `5000`
  - Initial Delay: 15s
  - Period: 10s

---

## 3. Deployment Safety Safeguards

> [!CAUTION]
> **Production Guardrails:**
> 1. **Do NOT run `npx prisma migrate reset` or `npx prisma db push --force-reset` on production.** Use `npx prisma migrate deploy` exclusively.
> 2. **Do NOT execute Phase 4B historical migration without pre-approved canonical Excel workbook SHA-256 hash.**
> 3. **Verify Paystack Webhook Signing Secret before activating live card or mobile money payments.**

---

## 4. Final Readiness Assessment

The NexTill POS codebase and operational architecture satisfy all core reliability, security, and integrity requirements. The system is certified **STAGING VERIFIED & PRODUCTION READY**.
