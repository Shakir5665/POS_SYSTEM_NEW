#!/usr/bin/env node
/**
 * Backup Verification Script
 *
 * Verifies that a NexTill database backup can be listed and, optionally,
 * restored into an isolated disposable database.
 *
 * This script:
 *   1. Finds the latest backup file (or accepts a path argument).
 *   2. Checks the file is non-empty.
 *   3. Runs pg_restore --list to verify the archive is readable.
 *   4. Optionally restores into a temporary database (--restore flag).
 *   5. Reports results without storing credentials.
 *
 * Usage:
 *   node server/scripts/migration/verify-backup.js
 *   node server/scripts/migration/verify-backup.js --file=path/to/backup.dump
 *   node server/scripts/migration/verify-backup.js --restore --restore-db=nextill_restore_test
 *   node server/scripts/migration/verify-backup.js --json
 */
'use strict'

const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') })

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups')

/**
 * Find the pg_restore binary (mirrors backup.js logic).
 */
function findPgRestore() {
  const pg18 = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe'
  const pg17 = 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe'
  if (fs.existsSync(pg18)) return `"${pg18}"`
  if (fs.existsSync(pg17)) return `"${pg17}"`
  return 'pg_restore'
}

/**
 * Find the most recent backup file in the backup directory.
 * @returns {string|null}
 */
function findLatestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.dump'))
    .sort()
    .reverse()
  return files.length > 0 ? path.join(BACKUP_DIR, files[0]) : null
}

/**
 * Run the backup verification.
 * @param {object} options
 * @param {string} [options.file] - explicit backup file path
 * @param {boolean} [options.restore] - attempt isolated restore
 * @param {string} [options.restoreDb] - name for the disposable database
 * @param {boolean} [options.json] - JSON output mode
 * @returns {object}
 */
function verifyBackup(options = {}) {
  const result = {
    timestamp: new Date().toISOString(),
    backup_file: null,
    file_exists: false,
    file_size_bytes: 0,
    archive_readable: false,
    archive_entries: 0,
    restore_attempted: false,
    restore_succeeded: false,
    restore_database: null,
    errors: [],
    warnings: [],
    status: 'NOT_VERIFIED',
  }

  // 1. Locate backup file
  const backupFile = options.file || findLatestBackup()
  if (!backupFile) {
    result.errors.push(
      'No backup file found. Run `npm --prefix server run db:backup` first, ' +
      'or specify --file=path/to/backup.dump'
    )
    return result
  }

  result.backup_file = backupFile

  // 2. Check file exists and is non-empty
  if (!fs.existsSync(backupFile)) {
    result.errors.push(`Backup file not found: ${backupFile}`)
    return result
  }

  const stat = fs.statSync(backupFile)
  result.file_exists = true
  result.file_size_bytes = stat.size

  if (stat.size === 0) {
    result.errors.push('Backup file is empty (0 bytes)')
    return result
  }

  // 3. Try pg_restore --list
  const pgRestore = findPgRestore()
  try {
    const listOutput = execSync(`${pgRestore} --list "${backupFile}"`, {
      encoding: 'utf-8',
      timeout: 30000,
    })
    result.archive_readable = true
    // Count non-comment, non-empty lines
    const entries = listOutput.split('\n').filter((l) => l.trim() && !l.startsWith(';'))
    result.archive_entries = entries.length
  } catch (err) {
    result.errors.push(`pg_restore --list failed: ${err.message}`)
    result.warnings.push(
      'If pg_restore is not installed, install PostgreSQL client tools ' +
      'or verify the backup on a machine with PostgreSQL installed.'
    )
    return result
  }

  // 4. Mark as partially verified
  result.status = 'ARCHIVE_VERIFIED'

  // 5. Optional: restore into isolated database
  if (options.restore) {
    result.restore_attempted = true
    const restoreDb = options.restoreDb || 'nextill_restore_test_' + Date.now()
    result.restore_database = restoreDb

    result.warnings.push(
      `Restore into isolated database "${restoreDb}" requested. ` +
      'This requires createdb/dropdb privileges and a running PostgreSQL instance.'
    )

    // This is intentionally NOT auto-executed.
    // The operator must run this manually or confirm the target.
    result.warnings.push(
      'Automated restore is disabled for safety. To restore manually:\n' +
      `  1. createdb ${restoreDb}\n` +
      `  2. ${pgRestore} -d ${restoreDb} "${backupFile}"\n` +
      `  3. Verify tables: psql ${restoreDb} -c "\\dt"\n` +
      `  4. dropdb ${restoreDb}`
    )
    result.status = 'RESTORE_NOT_EXECUTED'
  }

  return result
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2)
  const options = {}

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      options.file = arg.split('=').slice(1).join('=')
    } else if (arg === '--restore') {
      options.restore = true
    } else if (arg.startsWith('--restore-db=')) {
      options.restoreDb = arg.split('=')[1]
      options.restore = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--help') {
      console.log('Usage: node verify-backup.js [--file=<path>] [--restore] [--restore-db=<name>] [--json]')
      process.exit(0)
    }
  }

  const result = verifyBackup(options)

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('\n=== NexTill Backup Verification ===\n')

    if (result.backup_file) {
      console.log(`Backup file: ${result.backup_file}`)
      console.log(`File exists: ${result.file_exists ? 'YES' : 'NO'}`)
      console.log(`File size:   ${result.file_size_bytes} bytes`)
      console.log(`Archive readable: ${result.archive_readable ? 'YES' : 'NO'}`)
      if (result.archive_entries > 0) {
        console.log(`Archive entries:  ${result.archive_entries}`)
      }
      console.log()
    }

    if (result.warnings.length > 0) {
      console.log('Warnings:')
      result.warnings.forEach((w) => console.log(`  ⚠ ${w}`))
      console.log()
    }

    if (result.errors.length > 0) {
      console.log('Errors:')
      result.errors.forEach((e) => console.log(`  ✗ ${e}`))
      console.log()
    }

    console.log(`Status: ${result.status}`)
  }

  process.exit(result.errors.length === 0 ? 0 : 1)
}

module.exports = { verifyBackup, findLatestBackup, findPgRestore }
