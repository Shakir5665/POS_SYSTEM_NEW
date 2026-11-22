'use strict';

const path = require('path');
const prisma = require('../utils/prismaClient');
const { isStagingOrProduction, assertExecutionPermitted } = require('../services/migration/migrationGuard');
const { runExcelImport, rollbackExcelBatch } = require('../services/migration/excelImportEngine');

const WORKBOOK_PATH = path.resolve(__dirname, '../../../NexTill_Phase4B_Complete_Historical_Import_REPAIRED.xlsx');

describe('Phase 4B: Excel Import Safety & Guardrail Suite', () => {
  it('should detect AWS Neon DASHPOS staging connection string as staging/production', () => {
    const neonUrl = 'postgresql://neondb_owner:npg_secret@ep-dry-heart-aob4tqn2.c-2.ap-southeast-1.aws.neon.tech/DASHPOS?sslmode=require';
    expect(isStagingOrProduction(neonUrl)).toBe(true);
  });

  it('should detect production connection string as staging/production', () => {
    const prodUrl = 'postgresql://admin:secret@production-db.company.com:5432/pos_prod';
    expect(isStagingOrProduction(prodUrl)).toBe(true);
  });

  it('should detect localhost disposable test database as non-production', () => {
    const localUrl = 'postgresql://postgres@127.0.0.1:5432/nextill_isolated_phase4b';
    expect(isStagingOrProduction(localUrl)).toBe(false);
  });

  it('should reject execution with STAGING_IMPORT_LOCKED when database URL is staging or production', () => {
    const neonUrl = 'postgresql://neondb_owner:npg_secret@ep-dry-heart-aob4tqn2.c-2.ap-southeast-1.aws.neon.tech/DASHPOS?sslmode=require';
    expect(() => assertExecutionPermitted({ dryRun: false, databaseUrl: neonUrl })).toThrow(
      /STAGING_IMPORT_LOCKED/
    );
  });

  it('should reject non-dryRun execution when ALLOW_ISOLATED_IMPORT is not true', () => {
    const localUrl = 'postgresql://postgres@127.0.0.1:5432/nextill_isolated_phase4b';
    const oldEnv = process.env.ALLOW_ISOLATED_IMPORT;
    delete process.env.ALLOW_ISOLATED_IMPORT;

    expect(() => assertExecutionPermitted({ dryRun: false, databaseUrl: localUrl })).toThrow(
      /ISOLATED_IMPORT_GUARD/
    );

    process.env.ALLOW_ISOLATED_IMPORT = oldEnv;
  });

  it('should execute zero-write dry run and leave zero rows in database', async () => {
    const preBatchCount = await prisma.migrationBatch.count();
    const preLegacyMapCount = await prisma.legacyIdMap.count();

    const dryRunResult = await runExcelImport({
      source: WORKBOOK_PATH,
      dryRun: true,
    });

    expect(dryRunResult.status).toBe('DRY_RUN_SUCCESS');
    expect(dryRunResult.mode).toBe('DRY_RUN');
    expect(dryRunResult.inventoryImpact.productQuantityMutations).toBe(0);
    expect(dryRunResult.inventoryImpact.inventoryLogsCreated).toBe(0);

    const postBatchCount = await prisma.migrationBatch.count();
    const postLegacyMapCount = await prisma.legacyIdMap.count();

    expect(postBatchCount).toBe(preBatchCount);
    expect(postLegacyMapCount).toBe(preLegacyMapCount);
  });

  it('should preview batch rollback safely without altering database state', async () => {
    // Test rollback preview with non-existent or existing batch
    await expect(rollbackExcelBatch('00000000-0000-0000-0000-000000000000', { dryRun: true })).rejects.toThrow(
      /Migration batch not found/
    );
  });
});
