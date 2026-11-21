#!/usr/bin/env node
/**
 * Migration Preflight Checker
 *
 * Verifies database connection metadata without exposing credentials.
 * Requires explicit target classification before allowing any operations.
 *
 * Usage:
 *   node server/scripts/migration/preflight.js
 *   node server/scripts/migration/preflight.js --target=development
 *   node server/scripts/migration/preflight.js --json
 */
'use strict'

const path = require('path')
const url = require('url')

// Load .env from server directory
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') })

const VALID_TARGETS = ['development', 'staging', 'production']

const PRODUCTION_HOST_PATTERNS = [
  'render.com',
  'amazonaws.com',
  'rds.amazonaws.com',
  'azure.com',
  'database.azure.com',
  'supabase.co',
  'neon.tech',
  'elephantsql.com',
  'heroku',
  'digitalocean',
  'planetscale',
]

/**
 * Parse a PostgreSQL connection URL and return safe metadata (no password).
 * @param {string} connectionUrl
 * @returns {{ host: string, port: string, database: string, user: string, masked: string, raw_host: string } | null}
 */
function parseConnectionUrl(connectionUrl) {
  if (!connectionUrl) return null

  try {
    const parsed = new URL(connectionUrl)
    const host = parsed.hostname || 'unknown'
    const port = parsed.port || '5432'
    const database = parsed.pathname?.replace(/^\//, '') || 'unknown'
    const user = parsed.username || 'unknown'

    // Mask host to show only first and last segments
    const hostParts = host.split('.')
    let maskedHost = host
    if (hostParts.length > 2) {
      maskedHost = `${hostParts[0]}.***.${hostParts[hostParts.length - 1]}`
    }

    return {
      host: maskedHost,
      port,
      database,
      user,
      masked: `postgresql://${user}:****@${maskedHost}:${port}/${database}`,
      raw_host: host,
    }
  } catch {
    return null
  }
}

/**
 * Check if a host matches known production patterns.
 * @param {string} host
 * @returns {string[]} matching patterns
 */
function detectProductionPatterns(host) {
  if (!host) return []
  const lower = host.toLowerCase()
  return PRODUCTION_HOST_PATTERNS.filter((pattern) => lower.includes(pattern))
}

/**
 * Run the preflight check.
 * @param {object} options
 * @param {string} [options.target] - 'development' | 'staging' | 'production'
 * @param {boolean} [options.json] - output as JSON
 * @param {string} [options.databaseUrl] - override DATABASE_URL for testing
 * @returns {{ ok: boolean, classification: string|null, connection: object|null, warnings: string[], errors: string[] }}
 */
function runPreflight(options = {}) {
  const result = {
    ok: false,
    classification: null,
    connection: null,
    warnings: [],
    errors: [],
    destructive_allowed: false,
    timestamp: new Date().toISOString(),
  }

  // 1. Check DATABASE_URL exists
  const dbUrl = options.databaseUrl || process.env.DATABASE_URL
  if (!dbUrl) {
    result.errors.push('DATABASE_URL is not defined. Set it in server/.env or the environment.')
    return result
  }

  // 2. Parse without exposing credentials
  const conn = parseConnectionUrl(dbUrl)
  if (!conn) {
    result.errors.push('DATABASE_URL could not be parsed as a valid PostgreSQL URL.')
    return result
  }

  result.connection = {
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    masked_url: conn.masked,
  }

  // 3. Detect production patterns
  const prodPatterns = detectProductionPatterns(conn.raw_host)
  if (prodPatterns.length > 0) {
    result.warnings.push(
      `Host matches production patterns: ${prodPatterns.join(', ')}. ` +
      'Confirm this is not a production database before proceeding.'
    )
  }

  // 4. Check NODE_ENV (informational only — not authoritative)
  const nodeEnv = process.env.NODE_ENV
  if (nodeEnv && nodeEnv !== 'development' && nodeEnv !== 'test') {
    result.warnings.push(
      `NODE_ENV is "${nodeEnv}". This does NOT guarantee database safety. ` +
      'Explicit classification is still required.'
    )
  }

  // 5. Validate target classification
  const target = options.target
  if (!target) {
    result.errors.push(
      'No target classification provided. ' +
      'Use --target=development, --target=staging, or --target=production.'
    )
    return result
  }

  if (!VALID_TARGETS.includes(target)) {
    result.errors.push(
      `Invalid target "${target}". Must be one of: ${VALID_TARGETS.join(', ')}`
    )
    return result
  }

  result.classification = target

  // 6. Determine allowed operations
  if (target === 'production') {
    result.destructive_allowed = false
    result.warnings.push(
      'Target classified as PRODUCTION. All destructive operations are REFUSED.'
    )
  } else if (target === 'staging') {
    result.destructive_allowed = false
    result.warnings.push(
      'Target classified as STAGING. Destructive operations require additional confirmation.'
    )
  } else {
    result.destructive_allowed = true
  }

  // Additional safety: even if classified as development, warn on production patterns
  if (target === 'development' && prodPatterns.length > 0) {
    result.destructive_allowed = false
    result.errors.push(
      'SAFETY BLOCK: Classified as development but host matches production patterns. ' +
      'Refusing destructive operations. Verify your DATABASE_URL.'
    )
    return result
  }

  result.ok = result.errors.length === 0
  return result
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2)
  const options = {}

  for (const arg of args) {
    if (arg.startsWith('--target=')) {
      options.target = arg.split('=')[1]
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--help') {
      console.log('Usage: node preflight.js [--target=development|staging|production] [--json]')
      process.exit(0)
    }
  }

  const result = runPreflight(options)

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('\n=== NexTill Migration Preflight Check ===\n')

    if (result.connection) {
      console.log('Connection:')
      console.log(`  Host:     ${result.connection.host}`)
      console.log(`  Port:     ${result.connection.port}`)
      console.log(`  Database: ${result.connection.database}`)
      console.log(`  User:     ${result.connection.user}`)
      console.log(`  URL:      ${result.connection.masked_url}`)
      console.log()
    }

    if (result.classification) {
      console.log(`Classification: ${result.classification.toUpperCase()}`)
      console.log(`Destructive ops allowed: ${result.destructive_allowed ? 'YES' : 'NO'}`)
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

    console.log(`Result: ${result.ok ? '✓ PASSED' : '✗ FAILED'}`)
  }

  process.exit(result.ok ? 0 : 1)
}

module.exports = { runPreflight, parseConnectionUrl, detectProductionPatterns }
