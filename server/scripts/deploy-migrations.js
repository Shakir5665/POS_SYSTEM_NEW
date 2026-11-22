#!/usr/bin/env node
/**
 * Safe Prisma Migration Deployment Script for Render & Cloud Environments
 * Disables PostgreSQL advisory locking to prevent P1002 timeouts on serverless/pooled databases (e.g. Neon).
 */

const { execSync } = require('child_process');
const path = require('path');

process.env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = 'true';

const serverDir = path.resolve(__dirname, '..');

try {
  console.log('[deploy-migrations] Deploying Prisma migrations (advisory locks disabled for Neon)...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    cwd: serverDir,
    env: process.env
  });
  console.log('[deploy-migrations] Migrations applied successfully.');
} catch (error) {
  console.error('[deploy-migrations] Migration deployment failed with code:', error.status);
  process.exit(error.status || 1);
}
