const transferService = require('../services/transferService')

async function listTransfers(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { source_warehouse_id, destination_warehouse_id, status, search } = req.query

    const result = await transferService.listTransfers({
      page,
      per_page,
      source_warehouse_id,
      destination_warehouse_id,
      status,
      search,
    })

    res.json({
      success: true,
      data: result.transfers,
      meta: {
        page: result.page,
        per_page: result.per_page,
        total: result.total,
        total_pages: result.total_pages,
      },
    })
  } catch (err) {
    next(err)
  }
}

async function getTransferById(req, res, next) {
  try {
    const transfer = await transferService.getTransferById(req.params.id)
    res.json({ success: true, data: transfer })
  } catch (err) {
    next(err)
  }
}

async function createTransfer(req, res, next) {
  try {
    const transfer = await transferService.createTransfer(req.body, req.user.id)
    res.status(201).json({
      success: true,
      data: transfer,
      message: 'Stock transfer initiated successfully',
    })
  } catch (err) {
    next(err)
  }
}

async function receiveTransfer(req, res, next) {
  try {
    const transfer = await transferService.receiveTransfer(req.params.id, req.user.id, req.body)
    res.json({
      success: true,
      data: transfer,
      message: 'Stock transfer received and verified successfully',
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listTransfers,
  getTransferById,
  createTransfer,
  receiveTransfer,
}
