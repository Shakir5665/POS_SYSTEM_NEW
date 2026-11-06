# Deploying NexTill to Render (render.com)

This guide walks you through deploying the complete NexTill application (React frontend + Express API + PostgreSQL database) to [Render](https://render.com).

---

## Architecture Overview

NexTill is configured as a **unified production build**:
- Express serves both the REST API (`/api/*`), product image uploads (`/uploads/*`), and the compiled React production single-page application (`client/dist`).
- This guarantees:
  - **Zero CORS issues**.
  - **No third-party cookie restrictions** (refresh token cookies work seamlessly on the same origin).
  - Requires only **1 Web Service** and **1 PostgreSQL Database** on Render, fitting cleanly within Render's hosting limits.

---

## Method 1: Automatic Deployment with Render Blueprint (Recommended)

Render Blueprints allow you to provision both the database and web service with a single click using the included [`render.yaml`](../render.yaml).

### Step 1: Push your code to GitHub / GitLab
Make sure all your latest changes are committed and pushed to your repository:
```bash
git add .
git commit -m "Configure production deployment for Render"
git push origin main
```

### Step 2: Deploy on Render
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. In the top right, click **New +** and select **Blueprint**.
3. Connect your Git repository (`DASHPOS`).
4. Render will detect `render.yaml` and list two resources to create:
   - `dashpos-db` (PostgreSQL Database)
   - `dashpos` (Web Service)
5. Click **Apply**.
6. Render will:
   - Provision the PostgreSQL database.
   - Automatically link the database connection string.
   - Generate secure random secrets for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
   - Build both the client and server.
   - Run database migrations (`prisma migrate deploy`).
   - Start the web service.

---

## Method 2: Manual Setup via Render Dashboard

If you prefer to configure the services manually:

### Step 1: Create the PostgreSQL Database
1. In Render Dashboard, click **New +** > **PostgreSQL**.
2. Configure:
   - **Name**: `dashpos-db`
   - **Database**: `pos_db`
   - **User**: `pos_user`
   - **Region**: Choose the region closest to you (e.g., Singapore or Frankfurt).
   - **Plan**: `Free` (or `Starter` for persistent backups).
3. Click **Create Database**.
4. Once created, find the **Connections** section and copy the **Internal Database URL** (e.g. `postgres://pos_user:xxx@dpg-xxx-a/pos_db`).

### Step 2: Create the Web Service
1. In Render Dashboard, click **New +** > **Web Service**.
2. Connect your Git repository.
3. Configure the settings:
   - **Name**: `dashpos`
   - **Region**: Same region as your database.
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm run render:build
     ```
   - **Start Command**:
     ```bash
     npm run render:start
     ```
   - **Plan**: `Free` (or `Starter`).

### Step 3: Add Environment Variables
Under the **Environment** tab of your new Web Service, add the following key-value pairs:

| Variable | Value / Description |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Paste the **Internal Database URL** from Step 1 |
| `JWT_ACCESS_SECRET` | Generate a 64-char random hex string *(see below)* |
| `JWT_REFRESH_SECRET` | Generate a different 64-char random hex string |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `STORE_NAME` | `SKR Stores` *(or your store name)* |
| `STORE_ADDRESS` | `Colombo, Kalmunai` |
| `STORE_PHONE` | `075 295 8134` |
| `TAX_RATE` | `0` |
| `LOYALTY_POINTS_RATE` | `10` |

> **Generate JWT Secrets in terminal:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

4. Click **Create Web Service**.

---

## Step 3: Seed Initial Data (First-Time Deploy Only)

When creating a new production database, it has no users or settings yet. You must seed the database once to create the initial admin user and store categories.

### Option A: Using the Render Web Shell (Easiest)
1. Go to your Web Service in Render.
2. Click on the **Shell** tab on the left menu.
3. Once the terminal opens, run:
   ```bash
   cd server
   ALLOW_DESTRUCTIVE_SEED=true node prisma/seed.js
   ```
4. You will see:
   ```text
   Settings created
   Users created: admin, manager, cashier
   Categories created
   Products created
   Seeding complete
   ```

### Default Credentials After Seeding:
| Role | Username | Password |
|---|---|---|
| **Admin** | `admin` | `admin123` |
| **Manager** | `manager` | `manager123` |
| **Cashier** | `cashier` | `cashier123` |

> [!IMPORTANT]
> Immediately log in as `admin` and change your password in the Users management screen or update it in production.

---

## Persistent Storage for Uploads (Optional)

On Render's Free tier, the filesystem is ephemeral (any uploaded product images saved to `server/uploads` will be cleared if the free server spins down or restarts).

If you want uploaded product images to persist across deployments:
1. Upgrade to the **Starter** plan ($7/mo).
2. Go to your Web Service > **Disks** > **Add Disk**.
3. Set:
   - **Name**: `dashpos-uploads`
   - **Mount Path**: `/opt/render/project/src/server/uploads`
   - **Size**: 1 GB or more.

---

## Important Render Tips

1. **Free Tier Cold Starts**:
   Render Free Web Services spin down after 15 minutes of inactivity. When you visit the app after it goes to sleep, the first request will take ~30–50 seconds to wake up.
2. **Database 30-Day Free Limit**:
   Render Free PostgreSQL databases expire after 30 days unless upgraded to a paid plan ($7/mo) or replaced.
3. **Health Check**:
   The API provides a health endpoint at `/api/health` that Render uses to ensure zero-downtime rolling deploys.
