const productService = require('../services/productService')
const path = require('path')

async function listProducts(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const per_page = parseInt(req.query.per_page) || 20
    const { search, category_id } = req.query
    const include_inactive = req.query.include_inactive === 'true'

    const result = await productService.listProducts({ page, per_page, search, category_id, include_inactive })

    res.json({
      success: true,
      data: result.products,
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

async function getProduct(req, res, next) {
  try {
    const product = await productService.getProductById(req.params.id)
    res.json({ success: true, data: product })
  } catch (err) {
    next(err)
  }
}

async function getProductByBarcode(req, res, next) {
  try {
    const product = await productService.getProductByBarcode(req.params.code)
    res.json({ success: true, data: product })
  } catch (err) {
    next(err)
  }
}

async function createProduct(req, res, next) {
  try {
    const data = { ...req.body }
    if (req.file) {
      data.image_url = `/uploads/products/${req.file.filename}`
    }
    const product = await productService.createProduct(data)
    res.status(201).json({ success: true, data: product, message: 'Product created successfully' })
  } catch (err) {
    next(err)
  }
}

async function updateProduct(req, res, next) {
  try {
    const data = { ...req.body }
    if (req.file) {
      data.image_url = `/uploads/products/${req.file.filename}`
    }
    const product = await productService.updateProduct(req.params.id, data)
    res.json({ success: true, data: product, message: 'Product updated successfully' })
  } catch (err) {
    next(err)
  }
}

async function deleteProduct(req, res, next) {
  try {
    await productService.softDeleteProduct(req.params.id)
    res.json({ success: true, data: null, message: 'Product deactivated successfully' })
  } catch (err) {
    next(err)
  }
}

async function listCategories(req, res, next) {
  try {
    const categories = await productService.listCategories()
    res.json({ success: true, data: categories })
  } catch (err) {
    next(err)
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await productService.createCategory(req.body)
    res.status(201).json({ success: true, data: category, message: 'Category created successfully' })
  } catch (err) {
    next(err)
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await productService.updateCategory(req.params.id, req.body)
    res.json({ success: true, data: category, message: 'Category updated successfully' })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listProducts,
  getProduct,
  getProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  createCategory,
  updateCategory,
}
