# Master Plan & Architecture Blueprint: RJ Food POS System
**Target System**: RJ Food POS — Enterprise Data Archive & High-Performance Business Intelligence POS Viewer  
**Source Asset**: `RJ_Food_POS_Database_Export.xlsx` (16.7 MB legacy workbook containing 197,808 records across 24 worksheets)  
**Database Engine**: **Serverless PostgreSQL (Neon)**  
**Deliverable**: Master technical blueprint, PostgreSQL schema specification, API design, UI/UX interaction architecture, and the complete Master Prompt to empower any coding agent to rebuild this entire system from scratch.

---

## 1. Executive Vision & System Overview

### 1.1 Objective
Transform a raw, static, 16.7 MB Excel workbook export (`RJ_Food_POS_Database_Export.xlsx`) into a blazing-fast, responsive, read-only Point-of-Sale (POS) cloud data warehouse and business analytics dashboard connected to **Neon Serverless PostgreSQL**. The application provides instant search (<10ms across 197k+ records via PostgreSQL Full-Text Search `tsvector`/GIN indexing), relational drilldown, visual sales trends, CSV exports, and seamless deployment on Render.

### 1.2 Core Architectural Principles
1. **Cloud-Native Managed Database (Neon PostgreSQL)**: Hosted on Neon serverless PostgreSQL with connection pooling (`DATABASE_URL` via `pgbouncer`/pooled connection strings).
2. **Read-Only Application Security**: The application connects using a read-only role (`GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user`) or read-only connection pooling. No write, update, or delete endpoints exist, protecting financial history.
3. **Sub-10ms Full-Text Search**: Powered by native PostgreSQL Full-Text Search (`tsvector` + GIN indexes) with trigram (`pg_trgm`) support for prefix and substring matching across 197k+ rows.
4. **Zero Frontend Build Dependencies**: Vanilla modern ES6+ and CSS variables for frontend. No heavy frameworks (no React/Vue/Node build pipelines required, zero npm vulnerabilities).
5. **Modern POS Interface**: High-contrast, slate/navy enterprise palette, tactile typography (12px–14px baseline), instant keyboard navigation (<kbd>Ctrl+K</kbd>, <kbd>Esc</kbd>, arrows), and responsive split-views.

---

## 2. Ingestion & Database Architecture (Neon PostgreSQL)

### 2.1 Excel Ingestion Pipeline (`xlsx_to_postgres.py`)
The migration script ingests `RJ_Food_POS_Database_Export.xlsx` directly into Neon PostgreSQL:
* Connects via `psycopg2` or `asyncpg` using the Neon `DATABASE_URL` connection string.
* Reads worksheets using `openpyxl` or `calamine` in stream mode.
* Sanitizes worksheet names into lowercase snake_case tables (`t_<slug>`).
* Adds a synthetic autoincrement primary key `__rid BIGSERIAL PRIMARY KEY` to preserve original physical row order.
* Maps data types to robust PostgreSQL types: `BIGINT`, `NUMERIC(14, 2)`, `TEXT`, `TIMESTAMPTZ`, and `DATE`.
* Normalizes null-like strings (`NULL`, `None`, `nan`, `""`) to SQL `NULL`.
* Sanitizes and masks credential/secret fields in `settings` (e.g., mail passwords replaced with `[REDACTED]`).
* Populates metadata table `sheet_meta` and generates PostgreSQL GIN full-text search indexes.

### 2.2 PostgreSQL Database Schemas (All 24 Collections)

```
Database Engine: Neon Serverless PostgreSQL
Total Tables: 24 operational tables (prefixed with t_) + 2 system tables (sheet_meta, search_index)
```

#### Metadata & Search Index Tables
1. **`sheet_meta`**:
   ```sql
   CREATE TABLE sheet_meta (
     slug VARCHAR(64) PRIMARY KEY,
     title VARCHAR(128) NOT NULL,
     columns JSONB NOT NULL,
     row_count BIGINT NOT NULL,
     sheet_order INT NOT NULL,
     date_key VARCHAR(64)
   );
   ```
   * `slug`: Worksheet slug (e.g., `products`, `sales`).
   * `title`: Human-readable display title (e.g., `Products`, `Sales`).
   * `columns`: JSONB array defining `[{name, label, type}]`.
   * `row_count`: Total record count.
   * `sheet_order`: Logical ordering 1..24.
   * `date_key`: Primary date filtering column name or `NULL`.

2. **`search_index` (PostgreSQL Full-Text Search with GIN Index)**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;

   CREATE TABLE search_index (
     id BIGSERIAL PRIMARY KEY,
     dataset VARCHAR(64) NOT NULL,
     rid BIGINT NOT NULL,
     searchable TEXT NOT NULL,
     tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', searchable)) STORED
   );

   CREATE INDEX idx_search_tsv ON search_index USING gin(tsv);
   CREATE INDEX idx_search_trgm ON search_index USING gin(searchable gin_trgm_ops);
   CREATE INDEX idx_search_dataset_rid ON search_index(dataset, rid);
   ```

#### 24 Domain Tables
```mermaid
erDiagram
    WAREHOUSES ||--o{ SALES : "originates from"
    CUSTOMERS ||--o{ SALES : "places"
    SALES ||--|{ SALE_ITEMS : "contains"
    PRODUCTS ||--o{ SALE_ITEMS : "itemized in"

    SUPPLIERS ||--o{ PURCHASES : "fulfills"
    WAREHOUSES ||--o{ PURCHASES : "received at"
    PURCHASES ||--|{ PURCHASE_ITEMS : "contains"
    PRODUCTS ||--o{ PURCHASE_ITEMS : "purchased as"

    PRODUCT_CATEGORIES ||--o{ PRODUCTS : "categorizes"
    BRANDS ||--o{ PRODUCTS : "brands"
    BASE_UNITS ||--o{ UNITS : "base for"
    UNITS ||--o{ PRODUCTS : "measured by"

    PRODUCTS ||--o{ WAREHOUSE_STOCK_REPORT : "stocked in"
    WAREHOUSES ||--o{ WAREHOUSE_STOCK_REPORT : "holds"
    PRODUCTS ||--o{ STOCK_ALERTS : "triggers"

    WAREHOUSES ||--o{ ADJUSTMENTS : "adjusts stock at"
    ADJUSTMENTS ||--|{ ADJUSTMENT_ITEMS : "details"
    PRODUCTS ||--o{ ADJUSTMENT_ITEMS : "quantity adjusted"

    EXPENSE_CATEGORIES ||--o{ EXPENSES : "classifies"
    WAREHOUSES ||--o{ EXPENSES : "incurs"

    ROLES_PERMISSIONS ||--o{ USERS : "assigned to"
```

1. **`t_products` (4,171 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `product_id BIGINT`, `name TEXT`, `code_barcode TEXT`, `product_category TEXT`, `brand TEXT`, `product_cost NUMERIC(14,2)`, `product_price NUMERIC(14,2)`, `our_price NUMERIC(14,2)`, `product_unit TEXT`, `sale_unit TEXT`, `purchase_unit TEXT`, `stock_alert NUMERIC(12,2)`, `quantity_limit NUMERIC(12,2)`, `order_tax NUMERIC(12,2)`, `tax_type TEXT`, `notes TEXT`, `barcode_url TEXT`, `created_at TIMESTAMPTZ`.
2. **`t_sales` (20,644 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `sale_id BIGINT`, `reference_code TEXT`, `date TIMESTAMPTZ`, `customer_id BIGINT`, `customer_name TEXT`, `warehouse_id BIGINT`, `warehouse_name TEXT`, `grand_total NUMERIC(14,2)`, `paid_amount NUMERIC(14,2)`, `due_amount NUMERIC(14,2)`, `received_amount NUMERIC(14,2)`, `tax_rate NUMERIC(8,2)`, `tax_amount NUMERIC(14,2)`, `discount NUMERIC(14,2)`, `shipping NUMERIC(14,2)`, `payment_type TEXT`, `payment_status TEXT`, `status TEXT`, `is_return TEXT`, `note TEXT`, `barcode_url TEXT`, `created_at TIMESTAMPTZ`.
3. **`t_sale_items` (161,159 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `sale_item_id BIGINT`, `sale_id BIGINT`, `product_id BIGINT`, `product_name TEXT`, `product_code TEXT`, `product_price NUMERIC(14,2)`, `net_unit_price NUMERIC(14,2)`, `quantity NUMERIC(12,2)`, `unit TEXT`, `tax_type TEXT`, `tax_value NUMERIC(8,2)`, `tax_amount NUMERIC(14,2)`, `discount_type TEXT`, `discount_value NUMERIC(8,2)`, `discount_amount NUMERIC(14,2)`, `sub_total NUMERIC(14,2)`, `created_at TIMESTAMPTZ`.
4. **`t_purchases` (2,717 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `purchase_id BIGINT`, `reference_code TEXT`, `date TIMESTAMPTZ`, `supplier_id BIGINT`, `supplier_name TEXT`, `warehouse_id BIGINT`, `warehouse_name TEXT`, `grand_total NUMERIC(14,2)`, `tax_rate NUMERIC(8,2)`, `tax_amount NUMERIC(14,2)`, `discount NUMERIC(14,2)`, `shipping NUMERIC(14,2)`, `received_amount NUMERIC(14,2)`, `status TEXT`, `notes TEXT`, `created_at TIMESTAMPTZ`.
5. **`t_purchase_items` (2,647 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `item_id BIGINT`, `purchase_id BIGINT`, `product_id BIGINT`, `product_name TEXT`, `product_code TEXT`, `product_cost NUMERIC(14,2)`, `net_unit_cost NUMERIC(14,2)`, `quantity NUMERIC(12,2)`, `unit TEXT`, `tax_type TEXT`, `tax_value NUMERIC(8,2)`, `tax_amount NUMERIC(14,2)`, `discount_type TEXT`, `discount_value NUMERIC(8,2)`, `discount_amount NUMERIC(14,2)`, `sub_total NUMERIC(14,2)`, `created_at TIMESTAMPTZ`.
6. **`t_warehouse_stock_report` (4,171 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `stock_record_id BIGINT`, `warehouse_id BIGINT`, `warehouse_name TEXT`, `product_id BIGINT`, `product_name TEXT`, `product_code_barcode TEXT`, `category_name TEXT`, `current_quantity_on_hand NUMERIC(14,2)`, `unit TEXT`, `product_cost NUMERIC(14,2)`, `product_price NUMERIC(14,2)`, `our_price NUMERIC(14,2)`, `stock_alert_level NUMERIC(12,2)`, `quantity_limit NUMERIC(12,2)`.
7. **`t_stock_alerts` (10 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `product_id BIGINT`, `product_name TEXT`, `product_code TEXT`, `product_cost NUMERIC(14,2)`, `product_price NUMERIC(14,2)`, `stock_alert_level NUMERIC(12,2)`, `created_at TIMESTAMPTZ`.
8. **`t_adjustments` (1,081 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `adjustment_id BIGINT`, `reference_code TEXT`, `date TIMESTAMPTZ`, `warehouse_id BIGINT`, `warehouse_name TEXT`, `total_products INT`, `created_at TIMESTAMPTZ`.
9. **`t_adjustment_items` (1,028 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `adjustment_item_id BIGINT`, `adjustment_id BIGINT`, `product_id BIGINT`, `product_name TEXT`, `product_code TEXT`, `quantity NUMERIC(12,2)`, `method_type TEXT`, `method_description TEXT`, `sale_unit TEXT`, `created_at TIMESTAMPTZ`.
10. **`t_customers` (9 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `customer_id BIGINT`, `name TEXT`, `email TEXT`, `phone TEXT`, `country TEXT`, `city TEXT`, `address TEXT`, `created_at TIMESTAMPTZ`.
11. **`t_suppliers` (1 row)**: `__rid BIGSERIAL PRIMARY KEY`, `supplier_id BIGINT`, `name TEXT`, `email TEXT`, `phone TEXT`, `country TEXT`, `city TEXT`, `address TEXT`, `created_at TIMESTAMPTZ`.
12. **`t_product_categories` (37 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `category_id BIGINT`, `name TEXT`, `products_count INT`, `created_at TIMESTAMPTZ`.
13. **`t_brands` (51 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `brand_id BIGINT`, `name TEXT`, `products_count INT`, `image_url TEXT`, `created_at TIMESTAMPTZ`.
14. **`t_warehouses` (1 row)**: `__rid BIGSERIAL PRIMARY KEY`, `warehouse_id BIGINT`, `name TEXT`, `phone TEXT`, `country TEXT`, `city TEXT`, `email TEXT`, `zip_code TEXT`, `created_at TIMESTAMPTZ`.
15. **`t_units` (6 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `unit_id BIGINT`, `name TEXT`, `short_name TEXT`, `base_unit_id BIGINT`, `base_unit_name TEXT`, `created_at TIMESTAMPTZ`.
16. **`t_base_units` (6 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `base_unit_id BIGINT`, `name TEXT`, `created_at TIMESTAMPTZ`.
17. **`t_expenses` (1 row)**: `__rid BIGSERIAL PRIMARY KEY`, `expense_id BIGINT`, `date TIMESTAMPTZ`, `warehouse_id BIGINT`, `warehouse_name TEXT`, `expense_category_id BIGINT`, `expense_category_name TEXT`, `amount NUMERIC(14,2)`, `title TEXT`, `description TEXT`, `created_at TIMESTAMPTZ`.
18. **`t_expense_categories` (1 row)**: `__rid BIGSERIAL PRIMARY KEY`, `expense_category_id BIGINT`, `name TEXT`, `description TEXT`, `created_at TIMESTAMPTZ`.
19. **`t_users` (1 row)**: `__rid BIGSERIAL PRIMARY KEY`, `user_id BIGINT`, `first_name TEXT`, `last_name TEXT`, `email TEXT`, `phone TEXT`, `role TEXT`, `status TEXT`, `created_at TIMESTAMPTZ`.
20. **`t_roles_permissions` (2 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `role_id BIGINT`, `name TEXT`, `display_name TEXT`, `permissions_count INT`, `permissions_list TEXT`, `created_at TIMESTAMPTZ`.
21. **`t_currencies` (1 row)**: `__rid BIGSERIAL PRIMARY KEY`, `currency_id BIGINT`, `name TEXT`, `code TEXT`, `symbol TEXT`, `created_at TIMESTAMPTZ`.
22. **`t_settings` (39 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `setting_key TEXT`, `setting_value TEXT`.
23. **`t_warehouse_reports` (1 row)**: `__rid BIGSERIAL PRIMARY KEY`, `warehouse_id BIGINT`, `warehouse_name TEXT`, `total_sales_count INT`, `total_purchases_count INT`, `total_sales_return_count INT`, `total_purchases_return_count INT`.
24. **`t_overview` (23 rows)**: `__rid BIGSERIAL PRIMARY KEY`, `metric_entity TEXT`, `value TEXT`.

---

## 3. Backend Architecture & REST API Specification (PostgreSQL)

### 3.1 Server & Connection Management
The Python backend connects to Neon PostgreSQL using `psycopg2-binary` or `asyncpg` connection pooling:
* Connection string is read from the `DATABASE_URL` environment variable:
  `DATABASE_URL = os.environ.get("DATABASE_URL")`
* Reads `HOST` (default `0.0.0.0`) and `PORT` (default `8765`), making it natively Render-ready.
* Supports Neon connection pooling (`?sslmode=require` with pooler endpoint).
* Queries run with strict SQL parameterization (`%s` placeholders) to prevent SQL injection.

### 3.2 Endpoints Summary

#### `GET /api/bootstrap`
* **Purpose**: Single-turn initial page load.
* **Returns**: All collections metadata (`DATASETS`), sheet configurations, and the complete initial dashboard dataset.

#### `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`
* **Purpose**: Financial reporting and operational metrics for any date range using PostgreSQL aggregates:
  ```sql
  SELECT COUNT(*), COALESCE(SUM(grand_total), 0), COALESCE(SUM(paid_amount), 0), COALESCE(SUM(due_amount), 0)
  FROM t_sales WHERE date >= %s AND date < %s;
  ```
* **Response**:
  ```json
  {
    "sales_count": 20644,
    "gross_sales": 142859042.50,
    "paid_sales": 139100200.00,
    "due_sales": 3758842.50,
    "purchase_count": 2717,
    "purchase_total": 89450120.00,
    "products": 4171,
    "stock_records": 4171,
    "customers": 71,
    "alert_count": 10,
    "latest_sale_date": "2023-11-15",
    "trend": [{"period": "2023-10-16", "count": 112, "amount": 650000.0}],
    "trend_label": "Daily sales · latest 30 days in archive",
    "trend_unit": "daily",
    "top_products": [{"name": "Basmati Rice 5kg", "amount": 420000.0, "units": 150}],
    "recent_sales": [{"rid": 1, "reference": "INV-2023-001", "date": "2023-11-15", "customer": "Nimal Silva", "total": 12500.0}],
    "alerts": [{"rid": 10, "name": "Anchor Butter 200g", "code": "PRD-0045", "price": 850.0}],
    "stock_outliers": 0
  }
  ```

#### `GET /api/table/{slug}?page=1&limit=25&sort=col&dir=asc|desc&q=term&from=YYYY-MM-DD&to=YYYY-MM-DD`
* **Purpose**: Paginated, filtered, and sorted table explorer for any of the 24 collections.
* **SQL Query Structure**:
  ```sql
  -- Search join using Neon PostgreSQL Full-Text Search
  SELECT t.* FROM t_products t
  JOIN search_index s ON s.rid = t.__rid AND s.dataset = 'products'
  WHERE s.tsv @@ websearch_to_tsquery('english', %s)
  ORDER BY t.product_price DESC, t.__rid DESC
  LIMIT %s OFFSET %s;
  ```

#### `GET /api/record/{slug}/{rid}`
* **Purpose**: Comprehensive detail inspection of a single record, including relational joins:
  * `sales` ➔ Linked `sale_items`.
  * `purchases` ➔ Linked `purchase_items`.
  * `products` ➔ Linked `warehouse_stock_report`, sales history, purchase history.
  * `customers` ➔ Linked invoice history.

#### `GET /api/search?q={query}`
* **Purpose**: Multi-collection full-text search across all 24 sheets using PostgreSQL `websearch_to_tsquery` and trigram similarity. Returns top 80 relevance-ranked matches in <10ms.

#### `GET /api/export/{slug}?q=...&from=...&to=...&sort=...&dir=...`
* **Purpose**: Streamed UTF-8 BOM CSV download of all records matching active filter conditions (immune to pagination cuts). Includes CSV injection formula escaping (`'` prefix for `=, +, -, @`).

---

## 4. UI/UX Architecture & Modern POS Design System

### 4.1 Layout Structure (Split-View POS Layout)
* **Dark Enterprise Navy Sidebar (`#0a1120` to `#172a46`)**:
  * Brand badge with active pulse status indicator.
  * Instant search filter for collections.
  * **Categorized Collapsible Navigation Groups**:
    1. 📊 *Sales & Billing*
    2. 📦 *Inventory & Catalog*
    3. 🚚 *Procurement & Suppliers*
    4. 👥 *Customers & Users*
    5. ⚙️ *Store Master & Settings*
* **Workspace Surface (`#f4f6fa`)**:
  * Topbar: Breadcrumbs, global search trigger (<kbd>Ctrl+K</kbd>), active database badge ("Neon PostgreSQL Connected"), POS terminal avatar.
  * Dynamic view switcher: **Dashboard** vs **Data Explorer**.

### 4.2 High-Impact Usability Features
1. **Interactive SVG Revenue Trendline**:
   * Pure mathematical SVG polyline with gradient area fill.
   * Mouse scrubber displaying dynamic floating tooltips with exact Gross Sales (Rs.), Invoice Count, and Date.
2. **Click-to-Sort Table Headers**:
   * Instant header sorting (`▲`/`▼`) with sticky first column (record reference/code).
   * Visual horizontal scroll edge shadows (`scroll-edge`) signaling hidden columns.
3. **Quick Date Presets**:
   * Single-click presets: `All Time`, `Last 30 Days`, `Last 90 Days`, `This Year`.
   * Date continuity: Clicking *"View Sales Table"* from the dashboard carries active date filters directly into the table.
4. **Slide-Over Inspection Drawer with History Navigation**:
   * Primary vs. Technical field separation (hides internal database foreign keys under an accordion).
   * Navigation stack with a **"← Back"** button for retracing multi-level entity drilldowns (Invoice ➔ Line Item ➔ Product ➔ Alert).
   * Action bar: **"Print Record / Invoice"** and **"Copy JSON"**.
5. **Keyboard Power Shortcuts**:
   * <kbd>Ctrl + K</kbd>: Opens global search with live query highlighting.
   * <kbd>↑</kbd> / <kbd>↓</kbd> / <kbd>Enter</kbd>: Navigates search results.
   * <kbd>Esc</kbd>: Closes modals, drawers, and menus.

---

## 5. Deployment Architecture (Render + Neon PostgreSQL)

1. **Neon PostgreSQL Database**:
   * Provisioned via [Neon.tech](https://neon.tech) (Free Tier provides 0.5 GB storage and pooled connection strings).
   * Connection string passed as an environment variable in Render: `DATABASE_URL=postgres://user:pass@ep-xyz-pooler.neon.tech/neondb?sslmode=require`.
2. **Environment Port & Host Binding**:
   * Server dynamically reads `PORT` and `HOST` from Render's cloud environment. Suppresses browser launch (`webbrowser.open`) when running in containerized environments (`os.environ.get('RENDER')`).
3. **HTTP Security Headers**:
   * Emits strict headers (`nosniff`, `X-Frame-Options: DENY`, `no-referrer`, Content-Security-Policy).

---

## 6. Coding Agent Master Prompt (Neon PostgreSQL Edition)

Below is the turnkey prompt to feed to any autonomous coding agent or developer to rebuild this exact system from the raw Excel spreadsheet using **Neon PostgreSQL**.

***

### 🤖 COPY-PASTE AGENT MASTER PROMPT:

```markdown
You are an expert Principal Full-Stack Engineer and Lead UI/UX Designer. 
Your goal is to build a complete, high-performance, cloud-connected, read-only Point-of-Sale (POS) Data Archive & Business Intelligence Web Application from scratch using only a single legacy Excel export workbook: `RJ_Food_POS_Database_Export.xlsx`, backed by a Neon PostgreSQL serverless database.

### 1. SPECIFICATIONS & TECH STACK
- Database Engine: Neon Serverless PostgreSQL (`DATABASE_URL` with SSL connection pooling).
- Backend: Python 3.9+ (http.server.ThreadingHTTPServer, psycopg2-binary or asyncpg, json, csv, urllib). No heavy frameworks (no Django/FastAPI needed; keep runtime lean and robust).
- Ingestion: Python script (`xlsx_to_postgres.py`) using openpyxl and psycopg2 to ingest all 24 sheets of `RJ_Food_POS_Database_Export.xlsx` into Neon PostgreSQL.
- Frontend: Vanilla HTML5, modern CSS3 variables, Vanilla modern ES6+ JS. No React, Vue, or npm build step. High-contrast modern POS theme (Dark Navy `#0d1829` sidebar, crisp light surface `#f4f6fa`).

### 2. DATABASE INGESTION (`xlsx_to_postgres.py`)
1. Connect to Neon PostgreSQL using `os.environ["DATABASE_URL"]`.
2. Read all 24 sheets from `RJ_Food_POS_Database_Export.xlsx`.
3. Sanitize sheet names to lowercase snake_case table names (`t_<slug>`).
4. Add an auto-incrementing `__rid BIGSERIAL PRIMARY KEY` to preserve original physical order.
5. Map data types to PostgreSQL: BIGINT, NUMERIC(14,2), TIMESTAMPTZ, and TEXT.
6. Identify primary date column for sheets having dates (e.g. `date` for sales, `created_at` for products).
7. Redact password/secret keys in `settings` with `[REDACTED]`.
8. Create `sheet_meta` table storing: `(slug VARCHAR PRIMARY KEY, title VARCHAR, columns JSONB, row_count BIGINT, sheet_order INT, date_key VARCHAR)`.
9. Create Full-Text Search indexing in PostgreSQL:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE TABLE search_index (
     id BIGSERIAL PRIMARY KEY,
     dataset VARCHAR(64) NOT NULL,
     rid BIGINT NOT NULL,
     searchable TEXT NOT NULL,
     tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', searchable)) STORED
   );
   CREATE INDEX idx_search_tsv ON search_index USING gin(tsv);
   CREATE INDEX idx_search_trgm ON search_index USING gin(searchable gin_trgm_ops);
   ```
   Index key text fields (name, reference_code, product_code, customer_name, barcode, phone) into this table.

### 3. BACKEND SERVER (`server.py`)
Implement `ThreadingHTTPServer` on `HOST = os.environ.get('HOST', '0.0.0.0')` and `PORT = int(os.environ.get('PORT', 8765))`.
Connect to Neon PostgreSQL via `DATABASE_URL`.
Endpoints required:
1. `GET /api/bootstrap`: Returns all sheet metadata from `sheet_meta` + complete initial dashboard metrics.
2. `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`: Returns gross revenue, purchase total, product count, alert count, top 7 selling products, recent 6 sales, stock alerts, and sales trend array (grouped daily if <=65 days, monthly if >65 days) using PostgreSQL SQL aggregates.
3. `GET /api/table/<slug>?page=1&limit=25&sort=col&dir=asc|desc&q=term&from=...&to=...`: Paginated table query joining `search_index` via `tsv @@ websearch_to_tsquery('english', %s)` when `q` is provided.
4. `GET /api/record/<slug>/<rid>`: Full row dictionary + related records (e.g., sales line items, product purchase lines).
5. `GET /api/search?q=<term>`: PostgreSQL FTS query returning top 80 matched records with snippet and collection title.
6. `GET /api/export/<slug>?...`: Streams UTF-8 BOM CSV with Excel formula injection defense (`'` escape).
7. Static file handler for `/`, `/styles.css`, `/app.js`, `/favicon.svg`.

### 4. MODERN POS FRONTEND & UI/UX (`index.html`, `styles.css`, `app.js`)
1. **Sidebar Navigation**:
   - Categorize collections into 5 logical groups: Sales & Billing, Inventory & Catalog, Procurement & Suppliers, Customers & Users, Store Master & Settings.
   - Quick sidebar text filter to search collection names instantly.
2. **Executive Dashboard**:
   - 4 KPI cards: Total Revenue (LKR), Total Purchases, Active Catalog, Stock Alerts.
   - Interactive SVG Sales Trend Chart: Smooth line + area gradient fill with mouse hover scrubber and floating tooltip showing exact date, revenue in Rs., and transaction count.
   - Date range selector with instant presets: All Time, Last 30 Days, Last 90 Days, This Year.
3. **Data Explorer**:
   - Table headers (`<th>`) with direct click-to-sort and `▲`/`▼` indicator.
   - Horizontal scroll indicators with left/right fade shadows.
   - Direct jump-to-page input (`Page [ 14 ] of 120`).
   - Column visibility selector popover.
   - Clean currency formatting: `Rs. 12,500.00` and tabular numbers.
4. **Slide-Over Detail Drawer**:
   - Drill-down navigation stack with a working "← Back" button.
   - Core functional attributes highlighted; technical IDs collapsed in an accordion.
   - "Print Record / Invoice" and "Copy JSON" action buttons.
5. **Global Search Modal (Ctrl + K)**:
   - Floating search overlay with query term highlighting in `<mark>` tags.
   - Arrow keys (`↑`/`↓`) and `Enter` keyboard selection.

Generate clean, robust, thoroughly commented code files. Test the connection against Neon PostgreSQL.
```
***
