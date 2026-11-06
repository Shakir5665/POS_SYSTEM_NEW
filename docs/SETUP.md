# Setup Guide — GhanaShop POS System

This guide covers everything needed to get the POS system running from scratch on a development machine.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 22.12+ | [nodejs.org](https://nodejs.org) |
| npm | 10+ | Bundled with Node.js |
| PostgreSQL | 15+ | [postgresql.org](https://www.postgresql.org) |
| Git | Any | For cloning the repository |

### Verify your environment

```bash
node --version   # should be v20.x or higher
npm --version    # should be v10.x or higher
psql --version   # should be 15.x or higher
```

---

## 1. Clone the Repository

```bash
git clone <repo-url>
cd pos-system
```

---

## 2. Database Setup

### Create the PostgreSQL database

```bash
# Connect to PostgreSQL as the default superuser
psql -U postgres

# Inside psql, create the database and a dedicated user
CREATE DATABASE pos_db;
CREATE USER pos_user WITH ENCRYPTED PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE pos_db TO pos_user;
\q
```

Or use a single command if you have `createdb` in your PATH:

```bash
createdb pos_db
```

---

## 3. Backend Setup

```bash
cd server
npm install
```

### Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# Database — replace with your credentials
DATABASE_URL="postgresql://pos_user:your_password_here@localhost:5432/pos_db"

# JWT Secrets — generate strong random strings (see below)
JWT_ACCESS_SECRET="replace-with-256-bit-random-string"
JWT_REFRESH_SECRET="replace-with-different-256-bit-random-string"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Server
PORT=3001
NODE_ENV="development"

# CORS — must match your frontend URL
CORS_ORIGIN="http://localhost:5173"

# Cookie domain
COOKIE_DOMAIN="localhost"
```

**Generate secure JWT secrets:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run this command twice — once for `JWT_ACCESS_SECRET` and once for `JWT_REFRESH_SECRET`.

### Run database migrations

```bash
npx prisma migrate deploy
```

This applies the migrations committed in `prisma/migrations/`, creating all tables, indexes, and relationships.

If your database was created earlier with `prisma db push` or `migrate dev --name init`, don't run the baseline again. Mark it as applied instead:

```bash
npx prisma migrate resolve --applied 0_init
```

When you change `prisma/schema.prisma`, create a migration with `npx prisma migrate dev --name describe_your_change` and commit it. `migrate dev` needs a database user that can create databases (for Prisma's temporary shadow database). If you get `permission denied to create database`, grant it with `ALTER USER <user> CREATEDB;`.

### Seed the database

```bash
npx prisma db seed
```

> **Warning:** seeding first **deletes all existing data** (users, products, customers, sales, settings) and then inserts sample data with well-known passwords. Only seed a fresh development database. The script refuses to run when `NODE_ENV=production`; to override that deliberately, set `ALLOW_DESTRUCTIVE_SEED=true`.

This populates the database with:
- 3 users (one per role)
- 6 categories
- 50+ products with realistic prices and barcodes
- 10 customers with Ghanaian names
- 20 sample sales spread over the past 30 days

**Default login credentials after seeding:**

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Manager | `manager` | `manager123` |
| Cashier | `cashier` | `cashier123` |

### Start the backend server

```bash
npm run dev
```

The API will be available at `http://localhost:3001`. Check the health endpoint:

```bash
curl http://localhost:3001/api/health
# {"success":true,"data":{"status":"ok",...}}
```

---

## 4. Frontend Setup

```bash
cd ../client
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`.

---

## 5. Verify the Setup

1. Open `http://localhost:5173` in your browser.
2. You will be redirected to `/login`.
3. Log in with `admin` / `admin123`.
4. You should land on the Dashboard with today's KPIs and charts populated from seed data.

---

## Production Deployment Notes

### Environment differences

Set `NODE_ENV=production` in the server's `.env`. This affects:
- Cookie `secure` flag (requires HTTPS)
- Morgan logging format
- Error response verbosity (stack traces hidden)

### Frontend build

```bash
cd client
npm run build
```

The built assets are output to `client/dist/`. Serve them with Nginx, Caddy, or any static file server. Point the reverse proxy to the Express API for `/api/*` routes.

### Example Nginx config snippet

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/client/dist;
    index index.html;

    # Serve frontend SPA
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Express
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Serve uploaded product images
    location /uploads/ {
        alias /path/to/server/uploads/;
    }
}
```

---

## Available Scripts

### Backend (`server/`)

| Script | Command | Description |
|---|---|---|
| Start (dev) | `npm run dev` | Start with nodemon (auto-restart) |
| Start (prod) | `npm start` | Start without nodemon |
| Run tests | `npm test` | Jest + Supertest with coverage |
| Watch tests | `npm run test:watch` | Re-run on file change |
| Migrations | `npm run db:migrate` | Run pending Prisma migrations |
| Seed data | `npm run db:seed` | Populate database with sample data |
| Studio | `npm run db:studio` | Open Prisma visual DB browser |
| Backup | `npm run db:backup` | Create timestamped PostgreSQL dump |
| Lint | `npm run lint` | ESLint check |

### Frontend (`client/`)

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | Vite dev server at :5173 |
| Build | `npm run build` | Production build to `dist/` |
| Preview | `npm run preview` | Serve the production build locally |
| Run tests | `npm test` | Vitest component tests |
| Lint | `npm run lint` | ESLint check |

---

## Database Backup & Restore

### Create a backup

```bash
cd server
npm run db:backup
# Output: server/backups/pos_backup_2026-03-19T10-30-00.dump
```

### Restore a backup

```bash
pg_restore -d pos_db --clean --if-exists server/backups/pos_backup_2026-03-19T10-30-00.dump
```

---

## Troubleshooting

### `Error: connect ECONNREFUSED 127.0.0.1:5432`

PostgreSQL is not running. Start it:

```bash
# macOS (Homebrew)
brew services start postgresql@15

# Ubuntu/Debian
sudo systemctl start postgresql

# Windows
# Start "PostgreSQL" from Services (services.msc)
```

### `Error: Invalid `prisma.user.findMany()` invocation`

The database schema is out of sync. Run:

```bash
npx prisma migrate deploy
```

### `Error: P1001: Can't reach database server`

Check that `DATABASE_URL` in `.env` has the correct username, password, host, port, and database name.

### CORS errors in the browser

Verify that `CORS_ORIGIN` in `server/.env` exactly matches the URL shown in your browser (including port). No trailing slash.

### JWT errors (`JsonWebTokenError: invalid signature`)

The `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` in `.env` has changed since tokens were issued. Clear browser cookies and log in again.

### Prisma Studio shows no data after seeding

Check the seeder output for errors:

```bash
cd server
npx prisma db seed
```

If the seed fails midway, the transaction is rolled back. Fix the error and re-run.

---

## Project Structure

```
pos-system/
├── client/                    # React 18 + Vite frontend
│   ├── src/
│   │   ├── components/        # Button, Input, Modal, Table, Badge, Pagination
│   │   ├── pages/             # LoginPage, POSPage, ProductsPage, InventoryPage, ...
│   │   ├── layouts/           # AuthLayout, DashboardLayout
│   │   ├── hooks/             # useAuth
│   │   ├── context/           # AuthContext, CartContext, SettingsContext
│   │   ├── services/          # Axios API clients per module
│   │   ├── utils/             # formatCurrency
│   │   └── App.jsx
│   ├── tailwind.config.js
│   └── package.json
│
├── server/                    # Node.js 22 + Express backend
│   ├── src/
│   │   ├── routes/            # auth, products, inventory, sales, customers, reports, users, settings
│   │   ├── controllers/       # One controller file per module
│   │   ├── services/          # Business logic per module
│   │   ├── middleware/        # authenticate, authorize, validate, errorHandler, logger
│   │   └── utils/             # prismaClient, generateTransactionId, errors
│   ├── prisma/
│   │   ├── schema.prisma      # All models, enums, relations, indexes
│   │   ├── migrations/        # Auto-generated migration files
│   │   └── seed.js            # Sample data seeder
│   ├── scripts/
│   │   └── backup.js          # Database backup script
│   ├── .env.example
│   └── package.json
│
└── docs/
    ├── API.md                 # Full API endpoint reference
    ├── DATABASE.md            # Schema and data model documentation
    └── SETUP.md               # This file
```

---

## Further Reading

- [API Reference](API.md) — All endpoints, request/response shapes, and error codes
- [Database Schema](DATABASE.md) — Table definitions, relationships, and design decisions
- [Prisma Documentation](https://www.prisma.io/docs) — ORM reference
- [Tailwind CSS](https://tailwindcss.com/docs) — Utility class reference
