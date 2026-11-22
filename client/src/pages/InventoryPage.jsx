import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { inventoryService } from '../services/inventory'
import { stockAdjustmentService } from '../services/stockAdjustment'
import { warehouseService } from '../services/warehouses'
import { productsService } from '../services/products'
import { formatCurrency } from '../utils/formatCurrency'
import { formatQuantityWithUnit, getUnitCategory } from '../utils/uom'
import { useAuth } from '../hooks/useAuth'

const TABS = [
  { key: 'all', label: 'All Products' },
  { key: 'low', label: 'Low Stock' },
  { key: 'out', label: 'Out of Stock' },
]

function StockStatusBadge({ quantity, threshold }) {
  const q = Number(quantity || 0)
  const t = Number(threshold || 0)
  if (q === 0) return <Badge variant="danger">Out of Stock</Badge>
  if (q <= t) return <Badge variant="warning">Low Stock</Badge>
  return <Badge variant="success">OK</Badge>
}

export default function InventoryPage() {
  const { user } = useAuth()
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  // Top-level mode: 'balances' | 'adjustments'
  const [viewMode, setViewMode] = useState('balances')

  // Product balances state
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [searchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState(
    tabFromUrl && ['all', 'low', 'out'].includes(tabFromUrl) ? tabFromUrl : 'all'
  )

  const [stats, setStats] = useState({ total: 0, low: 0, out: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Quick Adjust/Restock single-product modal state
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [adjustForm, setAdjustForm] = useState({ type: 'RESTOCK', quantity: '', notes: '', unit: 'pcs' })
  const [adjustErrors, setAdjustErrors] = useState({})
  const [isAdjusting, setIsAdjusting] = useState(false)

  // -------------------------------------------------------------
  // Multi-Item Transactional Stock Adjustments State (Phase 3B)
  // -------------------------------------------------------------
  const [adjustments, setAdjustments] = useState([])
  const [loadingAdjustments, setLoadingAdjustments] = useState(false)
  const [adjMeta, setAdjMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [adjPage, setAdjPage] = useState(1)
  const [adjSearch, setAdjSearch] = useState('')
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('')
  const [adjLegacyFilter, setAdjLegacyFilter] = useState('all')
  const [adjStartDate, setAdjStartDate] = useState('')
  const [adjEndDate, setAdjEndDate] = useState('')

  // Warehouses list for attribution
  const [warehouses, setWarehouses] = useState([])
  const [defaultWarehouse, setDefaultWarehouse] = useState(null)

  // Multi-Item Adjustment Creation Modal
  const [isNewAdjOpen, setIsNewAdjOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [allProductsList, setAllProductsList] = useState([])
  const [adjWarehouseId, setAdjWarehouseId] = useState('')
  const [adjReason, setAdjReason] = useState('Physical Count')
  const [adjNotes, setAdjNotes] = useState('')
  const [adjItems, setAdjItems] = useState([])
  const [creatingAdjustment, setCreatingAdjustment] = useState(false)

  // Adjustment Details Modal
  const [selectedAdjustment, setSelectedAdjustment] = useState(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && ['all', 'low', 'out'].includes(t) && t !== activeTab) {
      setActiveTab(t)
      setPage(1)
    }
  }, [searchParams, activeTab])

  // Debounce search query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch warehouses
  useEffect(() => {
    warehouseService.list().then((res) => {
      const list = res.data?.data || []
      setWarehouses(list)
      const def = list.find((w) => w.is_default && w.is_active) || list[0]
      setDefaultWarehouse(def)
      if (def) setAdjWarehouseId(def.id)
    }).catch(() => {})
  }, [])

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      let res
      const cleanSearch = debouncedSearch.trim() || undefined
      const params = { page, per_page: 20, search: cleanSearch }

      if (activeTab === 'low') {
        res = await inventoryService.lowStock(cleanSearch)
        const data = res.data?.data || []
        setProducts(data)
        setMeta({ page: 1, total_pages: 1, total: data.length })
      } else if (activeTab === 'out') {
        res = await inventoryService.list({ ...params, status: 'out' })
        setProducts(res.data?.data || [])
        setMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
      } else {
        res = await inventoryService.list(params)
        setProducts(res.data?.data || [])
        setMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
      }
    } catch {
      toast.error('Failed to load inventory')
    } finally {
      setIsLoading(false)
    }
  }, [page, activeTab, debouncedSearch])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Load stats (total, low, out)
  useEffect(() => {
    Promise.allSettled([
      inventoryService.list({ per_page: 1 }),
      inventoryService.lowStock(),
      inventoryService.list({ per_page: 1, status: 'out' }),
    ]).then(([allRes, lowRes, outRes]) => {
      const total = allRes.status === 'fulfilled' ? (allRes.value?.data?.meta?.total || 0) : 0
      const low = lowRes.status === 'fulfilled' ? (lowRes.value?.data?.data?.length || 0) : 0
      const out = outRes.status === 'fulfilled' ? (outRes.value?.data?.meta?.total || 0) : 0
      setStats({ total, low, out })
    })
  }, [])

  // Fetch Adjustments History
  const fetchAdjustments = useCallback(async () => {
    setLoadingAdjustments(true)
    try {
      const params = {
        page: adjPage,
        per_page: 15,
      }
      if (adjSearch.trim()) params.search = adjSearch.trim()
      if (selectedWarehouseFilter) params.warehouse_id = selectedWarehouseFilter
      if (adjLegacyFilter === 'live') params.is_legacy_import = false
      if (adjLegacyFilter === 'legacy') params.is_legacy_import = true
      if (adjStartDate) params.start_date = adjStartDate
      if (adjEndDate) params.end_date = adjEndDate

      const res = await stockAdjustmentService.list(params)
      setAdjustments(res.data?.data || [])
      setAdjMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load stock adjustments')
    } finally {
      setLoadingAdjustments(false)
    }
  }, [adjPage, adjSearch, selectedWarehouseFilter, adjLegacyFilter, adjStartDate, adjEndDate])

  useEffect(() => {
    if (viewMode === 'adjustments') {
      fetchAdjustments()
    }
  }, [viewMode, fetchAdjustments])

  // Load active products for adjustment selector
  async function openNewAdjustmentModal() {
    try {
      if (allProductsList.length === 0) {
        const res = await productsService.list({ per_page: 200, is_active: true })
        setAllProductsList(res.data?.data || [])
      }
      setAdjWarehouseId(defaultWarehouse ? defaultWarehouse.id : '')
      setAdjReason('Physical Count')
      setAdjNotes('')
      setAdjItems([])
      setIsNewAdjOpen(true)
    } catch {
      toast.error('Failed to load products for adjustment')
    }
  }

  function handleAddItem() {
    setAdjItems((prev) => [
      ...prev,
      {
        product_id: '',
        product: null,
        quantity_change: '',
        unit: 'pcs',
        notes: '',
      },
    ])
  }

  function handleRemoveItem(index) {
    setAdjItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  function handleItemProductChange(index, productId) {
    const prod = allProductsList.find((p) => p.id === productId)
    setAdjItems((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        product_id: productId,
        product: prod,
        unit: prod?.base_unit || 'pcs',
      }
      return next
    })
  }

  function handleItemChange(index, field, value) {
    setAdjItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function validateNewAdjustment() {
    if (!adjReason.trim()) {
      toast.error('Adjustment reason is required')
      return false
    }
    if (adjItems.length === 0) {
      toast.error('Please add at least one product to adjust')
      return false
    }

    for (let i = 0; i < adjItems.length; i++) {
      const it = adjItems[i]
      if (!it.product_id) {
        toast.error(`Please select a product for line #${i + 1}`)
        return false
      }
      const qty = parseFloat(it.quantity_change)
      if (isNaN(qty) || qty === 0) {
        toast.error(`Quantity change for "${it.product?.name || `line #${i + 1}`}" must be a non-zero number`)
        return false
      }

      // Negative stock check
      if (qty < 0 && it.product) {
        const cur = Number(it.product.quantity || 0)
        if (cur + qty < 0) {
          toast.error(
            `Negative stock not permitted: "${it.product.name}" has ${cur} in stock. Cannot deduct ${Math.abs(qty)}.`
          )
          return false
        }
      }
    }

    return true
  }

  function proceedToConfirm() {
    if (!validateNewAdjustment()) return
    setIsConfirmOpen(true)
  }

  async function handleSubmitAdjustment() {
    setCreatingAdjustment(true)
    try {
      // Stable client idempotency key
      const idempotencyKey = `ADJ-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

      const payload = {
        reason: adjReason.trim(),
        notes: adjNotes.trim() || undefined,
        warehouse_id: adjWarehouseId || undefined,
        idempotency_key: idempotencyKey,
        items: adjItems.map((it) => ({
          product_id: it.product_id,
          quantity_change: parseFloat(it.quantity_change),
          unit: it.unit,
          notes: it.notes ? it.notes.trim() : undefined,
        })),
      }

      await stockAdjustmentService.create(payload)
      toast.success('Stock adjustment committed successfully')
      setIsConfirmOpen(false)
      setIsNewAdjOpen(false)
      fetchAdjustments()
      fetchProducts()
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || 'Failed to submit adjustment'
      toast.error(msg)
    } finally {
      setCreatingAdjustment(false)
    }
  }

  // Quick adjust single modal handlers
  function openAdjustModal(product) {
    setAdjustTarget(product)
    setAdjustForm({
      type: 'RESTOCK',
      quantity: '',
      unit: product.base_unit || 'pcs',
      notes: '',
    })
    setAdjustErrors({})
  }

  function validateAdjustForm() {
    const errs = {}
    const qty = parseFloat(adjustForm.quantity)
    if (adjustForm.quantity === '' || isNaN(qty)) {
      errs.quantity = 'Quantity is required'
    } else if (adjustForm.type === 'RESTOCK' && qty <= 0) {
      errs.quantity = 'Restock quantity must be positive'
    } else if (adjustForm.type === 'ADJUSTMENT' && qty === 0) {
      errs.quantity = 'Adjustment cannot be zero'
    } else if (getUnitCategory(adjustForm.unit) === 'COUNT' && !Number.isInteger(Number(adjustForm.quantity))) {
      errs.quantity = 'Count units must have integer quantities'
    }
    setAdjustErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleAdjustSubmit() {
    if (!validateAdjustForm()) return
    setIsAdjusting(true)
    try {
      const qty = parseFloat(adjustForm.quantity)

      if (adjustForm.type === 'RESTOCK') {
        await inventoryService.restock({
          product_id: adjustTarget.id,
          quantity: qty,
          unit: adjustForm.unit,
          notes: adjustForm.notes || undefined,
        })
        toast.success(`Restocked ${adjustTarget.name} by ${qty} ${adjustForm.unit}`)
      } else {
        await inventoryService.adjust({
          product_id: adjustTarget.id,
          quantity_change: qty,
          unit: adjustForm.unit,
          notes: adjustForm.notes || undefined,
        })
        toast.success(`Stock adjusted for ${adjustTarget.name}`)
      }

      setAdjustTarget(null)
      fetchProducts()
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to adjust stock'
      toast.error(msg)
    } finally {
      setIsAdjusting(false)
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Product',
      render: (val, row) => (
        <div>
          <p className="font-medium text-gray-900">{val}</p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>SKU: {row.sku || '—'}</span>
            {row.barcode && (
              <>
                <span>•</span>
                <span className="font-mono text-gray-500">Barcode: {row.barcode}</span>
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (val) => val?.name ? <Badge variant="default">{val.name}</Badge> : <span className="text-gray-400">—</span>,
    },
    {
      key: 'quantity',
      label: 'Current Stock',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${Number(val) === 0 ? 'text-danger-600' : Number(val) <= Number(row.low_stock_threshold) ? 'text-warning-600' : 'text-gray-900'}`}>
            {formatQuantityWithUnit(val, row.base_unit)}
          </span>
        </div>
      ),
    },
    {
      key: 'low_stock_threshold',
      label: 'Threshold',
      render: (val, row) => <span className="text-sm text-gray-600">{formatQuantityWithUnit(val, row.base_unit)}</span>,
    },
    {
      key: 'price',
      label: 'Unit Price',
      render: (val, row) => `${formatCurrency(val)}${row.pricing_unit && row.pricing_unit !== 'pcs' ? ` / ${row.pricing_unit}` : ''}`,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val, row) => <StockStatusBadge quantity={row.quantity} threshold={row.low_stock_threshold} />,
    },
    {
      key: 'id',
      label: 'Actions',
      render: (val, row) => (
        <Button size="sm" variant="secondary" onClick={() => openAdjustModal(row)}>
          Adjust Stock
        </Button>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Top Header & Mode Toggle */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Authoritative stock tracking, physical stock adjustments, and warehouse movements
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-gray-100 p-1 rounded-xl flex">
              <button
                type="button"
                onClick={() => setViewMode('balances')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
                  viewMode === 'balances' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Stock Balances
              </button>
              <button
                type="button"
                onClick={() => setViewMode('adjustments')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
                  viewMode === 'adjustments' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Stock Adjustments
              </button>
            </div>

            {viewMode === 'adjustments' && isAdminOrManager && (
              <Button onClick={openNewAdjustmentModal}>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Adjustment
              </Button>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* MODE 1: STOCK BALANCES VIEW */}
        {/* ======================================================== */}
        {viewMode === 'balances' && (
          <div className="space-y-5">
            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-sm text-gray-500">Total Products</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <div className="bg-warning-50 rounded-xl border border-warning-100 p-4 shadow-sm">
                <p className="text-sm text-warning-700">Low Stock</p>
                <p className="text-3xl font-bold text-warning-700 mt-1">{stats.low}</p>
                <p className="text-xs text-warning-500 mt-0.5">Below threshold</p>
              </div>
              <div className="bg-danger-50 rounded-xl border border-danger-100 p-4 shadow-sm">
                <p className="text-sm text-danger-700">Out of Stock</p>
                <p className="text-3xl font-bold text-danger-700 mt-1">{stats.out}</p>
                <p className="text-xs text-danger-500 mt-0.5">Zero quantity</p>
              </div>
            </div>

            {/* Controls: Tabs & Live Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key)
                      setPage(1)
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                      activeTab === tab.key
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                    {tab.key === 'low' && stats.low > 0 && (
                      <span className="ml-1.5 bg-warning-500 text-white text-xs rounded-full px-1.5 py-0.5">{stats.low}</span>
                    )}
                    {tab.key === 'out' && stats.out > 0 && (
                      <span className="ml-1.5 bg-danger-500 text-white text-xs rounded-full px-1.5 py-0.5">{stats.out}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by name, SKU, or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition shadow-xs"
                />
              </div>
            </div>

            {/* Balances Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <Table
                columns={columns}
                data={products}
                isLoading={isLoading}
                emptyMessage={
                  activeTab === 'low'
                    ? 'No low-stock products. All products are well stocked!'
                    : activeTab === 'out'
                    ? 'No out-of-stock products.'
                    : 'No products found.'
                }
              />
            </div>

            {/* Pagination */}
            {activeTab !== 'low' && meta.total_pages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Page {meta.page} of {meta.total_pages} &mdash; {meta.total} results
                </p>
                <Pagination page={meta.page} total_pages={meta.total_pages} onPageChange={setPage} />
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 2: STOCK ADJUSTMENTS MANAGEMENT VIEW (PART 3) */}
        {/* ======================================================== */}
        {viewMode === 'adjustments' && (
          <div className="space-y-5">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Search</label>
                <input
                  type="text"
                  placeholder="Adjustment # or reason..."
                  value={adjSearch}
                  onChange={(e) => { setAdjSearch(e.target.value); setAdjPage(1) }}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Warehouse</label>
                <select
                  value={selectedWarehouseFilter}
                  onChange={(e) => { setSelectedWarehouseFilter(e.target.value); setAdjPage(1) }}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-primary-500"
                >
                  <option value="">All Warehouses</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>{wh.name} ({wh.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Source</label>
                <select
                  value={adjLegacyFilter}
                  onChange={(e) => { setAdjLegacyFilter(e.target.value); setAdjPage(1) }}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-primary-500"
                >
                  <option value="all">All Adjustments</option>
                  <option value="live">Live Adjustments Only</option>
                  <option value="legacy">Legacy Imported Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Start Date</label>
                <input
                  type="date"
                  value={adjStartDate}
                  onChange={(e) => { setAdjStartDate(e.target.value); setAdjPage(1) }}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">End Date</label>
                <input
                  type="date"
                  value={adjEndDate}
                  onChange={(e) => { setAdjEndDate(e.target.value); setAdjPage(1) }}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5"
                />
              </div>
            </div>

            {/* Adjustments Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {loadingAdjustments ? (
                <div className="p-12 text-center text-gray-500">
                  <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Loading adjustments...</span>
                </div>
              ) : adjustments.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <p className="font-medium text-gray-700">No stock adjustments found</p>
                  <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or create a new adjustment</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3.5 text-left font-semibold text-gray-700">Adjustment #</th>
                        <th className="px-6 py-3.5 text-left font-semibold text-gray-700">Date</th>
                        <th className="px-6 py-3.5 text-left font-semibold text-gray-700">Warehouse</th>
                        <th className="px-6 py-3.5 text-left font-semibold text-gray-700">Reason</th>
                        <th className="px-6 py-3.5 text-center font-semibold text-gray-700">Items</th>
                        <th className="px-6 py-3.5 text-center font-semibold text-gray-700">Type</th>
                        <th className="px-6 py-3.5 text-right font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {adjustments.map((adj) => (
                        <tr key={adj.id} className="hover:bg-gray-50/75 transition-colors">
                          <td className="px-6 py-4 font-mono font-medium text-primary-600">
                            {adj.adjustment_number || 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {new Date(adj.adjustment_date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {adj.warehouse?.name ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span>{adj.warehouse.name}</span>
                                <span className="font-mono text-xs text-gray-400">({adj.warehouse.code})</span>
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-medium text-gray-900">
                            {adj.reason || 'General Adjustment'}
                          </td>
                          <td className="px-6 py-4 text-center font-semibold text-gray-700">
                            {adj.items?.length || 0}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {adj.is_legacy_import ? (
                              <Badge variant="warning">Legacy Import</Badge>
                            ) : (
                              <Badge variant="success">Live Adjustment</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedAdjustment(adj)
                                setIsDetailOpen(true)
                              }}
                            >
                              View Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Adjustments Pagination */}
            {adjMeta.total_pages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Page {adjMeta.page} of {adjMeta.total_pages} &mdash; {adjMeta.total} adjustments
                </p>
                <Pagination page={adjMeta.page} total_pages={adjMeta.total_pages} onPageChange={setAdjPage} />
              </div>
            )}
          </div>
        )}

        {/* Modal: Adjustment Details */}
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`Stock Adjustment: ${selectedAdjustment?.adjustment_number || ''}`}
          size="lg"
        >
          {selectedAdjustment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">Adjustment Number</p>
                  <p className="font-mono font-bold text-gray-900 mt-0.5">{selectedAdjustment.adjustment_number}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Adjustment Date</p>
                  <p className="text-gray-900 font-medium mt-0.5">
                    {new Date(selectedAdjustment.adjustment_date).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Warehouse</p>
                  <p className="text-gray-900 font-medium mt-0.5">{selectedAdjustment.warehouse?.name || 'Default'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Reason</p>
                  <p className="text-gray-900 font-medium mt-0.5">{selectedAdjustment.reason}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Created By</p>
                  <p className="text-gray-900 font-medium mt-0.5">
                    {selectedAdjustment.user?.full_name || selectedAdjustment.user?.username || 'Staff'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Classification</p>
                  <p className="mt-0.5">
                    {selectedAdjustment.is_legacy_import ? (
                      <Badge variant="warning">Historical Legacy</Badge>
                    ) : (
                      <Badge variant="success">Live POS</Badge>
                    )}
                  </p>
                </div>
              </div>

              {selectedAdjustment.notes && (
                <div className="bg-white border border-gray-200 p-3 rounded-lg text-sm text-gray-700">
                  <span className="font-semibold text-gray-900">Notes: </span>
                  {selectedAdjustment.notes}
                </div>
              )}

              {/* Items Table */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Adjusted Line Items</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-700">Product</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-700">SKU</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-gray-700">Change</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-700">Unit</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-700">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {selectedAdjustment.items?.map((item) => {
                        const change = Number(item.quantity_change)
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {item.product?.name || item.product_name || 'Mapped Product'}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">
                              {item.product?.sku || item.product_sku || '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold">
                              <span className={change > 0 ? 'text-success-600' : 'text-danger-600'}>
                                {change > 0 ? `+${change}` : change}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{item.unit || 'pcs'}</td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{item.notes || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Modal: Create Multi-Item Stock Adjustment */}
        <Modal
          isOpen={isNewAdjOpen}
          onClose={() => setIsNewAdjOpen(false)}
          title="Create Multi-Item Stock Adjustment"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Warehouse Location *
                </label>
                <select
                  value={adjWarehouseId}
                  onChange={(e) => setAdjWarehouseId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500"
                >
                  <option value="">Default Warehouse</option>
                  {warehouses.filter((w) => w.is_active).map((wh) => (
                    <option key={wh.id} value={wh.id}>{wh.name} ({wh.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Reason for Adjustment *
                </label>
                <select
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500"
                >
                  <option value="Physical Count">Physical Count / Inventory Audit</option>
                  <option value="Damage / Waste">Damaged / Expired Goods</option>
                  <option value="Internal Use">Internal Consumption / Sample</option>
                  <option value="Correction">Data Correction / Reclassification</option>
                  <option value="Other">Other Operational Reason</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Notes / Audit Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain the background for this adjustment cycle..."
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Items list */}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-bold text-gray-800">Adjusted Items ({adjItems.length})</h4>
                <Button size="sm" variant="secondary" onClick={handleAddItem}>
                  + Add Product
                </Button>
              </div>

              {adjItems.length === 0 ? (
                <div className="bg-gray-50 border border-dashed border-gray-300 p-6 rounded-lg text-center text-gray-500 text-sm">
                  No items added yet. Click &quot;+ Add Product&quot; to select items for adjustment.
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {adjItems.map((item, idx) => {
                    const currentStock = item.product ? Number(item.product.quantity || 0) : 0
                    const change = parseFloat(item.quantity_change) || 0
                    const newStock = currentStock + change
                    const isNegative = change < 0 && newStock < 0

                    return (
                      <div key={idx} className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <div className="flex-1 w-full">
                          <label className="block text-xs font-medium text-gray-500 mb-0.5">Product #{idx + 1}</label>
                          <select
                            value={item.product_id}
                            onChange={(e) => handleItemProductChange(idx, e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                          >
                            <option value="">Select product...</option>
                            {allProductsList.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.sku}) — Available: {p.quantity} {p.base_unit}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-full sm:w-36">
                          <label className="block text-xs font-medium text-gray-500 mb-0.5">
                            Change ({item.unit})
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="+5 or -3"
                            value={item.quantity_change}
                            onChange={(e) => handleItemChange(idx, 'quantity_change', e.target.value)}
                            className={`w-full border rounded-lg px-2.5 py-1.5 text-sm ${
                              isNegative ? 'border-danger-500 text-danger-700 bg-danger-50' : 'border-gray-300'
                            }`}
                          />
                        </div>

                        <div className="w-full sm:w-36">
                          <label className="block text-xs font-medium text-gray-500 mb-0.5">Resulting Stock</label>
                          <div className={`px-2.5 py-1.5 text-sm rounded-lg font-bold ${isNegative ? 'text-danger-600 bg-danger-100' : 'text-gray-900 bg-gray-200/50'}`}>
                            {item.product ? `${newStock} ${item.unit}` : '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-danger-600 hover:text-danger-800 p-1 self-end sm:self-center"
                          title="Remove item"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setIsNewAdjOpen(false)}>
                Cancel
              </Button>
              <Button onClick={proceedToConfirm}>
                Review & Confirm
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal: Confirmation Dialog Before Final Submission */}
        <Modal
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          title="Confirm Stock Adjustment Execution"
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-lg text-sm text-amber-800">
              <p className="font-semibold">Review before applying changes</p>
              <p className="text-xs mt-0.5">
                This transaction will atomically mutate global product stock balances and record permanent audit trails in the inventory log.
              </p>
            </div>

            <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between">
                <span className="text-gray-500">Warehouse:</span>
                <span className="font-semibold text-gray-900">
                  {warehouses.find((w) => w.id === adjWarehouseId)?.name || 'Default Warehouse'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Reason:</span>
                <span className="font-semibold text-gray-900">{adjReason}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Items to Adjust:</span>
                <span className="font-semibold text-gray-900">{adjItems.length} products</span>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Product</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Before</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Change</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {adjItems.map((it, idx) => {
                    const cur = Number(it.product?.quantity || 0)
                    const ch = parseFloat(it.quantity_change) || 0
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-medium text-gray-800">{it.product?.name}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{cur}</td>
                        <td className="px-3 py-2 text-right font-bold">
                          <span className={ch > 0 ? 'text-success-600' : 'text-danger-600'}>
                            {ch > 0 ? `+${ch}` : ch}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{cur + ch}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setIsConfirmOpen(false)} disabled={creatingAdjustment}>
                Back to Edit
              </Button>
              <Button onClick={handleSubmitAdjustment} isLoading={creatingAdjustment}>
                Confirm & Commit Adjustment
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal: Single Product Quick Adjust / Restock Modal (existing) */}
        <Modal
          isOpen={!!adjustTarget}
          onClose={() => setAdjustTarget(null)}
          title="Adjust Stock"
          size="sm"
        >
          {adjustTarget && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">{adjustTarget.name}</p>
                <p className="text-xs text-gray-500">{adjustTarget.sku}</p>
                <p className="text-sm mt-1">
                  Current stock:{' '}
                  <span className="font-bold text-gray-900">
                    {formatQuantityWithUnit(adjustTarget.quantity, adjustTarget.base_unit)}
                  </span>
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Adjustment Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'RESTOCK', label: 'Restock (+)', desc: 'Add stock' },
                    { value: 'ADJUSTMENT', label: 'Adjustment', desc: 'Add or remove' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setAdjustForm((f) => ({ ...f, type: opt.value }))
                        setAdjustErrors({})
                      }}
                      className={`py-2.5 px-3 rounded-lg border text-left transition ${
                        adjustForm.type === opt.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-sm font-medium ${adjustForm.type === opt.value ? 'text-primary-700' : 'text-gray-700'}`}>{opt.label}</p>
                      <p className="text-xs text-gray-400">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Input
                  label={adjustForm.type === 'RESTOCK' ? `Quantity to Add (${adjustForm.unit})` : `Quantity Change (${adjustForm.unit})`}
                  type="number"
                  step="any"
                  value={adjustForm.quantity}
                  onChange={(e) => {
                    setAdjustForm((f) => ({ ...f, quantity: e.target.value }))
                    setAdjustErrors({})
                  }}
                  placeholder={adjustForm.type === 'RESTOCK' ? 'e.g. 50' : 'e.g. 10 or -5'}
                  error={adjustErrors.quantity}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
                <textarea
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Reason for adjustment…"
                  rows={2}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="secondary" className="flex-1" onClick={() => setAdjustTarget(null)} disabled={isAdjusting}>
                  Cancel
                </Button>
                <Button variant="primary" className="flex-1" isLoading={isAdjusting} onClick={handleAdjustSubmit}>
                  {adjustForm.type === 'RESTOCK' ? 'Restock' : 'Adjust'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  )
}
