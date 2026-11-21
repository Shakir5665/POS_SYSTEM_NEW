const warehouseService = require('../services/warehouseService')

async function list(req, res, next) {
  try {
    const { is_active } = req.query
    const warehouses = await warehouseService.listWarehouses({ is_active })
    res.json({ success: true, data: warehouses })
  } catch (err) {
    next(err)
  }
}

async function get(req, res, next) {
  try {
    const warehouse = await warehouseService.getWarehouseById(req.params.id)
    res.json({ success: true, data: warehouse })
  } catch (err) {
    next(err)
  }
}

async function create(req, res, next) {
  try {
    const warehouse = await warehouseService.createWarehouse(req.body)
    res.status(201).json({
      success: true,
      data: warehouse,
      message: 'Warehouse created successfully',
    })
  } catch (err) {
    next(err)
  }
}

async function update(req, res, next) {
  try {
    const warehouse = await warehouseService.updateWarehouse(req.params.id, req.body)
    res.json({
      success: true,
      data: warehouse,
      message: 'Warehouse updated successfully',
    })
  } catch (err) {
    next(err)
  }
}

async function getDefault(req, res, next) {
  try {
    const warehouse = await warehouseService.getDefaultWarehouse()
    res.json({ success: true, data: warehouse })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  list,
  get,
  create,
  update,
  getDefault,
}
