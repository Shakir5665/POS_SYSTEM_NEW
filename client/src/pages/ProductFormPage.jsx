import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { productsService } from '../services/products'

export default function ProductFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = Boolean(id)

  const [categories, setCategories] = useState([])
  const [isLoadingProduct, setIsLoadingProduct] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    category_id: '',
    price: '',
    cost_price: '',
    quantity: '0',
    low_stock_threshold: '10',
    is_active: true,
  })
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  // Load categories
  useEffect(() => {
    productsService.categories()
      .then((res) => setCategories(res.data?.data || []))
      .catch(() => toast.error('Failed to load categories'))
  }, [])

  // Load product if editing
  useEffect(() => {
    if (!isEditing) return
    productsService.get(id)
      .then((res) => {
        const p = res.data?.data
        if (!p) { toast.error('Product not found'); navigate('/products'); return }
        setForm({
          name: p.name || '',
          sku: p.sku || '',
          barcode: p.barcode || '',
          category_id: p.category_id || '',
          price: p.price?.toString() || '',
          cost_price: p.cost_price?.toString() || '',
          quantity: p.quantity?.toString() || '0',
          low_stock_threshold: p.low_stock_threshold?.toString() || '10',
          is_active: p.is_active ?? true,
        })
        if (p.image_url) setImagePreview(p.image_url)
      })
      .catch(() => { toast.error('Failed to load product'); navigate('/products') })
      .finally(() => setIsLoadingProduct(false))
  }, [id, isEditing, navigate])

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => { const e = { ...prev }; delete e[key]; return e })
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, image: 'Please select a valid image file' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, image: 'Image must be smaller than 5 MB' }))
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setErrors((prev) => { const e = { ...prev }; delete e.image; return e })
  }

  function validate() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Product name is required'
    if (!form.sku.trim()) errs.sku = 'SKU is required'
    if (!form.category_id) errs.category_id = 'Category is required'
    if (!form.price || parseFloat(form.price) <= 0) errs.price = 'Price must be greater than 0'
    if (form.cost_price && parseFloat(form.cost_price) < 0) errs.cost_price = 'Cost price cannot be negative'
    if (form.quantity === '' || parseInt(form.quantity) < 0) errs.quantity = 'Quantity must be 0 or more'
    if (form.low_stock_threshold === '' || parseInt(form.low_stock_threshold) < 0) errs.low_stock_threshold = 'Threshold must be 0 or more'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) { toast.error('Please fix the errors below'); return }

    setIsSubmitting(true)
    try {
      let payload

      if (imageFile) {
        // Use FormData for file upload
        payload = new FormData()
        payload.append('name', form.name.trim())
        payload.append('sku', form.sku.trim())
        if (form.barcode.trim()) payload.append('barcode', form.barcode.trim())
        payload.append('category_id', form.category_id)
        payload.append('price', form.price)
        if (form.cost_price) payload.append('cost_price', form.cost_price)
        payload.append('quantity', form.quantity)
        payload.append('low_stock_threshold', form.low_stock_threshold)
        payload.append('is_active', form.is_active ? 'true' : 'false')
        payload.append('image', imageFile)
      } else {
        payload = {
          name: form.name.trim(),
          sku: form.sku.trim(),
          barcode: form.barcode.trim() || null,
          category_id: form.category_id,
          price: parseFloat(form.price),
          cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
          quantity: parseInt(form.quantity),
          low_stock_threshold: parseInt(form.low_stock_threshold),
          is_active: form.is_active,
        }
      }

      if (isEditing) {
        await productsService.update(id, payload)
        toast.success('Product updated successfully')
      } else {
        await productsService.create(payload)
        toast.success('Product created successfully')
      }

      navigate('/products')
    } catch (err) {
      const apiError = err.response?.data?.error
      if (apiError?.details) {
        const fieldErrors = {}
        apiError.details.forEach(({ field, message }) => { fieldErrors[field] = message })
        setErrors(fieldErrors)
        toast.error('Please fix the validation errors')
      } else {
        toast.error(apiError?.message || 'Failed to save product')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoadingProduct) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <div className="flex items-center gap-3 text-gray-500">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading product…
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/products')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isEditing ? 'Edit Product' : 'Add Product'}</h1>
            <p className="text-sm text-gray-500">{isEditing ? 'Update the product details below' : 'Fill in the details for the new product'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Basic info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Basic Information</h2>

            <Input
              label="Product Name *"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Coca-Cola 500ml"
              error={errors.name}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="SKU *"
                value={form.sku}
                onChange={(e) => setField('sku', e.target.value.toUpperCase())}
                placeholder="e.g. BEV-001"
                error={errors.sku}
              />
              <Input
                label="Barcode (EAN)"
                value={form.barcode}
                onChange={(e) => setField('barcode', e.target.value)}
                placeholder="e.g. 6001234567890"
                error={errors.barcode}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Category *</label>
              <select
                value={form.category_id}
                onChange={(e) => setField('category_id', e.target.value)}
                className={`block w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition bg-white
                  ${errors.category_id ? 'border-danger-500 bg-danger-50' : 'border-gray-300'}`}
              >
                <option value="">Select a category…</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {errors.category_id && <p className="text-xs text-danger-600 mt-1">{errors.category_id}</p>}
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mt-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Pricing</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Selling Price (GH₵) *"
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={(e) => setField('price', e.target.value)}
                placeholder="0.00"
                error={errors.price}
              />
              <Input
                label="Cost Price (GH₵)"
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setField('cost_price', e.target.value)}
                placeholder="0.00 (optional)"
                error={errors.cost_price}
              />
            </div>
          </div>

          {/* Inventory */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mt-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Inventory</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Current Quantity"
                type="number"
                min="0"
                step="1"
                value={form.quantity}
                onChange={(e) => setField('quantity', e.target.value)}
                placeholder="0"
                error={errors.quantity}
                disabled={isEditing}
              />
              <Input
                label="Low Stock Threshold"
                type="number"
                min="0"
                step="1"
                value={form.low_stock_threshold}
                onChange={(e) => setField('low_stock_threshold', e.target.value)}
                placeholder="10"
                error={errors.low_stock_threshold}
              />
            </div>
            {isEditing && (
              <p className="text-xs text-gray-400">
                To adjust stock, use the Inventory page after saving.
              </p>
            )}
          </div>

          {/* Image upload */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mt-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Product Image</h2>

            <div className="flex items-start gap-4">
              {/* Preview */}
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-50">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </div>

              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imagePreview ? 'Change Image' : 'Upload Image'}
                </Button>
                {imagePreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-2 text-danger-500 hover:text-danger-700"
                    onClick={() => { setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  >
                    Remove
                  </Button>
                )}
                <p className="text-xs text-gray-400 mt-2">JPG, PNG, or WebP. Max 5 MB.</p>
                {errors.image && <p className="text-xs text-danger-600 mt-1">{errors.image}</p>}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Active Status</h2>
                <p className="text-xs text-gray-400 mt-0.5">Inactive products won't appear in the POS</p>
              </div>
              <button
                type="button"
                onClick={() => setField('is_active', !form.is_active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${form.is_active ? 'bg-primary-600' : 'bg-gray-200'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>
          </div>

          {/* Form actions */}
          <div className="flex gap-3 justify-end mt-5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/products')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {isEditing ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
