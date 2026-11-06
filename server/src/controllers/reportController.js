const reportService = require('../services/reportService')

async function getSalesSummary(req, res, next) {
  try {
    const { start_date, end_date } = req.query
    const data = await reportService.getSalesSummary({ start_date, end_date })
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function getSalesByDay(req, res, next) {
  try {
    const { start_date, end_date } = req.query
    const data = await reportService.getSalesByDay({ start_date, end_date })
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function getTopProducts(req, res, next) {
  try {
    const { start_date, end_date, limit = 10, by = 'revenue' } = req.query
    const data = await reportService.getTopProducts({ start_date, end_date, limit: parseInt(limit), by })
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function getCategoryPerformance(req, res, next) {
  try {
    const { start_date, end_date } = req.query
    const data = await reportService.getCategoryPerformance({ start_date, end_date })
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function getCashierPerformance(req, res, next) {
  try {
    const { start_date, end_date } = req.query
    const data = await reportService.getCashierPerformance({ start_date, end_date })
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function getInventoryStatus(req, res, next) {
  try {
    const data = await reportService.getInventoryStatus()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function getProfitReport(req, res, next) {
  try {
    const { start_date, end_date } = req.query
    const data = await reportService.getProfitReport({ start_date, end_date })
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function getDashboardSummary(req, res, next) {
  try {
    const data = await reportService.getDashboardSummary()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  getSalesSummary,
  getSalesByDay,
  getTopProducts,
  getCategoryPerformance,
  getCashierPerformance,
  getInventoryStatus,
  getProfitReport,
  getDashboardSummary,
}
