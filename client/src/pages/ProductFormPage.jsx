import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { productsService } from '../services/products'
import { brandsService } from '../services/brands'
import { variationsService } from '../services/variations'
import { useSettings } from '../hooks/useSettings'
import { UOM_CONFIG, getUnitsForCategory, getBaseUnit, getDefaultPricingUnit } from '../utils/uom'

export default function ProductFormPage() {
  const { currency_symbol: currencySymbol = 'LKR' } = useSettings()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = Boolean(id)

  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])
  const [variations, setVariations] = useState([])
  const [isLoadingProduct, setIsLoadingProduct] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const fileInputRef = useRef(null)

  // Category modal state (create, edit, delete)
  const [categoryModal, setCategoryModal] = useState({
    open: false,
    mode: 'create', // 'create' | 'edit' | 'delete'
    category: null,
    name: '',
    description: '',
    isSubmitting: false,
    error: '',
  })

  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    category_id: '',
    brand_id: '',
    variation_id: '',
    variation_value: '',
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    usual_price: '',
    our_price: '',
    wholesale_price: '',
    price: '',
    cost_price: '',
    quantity: '',
    low_stock_threshold: '',
    is_active: true,
  })
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  // Load categories with optional auto-select
  const loadCategories = useCallback(async (selectId = null) => {
    try {
      const res = await productsService.categories()
      const list = res.data?.data || []
      setCategories(list)
      if (selectId) {
        setForm((prev) => ({ ...prev, category_id: selectId }))
      }
    } catch {
      toast.error('Failed to load categories')
    }
  }, [])

  useEffect(() => {
    loadCategories()
    brandsService
      .list()
      .then((res) => setBrands(res.data?.data || []))
      .catch(() => {})
    variationsService
      .list()
      .then((res) => setVariations(res.data?.data || []))
      .catch(() => {})
  }, [loadCategories])

  function openCategoryModal(mode, category = null) {
    setCategoryModal({
      open: true,
      mode,
      category,
      name: category ? category.name : '',
      description: category?.description || '',
      isSubmitting: false,
      error: '',
    })
  }

  function closeCategoryModal() {
    setCategoryModal({
      open: false,
      mode: 'create',
      category: null,
      name: '',
      description: '',
      isSubmitting: false,
      error: '',
    })
  }

  async function handleCategorySubmit(e) {
    e.preventDefault()
    if (categoryModal.mode === 'delete') {
      setCategoryModal((prev) => ({ ...prev, isSubmitting: true, error: '' }))
      try {
        await productsService.deleteCategory(categoryModal.category.id)
        toast.success('Category deleted. Associated products set to unassigned.')
        if (form.category_id === categoryModal.category.id) {
          setField('category_id', '')
        }
        closeCategoryModal()
        await loadCategories()
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || 'Failed to delete category'
        setCategoryModal((prev) => ({ ...prev, isSubmitting: false, error: msg }))
      }
      return
    }

    const name = categoryModal.name.trim()
    if (!name) {
      setCategoryModal((prev) => ({ ...prev, error: 'Category name is required' }))
      return
    }

    setCategoryModal((prev) => ({ ...prev, isSubmitting: true, error: '' }))
    try {
      if (categoryModal.mode === 'create') {
        const res = await productsService.createCategory({
          name,
          description: categoryModal.description.trim() || null,
        })
        const newCat = res.data?.data
        toast.success('Category created successfully')
        closeCategoryModal()
        await loadCategories(newCat?.id)
      } else if (categoryModal.mode === 'edit') {
        await productsService.updateCategory(categoryModal.category.id, {
          name,
          description: categoryModal.description.trim() || null,
        })
        toast.success('Category updated successfully')
        closeCategoryModal()
        await loadCategories()
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to save category'
      setCategoryModal((prev) => ({ ...prev, isSubmitting: false, error: msg }))
    }
  }

  // Load product if editing
  useEffect(() => {
    if (!id) return
    setIsLoadingProduct(true)
    productsService
      .get(id)
      .then((res) => {
        const p = res.data?.data || {}
        setForm({
          name: p.name || '',
          sku: p.sku || '',
          barcode: p.barcode || '',
          category_id: p.category_id || '',
          brand_id: p.brand_id || '',
          variation_id: p.variation_id || '',
          variation_value: p.variation_value || '',
          unit_category: p.unit_category || 'COUNT',
          base_unit: p.base_unit || 'pcs',
          pricing_unit: p.pricing_unit || 'pcs',
          usual_price: p.usual_price != null ? String(p.usual_price) : p.price != null ? String(p.price) : '',
          our_price: p.our_price != null ? String(p.our_price) : p.price != null ? String(p.price) : '',
          wholesale_price: p.wholesale_price != null ? String(p.wholesale_price) : '',
          price: p.price != null ? String(p.price) : '',
          cost_price: p.cost_price != null ? String(p.cost_price) : '',
          quantity: p.quantity != null ? String(p.quantity) : '',
          low_stock_threshold: p.low_stock_threshold != null ? String(p.low_stock_threshold) : '',
          is_active: p.is_active ?? true,
        })
        if (p.image_url) {
          setImagePreview(p.image_url)
        }
      })
      .catch(() => {
        toast.error('Failed to load product')
        navigate('/products')
      })
      .finally(() => setIsLoadingProduct(false))
  }, [id, navigate])

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) {
      setErrors((prev) => {
        const updated = { ...prev }
        delete updated[key]
        return updated
      })
    }
  }

  function handleUnitCategoryChange(newCategory) {
    const base = getBaseUnit(newCategory)
    const pricing = getDefaultPricingUnit(newCategory)
    setForm((prev) => ({
      ...prev,
      unit_category: newCategory,
      base_unit: base,
      pricing_unit: pricing,
    }))
    setErrors((prev) => {
      const err = { ...prev }
      delete err.base_unit
      delete err.pricing_unit
      return err
    })
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, image: 'Please select a valid image file' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, image: 'Image size must be less than 5 MB' }))
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setErrors((prev) => {
      const updated = { ...prev }
      delete updated.image
      return updated
    })
  }

  function validate() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Product name is required'
    if (!form.sku.trim()) errs.sku = 'SKU is required'
    if (!form.base_unit.trim()) errs.base_unit = 'Base inventory unit is required'
    if (!form.pricing_unit.trim()) errs.pricing_unit = 'Pricing unit is required'

    const ourPriceNum = parseFloat(form.our_price)
    if (!form.our_price && form.our_price !== 0) {
      errs.our_price = 'Our selling price is required'
    } else if (isNaN(ourPriceNum) || ourPriceNum < 0) {
      errs.our_price = 'Our price must be a valid non-negative number'
    }

    if (form.usual_price !== '' && form.usual_price !== null) {
      const usualPriceNum = parseFloat(form.usual_price)
      if (isNaN(usualPriceNum) || usualPriceNum < 0) {
        errs.usual_price = 'Market price must be a valid non-negative number'
      }
    }

    if (form.wholesale_price !== '' && form.wholesale_price !== null) {
      const ws = parseFloat(form.wholesale_price)
      if (isNaN(ws) || ws < 0) {
        errs.wholesale_price = 'Wholesale price must be a valid non-negative number'
      }
    }

    if (form.cost_price !== '' && form.cost_price !== null) {
      const cp = parseFloat(form.cost_price)
      if (isNaN(cp) || cp < 0) {
        errs.cost_price = 'Cost price must be a valid non-negative number'
      }
    }

    if (form.quantity !== '' && form.quantity !== null) {
      const qty = parseFloat(form.quantity)
      if (isNaN(qty) || qty < 0) {
        errs.quantity = 'Quantity must be a valid non-negative number'
      }
    }

    if (form.low_stock_threshold !== '' && form.low_stock_threshold !== null) {
      const lst = parseFloat(form.low_stock_threshold)
      if (isNaN(lst) || lst < 0) {
        errs.low_stock_threshold = 'Threshold must be a valid non-negative number'
      }
    }

    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || null,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        variation_id: form.variation_id || null,
        variation_value: form.variation_value.trim() || null,
        unit_category: form.unit_category,
        base_unit: form.base_unit.trim(),
        pricing_unit: form.pricing_unit.trim(),
        usual_price: form.usual_price !== '' ? parseFloat(form.usual_price) : parseFloat(form.our_price),
        our_price: parseFloat(form.our_price),
        wholesale_price: form.wholesale_price !== '' ? parseFloat(form.wholesale_price) : null,
        price: parseFloat(form.our_price),
        cost_price: form.cost_price !== '' ? parseFloat(form.cost_price) : null,
        quantity: form.quantity !== '' ? parseFloat(form.quantity) : 0,
        low_stock_threshold: form.low_stock_threshold !== '' ? parseFloat(form.low_stock_threshold) : 0,
        is_active: form.is_active,
      }

      let savedProduct
      if (isEditing) {
        const res = await productsService.update(id, payload)
        savedProduct = res.data?.data
        toast.success('Product updated successfully')
      } else {
        const res = await productsService.create(payload)
        savedProduct = res.data?.data
        toast.success('Product created successfully')
      }

      if (imageFile && savedProduct?.id) {
        try {
          await productsService.uploadImage(savedProduct.id, imageFile)
        } catch {
          toast.error('Product saved, but image upload failed')
        }
      }

      navigate('/products')
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to save product'
      toast.error(msg)
      if (msg.toLowerCase().includes('sku')) {
        setErrors((prev) => ({ ...prev, sku: msg }))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const numUsual = parseFloat(form.usual_price) || 0
  const numOur = parseFloat(form.our_price) || 0
  const calculatedDiscount = Math.max(0, numUsual - numOur).toFixed(2)

  if (isLoadingProduct) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto p-12 text-center text-slate-500">
          <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Loading product details...</span>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('/products')}
              className="text-xs font-semibold text-slate-500 hover:text-primary-600 flex items-center gap-1.5 mb-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Products
            </button>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {isEditing ? `Edit Product: ${form.name}` : 'Add New Product'}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <Button type="button" variant="secondary" onClick={() => navigate('/products')} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>
              {isEditing ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* Section 1: Basic Information */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6 space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Basic Information</h2>

            <div>
              <Input
                label="Product Name *"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="e.g. Coca-Cola 500ml"
                error={errors.name}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="SKU (Stock Keeping Unit) *"
                value={form.sku}
                onChange={(e) => setField('sku', e.target.value)}
                placeholder="e.g. COKE-500ML"
                error={errors.sku}
              />
              <Input
                label="Barcode / UPC"
                value={form.barcode}
                onChange={(e) => setField('barcode', e.target.value)}
                placeholder="Scan or type barcode"
              />
            </div>

            {/* Category selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">Category</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openCategoryModal('create')}
                    className="text-xs font-semibold text-primary-600 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                  >
                    + New Category
                  </button>
                  {form.category_id && (
                    <>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          const cat = categories.find((c) => c.id === form.category_id)
                          if (cat) openCategoryModal('edit', cat)
                        }}
                        className="text-xs font-semibold text-slate-500 hover:text-primary-600 transition-colors"
                      >
                        Edit
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          const cat = categories.find((c) => c.id === form.category_id)
                          if (cat) openCategoryModal('delete', cat)
                        }}
                        className="text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              <select
                value={form.category_id}
                onChange={(e) => setField('category_id', e.target.value)}
                className="block w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all"
              >
                <option value="">Unassigned (No Category)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand & Variations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Brand</label>
                <select
                  value={form.brand_id}
                  onChange={(e) => setField('brand_id', e.target.value)}
                  className="block w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all"
                >
                  <option value="">None (Generic / Unbranded)</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Variation Type</label>
                <select
                  value={form.variation_id}
                  onChange={(e) => setField('variation_id', e.target.value)}
                  className="block w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all"
                >
                  <option value="">None (Standard Product)</option>
                  {variations.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>

                {form.variation_id && (
                  <div className="mt-2.5">
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Variation Option Value</label>
                    {(() => {
                      const currentVar = variations.find((v) => v.id === form.variation_id)
                      const varValues = currentVar?.values || []
                      return (
                        <div className="space-y-2">
                          {varValues.length > 0 ? (
                            <select
                              value={form.variation_value}
                              onChange={(e) => setField('variation_value', e.target.value)}
                              className="block w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all"
                            >
                              <option value="">Select a value or type below</option>
                              {varValues.map((val) => {
                                const valStr = typeof val === 'string' ? val : val.value
                                return (
                                  <option key={valStr} value={valStr}>
                                    {valStr}
                                  </option>
                                )
                              })}
                            </select>
                          ) : null}
                          <Input
                            placeholder="Or enter custom variation value (e.g. XL, Red, 500g)"
                            value={form.variation_value}
                            onChange={(e) => setField('variation_value', e.target.value)}
                          />
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Unit of Measure (UOM) */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6 space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unit of Measure (UOM)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Quantity Type *</label>
                <select
                  value={form.unit_category}
                  onChange={(e) => handleUnitCategoryChange(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all"
                >
                  <option value="COUNT">Count (Pieces, Units, Packs…)</option>
                  <option value="WEIGHT">Weight (g, kg)</option>
                  <option value="VOLUME">Volume (ml, L)</option>
                  <option value="LENGTH">Length (m, cm, yd…)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Select whether item is sold by count, weight, volume, or length</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Base Inventory Unit *</label>
                <div className="relative">
                  <input
                    type="text"
                    list="base-unit-options"
                    value={form.base_unit}
                    onChange={(e) => {
                      const newBase = e.target.value
                      setForm((prev) => ({
                        ...prev,
                        base_unit: newBase,
                        pricing_unit: prev.pricing_unit === prev.base_unit ? newBase : prev.pricing_unit,
                      }))
                      if (errors.base_unit)
                        setErrors((prev) => {
                          const err = { ...prev }
                          delete err.base_unit
                          return err
                        })
                    }}
                    placeholder={
                      form.unit_category === 'WEIGHT'
                        ? 'e.g. g, kg'
                        : form.unit_category === 'VOLUME'
                        ? 'e.g. ml, L'
                        : form.unit_category === 'LENGTH'
                        ? 'e.g. m, cm, yd'
                        : 'e.g. pcs, pack, box'
                    }
                    className={`block w-full rounded-xl border px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all bg-white/90 ${
                      errors.base_unit ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200/90'
                    }`}
                  />
                  <datalist id="base-unit-options">
                    {getUnitsForCategory(form.unit_category).map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </datalist>
                </div>
                {/* Quick-select pills */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {getUnitsForCategory(form.unit_category).map((u) => (
                    <button
                      key={u.value}
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          base_unit: u.value,
                          pricing_unit: prev.pricing_unit === prev.base_unit ? u.value : prev.pricing_unit,
                        }))
                        if (errors.base_unit)
                          setErrors((prev) => {
                            const err = { ...prev }
                            delete err.base_unit
                            return err
                          })
                      }}
                      className={`px-2 py-0.5 text-xs rounded-lg border transition-all ${
                        form.base_unit === u.value
                          ? 'bg-blue-50 border-primary-500 text-primary-700 font-bold shadow-2xs'
                          : 'bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {u.value}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Stock is tracked in {form.base_unit || 'base unit'}</p>
                {errors.base_unit && <p className="text-xs text-rose-600 mt-1">{errors.base_unit}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Pricing Unit *</label>
                <div className="relative">
                  <input
                    type="text"
                    list="pricing-unit-options"
                    value={form.pricing_unit}
                    onChange={(e) => setField('pricing_unit', e.target.value)}
                    placeholder={
                      form.unit_category === 'WEIGHT'
                        ? 'e.g. kg, g'
                        : form.unit_category === 'VOLUME'
                        ? 'e.g. L, ml'
                        : form.unit_category === 'LENGTH'
                        ? 'e.g. m, cm, yd'
                        : 'e.g. pcs, pack, box'
                    }
                    className={`block w-full rounded-xl border px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all bg-white/90 ${
                      errors.pricing_unit ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200/90'
                    }`}
                  />
                  <datalist id="pricing-unit-options">
                    {getUnitsForCategory(form.unit_category).map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </datalist>
                </div>
                {/* Quick-select pills */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {getUnitsForCategory(form.unit_category).map((u) => (
                    <button
                      key={u.value}
                      type="button"
                      onClick={() => setField('pricing_unit', u.value)}
                      className={`px-2 py-0.5 text-xs rounded-lg border transition-all ${
                        form.pricing_unit === u.value
                          ? 'bg-blue-50 border-primary-500 text-primary-700 font-bold shadow-2xs'
                          : 'bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {u.value}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Price is set per {form.pricing_unit || 'pricing unit'}</p>
                {errors.pricing_unit && <p className="text-xs text-rose-600 mt-1">{errors.pricing_unit}</p>}
              </div>
            </div>
          </div>

          {/* Section 3: Pricing & Cost */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6 space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pricing &amp; Cost</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input
                  label={`MRKT_Price (Market/Reference) (${currencySymbol})`}
                  type="number"
                  step="any"
                  value={form.usual_price}
                  onChange={(e) => setField('usual_price', e.target.value)}
                  placeholder="0.00"
                  error={errors.usual_price}
                />
                <p className="text-[11px] text-slate-400 mt-1">Standard market reference price</p>
              </div>

              <div>
                <Input
                  label={`Our_price (Selling Price) (${currencySymbol}) *`}
                  type="number"
                  step="any"
                  value={form.our_price}
                  onChange={(e) => setField('our_price', e.target.value)}
                  placeholder="0.00"
                  error={errors.our_price}
                />
                <p className="text-[11px] text-slate-400 mt-1">Preferred selling price</p>
              </div>

              <div>
                <Input
                  label={`Wholesale Price (${currencySymbol})`}
                  type="number"
                  step="any"
                  value={form.wholesale_price}
                  onChange={(e) => setField('wholesale_price', e.target.value)}
                  placeholder="0.00 (optional)"
                  error={errors.wholesale_price}
                />
                <p className="text-[11px] text-slate-400 mt-1">Wholesale / bulk selling price</p>
              </div>

              <div>
                <Input
                  label={`Cost Price (${currencySymbol})`}
                  type="number"
                  step="any"
                  value={form.cost_price}
                  onChange={(e) => setField('cost_price', e.target.value)}
                  placeholder="0.00 (optional)"
                  error={errors.cost_price}
                />
                <p className="text-[11px] text-slate-400 mt-1">Purchasing cost for margin tracking</p>
              </div>
            </div>

            {/* Dynamic Discount display */}
            <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-primary-900 uppercase tracking-wider">Discount</p>
                <p className="text-xs text-primary-700 mt-0.5">
                  Calculated automatically: MRKT_Price ({currencySymbol} {numUsual.toFixed(2)}) − Our_price ({currencySymbol} {numOur.toFixed(2)})
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 bg-white px-3.5 py-1.5 rounded-xl border border-blue-200 shadow-2xs">
                <span className="text-xs text-primary-600 font-semibold">{currencySymbol}</span>
                <span className="text-xl font-bold text-primary-800">{calculatedDiscount}</span>
              </div>
            </div>
          </div>

          {/* Section 4: Inventory */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6 space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inventory</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input
                  label={`Current Quantity (${form.base_unit})${isEditing ? ' — Locked' : ''}`}
                  type="number"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => setField('quantity', e.target.value)}
                  placeholder="0"
                  error={errors.quantity}
                  disabled={isEditing}
                  readOnly={isEditing}
                  className={isEditing ? 'bg-slate-100/80 cursor-not-allowed text-slate-500 font-semibold' : ''}
                />
                {isEditing && (
                  <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1 font-medium bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Quantity can only be set during initial registration. Adjust stock via the Inventory page or Purchases.
                  </p>
                )}
              </div>
              <Input
                label={`Low Stock Threshold (${form.base_unit})`}
                type="number"
                step="any"
                value={form.low_stock_threshold}
                onChange={(e) => setField('low_stock_threshold', e.target.value)}
                placeholder="10"
                error={errors.low_stock_threshold}
              />
            </div>
          </div>

          {/* Section 5: Image Upload */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6 space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Image</h2>

            <div className="flex items-start gap-4">
              <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center bg-slate-50/60 shadow-2xs">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </div>

              <div className="flex-1">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                  {imagePreview ? 'Change Image' : 'Upload Image'}
                </Button>
                {imagePreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-2 text-rose-500 hover:text-rose-700"
                    onClick={() => {
                      setImageFile(null)
                      setImagePreview(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    Remove
                  </Button>
                )}
                <p className="text-[11px] text-slate-400 mt-2">JPG, PNG, or WebP. Max 5 MB.</p>
                {errors.image && <p className="text-xs text-rose-600 mt-1">{errors.image}</p>}
              </div>
            </div>
          </div>

          {/* Section 6: Status */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Active Status</h2>
                <p className="text-xs text-slate-500 mt-0.5">Inactive products won&apos;t appear in the POS cashier terminal</p>
              </div>
              <button
                type="button"
                onClick={() => setField('is_active', !form.is_active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.is_active ? 'bg-primary-600' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                    form.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Form actions */}
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/products')} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {isEditing ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        </form>

        {/* Category Modal (Create / Edit / Delete) */}
        {categoryModal.open && (
          <Modal
            isOpen={categoryModal.open}
            onClose={closeCategoryModal}
            title={
              categoryModal.mode === 'create'
                ? 'Create New Category'
                : categoryModal.mode === 'edit'
                ? 'Edit Category'
                : 'Delete Category'
            }
            size="sm"
          >
            {categoryModal.mode === 'delete' ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-700">
                  Are you sure you want to delete category{' '}
                  <strong className="text-slate-900">&quot;{categoryModal.category?.name}&quot;</strong>?
                </p>
                <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800">
                  <p className="font-bold">Associated Products Protection:</p>
                  <p className="mt-1 leading-relaxed">
                    This category currently has{' '}
                    <strong>{categoryModal.category?._count?.products || 0} product(s)</strong>.
                    Deleting this category will <strong>NOT</strong> delete any products; their category will simply be set to Unassigned.
                  </p>
                </div>
                {categoryModal.error && <p className="text-xs text-rose-600">{categoryModal.error}</p>}
                <div className="flex justify-end gap-2.5 pt-2">
                  <Button variant="secondary" onClick={closeCategoryModal} disabled={categoryModal.isSubmitting}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={handleCategorySubmit} isLoading={categoryModal.isSubmitting}>
                    Delete Category
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCategorySubmit} className="space-y-4">
                <Input
                  label="Category Name *"
                  value={categoryModal.name}
                  onChange={(e) => setCategoryModal((prev) => ({ ...prev, name: e.target.value, error: '' }))}
                  placeholder="e.g. Beverages, Snacks, Hardware"
                  error={categoryModal.error}
                  autoFocus
                />
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Description (Optional)</label>
                  <textarea
                    value={categoryModal.description}
                    onChange={(e) => setCategoryModal((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Short description for this category..."
                    rows={2}
                    className="block w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all placeholder:text-slate-400"
                  />
                </div>
                <div className="flex justify-end gap-2.5 pt-2">
                  <Button variant="secondary" type="button" onClick={closeCategoryModal} disabled={categoryModal.isSubmitting}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" isLoading={categoryModal.isSubmitting}>
                    {categoryModal.mode === 'create' ? 'Create Category' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            )}
          </Modal>
        )}
      </div>
    </DashboardLayout>
  )
}
