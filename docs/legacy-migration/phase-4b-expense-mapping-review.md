# NexTill POS — Phase 4B Critical Audit D: Expense Classification & Category Mapping Review

**Document Version:** 1.0.0  
**Date:** November 22, 2026  
**Target Workbook:** `NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx`  
**Workbook SHA-256:** `6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7`  
**Database Target:** Isolated PostgreSQL 17 Database (`nextill_isolated_phase4b`)  

---

## 1. Audit Context & Discrepancy Discovery

The historical workbook contains operating expense records:
- **`Expenses` worksheet:** Exactly 1 row.
  - Expense ID: `3`
  - Reference Code: `EX_113`
  - Date: `2024-09-08`
  - Amount: `10,000.00 LKR` *(Note: previous prompt report referenced 2,500.00; authentic workbook inspection establishes exact source amount as 10,000.00 LKR)*
  - Title / Reason: `genarator`
  - Category ID: `5`
- **`Expense_Categories` worksheet:** Exactly 1 row.
  - Category ID: `5`
  - Name: `home`

### Investigation Findings:
1. **Unauthorized Semantic Reclassification:** The previous implementation automatically reclassified Expense `EX_113` from category `home` to a synthetic target category named "Store Utilities / General" without human authorization, and failed to import authentic category `home`.
2. **Accounting Integrity Risk:** Modifying expense classifications during automated migration falsifies historical transaction semantics and risks auditing non-compliance. A retail generator fuel expense labeled "home" in legacy might represent personal owner drawings or store operating overhead; the importer cannot guess this intent.

---

## 2. Technical Resolution & Enforced Requirements

The importer was modified to enforce strict historical fidelity:

1. **Authentic Category Preservation:**
   - Category ID `5` with name `home` is imported directly into the `ExpenseCategory` table.
   - `LegacyIdMap` records mapping: `source_system: 'legacy_pos'`, `entity_type: 'ExpenseCategory'`, `legacy_id: '5'`.
2. **Authentic Expense Association:**
   - Expense `EX_113` (ID 3) is imported into `Expense` linked directly to category `home` (`category_id: <uuid_of_home>`).
   - Original expense reference (`EX_113`), amount (`10,000.00 LKR`), business date (`2024-09-08`), and notes (`"genarator"`) are 100% preserved.
3. **Formal Administrative Proposal Mechanism:**
   - Instead of mutating the classification, an informational `MigrationIssue` is created:
     - `issue_code: 'EXPENSE_CATEGORY_RECLASSIFICATION_PROPOSAL'`
     - `severity: 'INFO'`
     - `resolution_status: 'UNRESOLVED'`
     - `metadata`:
       - `source_category_id: 5`
       - `source_category_name: 'home'`
       - `proposed_target_category: 'Store Utilities / General'`
       - `proposed_reason: 'Operational generator expense for retail store'`
       - `original_reference: 'EX_113'`
       - `original_amount: 10000.00`
       - `requires_admin_approval: true`
4. **Zero Impact on Accounting Balances:**
   - No ledger balances, payment rows, or cash drawer shifts are altered.

---

## 3. Reconciliation Matrix

| Entity | Legacy ID | Reference | Date | Source Amount | Source Category | Target Classification | Target Status |
|---|---|---|---|---|---|---|---|
| **ExpenseCategory** | 5 | N/A | N/A | N/A | `home` | `home` | **Imported Authentically** |
| **Expense** | 3 | `EX_113` | 2024-09-08 | 10,000.00 | `home` (ID 5) | `home` | **Imported Authentically** |
| **Reclassification Proposal** | 3 | `EX_113` | 2024-09-08 | 10,000.00 | `home` | `Store Utilities / General` | **Pending Admin Review (`MigrationIssue`)** |

---

## 4. Verification Evidence

1. **Automated Unit & Reconciliation Tests:**
   - `server/src/__tests__/excelAuditsReconciliation.test.js`:
     - Test: `should verify authentic Expense ID 3 has amount 10000.00 and category ID 5 "home"`.
     - Test: `should verify ExpenseCategory "home" is imported without unauthorized reclassification`.
     - Test: `should verify EXPENSE_CATEGORY_RECLASSIFICATION_PROPOSAL is logged for admin review`.
   - 100% PASS in isolated test environment.
2. **Database Verification (`run-isolated-dry-run.js`):**
   - Verified that `prisma.expenseCategory.findFirst({ where: { name: 'home' } })` returns authentic ID 5.
   - Verified that `prisma.expense.findFirst({ where: { notes: { contains: 'genarator' } } })` has `amount: 10000.00` and points to category `home`.
   - Verified that `EXPENSE_CATEGORY_RECLASSIFICATION_PROPOSAL` issue exists in `migration_issues`.

---

## 5. Audit Conclusion

Critical Audit D is **FULLY RESOLVED**. The historical classification of Expense `EX_113` and Category `home` is preserved with absolute historical fidelity. Semantic reclassification requires explicit administrator approval via the governance UI/API.
