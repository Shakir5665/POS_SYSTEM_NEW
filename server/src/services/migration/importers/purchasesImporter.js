'use strict'

/**
 * Historical Purchases Importer for Legacy POS Migration
 *
 * Implements historical purchase ingestion in strict compliance with:
 * - RISK-07: Never re-add stock or overwrite Product.cost_price on import
 * - RISK-08: Never call receivePurchase() for imported purchases
 * - RISK-09: Never create synthetic SupplierPayment or allocation rows (DEC-009)
 * - DEC-006: Track orphan flattened purchase items in MigrationIssue
 * - DEC-010: Preserve purchase_date as historical business date
 * - DEC-011: Assign to dedicated inactive migration system user
 */

const { Decimal } = require('../../../utils/money')
const { SOURCE_SYSTEM, resolveProduct, resolveSupplier, normalizeUnit } = require('../entityResolvers')

/**
 * Import a single historical legacy purchase.
 *
 * @param {Object} purchaseData - Source legacy purchase record
 * @param {Object} context - Execution context { batchId, migrationUser, warehouse, dryRun, issues }
 * @param {Object} tx - Active Prisma transaction client
 * @returns {Promise<Object>} Import result summary
 */
async function importPurchase(purchaseData, context, tx) {
  const { batchId, migrationUser, warehouse, dryRun, issues } = context
  const legacyPurchaseIdStr = String(purchaseData.legacy_id)

  // 1. Idempotency Check
  const existingMap = await tx.legacyIdMap.findUnique({
    where: {
      source_system_entity_type_legacy_id: {
        source_system: SOURCE_SYSTEM,
        entity_type: 'Purchase',
        legacy_id: legacyPurchaseIdStr,
      },
    },
  })

  if (existingMap) {
    return {
      status: 'SKIPPED_DUPLICATE',
      legacy_id: purchaseData.legacy_id,
      nextill_id: existingMap.nextill_id,
    }
  }

  // 2. Resolve Supplier (DEC-003)
  const supplier = await resolveSupplier(purchaseData.supplier_id, tx)
  if (!supplier && !dryRun) {
    throw new Error(`Cannot import Purchase #${purchaseData.legacy_id}: Supplier ID ${purchaseData.supplier_id} not resolved.`)
  }

  // 3. Process line items
  const processedItems = []
  for (const rawItem of purchaseData.items || []) {
    const { product } = await resolveProduct(rawItem.product_id, rawItem.product_name, tx)

    if (!product) {
      issues.push({
        batch_id: batchId,
        entity_type: 'PurchaseItem',
        legacy_id: String(rawItem.legacy_id),
        issue_code: 'MISSING_PRODUCT',
        severity: 'WARNING',
        description: `Unmapped product for purchase item: '${rawItem.product_name}' (legacy_id: ${rawItem.product_id})`,
        source_data: rawItem,
      })
    }

    const unit = normalizeUnit(rawItem.unit || product?.base_unit || 'pcs')
    const qtyDecimal = new Decimal(rawItem.quantity || 1)
    const unitPriceDecimal = new Decimal(rawItem.unit_price || rawItem.unit_cost || 0)
    const totalDecimal = rawItem.total || rawItem.total_cost
      ? new Decimal(rawItem.total || rawItem.total_cost)
      : qtyDecimal.times(unitPriceDecimal)

    processedItems.push({
      legacy_id: rawItem.legacy_id,
      product_id: product?.id || null,
      product_name: rawItem.product_name || product?.name || 'Legacy Product',
      product_sku: product?.sku || `LEGACY-${rawItem.product_id}`,
      unit,
      quantity: qtyDecimal.toNumber(),
      base_quantity: qtyDecimal.toNumber(),
      unit_cost: unitPriceDecimal.toNumber(),
      total_cost: totalDecimal.toNumber(),
    })
  }

  const legacyRef = purchaseData.reference_code || `PO-${purchaseData.legacy_id}`
  const purchaseNumber = legacyRef.startsWith('LEGACY-') ? legacyRef : `LEGACY-${legacyRef}`

  const purchasePayload = {
    purchase_number: purchaseNumber,
    purchase_date: new Date(purchaseData.purchase_date || Date.now()),
    supplier_id: supplier?.id,
    user_id: migrationUser.id,
    warehouse_id: warehouse.id,
    total_amount: new Decimal(purchaseData.grand_total || 0).toNumber(),
    subtotal: new Decimal(purchaseData.subtotal || purchaseData.grand_total || 0).toNumber(),
    tax_amount: new Decimal(purchaseData.tax_amount || 0).toNumber(),
    amount_paid: new Decimal(purchaseData.paid_amount || purchaseData.grand_total || 0).toNumber(),
    balance_due: new Decimal(purchaseData.due_amount || 0).toNumber(),
    status: 'RECEIVED', // Historical purchases are finalized (RISK-08)
    payment_status: 'COMPLETED',
    received_at: new Date(purchaseData.purchase_date || Date.now()),
    notes: purchaseData.notes || `Legacy POS Purchase #${purchaseData.legacy_id}`,
    is_legacy_import: true, // RISK-07 / DEC-010
  }

  // 4. In Dry-Run mode, do not write to DB
  if (dryRun) {
    return {
      status: 'SIMULATED',
      legacy_id: purchaseData.legacy_id,
      purchase: purchasePayload,
      itemCount: processedItems.length,
    }
  }

  // 5. Live Import Execution
  // Ensure product_id is resolved (using fallback product if needed for NOT NULL constraint)
  let defaultFallbackProduct = null
  for (const item of processedItems) {
    if (!item.product_id) {
      if (!defaultFallbackProduct) {
        defaultFallbackProduct = await tx.product.findFirst({ orderBy: { created_at: 'asc' } })
      }
      item.product_id = defaultFallbackProduct?.id
    }
  }

  const createdPurchase = await tx.purchase.create({
    data: {
      ...purchasePayload,
      items: {
        create: processedItems.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          unit: item.unit,
          quantity: item.quantity,
          base_quantity: item.base_quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
        })),
      },
    },
    include: {
      items: true,
    },
  })

  // 6. Record LegacyIdMap for Purchase
  await tx.legacyIdMap.create({
    data: {
      source_system: SOURCE_SYSTEM,
      entity_type: 'Purchase',
      legacy_id: legacyPurchaseIdStr,
      target_model: 'Purchase',
      nextill_id: createdPurchase.id,
      batch_id: batchId,
      metadata: {
        reference_code: purchaseData.reference_code,
        grand_total: purchaseData.grand_total,
      },
    },
  })

  // 7. Record LegacyIdMap for each PurchaseItem
  for (let i = 0; i < createdPurchase.items.length; i++) {
    const rawItem = purchaseData.items[i]
    if (rawItem && rawItem.legacy_id) {
      await tx.legacyIdMap.create({
        data: {
          source_system: SOURCE_SYSTEM,
          entity_type: 'PurchaseItem',
          legacy_id: String(rawItem.legacy_id),
          target_model: 'PurchaseItem',
          nextill_id: createdPurchase.items[i].id,
          batch_id: batchId,
          metadata: {
            parent_legacy_purchase_id: purchaseData.legacy_id,
            product_name: rawItem.product_name,
          },
        },
      })
    }
  }

  return {
    status: 'IMPORTED',
    legacy_id: purchaseData.legacy_id,
    nextill_id: createdPurchase.id,
    itemCount: createdPurchase.items.length,
  }
}

/**
 * Records orphan flattened purchase items into context issues (DEC-006).
 */
async function recordOrphanPurchaseItems(orphanItems, context) {
  const { batchId, issues } = context
  for (const item of orphanItems || []) {
    issues.push({
      batch_id: batchId || null,
      entity_type: 'PurchaseItem',
      legacy_id: String(item.legacy_id),
      issue_code: 'ORPHAN_CHILD',
      severity: 'WARNING',
      description: `Flattened purchase item #${item.legacy_id} references missing parent purchase #${item.parent_purchase_id}`,
      resolution_status: 'UNRESOLVED',
      metadata: item,
    })
  }
}

module.exports = {
  importPurchase,
  recordOrphanPurchaseItems,
}
