'use strict'

/**
 * Entity Resolvers for Legacy POS Migration
 *
 * Resolves legacy numeric IDs and entity names to NexTill UUIDs,
 * enforcing DEC-001 (Warehouse), DEC-002 (Product Identity),
 * DEC-003 (Customer/Supplier), DEC-005 (Unit Normalization),
 * and DEC-011 (Migration User).
 */

const prisma = require('../../utils/prismaClient')

const SOURCE_SYSTEM = 'legacy_pos'

/**
 * Normalizes legacy unit strings to NexTill standard UOM values.
 * e.g., 'peice' -> 'pcs', 'piece' -> 'pcs' (DEC-005)
 */
function normalizeUnit(legacyUnit) {
  if (!legacyUnit) return 'pcs'
  const cleaned = String(legacyUnit).trim().toLowerCase()
  if (cleaned === 'peice' || cleaned === 'piece' || cleaned === 'pcs' || cleaned === 'pce') {
    return 'pcs'
  }
  if (cleaned === 'kg' || cleaned === 'kilogram') return 'kg'
  if (cleaned === 'g' || cleaned === 'gram') return 'g'
  if (cleaned === 'l' || cleaned === 'liter' || cleaned === 'litre') return 'l'
  if (cleaned === 'ml' || cleaned === 'milliliter') return 'ml'
  if (cleaned === 'box' || cleaned === 'carton') return 'box'
  if (cleaned === 'pack' || cleaned === 'pkt') return 'pack'
  return cleaned
}

/**
 * Resolves or creates the dedicated system migration user (DEC-011).
 */
async function resolveMigrationUser(tx = prisma) {
  let user = await tx.user.findUnique({
    where: { username: 'migration_import' },
  })

  if (!user) {
    user = await tx.user.create({
      data: {
        username: 'migration_import',
        email: 'migration_import@system.internal',
        password_hash: '$2b$12$LOCKED_SYSTEM_USER_DO_NOT_AUTHENTICATE_DIRECTLY',
        full_name: 'Legacy Migration System',
        role: 'ADMIN',
        is_active: false,
      },
    })
  }

  return user
}

/**
 * Resolves the target warehouse for legacy transactions (DEC-001).
 * Maps legacy warehouse_id = 1 to the default warehouse (WH-001 / Main Warehouse).
 */
async function resolveWarehouse(legacyWarehouseId, tx = prisma, options = {}) {
  // Check LegacyIdMap first
  if (legacyWarehouseId !== undefined && legacyWarehouseId !== null) {
    const existingMap = await tx.legacyIdMap.findUnique({
      where: {
        source_system_entity_type_legacy_id: {
          source_system: SOURCE_SYSTEM,
          entity_type: 'Warehouse',
          legacy_id: String(legacyWarehouseId),
        },
      },
    })
    if (existingMap) {
      const wh = await tx.warehouse.findUnique({ where: { id: existingMap.nextill_id } })
      if (wh) return wh
    }
  }

  // Fallback to active default warehouse
  let warehouse = await tx.warehouse.findFirst({
    where: { is_default: true, is_active: true },
  })

  if (!warehouse) {
    warehouse = await tx.warehouse.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'asc' },
    })
  }

  if (!warehouse) {
    throw new Error('No active warehouse found in database. Run seed-phase2.js first.')
  }

  // Record mapping if legacy ID was supplied and NOT in dry-run mode
  if (!options.dryRun && legacyWarehouseId !== undefined && legacyWarehouseId !== null) {
    await tx.legacyIdMap.upsert({
      where: {
        source_system_entity_type_legacy_id: {
          source_system: SOURCE_SYSTEM,
          entity_type: 'Warehouse',
          legacy_id: String(legacyWarehouseId),
        },
      },
      update: { nextill_id: warehouse.id },
      create: {
        source_system: SOURCE_SYSTEM,
        entity_type: 'Warehouse',
        legacy_id: String(legacyWarehouseId),
        target_model: 'Warehouse',
        nextill_id: warehouse.id,
        metadata: { warehouse_code: warehouse.code, warehouse_name: warehouse.name },
      },
    })
  }

  return warehouse
}

/**
 * Resolves legacy product ID or name to a NexTill Product (DEC-002).
 */
async function resolveProduct(legacyId, legacyName, tx = prisma) {
  // 1. Check LegacyIdMap
  if (legacyId !== undefined && legacyId !== null) {
    const map = await tx.legacyIdMap.findUnique({
      where: {
        source_system_entity_type_legacy_id: {
          source_system: SOURCE_SYSTEM,
          entity_type: 'Product',
          legacy_id: String(legacyId),
        },
      },
    })
    if (map) {
      const product = await tx.product.findUnique({ where: { id: map.nextill_id } })
      if (product) return { product, matchedBy: 'LEGACY_MAP' }
    }
  }

  // 2. Check by name (case-insensitive)
  if (legacyName) {
    const product = await tx.product.findFirst({
      where: {
        name: { equals: legacyName.trim(), mode: 'insensitive' },
      },
    })
    if (product) {
      return { product, matchedBy: 'NAME_MATCH' }
    }
  }

  return { product: null, matchedBy: null }
}

/**
 * Resolves legacy customer ID to a NexTill Customer (DEC-003).
 */
async function resolveCustomer(legacyCustomerId, tx = prisma) {
  if (!legacyCustomerId) return null

  // 1. Check LegacyIdMap
  const map = await tx.legacyIdMap.findUnique({
    where: {
      source_system_entity_type_legacy_id: {
        source_system: SOURCE_SYSTEM,
        entity_type: 'Customer',
        legacy_id: String(legacyCustomerId),
      },
    },
  })
  if (map) {
    const customer = await tx.customer.findUnique({ where: { id: map.nextill_id } })
    if (customer) return customer
  }

  // 2. Match first customer as fallback if available, or return null
  const fallbackCustomer = await tx.customer.findFirst({
    orderBy: { created_at: 'asc' },
  })

  return fallbackCustomer || null
}

/**
 * Resolves legacy supplier ID to a NexTill Supplier (DEC-003).
 */
async function resolveSupplier(legacySupplierId, tx = prisma) {
  if (!legacySupplierId) return null

  // 1. Check LegacyIdMap
  const map = await tx.legacyIdMap.findUnique({
    where: {
      source_system_entity_type_legacy_id: {
        source_system: SOURCE_SYSTEM,
        entity_type: 'Supplier',
        legacy_id: String(legacySupplierId),
      },
    },
  })
  if (map) {
    const supplier = await tx.supplier.findUnique({ where: { id: map.nextill_id } })
    if (supplier) return supplier
  }

  // 2. Fallback to first active supplier (e.g., SS-MART)
  const defaultSupplier = await tx.supplier.findFirst({
    where: { is_active: true },
    orderBy: { created_at: 'asc' },
  })

  return defaultSupplier || null
}

/**
 * Resolves legacy expense category ID or name.
 */
async function resolveExpenseCategory(legacyCategoryId, categoryName, tx = prisma) {
  // 1. Check LegacyIdMap
  if (legacyCategoryId) {
    const map = await tx.legacyIdMap.findUnique({
      where: {
        source_system_entity_type_legacy_id: {
          source_system: SOURCE_SYSTEM,
          entity_type: 'ExpenseCategory',
          legacy_id: String(legacyCategoryId),
        },
      },
    })
    if (map) {
      const cat = await tx.expenseCategory.findUnique({ where: { id: map.nextill_id } })
      if (cat) return cat
    }
  }

  // 2. Match by name
  if (categoryName) {
    const cat = await tx.expenseCategory.findFirst({
      where: {
        name: { equals: categoryName.trim(), mode: 'insensitive' },
      },
    })
    if (cat) return cat
  }

  // 3. Match Miscellaneous fallback
  const misc = await tx.expenseCategory.findFirst({
    where: { name: { equals: 'Miscellaneous', mode: 'insensitive' } },
  })
  if (misc) return misc

  // 4. Any first category
  return tx.expenseCategory.findFirst({ orderBy: { created_at: 'asc' } })
}

module.exports = {
  SOURCE_SYSTEM,
  normalizeUnit,
  resolveMigrationUser,
  resolveWarehouse,
  resolveProduct,
  resolveCustomer,
  resolveSupplier,
  resolveExpenseCategory,
}
