# NexTill POS — Phase 4B Staging Import Execution Runbook

**Document Version:** 1.0.0  
**Date:** November 22, 2026  
**Target Environment:** AWS Neon DASHPOS Staging Database  
**Current Guard Status:** **LOCKED (`STAGING_IMPORT_LOCKED`)**  
**Authorization Policy:** **NO STAGING IMPORT IS PERMITTED WITHOUT EXPLICIT STAKEHOLDER AUTHORIZATION**  

---

## 1. Purpose & Preconditions

This runbook defines the exact, authoritative operational procedure for executing the Phase 4B historical data import against the AWS Neon DASHPOS staging database **only after receiving separate, explicit human authorization**.

### Preconditions (Must Be Satisfied Prior to Execution):
1. **Explicit Human Sign-Off:** Written authorization from the project owner approving the staging execution window.
2. **Repository Clean State:** Working branch `phase-4b` verified clean with all reconciliation tests passing.
3. **Workbook File Present:** Authentic repaired workbook `NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx` located at project root with verified SHA-256:
   `6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7`.
4. **Staging Pre-Import Backup Verified:** Verified pre-migration backup dump must exist in `server/scripts/migration/backups/`.
5. **No Active POS Shifts:** Cash drawer shifts closed and no concurrent staging transactions in progress.

---

## 2. Pre-Import Verification Phase

Before unlocking execution, the operator must execute the preflight checks:

### Step 1: Verify Workbook SHA-256
```powershell
Get-FileHash -Path "NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx" -Algorithm SHA256
```
**Expected Output:**
`6C3ED8F9EB76C8FDF86898609AE1F120AD829DDBF8169DD574049E2DDE06EAF7`

### Step 2: Verify Existing Staging Backup
```powershell
cd server
node scripts/migration/verify-backup.js
```
**Expected Output:**
`[verify-backup] RESULT: ARCHIVE_VERIFIED (245 TOC entries, 169279 bytes)`

### Step 3: Take Fresh Staging Snapshot (Safety Precaution)
```powershell
# In server directory with staging DATABASE_URL loaded
node scripts/backup.js
```

---

## 3. Staging Execution Phase (Authorized Window Only)

> [!CAUTION]
> Live import against AWS Neon DASHPOS is permanently guarded. Do NOT remove guards or bypass validation logic.

### Step 4: Staging Import Invocation
When explicitly authorized, the migration operator executes the import via the server CLI:

```powershell
cd server
# Ensure staging DATABASE_URL is set in environment
$env:ALLOW_STAGING_IMPORT = "true"
node scripts/migration/run-migration.js --execute-excel --file "../NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx"
```

### Step 5: Monitoring Import Progress
The import engine outputs structured progress indicators:
- `[5%] PARSING`: Loading and validating workbook sheets.
- `[15%] VALIDATING`: Validating data and computing B/F financial totals.
- `[20%] INIT_BATCH`: Creating `MigrationBatch` record in staging DB.
- `[25%] CATEGORIES`: Importing 37 product categories.
- `[30%] CUSTOMERS`: Importing 9 customers.
- `[35%] SUPPLIERS`: Importing 1 supplier (SS-MART).
- `[40%] PRODUCTS`: Importing 4,170 products with 0 stock drift.
- `[50%] SALES`: Chunked ingestion of 20,521 sales and 162,113 sale items.
- `[75%] PURCHASES`: Chunked ingestion of 2,645 purchases and 2,645 purchase items.
- `[85%] ADJUSTMENTS`: Ingestion of 1,081 stock adjustments and 1,031 adjustment items.
- `[90%] EXPENSES`: Ingestion of authentic category "home" and Expense "EX_113".
- `[100%] COMPLETED`: Batch status updated to `COMPLETED`.

---

## 4. Post-Import Verification Phase

Immediately following import completion, the operator must execute the post-import integrity verification queries:

### Step 6: Verify Authoritative Invariants
Execute the automated post-import audit:
```powershell
cd server
node -e "
const prisma = require('./src/utils/prismaClient');
async function verify() {
  const [sales, saleItems, purchases, purchaseItems, adjs, adjItems, products, payments, logs, issues] = await Promise.all([
    prisma.sale.count({ where: { is_legacy_import: true } }),
    prisma.saleItem.count({ where: { sale: { is_legacy_import: true } } }),
    prisma.purchase.count({ where: { is_legacy_import: true } }),
    prisma.purchaseItem.count({ where: { purchase: { is_legacy_import: true } } }),
    prisma.stockAdjustment.count({ where: { is_legacy_import: true } }),
    prisma.stockAdjustmentItem.count({ where: { adjustment: { is_legacy_import: true } } }),
    prisma.product.count({ where: { is_legacy_import: true } }),
    prisma.payment.count(),
    prisma.inventoryLog.count(),
    prisma.migrationIssue.count(),
  ]);
  console.log('--- POST-IMPORT STAGING VERIFICATION ---');
  console.log('Imported Sales:           ', sales, sales === 20521 ? '✓ PASS' : '✗ FAIL');
  console.log('Imported Sale Items:      ', saleItems, saleItems === 162113 ? '✓ PASS' : '✗ FAIL');
  console.log('Imported Purchases:       ', purchases, purchases === 2645 ? '✓ PASS' : '✗ FAIL');
  console.log('Imported Purchase Items:  ', purchaseItems, purchaseItems === 2645 ? '✓ PASS' : '✗ FAIL');
  console.log('Imported Adjustments:     ', adjs, adjs === 1081 ? '✓ PASS' : '✗ FAIL');
  console.log('Imported Adjustment Items:', adjItems, adjItems === 1031 ? '✓ PASS' : '✗ FAIL');
  console.log('Imported Products:        ', products, products === 4170 ? '✓ PASS' : '✗ FAIL');
  console.log('Zero Payments Invariant:  ', payments === 0 ? '✓ PASS (0 fake payments)' : '✗ FAIL');
  console.log('Zero Logs Invariant:      ', logs === 0 ? '✓ PASS (0 inventory logs)' : '✗ FAIL');
  console.log('Total Migration Issues:   ', issues, issues === 5889 ? '✓ PASS (5889 expected)' : '✗ FAIL');
}
verify().finally(() => prisma.\$disconnect());
"
```

### Expected Post-Import Metrics:
- **Imported Sales:** 20,521
- **Imported Sale Items:** 162,113
- **Imported Purchases:** 2,645
- **Imported Purchase Items:** 2,645
- **Imported Stock Adjustments:** 1,081
- **Imported Stock Adjustment Items:** 1,031
- **Imported Products:** 4,170
- **Total Operational Records in `LegacyIdMap`:** 194,362
- **Zero Payment Rows:** PASS
- **Zero Inventory Logs:** PASS

---

## 5. Emergency Rollback Procedure

If any anomaly or discrepancy is detected post-import:

### Step 7: Rollback Execution
```powershell
cd server
# Replace <batch_id> with the UUID printed in Step 4 output
node scripts/migration/run-migration.js --rollback <batch_id>
```

### Rollback Guarantees:
- Cascading deletion of all 194,362 records belonging to the batch.
- Complete removal of `LegacyIdMap` records for the batch.
- Batch status set to `ROLLED_BACK`.
- Pre-existing operational records and live stock balances remain 100% intact.
- Rollback will be blocked automatically if any downstream transactions (returns, payments) have been created against imported records.

---

## 6. Execution Safety Sign-Off

This runbook is finalized and ready for operational deployment. **No execution against AWS Neon staging is authorized until explicit human instruction is provided.**
