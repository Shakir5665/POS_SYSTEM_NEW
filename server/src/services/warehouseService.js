const prisma = require('../utils/prismaClient')
const { NotFoundError, ValidationError } = require('../utils/errors')

/**
 * List warehouses with optional active filter.
 * Default warehouse is ordered first, then alphabetically by name.
 */
async function listWarehouses({ is_active } = {}) {
  const where = {}
  if (is_active !== undefined) {
    where.is_active = is_active === 'true' || is_active === true
  }

  return prisma.warehouse.findMany({
    where,
    orderBy: [
      { is_default: 'desc' },
      { name: 'asc' },
    ],
  })
}

/**
 * Get warehouse by UUID.
 */
async function getWarehouseById(id) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
  })
  if (!warehouse) {
    throw new NotFoundError(`Warehouse with ID ${id} not found`)
  }
  return warehouse
}

/**
 * Get the active default warehouse, falling back to any default or first warehouse.
 */
async function getDefaultWarehouse() {
  const defaultWh = await prisma.warehouse.findFirst({
    where: { is_default: true, is_active: true },
  })
  if (defaultWh) return defaultWh

  const anyDefault = await prisma.warehouse.findFirst({
    where: { is_default: true },
  })
  if (anyDefault) return anyDefault

  return prisma.warehouse.findFirst()
}

/**
 * Create a new warehouse.
 * If designated as default, unset existing default warehouses in a transaction.
 */
async function createWarehouse({ code, name, address, is_default = false, is_active = true }) {
  if (!code || !code.trim()) {
    throw new ValidationError('Warehouse code is required', [{ field: 'code', message: 'Warehouse code is required' }])
  }
  if (!name || !name.trim()) {
    throw new ValidationError('Warehouse name is required', [{ field: 'name', message: 'Warehouse name is required' }])
  }

  const normalizedCode = code.trim().toUpperCase()
  const existing = await prisma.warehouse.findUnique({
    where: { code: normalizedCode },
  })
  if (existing) {
    throw new ValidationError(`Warehouse code "${normalizedCode}" already exists`, [
      { field: 'code', message: 'Warehouse code must be unique' },
    ])
  }

  const shouldBeDefault = Boolean(is_default)

  return prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.warehouse.updateMany({
        where: { is_default: true },
        data: { is_default: false },
      })
    }

    return tx.warehouse.create({
      data: {
        code: normalizedCode,
        name: name.trim(),
        address: address ? address.trim() : null,
        is_default: shouldBeDefault,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
      },
    })
  })
}

/**
 * Update an existing warehouse.
 * If updating to default, unset other defaults in a transaction.
 */
async function updateWarehouse(id, { code, name, address, is_default, is_active }) {
  const existing = await prisma.warehouse.findUnique({ where: { id } })
  if (!existing) {
    throw new NotFoundError(`Warehouse with ID ${id} not found`)
  }

  const data = {}
  if (code !== undefined) {
    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode) {
      throw new ValidationError('Warehouse code cannot be empty', [{ field: 'code', message: 'Code cannot be empty' }])
    }
    const duplicate = await prisma.warehouse.findFirst({
      where: { code: normalizedCode, id: { not: id } },
    })
    if (duplicate) {
      throw new ValidationError(`Warehouse code "${normalizedCode}" is already in use`, [
        { field: 'code', message: 'Warehouse code must be unique' },
      ])
    }
    data.code = normalizedCode
  }

  if (name !== undefined) {
    if (!name.trim()) {
      throw new ValidationError('Warehouse name cannot be empty', [{ field: 'name', message: 'Name cannot be empty' }])
    }
    data.name = name.trim()
  }

  if (address !== undefined) {
    data.address = address ? address.trim() : null
  }

  if (is_active !== undefined) {
    data.is_active = Boolean(is_active)
  }

  const settingDefault = is_default !== undefined && Boolean(is_default)

  return prisma.$transaction(async (tx) => {
    if (settingDefault) {
      await tx.warehouse.updateMany({
        where: { id: { not: id }, is_default: true },
        data: { is_default: false },
      })
      data.is_default = true
    } else if (is_default !== undefined) {
      data.is_default = false
    }

    return tx.warehouse.update({
      where: { id },
      data,
    })
  })
}

/**
 * Validate that a warehouse exists, and optionally verify it is active.
 */
async function validateWarehouseId(warehouseId, { allowInactive = true } = {}) {
  if (!warehouseId) return null
  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } })
  if (!warehouse) {
    throw new NotFoundError(`Warehouse with ID ${warehouseId} not found`)
  }
  if (!allowInactive && !warehouse.is_active) {
    throw new ValidationError(`Cannot assign transaction to inactive warehouse "${warehouse.name}"`)
  }
  return warehouse
}

module.exports = {
  listWarehouses,
  getWarehouseById,
  getDefaultWarehouse,
  createWarehouse,
  updateWarehouse,
  validateWarehouseId,
}
