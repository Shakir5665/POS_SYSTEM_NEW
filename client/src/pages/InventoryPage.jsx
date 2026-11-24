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
    warehouseService
      .list()
      .then((res) => {
        const list = res.data?.data || []
        setWarehouses(list)
        const def = list.find((w) => w.is_default && w.is_active) || list[0]
        setDefaultWarehouse(def)
        if (def) setAdjWarehouseId(def.id)
      })
      .catch(() => {})
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
      const total = allRes.status === 'fulfilled' ? allRes.value?.data?.meta?.total || 0 : 0
      const low = lowRes.status === 'fulfilled' ? lowRes.value?.data?.data?.length || 0 : 0
      const out = outRes.status === 'fulfilled' ? outRes.value?.data?.meta?.total || 0 : 0
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
      const idempotencyKey = `ADJ-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

      const payload = {
        warehouse_id: adjWarehouseId || defaultWarehouse?.id,
        reason: adjReason,
        notes: adjNotes || undefined,
        idempotency_key: idempotencyKey,
        items: adjItems.map((it) => ({
          product_id: it.product_id,
          quantity_change: parseFloat(it.quantity_change),
          unit: it.unit,
          notes: it.notes || undefined,
        })),
      }

      const res = await stockAdjustmentService.create(payload)
      const adjNum = res.data?.data?.adjustment_number || 'Completed'
      toast.success(`Stock adjustment ${adjNum} applied successfully!`)

      setIsConfirmOpen(false)
      setIsNewAdjOpen(false)
      fetchAdjustments()
      fetchProducts()
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to submit stock adjustment')
    } finally {
      setCreatingAdjustment(false)
    }
  }

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
          <p className="font-bold text-slate-900">{val}</p>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            <span className="font-mono">SKU: {row.sku || '—'}</span>
            {row.barcode && (
              <>
                <span>•</span>
                <span className="font-mono text-slate-500">Barcode: {row.barcode}</span>
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (val) => (val?.name ? <Badge variant="default">{val.name}</Badge> : <span className="text-slate-400">—</span>),
    },
    {
      key: 'quantity',
      label: 'Current Stock',
      render: (val, row) => (
        <span
          className={`text-base font-bold tracking-tight ${
            Number(val) === 0
              ? 'text-rose-600'
              : Number(val) <= Number(row.low_stock_threshold)
              ? 'text-amber-600'
              : 'text-slate-900'
          }`}
        >
          {formatQuantityWithUnit(val, row.base_unit)}
        </span>
      ),
    },
    {
      key: 'low_stock_threshold',
      label: 'Threshold',
      render: (val, row) => <span className="text-xs text-slate-500">{formatQuantityWithUnit(val, row.base_unit)}</span>,
    },
    {
      key: 'price',
      label: 'Unit Price',
      render: (val, row) =>
        `${formatCurrency(val)}${row.pricing_unit && row.pricing_unit !== 'pcs' ? ` / ${row.pricing_unit}` : ''}`,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StockStatusBadge quantity={row.quantity} threshold={row.low_stock_threshold} />,
    },
    {
      key: 'id',
      label: 'Actions',
      render: (_, row) => (
        <Button size="sm" variant="secondary" onClick={() => openAdjustModal(row)}>
          Adjust Stock
        </Button>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Top Header & Mode Toggle */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventory Management</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Authoritative stock tracking, physical stock adjustments, and warehouse movements
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-100/80 p-1 rounded-2xl flex border border-slate-200/80 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('balances')}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                  viewMode === 'balances'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Stock Balances
              </button>
              <button
                type="button"
                onClick={() => setViewMode('adjustments')}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                  viewMode === 'adjustments'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Stock Adjustments
              </button>
            </div>
            {viewMode === 'balances' && isAdminOrManager && (
              <Button onClick={openNewAdjustmentModal} className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-white/90 p-4 shadow-glass-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Products</p>
                <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{stats.total}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Catalog items tracked</p>
              </div>
              <div className="bg-amber-50/80 backdrop-blur-md rounded-2xl border border-amber-200/80 p-4 shadow-2xs">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Low Stock</p>
                <p className="text-2xl font-bold tracking-tight text-amber-700 mt-1">{stats.low}</p>
                <p className="text-[11px] text-amber-600/80 mt-0.5">Below threshold</p>
              </div>
              <div className="bg-rose-50/80 backdrop-blur-md rounded-2xl border border-rose-200/80 p-4 shadow-2xs">
                <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Out of Stock</p>
                <p className="text-2xl font-bold tracking-tight text-rose-700 mt-1">{stats.out}</p>
                <p className="text-[11px] text-rose-600/80 mt-0.5">Zero quantity</p>
              </div>
            </div>

            {/* Controls: Tabs & Live Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex gap-1 bg-white/80 backdrop-blur-md p-1 rounded-2xl border border-slate-200/80 shadow-2xs w-fit">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key)
                      setPage(1)
                    }}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                      activeTab === tab.key
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                    {tab.key === 'low' && stats.low > 0 && (
                      <span className="ml-1.5 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.2">
                        {stats.low}
                      </span>
                    )}
                    {tab.key === 'out' && stats.out > 0 && (
                      <span className="ml-1.5 bg-rose-500 text-white text-[10px] rounded-full px-1.5 py-0.2">
                        {stats.out}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  placeholder="Search by name, SKU, or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-9 pr-4 py-2 text-sm bg-white/90 border border-slate-200/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all placeholder:text-slate-400"
                />
                <svg
                  className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Balances Table */}
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

            {/* Pagination */}
            {activeTab !== 'low' && meta.total_pages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs font-medium text-slate-500">
                  Page {meta.page} of {meta.total_pages} &mdash; {meta.total} results
                </p>
                <Pagination page={meta.page} total_pages={meta.total_pages} onPageChange={setPage} />
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 2: STOCK ADJUSTMENTS MANAGEMENT VIEW */}
        {/* ======================================================== */}
        {viewMode === 'adjustments' && (
          <div className="space-y-5">
            {/* Filter Bar */}
            <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/90 shadow-glass-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Search</label>
                <input
                  type="text"
                  placeholder="Adjustment # or reason..."
                  value={adjSearch}
                  onChange={(e) => {
                    setAdjSearch(e.target.value)
                    setAdjPage(1)
                  }}
                  className="w-full text-xs border border-slate-200/90 rounded-xl px-3 py-2 bg-white/90 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Warehouse</label>
                <select
                  value={selectedWarehouseFilter}
                  onChange={(e) => {
                    setSelectedWarehouseFilter(e.target.value)
                    setAdjPage(1)
                  }}
                  className="w-full text-xs border border-slate-200/90 rounded-xl px-3 py-2 bg-white/90 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
                >
                  <option value="">All Warehouses</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Source</label>
                <select
                  value={adjLegacyFilter}
                  onChange={(e) => {
                    setAdjLegacyFilter(e.target.value)
                    setAdjPage(1)
                  }}
                  className="w-full text-xs border border-slate-200/90 rounded-xl px-3 py-2 bg-white/90 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
                >
                  <option value="all">All Adjustments</option>
                  <option value="live">Live Adjustments Only</option>
                  <option value="legacy">Legacy Imported Only</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Start Date</label>
                <input
                  type="date"
                  value={adjStartDate}
                  onChange={(e) => {
                    setAdjStartDate(e.target.value)
                    setAdjPage(1)
                  }}
                  className="w-full text-xs border border-slate-200/90 rounded-xl px-3 py-2 bg-white/90"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">End Date</label>
                <input
                  type="date"
                  value={adjEndDate}
                  onChange={(e) => {
                    setAdjEndDate(e.target.value)
                    setAdjPage(1)
                  }}
                  className="w-full text-xs border border-slate-200/90 rounded-xl px-3 py-2 bg-white/90"
                />
              </div>
            </div>

            {/* Adjustments Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/85 backdrop-blur-md shadow-2xs">
              {loadingAdjustments ? (
                <div className="p-12 text-center text-slate-500">
                  <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Loading adjustments...</span>
                </div>
              ) : adjustments.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <p className="font-bold text-slate-700 text-sm">No stock adjustments found</p>
                  <p className="text-xs text-slate-400 mt-1">Adjust stock using the &quot;Adjust Stock&quot; button on the Stock Balances tab</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-6 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Adjustment #</th>
                      <th className="px-6 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Warehouse</th>
                      <th className="px-6 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-3.5 text-center font-semibold text-slate-500 uppercase tracking-wider">Items</th>
                      <th className="px-6 py-3.5 text-center font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3.5 text-right font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/90 bg-white/60">
                    {adjustments.map((adj) => (
                      <tr key={adj.id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-primary-600">
                          {adj.adjustment_number || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-medium">
                          {new Date(adj.adjustment_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {adj.warehouse?.name ? (
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <span>{adj.warehouse.name}</span>
                              <span className="font-mono text-xs text-slate-400">({adj.warehouse.code})</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900">
                          {adj.reason || 'General Adjustment'}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-700">
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
              )}
            </div>

            {/* Adjustments Pagination */}
            {adjMeta.total_pages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs font-medium text-slate-500">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Adjustment #</p>
                  <p className="font-mono font-bold text-slate-900 mt-1">{selectedAdjustment.adjustment_number || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Date</p>
                  <p className="text-xs font-bold text-slate-800 mt-1">{new Date(selectedAdjustment.adjustment_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Warehouse</p>
                  <p className="text-xs font-bold text-slate-800 mt-1">
                    {selectedAdjustment.warehouse?.name || 'Default Warehouse'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Reason</p>
                  <p className="text-xs font-bold text-slate-900 mt-1">{selectedAdjustment.reason}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Type</p>
                  <p className="mt-1">
                    {selectedAdjustment.is_legacy_import ? (
                      <Badge variant="warning">Legacy Import</Badge>
                    ) : (
                      <Badge variant="success">Live Adjustment</Badge>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Created By</p>
                  <p className="text-xs font-bold text-slate-800 mt-1">{selectedAdjustment.user?.full_name || 'System'}</p>
                </div>
                {selectedAdjustment.notes && (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-xs text-slate-400 font-semibold uppercase">Notes</p>
                    <p className="text-xs text-slate-700 mt-1">{selectedAdjustment.notes}</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Adjusted Items</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="min-w-full divide-y divide-slate-100 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3.5 py-2.5 text-left font-semibold text-slate-600">Product</th>
                        <th className="px-3.5 py-2.5 text-left font-semibold text-slate-600">SKU</th>
                        <th className="px-3.5 py-2.5 text-right font-semibold text-slate-600">Qty Change</th>
                        <th className="px-3.5 py-2.5 text-left font-semibold text-slate-600">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(selectedAdjustment.items || []).map((it, idx) => {
                        const change = Number(it.quantity_change || 0)
                        return (
                          <tr key={idx}>
                            <td className="px-3.5 py-2 font-medium text-slate-900">{it.product?.name || '—'}</td>
                            <td className="px-3.5 py-2 font-mono text-slate-400">{it.product?.sku || '—'}</td>
                            <td className="px-3.5 py-2 text-right font-bold">
                              <span className={change > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {change > 0 ? `+${change}` : change} {it.unit}
                              </span>
                            </td>
                            <td className="px-3.5 py-2 text-slate-500">{it.notes || '—'}</td>
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

        {/* Modal: Multi-Item Adjustment Creation */}
        <Modal
          isOpen={isNewAdjOpen}
          onClose={() => setIsNewAdjOpen(false)}
          title="Create Transactional Stock Adjustment"
          size="xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Warehouse Location *</label>
                <select
                  value={adjWarehouseId}
                  onChange={(e) => setAdjWarehouseId(e.target.value)}
                  className="w-full border border-slate-200/90 rounded-xl px-3.5 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
                >
                  <option value="">Default Warehouse</option>
                  {warehouses
                    .filter((w) => w.is_active)
                    .map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} ({wh.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Reason for Adjustment *</label>
                <select
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full border border-slate-200/90 rounded-xl px-3.5 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
                >
                  <option value="Physical Count">Physical Count / Inventory Audit</option>
                  <option value="Damage / Waste">Damaged / Expired Goods</option>
                  <option value="Internal Use">Internal Consumption / Sample</option>
                  <option value="Correction">Data Correction / Reclassification</option>
                  <option value="Other">Other Operational Reason</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Notes / Audit Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Explain the background for this adjustment cycle..."
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  className="w-full border border-slate-200/90 rounded-xl px-3.5 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
                />
              </div>
            </div>

            {/* Items list */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Adjusted Items ({adjItems.length})
                </h4>
                <Button size="sm" variant="secondary" onClick={handleAddItem}>
                  + Add Product
                </Button>
              </div>

              {adjItems.length === 0 ? (
                <div className="bg-slate-50/70 border border-dashed border-slate-200 p-8 rounded-2xl text-center text-slate-400 text-xs font-medium">
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
                      <div
                        key={idx}
                        className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                      >
                        <div className="flex-1 w-full">
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Product #{idx + 1}
                          </label>
                          <select
                            value={item.product_id}
                            onChange={(e) => handleItemProductChange(idx, e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-primary-500"
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
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Change ({item.unit})
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="+5 or -3"
                            value={item.quantity_change}
                            onChange={(e) => handleItemChange(idx, 'quantity_change', e.target.value)}
                            className={`w-full border rounded-lg px-2.5 py-1.5 text-xs ${
                              isNegative ? 'border-rose-400 text-rose-700 bg-rose-50' : 'border-slate-200'
                            }`}
                          />
                        </div>

                        <div className="w-full sm:w-36">
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Resulting Stock</label>
                          <div
                            className={`px-2.5 py-1.5 text-xs rounded-lg font-bold ${
                              isNegative ? 'text-rose-600 bg-rose-100' : 'text-slate-900 bg-slate-200/50'
                            }`}
                          >
                            {item.product ? `${newStock} ${item.unit}` : '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-rose-500 hover:text-rose-700 p-1 self-end sm:self-center font-bold text-sm"
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

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setIsNewAdjOpen(false)}>
                Cancel
              </Button>
              <Button onClick={proceedToConfirm}>Review &amp; Confirm</Button>
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
            <div className="bg-amber-50/90 border border-amber-200/80 p-3.5 rounded-xl text-xs text-amber-900">
              <p className="font-bold">Review before applying changes</p>
              <p className="mt-1">
                This transaction will atomically mutate global product stock balances and record permanent audit trails in the inventory log.
              </p>
            </div>

            <div className="space-y-2 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <div className="flex justify-between">
                <span className="text-slate-500">Warehouse:</span>
                <span className="font-bold text-slate-900">
                  {warehouses.find((w) => w.id === adjWarehouseId)?.name || 'Default Warehouse'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reason:</span>
                <span className="font-bold text-slate-900">{adjReason}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Items to Adjust:</span>
                <span className="font-bold text-slate-900">{adjItems.length} products</span>
              </div>
            </div>

            <div className="border border-slate-200/80 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs">
                <thead className="bg-slate-100/80">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Before</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Change</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {adjItems.map((it, idx) => {
                    const cur = Number(it.product?.quantity || 0)
                    const ch = parseFloat(it.quantity_change) || 0
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-bold text-slate-800">{it.product?.name}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{cur}</td>
                        <td className="px-3 py-2 text-right font-bold">
                          <span className={ch > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {ch > 0 ? `+${ch}` : ch}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">{cur + ch}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setIsConfirmOpen(false)} disabled={creatingAdjustment}>
                Back to Edit
              </Button>
              <Button onClick={handleSubmitAdjustment} isLoading={creatingAdjustment}>
                Confirm &amp; Commit Adjustment
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal: Single Product Quick Adjust / Restock Modal */}
        <Modal
          isOpen={!!adjustTarget}
          onClose={() => setAdjustTarget(null)}
          title="Adjust Stock"
          size="sm"
        >
          {adjustTarget && (
            <div className="space-y-4">
              <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 px-4 py-3">
                <p className="text-xs font-bold text-slate-900">{adjustTarget.name}</p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{adjustTarget.sku}</p>
                <p className="text-xs mt-1.5 text-slate-600">
                  Current stock:{' '}
                  <span className="font-bold text-slate-900">
                    {formatQuantityWithUnit(adjustTarget.quantity, adjustTarget.base_unit)}
                  </span>
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1.5">Adjustment Type</p>
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
                      className={`py-2 px-3 rounded-xl border text-left transition-all ${
                        adjustForm.type === opt.value
                          ? 'border-primary-500 bg-blue-50/80 shadow-2xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <p
                        className={`text-xs font-bold ${
                          adjustForm.type === opt.value ? 'text-primary-700' : 'text-slate-700'
                        }`}
                      >
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Input
                  label={
                    adjustForm.type === 'RESTOCK'
                      ? `Quantity to Add (${adjustForm.unit})`
                      : `Quantity Change (${adjustForm.unit})`
                  }
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
                <label className="text-xs font-semibold text-slate-700">Notes (optional)</label>
                <textarea
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Reason for adjustment…"
                  rows={2}
                  className="block w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 resize-none"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setAdjustTarget(null)}
                  disabled={isAdjusting}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  isLoading={isAdjusting}
                  onClick={handleAdjustSubmit}
                >
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
