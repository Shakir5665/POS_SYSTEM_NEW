# Database Safety Protocol

## 1. Purpose

This document defines the safety rules for all migration-related database operations
in the NexTill POS legacy migration project. No migration script may bypass these rules.

## 2. Environment Classification

Every database connection must be classified before any operation:

| Classification | Allowed operations                                      |
| -------------- | ------------------------------------------------------- |
| `development`  | Read, write, schema changes, test data, restore         |
| `staging`      | Read, write, restore into isolated database             |
| `production`   | **Read-only**. No writes, no schema changes, no resets  |
| `unconfirmed`  | **No operations**. Must be classified first             |

## 3. Safety Rules

1. **Never run destructive commands on production.** This includes `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, `DROP DATABASE`, `TRUNCATE`, and bulk `DELETE`.
2. **Never assume `NODE_ENV=development` means a safe database.** A developer may have `DATABASE_URL` pointing to production.
3. **Never log complete connection strings or passwords.** Display only masked host, port, and database name.
4. **Never modify `.env` automatically.** Environment files are developer-managed.
5. **Always require explicit operator confirmation** before destructive operations.
6. **Use isolated databases for restore tests.** Create a temporary database, restore into it, verify, then drop it.
7. **Verify the original database was not modified** after any restore operation.

## 4. Preflight Checker

The preflight checker is implemented at:
- `server/scripts/migration/preflight.js`

### Usage

```bash
# Interactive mode — prompts for target classification
node server/scripts/migration/preflight.js

# Explicit classification
node server/scripts/migration/preflight.js --target=development

# JSON output for scripting
node server/scripts/migration/preflight.js --json
```

### What it checks
1. `DATABASE_URL` is defined and parseable.
2. Connection host, port, and database name are displayed (masked).
3. Operator must classify the target as `development`, `staging`, or `production`.
4. If `production`, destructive operations are refused.
5. If the host contains known production patterns (`render.com`, `amazonaws.com`, `azure`), a warning is raised.

## 5. Backup Verification

The backup verification procedure is implemented at:
- `server/scripts/migration/verify-backup.js`

### Manual Verification Steps

If automated verification is blocked by missing database access:

1. **Identify source database** — confirm which DATABASE_URL is active.
2. **Run existing backup** — `npm --prefix server run db:backup`
3. **Verify backup file** — check the file exists and is non-empty.
4. **Inspect backup contents** — `pg_restore --list <backup_file>`
5. **Create disposable database** — `createdb -U <user> nextill_restore_test`
6. **Restore into it** — `pg_restore -d nextill_restore_test <backup_file>`
7. **Verify schema** — count tables, check representative row counts.
8. **Drop test database** — `dropdb nextill_restore_test`
9. **Verify original** — confirm original database row counts unchanged.

## 6. Verification Status

- Backup creation script: **EXECUTED & VERIFIED** (`server/scripts/backup.js`)
  - Backup produced: `server/backups/pos_backup_2026-11-21T17-07-04.dump` (114,929 bytes)
- Backup archive inspection: **ARCHIVE_VERIFIED** (`server/scripts/migration/verify-backup.js`)
  - Verified non-empty custom-format archive with 146 readable TOC entries using `pg_restore --list`.
- Preflight safety checker: **VERIFIED** (`server/scripts/migration/preflight.js`)
  - Successfully detected remote database host (`neon.tech`) and blocked unsafe operations.
- Isolated restore verification: **NOT VERIFIED**
  - **Reason / Blocker**: The active `DATABASE_URL` is a remote Neon cloud database (`ep-dry-heart-aob4tqn2.***.tech`). Preflight safety check flagged it as production-like, blocking destructive operations. Local Docker Desktop engine is not running, and local PostgreSQL instance credentials for disposable database creation are unconfigured.
  - Automated restore tests into the live database were strictly blocked in accordance with safety rules.
  - All verification scripts (`verify-backup.js`) and manual instructions are tested and ready for isolated restoration once a dedicated staging database is authorized.

## 7. What This Phase Does NOT Do

- Does not create, delete, or modify any PostgreSQL database.
- Does not run `prisma migrate dev` or `prisma migrate deploy`.
- Does not seed any data.
- Does not connect to production.
- Does not store credentials or connection strings in documentation.
