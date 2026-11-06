# DASHPOS System

A full-featured, web-based Point of Sale system for retail businesses, built as a capstone project. Supports multi-role access (Admin, Manager, Cashier), real-time inventory tracking, sales processing, customer loyalty, receipt printing, and business analytics.

---

## Features

- **POS Screen** — Barcode scanner support, keyboard shortcuts (F1/F2/F4), cart management, payment processing (Cash, Mobile Money, Card), and printable thermal receipts (80mm)
- **Product Management** — Full CRUD with image upload, SKU/barcode lookup, soft-delete
- **Inventory Management** — Real-time stock deduction on sale, restock, manual adjustment, low-stock alerts, full audit log
- **Customer Management** — Customer registration, purchase history, automatic loyalty points
- **Sales & Refunds** — Atomic transactions with full rollback; refund restores stock and reverses loyalty points
- **Reporting & Analytics** — Daily sales charts, top products, category performance, cashier performance, profit report
- **User Management** — Role-based access control (Admin, Manager, Cashier), account lockout after 5 failed attempts
- **Settings** — Configurable store name, address, tax rate, currency symbol, loyalty rate, receipt footer
- **Security** — JWT auth (15 min access + 7 day refresh tokens), bcrypt password hashing, rate limiting, audit logging

---

## Screenshots

> **Note:** Run the app and log in with the seed credentials to see these screens.

**Dashboard** — Today's KPIs, daily revenue chart, and top 5 products by revenue.

![Dashboard](docs/screenshots/dashboard.png)

**POS Screen** — Two-panel layout: product search/grid on the left, cart and payment on the right. Supports barcode scanner and keyboard shortcuts.

![POS Screen](docs/screenshots/pos.png)

**Receipt** — Printable 80mm thermal receipt rendered in-browser after every sale.

![Receipt](docs/screenshots/receipt.png)

**Inventory Management** — Stock levels with low-stock alerts and one-click restock.

![Inventory](docs/screenshots/inventory.png)

> To add your own screenshots: run the app, capture the screens above, and save them to `docs/screenshots/`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| State Management | React Context + useReducer |
| Backend | Node.js 22 + Express |
| ORM | Prisma 5 |
| Database | PostgreSQL 15+ |
| Auth | JWT (access + refresh tokens) |
| Testing | Vitest (frontend) + Jest/Supertest (backend) |

---

## Prerequisites

- Node.js 22.12+ (the frontend test runner, Vitest 5, needs it)
- PostgreSQL 15+
- npm 10+

---

## Run with Docker

The quickest way to run everything locally. Needs Docker with Compose v2.24 or newer; no local Node.js or PostgreSQL is required.

```bash
docker compose up --build

# First run only, in another terminal: sample data and the logins below
docker compose exec api npx prisma db seed
```

- App: http://localhost:5173
- API: http://localhost:3001
- PostgreSQL: `localhost:5433` (user `pos`, password `pos`, database `pos_db`)

Code changes in `server/` and `client/` reload automatically. The database lives in the `db-data` volume and survives restarts; `docker compose down -v` deletes it. For Paystack, put your keys in `server/.env` (`PAYSTACK_SECRET_KEY`) and `client/.env` (`VITE_PAYSTACK_PUBLIC_KEY`); the API's database and JWT settings come from `docker-compose.yml`.

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone <repo-url>
cd pos-system
```

### 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/pos_db"
JWT_ACCESS_SECRET="your-256-bit-secret-here"
JWT_REFRESH_SECRET="your-other-256-bit-secret-here"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3001
NODE_ENV="development"
CORS_ORIGIN="http://localhost:5173"
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database setup

```bash
# Create the database
createdb pos_db

# Apply the committed migrations
npx prisma migrate deploy

# Seed with sample data (50+ products, 10 customers, 20 sample sales)
# Warning: deletes all existing data first; refuses to run with NODE_ENV=production
npx prisma db seed
```

### 4. Frontend setup

```bash
cd ../client
npm install
```

### 5. Start the development servers

In two separate terminals:

```bash
# Terminal 1 — backend
cd server
npm run dev   # starts on http://localhost:3001

# Terminal 2 — frontend
cd client
npm run dev   # starts on http://localhost:5173
```

---

## Default Login Credentials (Seed Data)

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Manager | `manager` | `manager123` |
| Cashier | `cashier` | `cashier123` |

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens (min 256-bit) | — |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (min 256-bit) | — |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `PORT` | Express server port | `3001` |
| `NODE_ENV` | Environment (`development`/`production`) | `development` |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:5173` |
| `COOKIE_DOMAIN` | Cookie domain for refresh token | `localhost` |

---

## Database Setup Commands

```bash
# Apply all pending migrations
npx prisma migrate deploy

# After editing schema.prisma, create a new migration
# (needs a database user with CREATEDB permission for Prisma's shadow database)
npx prisma migrate dev --name describe_your_change

# Existing database created before migrations were committed (with db push):
# mark the baseline as applied instead of re-creating tables
npx prisma migrate resolve --applied 0_init

# Seed the database with sample data
npx prisma db seed

# Open Prisma Studio (visual DB browser)
npm run db:studio

# Create a timestamped database backup
npm run db:backup
```

---

## Running Tests

GitHub Actions (`.github/workflows/ci.yml`) runs the server tests against a fresh PostgreSQL database, and client lint, tests and build, on every pull request and every push to `main`.

```bash
# Backend tests (requires a running PostgreSQL database configured in .env)
cd server
npm test

# Frontend tests
cd client
npm test
```

---

## Project Structure

```
pos-system/
├── client/                    # React frontend (Vite)
│   └── src/
│       ├── components/        # Button, Input, Modal, Table, Badge, Pagination
│       ├── pages/             # LoginPage, POSPage, ProductsPage, InventoryPage, ...
│       ├── layouts/           # AuthLayout, DashboardLayout
│       ├── hooks/             # useAuth
│       ├── context/           # AuthContext, CartContext
│       ├── services/          # API client (axios) per module
│       └── utils/             # formatCurrency
│
├── server/                    # Node.js/Express backend
│   ├── src/
│   │   ├── routes/            # Auth, Products, Inventory, Sales, Customers, Reports, Users, Settings
│   │   ├── controllers/       # Request handlers
│   │   ├── services/          # Business logic
│   │   ├── middleware/        # authenticate, authorize, validate, errorHandler, logger
│   │   └── utils/             # Prisma client, generateTransactionId, errors
│   └── prisma/
│       ├── schema.prisma      # Database schema
│       ├── migrations/        # Prisma migration files
│       └── seed.js            # Sample data seeder
│
└── docs/
    ├── API.md                 # API endpoint reference
    ├── DATABASE.md            # Schema documentation
    └── SETUP.md               # Detailed setup guide
```

---

## API Overview

Base URL: `http://localhost:3001/api`

All responses follow the format:
```json
{ "success": true, "data": { ... }, "message": "..." }
```

| Module | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me` |
| Products | `GET/POST /products`, `GET/PUT/DELETE /products/:id`, `GET /products/barcode/:code` |
| Categories | `GET/POST /categories` |
| Inventory | `GET /inventory`, `GET /inventory/low-stock`, `POST /inventory/restock`, `POST /inventory/adjust` |
| Sales | `GET/POST /sales`, `GET /sales/:id`, `GET /sales/:id/receipt`, `POST /sales/:id/refund` |
| Customers | `GET/POST /customers`, `GET/PUT /customers/:id`, `GET /customers/:id/purchases` |
| Reports | `GET /reports/sales-summary`, `/reports/sales-by-day`, `/reports/top-products`, `/reports/category-performance`, `/reports/cashier-performance`, `/reports/profit` |
| Users | `GET/POST /users`, `GET/PUT /users/:id`, `POST /users/:id/unlock` |
| Settings | `GET/PUT /settings` |

See [docs/API.md](docs/API.md) for the full reference.

---

## Currency

Default currency: **GHS (Ghana Cedis)** — displayed as `GH₵ 1,234.56`. Configurable via Settings.

---

## License

MIT
