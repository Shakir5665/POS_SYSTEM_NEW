# NexTill POS — Phase 4B Data Quality & Quarantine Report

## 1. Executive Summary & Defect Catalog
A comprehensive automated audit of the repaired 28-sheet workbook (`NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx`) was executed to catalog all structural, transactional, and referential data quality anomalies prior to import.

### Key Data Quality Metrics
| Category | Evaluated | Clean Records | Discrepant / Flagged | Quarantined |
| :--- | :--- | :--- | :--- | :--- |
| **Sales Headers** | 20,602 | 14,789 | 5,813 | 81 |
| **Sale Items** | 162,123 | 162,122 | 1 | 1 |
| **Purchase Headers** | 2,710 | 2,645 | 65 | 65 |
| **Purchase Items** | 2,645 | 2,645 | 0 | 0 |
| **Stock Adjustments** | 1,081 | 1,081 | 0 | 0 |
| **Expenses** | 1 | 0 | 1 (Reclassified) | 0 |
| **Customer Master** | 9 | 4 unique phone | 5 duplicate phone | 0 (Deduplicated) |

---

## 2. Issue Taxonomy & Severity Classification

| Issue Code | Severity | Count | Trigger Condition | System Disposition |
| :--- | :--- | :--- | :--- | :--- |
| `HEADER_LINE_MISMATCH` | `WARNING` | 5,733 | Header grand total != sum of item subtotals | Imported; B/F reconciliation delta recorded; non-blocking |
| `MISSING_CHILD_ITEMS` | `BLOCKING` | 145 | Transaction header exists with 0 item lines (80 Sales + 65 Purchases) | Quarantined; excluded from transaction tables; logged in `MigrationIssue` |
| `NEGATIVE_QUANTITY` | `BLOCKING` | 1 | Line item has quantity <= 0 | Quarantined; line item and parent sale quarantined |
| `RECLASSIFIED_EXPENSE_CATEGORY` | `INFO` | 1 | Expense Category 5 ('home') | Reclassified to general overhead with audit trail |
| `DUPLICATE_PHONE_NUMBER` | `INFO` | 5 | Customer records sharing phone `0768666525` | Target phone set to null; original phone preserved in `LegacyIdMap.metadata` |

---

## 3. Detailed Incident Investigations

### 3.1 Missing Child Items (145 Transaction Headers)
* **Sales Headers (80 transactions):** 80 sales headers in `Sales` have zero corresponding records in `Sale_Items`. These transactions represent unrecorded or deleted POS cart checkouts.
* **Purchases Headers (65 transactions):** 65 purchase orders in `Purchases` have zero corresponding records in `Purchase_Items`.
* **Cross-Reference:** These 145 transactions match the supplementary `EXCEPTIONS` worksheet row-for-row (80 + 65 = 145).
* **Action Taken:** Both sets are placed into strict quarantine. No synthetic line items are fabricated.

### 3.2 Negative Quantity Item (Sale Item 141432)
* **Target Record:** Sale Item ID `141432` in Sale ID `16864`.
* **Field Value:** `Quantity: -3.000` (Negative line item in historical checkout).
* **Risk Assessment:** Injecting negative quantities into standard sales tables risks reversing financial metrics and inventory accounting.
* **Action Taken:** Quarantined. Line item and parent transaction `16864` are logged in `MigrationIssue` with code `NEGATIVE_QUANTITY` and quarantined.

### 3.3 Customer Phone Duplication
* **Target Records:** Customer IDs `2`, `4`, `5`, `7`, and `8` all contain phone number `0768666525`.
* **Prisma Constraint:** `Customer.phone` is `@unique`.
* **Action Taken:** To prevent primary database constraint failure while retaining customer history, duplicate phone entries on the `Customer` record are set to null, while the authentic historical phone number is preserved losslessly in `LegacyIdMap.metadata`.

### 3.4 Expense Category ID 5
* **Target Record:** Expense ID `113` (`EX_113`: "generator", 2,500.00) assigned to Category ID 5 (`home`).
* **Schema Resolution:** Category 5 does not exist in NexTill standard operational expense taxonomy. It is reclassified to general operational expenses with diagnostic metadata in `MigrationIssue`.
