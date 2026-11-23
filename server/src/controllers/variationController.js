const variationService = require('../services/variationService')

async function listVariations(req, res, next) {
  try {
    const { page, per_page, search } = req.query
    const result = await variationService.listVariations({ page, per_page, search })
    if (result.page !== undefined) {
      res.json({
        success: true,
        data: result.variations,
        meta: {
          page: result.page,
          per_page: result.per_page,
          total: result.total,
          total_pages: result.total_pages,
        },
      })
    } else {
      res.json({ success: true, data: result.variations, total: result.total })
    }
  } catch (err) {
    next(err)
  }
}

async function getVariation(req, res, next) {
  try {
    const variation = await variationService.getVariationById(req.params.id)
    res.json({ success: true, data: variation })
  } catch (err) {
    next(err)
  }
}

async function createVariation(req, res, next) {
  try {
    const variation = await variationService.createVariation(req.body)
    res.status(201).json({ success: true, data: variation, message: 'Variation created successfully' })
  } catch (err) {
    next(err)
  }
}

async function updateVariation(req, res, next) {
  try {
    const variation = await variationService.updateVariation(req.params.id, req.body)
    res.json({ success: true, data: variation, message: 'Variation updated successfully' })
  } catch (err) {
    next(err)
  }
}

async function deleteVariation(req, res, next) {
  try {
    const result = await variationService.deleteVariation(req.params.id)
    res.json({ success: true, data: result, message: 'Variation deleted successfully' })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listVariations,
  getVariation,
  createVariation,
  updateVariation,
  deleteVariation,
}
