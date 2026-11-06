import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { inventoryService } from '../services/inventory'
import { formatCurrency } from '../utils/formatCurrency'

const TABS = [
  { key: 'all', label: 'All Products' },
  { key: 'low', label: 'Low Stock' },
  { key: 'out', label: 'Out of Stock' },
]

function StockStatusBadge({ quantity, threshold }) {
  if (quantity === 0) return <Badge variant="danger">Out of Stock</Badge>
  if (quantity <= threshold) return <Badge variant="warning">Low Stock</Badge>
  return <Badge variant="success">OK</Badge>
}

export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ total: 0, low: 0, out: 0 })

  // Adjust/Restock modal state
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [adjustForm, setAdjustForm] = useState({ type: 'RESTOCK', quantity: '', notes: '' })
  const [adjustErrors, setAdjustErrors] = useState({})
  const [isAdjusting, setIsAdjusting] = useState(false)

  const fetchProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      let res
      const params = { page, per_page: 20 }

      if (activeTab === 'low') {
        res = await inventoryService.lowStock()
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
  }, [page, activeTab])

  // Load stats (total, low, out)
  useEffect(() => {
    Promise.allSettled([
      inventoryService.list({ per_page: 1 }),
      inventoryService.lowStock(),
      inventoryService.list({ per_page: 1, status: 'out' }),
    ]).then(([allRes, lowRes, outRes]) => {
      const total = allRes.status === 'fulfilled' ? (allRes.value.data?.meta?.total || 0) : 0
      const low = lowRes.status === 'fulfilled' ? (lowRes.value.data?.data?.length || 0) : 0
      const out = outRes.status === 'fulfilled' ? (outRes.value.data?.meta?.total || 0) : 0
      setStats({ total, low, out })
    })
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    setPage(1)
  }, [activeTab])

  function openAdjustModal(product) {
    setAdjustTarget(product)
    setAdjustForm({ type: 'RESTOCK', quantity: '', notes: '' })
    setAdjustErrors({})
  }

  function validateAdjustForm() {
    const errs = {}
    const qty = parseInt(adjustForm.quantity)
    if (adjustForm.quantity === '' || isNaN(qty)) {
      errs.quantity = 'Quantity is required'
    } else if (adjustForm.type === 'RESTOCK' && qty <= 0) {
      errs.quantity = 'Restock quantity must be positive'
    } else if (adjustForm.type === 'ADJUSTMENT' && qty === 0) {
      errs.quantity = 'Adjustment cannot be zero'
    }
    setAdjustErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleAdjustSubmit() {
    if (!validateAdjustForm()) return
    setIsAdjusting(true)
    try {
      const qty = parseInt(adjustForm.quantity)

      if (adjustForm.type === 'RESTOCK') {
        await inventoryService.restock({ product_id: adjustTarget.id, quantity: qty, notes: adjustForm.notes || undefined })
        toast.success(`Restocked ${adjustTarget.name} by ${qty}`)
      } else {
        await inventoryService.adjust({ product_id: adjustTarget.id, quantity_change: qty, notes: adjustForm.notes || undefined })
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
          <p className="text-xs text-gray-400">{row.sku}</p>
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
          <span className={`text-lg font-bold ${val === 0 ? 'text-danger-600' : val <= row.low_stock_threshold ? 'text-warning-600' : 'text-gray-900'}`}>
            {val}
          </span>
          <span className="text-xs text-gray-400">units</span>
        </div>
      ),
    },
    {
      key: 'low_stock_threshold',
      label: 'Threshold',
      render: (val) => <span className="text-sm text-gray-600">{val}</span>,
    },
    {
      key: 'price',
      label: 'Unit Price',
      render: (val) => formatCurrency(val),
    },
    {
      key: 'quantity',
      label: 'Status',
      render: (val, row) => <StockStatusBadge quantity={val} threshold={row.low_stock_threshold} />,
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
      <div className="space-y-5">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monitor and manage stock levels across all products</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Total Products</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-warning-50 rounded-xl border border-warning-100 p-4">
            <p className="text-sm text-warning-700">Low Stock</p>
            <p className="text-3xl font-bold text-warning-700 mt-1">{stats.low}</p>
            <p className="text-xs text-warning-500 mt-0.5">Below threshold</p>
          </div>
          <div className="bg-danger-50 rounded-xl border border-danger-100 p-4">
            <p className="text-sm text-danger-700">Out of Stock</p>
            <p className="text-3xl font-bold text-danger-700 mt-1">{stats.out}</p>
            <p className="text-xs text-danger-500 mt-0.5">Zero quantity</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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

        {/* Pagination (not for low-stock tab since it returns all results) */}
        {activeTab !== 'low' && meta.total_pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.total_pages} &mdash; {meta.total} results
            </p>
            <Pagination page={meta.page} total_pages={meta.total_pages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Adjust / Restock modal */}
      <Modal
        isOpen={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title="Adjust Stock"
        size="sm"
      >
        {adjustTarget && (
          <div className="space-y-4">
            {/* Product info */}
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{adjustTarget.name}</p>
              <p className="text-xs text-gray-500">{adjustTarget.sku}</p>
              <p className="text-sm mt-1">
                Current stock: <span className="font-bold text-gray-900">{adjustTarget.quantity} units</span>
              </p>
            </div>

            {/* Type selector */}
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
                    onClick={() => { setAdjustForm((f) => ({ ...f, type: opt.value })); setAdjustErrors({}) }}
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

            {/* Quantity */}
            <div>
              <Input
                label={adjustForm.type === 'RESTOCK' ? 'Quantity to Add' : 'Quantity Change (use negative to remove)'}
                type="number"
                value={adjustForm.quantity}
                onChange={(e) => { setAdjustForm((f) => ({ ...f, quantity: e.target.value })); setAdjustErrors({}) }}
                placeholder={adjustForm.type === 'RESTOCK' ? 'e.g. 50' : 'e.g. 10 or -5'}
                error={adjustErrors.quantity}
                {...(adjustForm.type === 'RESTOCK' ? { min: 1 } : {})}
              />
            </div>

            {/* Notes */}
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

            {/* New quantity preview */}
            {adjustForm.quantity !== '' && !isNaN(parseInt(adjustForm.quantity)) && (
              (() => {
                const newQty = adjustTarget.quantity + parseInt(adjustForm.quantity)
                return (
                  <div className={`border rounded-lg px-3 py-2 text-sm ${newQty < 0 ? 'bg-danger-50 border-danger-100' : 'bg-blue-50 border-blue-100'}`}>
                    New quantity will be:{' '}
                    <span className={`font-bold ${newQty < 0 ? 'text-danger-700' : 'text-primary-700'}`}>
                      {newQty} units
                    </span>
                    {newQty < 0 && <span className="text-danger-600 ml-2">(Cannot go below 0)</span>}
                  </div>
                )
              })()
            )}

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
    </DashboardLayout>
  )
}
