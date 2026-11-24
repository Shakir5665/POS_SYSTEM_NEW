const prisma = require('../utils/prismaClient')
const { Decimal } = require('../utils/money')
const { getDefaultWarehouse } = require('./warehouseService')

/**
 * Ensures a WarehouseStock record exists for a given warehouse and product.
 * If creating, initializes quantity to 0 (or optionally initialQty).
 */
async function getOrCreateWarehouseStock(tx, warehouseId, productId, initialQty = 0) {
  const client = tx || prisma
  let ws = await client.warehouseStock.findUnique({
    where: {
      warehouse_id_product_id: {
        warehouse_id: warehouseId,
        product_id: productId,
      },
    },
  })

  if (!ws) {
    ws = await client.warehouseStock.create({
      data: {
        warehouse_id: warehouseId,
        product_id: productId,
        quantity: new Decimal(initialQty),
      },
    })
  }

  return ws
}

/**
 * Adjusts the stock of a product at a specific branch/warehouse.
 * Also synchronizes the global Product.quantity as the sum of all branch stocks
 * (or updates it proportionally) to maintain full backward compatibility.
 *
 * @param {Object} tx - Active Prisma transaction
 * @param {string} warehouseId - Branch / Warehouse UUID
 * @param {string} productId - Product UUID
 * @param {Decimal|number} deltaBaseQty - Positive for addition, negative for deduction
 * @returns {Promise<{ branchStock: Object, newBranchQty: Decimal, newGlobalQty: Decimal }>}
 */
async function adjustBranchStock(tx, warehouseId, productId, deltaBaseQty) {
  const delta = new Decimal(deltaBaseQty)

  // 1. Get or create the branch stock record
  const ws = await getOrCreateWarehouseStock(tx, warehouseId, productId, 0)
  const currentBranchQty = new Decimal(ws.quantity)
  const newBranchQty = currentBranchQty.plus(delta)

  // 2. Update Branch Stock
  const updatedBranchStock = await tx.warehouseStock.update({
    where: { id: ws.id },
    data: { quantity: newBranchQty },
  })

  // 3. Update global Product.quantity to ensure legacy endpoints remain in sync
  const prod = await tx.product.findUnique({
    where: { id: productId },
    select: { quantity: true },
  })
  const currentGlobalQty = new Decimal(prod.quantity)
  const newGlobalQty = currentGlobalQty.plus(delta)

  await tx.product.update({
    where: { id: productId },
    data: { quantity: newGlobalQty },
  })

  return {
    branchStock: updatedBranchStock,
    newBranchQty,
    newGlobalQty,
  }
}

/**
 * Check if a branch has sufficient stock for a given base quantity.
 */
async function checkBranchStock(tx, warehouseId, productId, requiredBaseQty) {
  const client = tx || prisma
  const ws = await client.warehouseStock.findUnique({
    where: {
      warehouse_id_product_id: {
        warehouse_id: warehouseId,
        product_id: productId,
      },
    },
  })

  const available = ws ? new Decimal(ws.quantity) : new Decimal(0)
  return {
    available,
    isSufficient: available.gte(requiredBaseQty),
  }
}

/**
 * Seed initial WarehouseStock records for all products into the default warehouse
 * for any products that do not have any branch stock assigned yet.
 */
async function syncMissingBranchStocks() {
  const defaultWh = await getDefaultWarehouse()
  if (!defaultWh) return

  const productsWithoutStock = await prisma.product.findMany({
    where: {
      warehouse_stocks: {
        none: { warehouse_id: defaultWh.id },
      },
    },
    select: { id: true, quantity: true, low_stock_threshold: true },
  })

  if (productsWithoutStock.length === 0) return

  for (const p of productsWithoutStock) {
    await prisma.warehouseStock.upsert({
      where: {
        warehouse_id_product_id: {
          warehouse_id: defaultWh.id,
          product_id: p.id,
        },
      },
      update: {},
      create: {
        warehouse_id: defaultWh.id,
        product_id: p.id,
        quantity: p.quantity,
        low_stock_threshold: p.low_stock_threshold,
      },
    })
  }
}

module.exports = {
  getOrCreateWarehouseStock,
  adjustBranchStock,
  checkBranchStock,
  syncMissingBranchStocks,
}
