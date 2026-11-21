'use strict'

/**
 * Historical Sales Importer for Legacy POS Migration
 *
 * Implements historical sales ingestion in strict compliance with:
 * - RISK-01: Zero stock deduction / no InventoryLog creation
 * - RISK-02: Zero loyalty points awarded
 * - RISK-03: Bypass live stock availability checks
 * - RISK-04: Zero synthetic Payment rows fabricated (DEC-009)
 * - RISK-05: Bypass Paystack validation
 * - RISK-15: Historical sale_date set without modifying created_at
 * - RISK-19: Prefix transaction_id with "LEGACY-"
 * - DEC-011: Assign to dedicated inactive migration system user
 */

const { Decimal } = require('../../../utils/money')
const { SOURCE_SYSTEM, resolveProduct, resolveCustomer, normalizeUnit } = require('../entityResolvers')
const { toBaseUnitQuantity } = require('../../../utils/uom')

/**
 * Import a single historical legacy sale.
 *
 * @param {Object} saleData - Source legacy sale record
 * @param {Object} context - Execution context { batchId, migrationUser, warehouse, dryRun, issues }
 * @param {Object} tx - Active Prisma transaction client
 * @returns {Promise<Object>} Import result summary
 */
async function importSale(saleData, context, tx) {
  const { batchId, migrationUser, warehouse, dryRun, issues } = context
  const legacySaleIdStr = String(saleData.legacy_id)

  // 1. Idempotency Check: Check if already imported
  const existingMap = await tx.legacyIdMap.findUnique({
    where: {
      source_system_entity_type_legacy_id: {
        source_system: SOURCE_SYSTEM,
        entity_type: 'Sale',
        legacy_id: legacySaleIdStr,
      },
    },
  })

  if (existingMap) {
    return {
      status: 'SKIPPED_DUPLICATE',
      legacy_id: saleData.legacy_id,
      nextill_id: existingMap.nextill_id,
    }
  }

  // 2. Resolve Customer (DEC-003)
  const customer = await resolveCustomer(saleData.customer_id, tx)

  // 3. Process line items
  const processedItems = []
  for (const rawItem of saleData.items || []) {
    const { product, matchedBy } = await resolveProduct(rawItem.product_id, rawItem.product_name, tx)

    if (!product) {
      issues.push({
        batch_id: batchId,
        entity_type: 'SaleItem',
        legacy_id: String(rawItem.legacy_id),
        issue_code: 'MISSING_PRODUCT',
        severity: 'WARNING',
        description: `Unmapped product for sale item: '${rawItem.product_name}' (legacy_id: ${rawItem.product_id})`,
        source_data: rawItem,
      })
    }

    const unit = normalizeUnit(rawItem.unit || product?.base_unit || 'pcs')
    const qtyDecimal = new Decimal(rawItem.quantity || 1)
    const unitPriceDecimal = new Decimal(rawItem.unit_price || 0)
    const totalDecimal = rawItem.total ? new Decimal(rawItem.total) : qtyDecimal.times(unitPriceDecimal)

    // Base quantity conversion
    let baseQty = qtyDecimal
    if (product && product.unit_category) {
      try {
        baseQty = new Decimal(toBaseUnitQuantity(qtyDecimal.toNumber(), unit, product.unit_category, product.base_unit))
      } catch (e) {
        baseQty = qtyDecimal
      }
    }

    processedItems.push({
      legacy_id: rawItem.legacy_id,
      product_id: product?.id || null,
      product_name: rawItem.product_name || product?.name || 'Legacy Product',
      product_sku: product?.sku || `LEGACY-${rawItem.product_id}`,
      unit,
      quantity: qtyDecimal.toNumber(),
      base_quantity: baseQty.toNumber(),
      base_unit: product?.base_unit || unit,
      pricing_unit: product?.pricing_unit || unit,
      unit_price: unitPriceDecimal.toNumber(),
      total: totalDecimal.toNumber(),
      line_cost: rawItem.line_cost ? new Decimal(rawItem.line_cost).toNumber() : 0,
      unit_cost_snapshot: rawItem.unit_cost_snapshot || 0,
      cost_price_snapshot: rawItem.cost_price_snapshot || product?.cost_price || null,
      matchedBy,
    })
  }

  // Transaction reference formatting (RISK-19)
  const legacyRef = saleData.reference_code || `REF-${saleData.legacy_id}`
  const transactionId = legacyRef.startsWith('LEGACY-') ? legacyRef : `LEGACY-${legacyRef}`

  const salePayload = {
    transaction_id: transactionId,
    sale_date: new Date(saleData.sale_date || Date.now()),
    user_id: migrationUser.id,
    warehouse_id: warehouse.id,
    customer_id: customer?.id || null,
    subtotal: new Decimal(saleData.subtotal || saleData.grand_total || 0).toNumber(),
    total_amount: new Decimal(saleData.grand_total || 0).toNumber(),
    amount_paid: new Decimal(saleData.paid_amount || saleData.grand_total || 0).toNumber(),
    balance_due: new Decimal(saleData.due_amount || 0).toNumber(),
    tax_amount: new Decimal(saleData.tax_amount || 0).toNumber(),
    discount_amount: new Decimal(saleData.discount || 0).toNumber(),
    payment_method: 'CASH', // Standard historical method (DEC-004)
    payment_status: 'COMPLETED',
    notes: saleData.notes || `Legacy POS Sale #${saleData.legacy_id}`,
    is_legacy_import: true, // RISK-01 / DEC-010
    loyalty_points_earned: 0, // RISK-02: Zero loyalty points
  }

  // 4. In Dry-Run mode, do not write to DB
  if (dryRun) {
    return {
      status: 'SIMULATED',
      legacy_id: saleData.legacy_id,
      sale: salePayload,
      itemCount: processedItems.length,
    }
  }

  // 5. Live Import Execution
  // Find a fallback product ID for items where product mapping is missing, if DB schema requires product_id NOT NULL
  let defaultFallbackProduct = null
  for (const item of processedItems) {
    if (!item.product_id) {
      if (!defaultFallbackProduct) {
        defaultFallbackProduct = await tx.product.findFirst({ orderBy: { created_at: 'asc' } })
      }
      item.product_id = defaultFallbackProduct?.id
    }
  }

  const createdSale = await tx.sale.create({
    data: {
      ...salePayload,
      sale_items: {
        create: processedItems.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          unit: item.unit,
          quantity: item.quantity,
          base_quantity: item.base_quantity,
          base_unit: item.base_unit,
          pricing_unit: item.pricing_unit,
          unit_price: item.unit_price,
          total: item.total,
          line_cost: item.line_cost,
          unit_cost_snapshot: item.unit_cost_snapshot,
          cost_price_snapshot: item.cost_price_snapshot,
        })),
      },
    },
    include: {
      sale_items: true,
    },
  })

  // 6. Record LegacyIdMap for Sale
  await tx.legacyIdMap.create({
    data: {
      source_system: SOURCE_SYSTEM,
      entity_type: 'Sale',
      legacy_id: legacySaleIdStr,
      target_model: 'Sale',
      nextill_id: createdSale.id,
      batch_id: batchId,
      metadata: {
        reference_code: saleData.reference_code,
        grand_total: saleData.grand_total,
      },
    },
  })

  // 7. Record LegacyIdMap for each SaleItem
  for (let i = 0; i < createdSale.sale_items.length; i++) {
    const rawItem = saleData.items[i]
    if (rawItem && rawItem.legacy_id) {
      await tx.legacyIdMap.create({
        data: {
          source_system: SOURCE_SYSTEM,
          entity_type: 'SaleItem',
          legacy_id: String(rawItem.legacy_id),
          target_model: 'SaleItem',
          nextill_id: createdSale.sale_items[i].id,
          batch_id: batchId,
          metadata: {
            parent_legacy_sale_id: saleData.legacy_id,
            product_name: rawItem.product_name,
          },
        },
      })
    }
  }

  return {
    status: 'IMPORTED',
    legacy_id: saleData.legacy_id,
    nextill_id: createdSale.id,
    itemCount: createdSale.sale_items.length,
  }
}

module.exports = {
  importSale,
}
