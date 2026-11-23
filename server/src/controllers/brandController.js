const brandService = require('../services/brandService')

async function listBrands(req, res, next) {
  try {
    const { page, per_page, search } = req.query
    const result = await brandService.listBrands({ page, per_page, search })
    if (result.page !== undefined) {
      res.json({
        success: true,
        data: result.brands,
        meta: {
          page: result.page,
          per_page: result.per_page,
          total: result.total,
          total_pages: result.total_pages,
        },
      })
    } else {
      res.json({ success: true, data: result.brands, total: result.total })
    }
  } catch (err) {
    next(err)
  }
}

async function getBrand(req, res, next) {
  try {
    const brand = await brandService.getBrandById(req.params.id)
    res.json({ success: true, data: brand })
  } catch (err) {
    next(err)
  }
}

async function createBrand(req, res, next) {
  try {
    const brand = await brandService.createBrand(req.body)
    res.status(201).json({ success: true, data: brand, message: 'Brand created successfully' })
  } catch (err) {
    next(err)
  }
}

async function updateBrand(req, res, next) {
  try {
    const brand = await brandService.updateBrand(req.params.id, req.body)
    res.json({ success: true, data: brand, message: 'Brand updated successfully' })
  } catch (err) {
    next(err)
  }
}

async function deleteBrand(req, res, next) {
  try {
    const result = await brandService.deleteBrand(req.params.id)
    res.json({
      success: true,
      data: result,
      message: `Brand deleted successfully. ${result.affected_products} products were unlinked.`,
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
}
