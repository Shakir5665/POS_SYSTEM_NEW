# NexTill POS — Phase 4B Source Analysis & Workbook Provenance

## 1. Executive Summary & Provenance Verification
This document establishes the verified cryptographic provenance, structural composition, and comprehensive row inventory of the authentic RJ Food POS database export repaired workbook used for **NexTill POS Phase 4B**.

The source workbook was repaired to ensure structural zip integrity and valid worksheet XML schemas without altering authoritative business transaction data.

| Metric | Repaired Import Workbook (Phase 4B) | Original Export (Reference) |
| :--- | :--- | :--- |
| **Filename** | `NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx` | `POS_Complete_Export_v4.xlsx` / Original |
| **File Size** | 13,789,816 bytes (13.15 MB) | ~12.8 MB |
| **SHA-256 Fingerprint** | `6c3ed8f9eb76c8fdf86898609ae1f120ad829ddbf8169dd574049e2dde06eaf7` | `e3d837e544b020f68c032575e40cc76fb0de8e4cca464d4fdc9bd64005f697f9` |
| **ZIP Magic Header** | `0x50, 0x4B, 0x03, 0x04` (PK..) | `0x50, 0x4B, 0x03, 0x04` (PK..) |
| **Worksheet Count** | 28 worksheets (21 original + 7 supplementary) | 21 worksheets |
| **Data Integrity** | Complete, repair confirmed, 100% readable | Repaired for open-xml parsing |

> [!IMPORTANT]
> The original source data remains strictly authoritative. The 7 supplementary worksheets (`START_HERE`, `RECON_SUMMARY`, `SALES_BF`, `PURCHASES_BF`, `EXCEPTIONS`, `NEGATIVE_LINES`, `SHEET_MAPPING`) are utilized exclusively for reconciliation cross-referencing and data quality validation. They are never imported as additional transactions.

---

## 2. Complete 28-Worksheet Inventory

The workbook contains exactly 28 worksheets with verified row counts:

### Core Source Worksheets (21 Sheets)
| # | Worksheet Name | Data Row Count | Target Domain | Authoritative Role |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `Overview` | 21 | Metadata | Summary of export sheets & counts (Audit only, not imported) |
| 2 | `Products` | 4,170 | Master Data | Product catalogue, prices, barcoding, alerts |
| 3 | `Sales` | 20,602 | Transactions | Historical sales headers, timestamps, reference codes |
| 4 | `Sale_Items` | 162,123 | Transactions | Historical transaction line items, quantities, prices |
| 5 | `Purchases` | 2,710 | Transactions | Vendor purchasing headers, reference codes, totals |
| 6 | `Purchase_Items` | 2,645 | Transactions | Vendor purchase line items, unit costs, quantities |
| 7 | `Adjustments` | 1,081 | Audit | Historical physical stock adjustment headers |
| 8 | `Adjustment_Items` | 1,031 | Audit | Historical stock adjustment line items |
| 9 | `Customers` | 9 | Reference | Historical customer master data (POS accounts) |
| 10 | `Suppliers` | 1 | Reference | Historical supplier master record (RJ Foods) |
| 11 | `Product_Categories` | 37 | Reference | Product category hierarchy |
| 12 | `Brands` | 51 | Reference | Manufacturer and brand names |
| 13 | `Warehouses` | 1 | Reference | Historical POS main store warehouse |
| 14 | `Units` | 6 | Reference | Operational units (Kg, Box, Packet, etc.) |
| 15 | `Base_Units` | 6 | Reference | Fundamental SI units (kg, pc, etc.) |
| 16 | `Expenses` | 1 | Accounting | Historical operational expense records |
| 17 | `Expense_Categories` | 1 | Reference | Historical expense category taxonomy |
| 18 | `Users` | 1 | Security/Audit | Historical POS system user (System audit only) |
| 19 | `Roles_Permissions` | 2 | Security/Audit | Legacy permissions matrix (Audit only) |
| 20 | `Currencies` | 1 | Reference | Operational currency definition (LKR) |
| 21 | `Settings` | 39 | Configuration | Historical POS system configuration (Audit only) |

### Supplementary Reconciliation Worksheets (7 Sheets)
| # | Supplementary Sheet | Row Count | Primary Purpose & Contents |
| :--- | :--- | :--- | :--- |
| 22 | `START_HERE` | 16 | Guide to repair notes, sheet layout, and audit findings |
| 23 | `RECON_SUMMARY` | 7 | Summary metrics of sales and purchase B/F discrepancies |
| 24 | `SALES_BF` | 5,813 | Catalog of all 5,813 sales with header vs item subtotals variance |
| 25 | `PURCHASES_BF` | 65 | Catalog of all 65 purchases with header vs item subtotals variance |
| 26 | `EXCEPTIONS` | 145 | Quarantined transaction headers (80 sales + 65 purchases with 0 line items) |
| 27 | `NEGATIVE_LINES` | 1 | Specific exception: Sale Item ID `141432` in Sale `16864` (Qty: -3.000) |
| 28 | `SHEET_MAPPING` | 21 | Explicit cross-walk mapping specifications |

**Total Data Rows across 28 Sheets:** `198,162 rows`.

---

## 3. Structural & Schema Integrity Findings

1. **ZIP Magic Bytes & Decompression:**
   The workbook is a fully compliant ECMA-376 Office Open XML package. Decompression and buffer verification confirm all XML relationships, shared string tables, and worksheet streams parse deterministically with 0 byte truncation.

2. **Source Identifiers:**
   All primary keys across `Products` (Product ID 1–4170), `Sales` (Sale ID 1–20602), `Sale_Items` (Item ID 1–162123), `Purchases` (Purchase ID 1–2710), and `Purchase_Items` (Item ID 1–2645) are unique in their primary worksheets. Zero primary key duplicates were found within core entity tables.

3. **Orphan Analysis:**
   - 0 orphan `Sale_Items` exist (every line item points to a valid parent `Sale ID`).
   - 0 orphan `Purchase_Items` exist (every line item points to a valid parent `Purchase ID`).
   - 0 orphan `Adjustment_Items` exist.

4. **Missing Children (Header without Items):**
   - 80 Sales headers (0 line items present in `Sale_Items`).
   - 65 Purchases headers (0 line items present in `Purchase_Items`).
   Both sets match the supplementary `EXCEPTIONS` sheet exactly (80 + 65 = 145 exception headers).

5. **Customer Phone Duplication:**
   5 customer records share phone `0768666525`. Handled in Phase 4B by nullifying duplicate unique fields on the target model while preserving original numbers in `LegacyIdMap.metadata`.
