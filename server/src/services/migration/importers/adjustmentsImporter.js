'use strict'

/**
 * Historical Stock Adjustments Importer for Legacy POS Migration
 *
 * Implements historical stock adjustment ingestion in strict compliance with:
 * - RISK-10: Zero mutation of Product.quantity / no live InventoryLog creation
 * - DEC-004: Preserve raw legacy method_type code (integer)
 * - DEC-007: Track orphan flattened adjustment items in MigrationIssue
 * - DEC-008: Current live Product.quantity remains authoritative
 * - DEC-011: Assign to dedicated inactive migration system user
 */

const { SOURCE_SYSTEM, resolveProduct, normalizeUnit } = require('../entityResolvers')
const { recordHistoricalAdjustment } = require('../../stockAdjustmentService')

/**
 * Import a historical legacy stock adjustment header with items.
 *
 * @param {Object} adjData - Source legacy adjustment record
 * @param {Object} context - Execution context { batchId, migrationUser, warehouse, dryRun, issues }
 * @param {Object} tx - Active Prisma transaction client
 * @returns {Promise<Object>} Import result summary
 */
async function importAdjustment(adjData, context, tx) {
  const { batchId, migrationUser, warehouse, dryRun, issues } = context
  const legacyAdjIdStr = String(adjData.legacy_id)

  // 1. Idempotency Check
  const existingMap = await tx.legacyIdMap.findUnique({
    where: {
      source_system_entity_type_legacy_id: {
        source_system: SOURCE_SYSTEM,
        entity_type: 'StockAdjustment',
        legacy_id: legacyAdjIdStr,
      },
    },
  })

  if (existingMap) {
    return {
      status: 'SKIPPED_DUPLICATE',
      legacy_id: adjData.legacy_id,
      nextill_id: existingMap.nextill_id,
    }
  }

  // 2. Process line items
  const processedItems = []
  for (const rawItem of adjData.items || []) {
    const { product } = await resolveProduct(rawItem.product_id, rawItem.product_name, tx)

    if (!product) {
      issues.push({
        batch_id: batchId,
        entity_type: 'StockAdjustmentItem',
        legacy_id: String(rawItem.legacy_id),
        issue_code: 'MISSING_PRODUCT',
        severity: 'INFO',
        description: `Unmapped product for adjustment item: '${rawItem.product_name}' (legacy_id: ${rawItem.product_id})`,
        source_data: rawItem,
      })
    }

    processedItems.push({
      legacy_id: rawItem.legacy_id,
      product_id: product?.id || null, // Nullable product mapping supported
      quantity_change: rawItem.quantity_change,
      method_type: rawItem.method_type || 1, // Preserved raw legacy code (DEC-004)
      unit: normalizeUnit(rawItem.unit || 'pcs'),
      notes: rawItem.notes || `Legacy Adjustment Item #${rawItem.legacy_id}`,
    })
  }

  const adjustmentPayload = {
    adjustment_number: `LEGACY-ADJ-${adjData.legacy_id}`,
    adjustment_date: new Date(adjData.adjustment_date || Date.now()),
    warehouse_id: warehouse.id,
    user_id: migrationUser.id,
    reason: adjData.reason || 'PHYSICAL_COUNT',
    notes: adjData.notes || `Legacy POS Stock Adjustment #${adjData.legacy_id}`,
    is_legacy_import: true,
    items: processedItems,
  }

  // 3. Dry-Run Mode
  if (dryRun) {
    return {
      status: 'SIMULATED',
      legacy_id: adjData.legacy_id,
      adjustment: adjustmentPayload,
      itemCount: processedItems.length,
    }
  }

  // 4. Live Import Execution (strictly bypasses stock mutations and InventoryLogs)
  const createdAdjustment = await tx.stockAdjustment.create({
    data: {
      adjustment_number: adjustmentPayload.adjustment_number,
      adjustment_date: adjustmentPayload.adjustment_date,
      warehouse_id: adjustmentPayload.warehouse_id,
      user_id: adjustmentPayload.user_id,
      reason: adjustmentPayload.reason,
      notes: adjustmentPayload.notes,
      is_legacy_import: true,
      items: {
        create: processedItems.map((item) => ({
          product_id: item.product_id,
          quantity_change: item.quantity_change,
          method_type: item.method_type,
          unit: item.unit,
          notes: item.notes,
        })),
      },
    },
    include: {
      items: true,
    },
  })

  // 5. Record LegacyIdMap for StockAdjustment header
  await tx.legacyIdMap.create({
    data: {
      source_system: SOURCE_SYSTEM,
      entity_type: 'StockAdjustment',
      legacy_id: legacyAdjIdStr,
      target_model: 'StockAdjustment',
      nextill_id: createdAdjustment.id,
      batch_id: batchId,
      metadata: {
        reason: adjData.reason,
        adjustment_date: adjData.adjustment_date,
      },
    },
  })

  // 6. Record LegacyIdMap for items
  for (let i = 0; i < createdAdjustment.items.length; i++) {
    const rawItem = adjData.items[i]
    if (rawItem && rawItem.legacy_id) {
      await tx.legacyIdMap.create({
        data: {
          source_system: SOURCE_SYSTEM,
          entity_type: 'StockAdjustmentItem',
          legacy_id: String(rawItem.legacy_id),
          target_model: 'StockAdjustmentItem',
          nextill_id: createdAdjustment.items[i].id,
          batch_id: batchId,
          metadata: {
            parent_legacy_adjustment_id: adjData.legacy_id,
            method_type: rawItem.method_type,
          },
        },
      })
    }
  }

  return {
    status: 'IMPORTED',
    legacy_id: adjData.legacy_id,
    nextill_id: createdAdjustment.id,
    itemCount: createdAdjustment.items.length,
  }
}

/**
 * Records orphan flattened adjustment items into context issues (DEC-007).
 */
async function recordOrphanAdjustmentItems(orphanItems, context) {
  const { batchId, issues } = context
  for (const item of orphanItems || []) {
    issues.push({
      batch_id: batchId || null,
      entity_type: 'StockAdjustmentItem',
      legacy_id: String(item.legacy_id),
      issue_code: 'ORPHAN_CHILD',
      severity: 'WARNING',
      description: `Flattened adjustment item #${item.legacy_id} references missing parent adjustment #${item.parent_adjustment_id}`,
      resolution_status: 'UNRESOLVED',
      metadata: item,
    })
  }
}

module.exports = {
  importAdjustment,
  recordOrphanAdjustmentItems,
}
