#!/usr/bin/env node
/**
 * Phase 2 — Database Initialization & Backfill Script
 *
 * Idempotently creates:
 * 1. Default Warehouse ("Main Warehouse", code "WH-001", is_default = true)
 * 2. Dedicated System Migration User ("migration_import", role ADMIN, is_active = false)
 * 3. Backfills existing Sale and Purchase records with default warehouse_id if null.
 *
 * Usage:
 *   node server/scripts/migration/seed-phase2.js
 */
'use strict'

const path = require('path')
const bcrypt = require('bcrypt')

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') })
const prisma = require('../../src/utils/prismaClient')

const BCRYPT_COST = 12

async function main() {
  console.log('\n=== NexTill Phase 2 — Database Initialization & Backfill ===\n')

  // 1. Seed or find Default Warehouse (DEC-001 Option B)
  console.log('1. Checking Default Warehouse...')
  let defaultWarehouse = await prisma.warehouse.findFirst({
    where: { is_default: true },
  })

  if (!defaultWarehouse) {
    defaultWarehouse = await prisma.warehouse.upsert({
      where: { name: 'Main Warehouse' },
      update: { is_default: true, is_active: true },
      create: {
        name: 'Main Warehouse',
        code: 'WH-001',
        address: 'Primary Store Location',
        is_default: true,
        is_active: true,
      },
    })
    console.log(`   ✓ Created default warehouse: "${defaultWarehouse.name}" (${defaultWarehouse.id})`)
  } else {
    console.log(`   ✓ Found existing default warehouse: "${defaultWarehouse.name}" (${defaultWarehouse.id})`)
  }

  // 2. Seed or find System Migration User (DEC-011 Option A)
  console.log('\n2. Checking System Migration User...')
  let migrationUser = await prisma.user.findUnique({
    where: { username: 'migration_import' },
  })

  if (!migrationUser) {
    // Generate an unguessable locked password hash
    const lockedPasswordHash = await bcrypt.hash(`locked-${Date.now()}-${Math.random()}`, BCRYPT_COST)
    migrationUser = await prisma.user.create({
      data: {
        username: 'migration_import',
        email: 'migration_import@system.internal',
        password_hash: lockedPasswordHash,
        full_name: 'Legacy Migration System',
        role: 'ADMIN',
        is_active: false, // Inactive so it cannot be used for interactive login
      },
    })
    console.log(`   ✓ Created migration system user: "${migrationUser.username}" (${migrationUser.id})`)
  } else {
    console.log(`   ✓ Found existing migration system user: "${migrationUser.username}" (${migrationUser.id})`)
  }

  // 3. Backfill existing Sales with default warehouse
  console.log('\n3. Backfilling Sale records with default warehouse...')
  const salesWithoutWarehouse = await prisma.sale.count({
    where: { warehouse_id: null },
  })
  if (salesWithoutWarehouse > 0) {
    const updatedSales = await prisma.sale.updateMany({
      where: { warehouse_id: null },
      data: { warehouse_id: defaultWarehouse.id },
    })
    console.log(`   ✓ Updated ${updatedSales.count} Sale records with warehouse_id = ${defaultWarehouse.id}`)
  } else {
    console.log('   ✓ All Sale records already have warehouse_id assigned (0 needed backfill)')
  }

  // 4. Backfill existing Purchases with default warehouse
  console.log('\n4. Backfilling Purchase records with default warehouse...')
  const purchasesWithoutWarehouse = await prisma.purchase.count({
    where: { warehouse_id: null },
  })
  if (purchasesWithoutWarehouse > 0) {
    const updatedPurchases = await prisma.purchase.updateMany({
      where: { warehouse_id: null },
      data: { warehouse_id: defaultWarehouse.id },
    })
    console.log(`   ✓ Updated ${updatedPurchases.count} Purchase records with warehouse_id = ${defaultWarehouse.id}`)
  } else {
    console.log('   ✓ All Purchase records already have warehouse_id assigned (0 needed backfill)')
  }

  console.log('\n✓ Phase 2 database initialization and backfill completed successfully.\n')
}

main()
  .catch((err) => {
    console.error('Error during Phase 2 initialization:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
