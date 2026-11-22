'use strict';

/**
 * Migration Safety Guard
 *
 * Enforces strict boundaries to protect production and staging databases:
 * - Reject any live import execution if DATABASE_URL points to AWS Neon, AWS, or production.
 * - Live staging/production execution remains strictly LOCKED during Phase 4B.
 * - Only verified isolated/disposable test databases are permitted for isolated live verification.
 */

function isStagingOrProduction(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) return true;
  const lower = databaseUrl.toLowerCase();
  return (
    lower.includes('neon.tech') ||
    lower.includes('dashpos') ||
    lower.includes('production') ||
    lower.includes('prod') ||
    lower.includes('rds.amazonaws.com')
  );
}

function assertExecutionPermitted(options = {}) {
  const dbUrl = options.databaseUrl || process.env.DATABASE_URL;

  // Live import execution is strictly forbidden against staging or production
  if (!options.dryRun && isStagingOrProduction(dbUrl)) {
    const error = new Error(
      'STAGING_IMPORT_LOCKED: Historical data import execution is strictly disabled on AWS Neon DASHPOS staging and production databases. ' +
      'Phase 4B authorizes isolated dry-run testing only. Live execution requires explicit administrative approval.'
    );
    error.code = 'STAGING_IMPORT_LOCKED';
    error.status = 403;
    throw error;
  }

  // Live import execution against isolated database requires explicit ALLOW_ISOLATED_IMPORT=true flag
  if (!options.dryRun && process.env.ALLOW_ISOLATED_IMPORT !== 'true') {
    const error = new Error(
      'ISOLATED_IMPORT_GUARD: Direct database mutation requires ALLOW_ISOLATED_IMPORT=true against an isolated database.'
    );
    error.code = 'ISOLATED_IMPORT_GUARD';
    error.status = 403;
    throw error;
  }

  return true;
}

module.exports = {
  isStagingOrProduction,
  assertExecutionPermitted,
};
