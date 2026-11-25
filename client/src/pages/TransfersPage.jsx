import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { transferService } from '../services/transfers'
import { warehouseService } from '../services/warehouses'
import { productsService } from '../services/products'
import { useAuth } from '../hooks/useAuth'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_TABS = [
  { key: 'all', label: 'All Transfers' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

function TransferStatusBadge({ status }) {
  switch (status) {
    case 'IN_TRANSIT':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          In Transit
        </span>
      )
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Completed
        </span>
      )
    case 'CANCELLED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Cancelled
        </span>
      )
    default:
      return <Badge>{status}</Badge>
  }
}

export default function TransfersPage() {
  const { user } = useAuth()
  const isAdminOrManager = ['ADMIN', 'MANAGER', 'SUPERADMIN'].includes(user?.role)

  // Transfers list state
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [activeTab, setActiveTab] = useState('all')

  // Filters
  const [search, setSearch] = useState('')
  const [fromWarehouseFilter, setFromWarehouseFilter] = useState('')
  const [toWarehouseFilter, setToWarehouseFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Warehouses and products
  const [warehouses, setWarehouses] = useState([])
  const [productList, setProductList] = useState([])

  // Modals
  const [isNewOpen, setIsNewOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isReceiveOpen, setIsReceiveOpen] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState(null)
  const [transferToReceive, setTransferToReceive] = useState(null)
  const [receiveNotes, setReceiveNotes] = useState('')

  // New transfer form state
  const [fromWarehouseId, setFromWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [transferNotes, setTransferNotes] = useState('')
  const [items, setItems] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load warehouses & products
  useEffect(() => {
    async function initData() {
      try {
        const whRes = await warehouseService.list({ is_active: true })
        const whs = whRes.data?.data || whRes.data || []
        setWarehouses(whs)
        if (whs.length >= 2) {
          setFromWarehouseId(whs[0].id)
          setToWarehouseId(whs[1].id)
        } else if (whs.length === 1) {
          setFromWarehouseId(whs[0].id)
        }
      } catch (err) {
        console.error('Failed to load branches for transfers', err)
      }

      try {
        const prodRes = await productsService.list({ per_page: 100, is_active: true })
        const prods = prodRes.data?.data || prodRes.data || []
        setProductList(prods)
      } catch (err) {
        console.error('Failed to load products for transfers', err)
      }
    }
    initData()
  }, [])

  // Fetch transfers
  const fetchTransfers = useCallback(async () => {
    try {
      setLoading(true)
      const params = {
        page,
        per_page: 15,
        search: search.trim() || undefined,
        from_warehouse_id: fromWarehouseFilter || undefined,
        to_warehouse_id: toWarehouseFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }
      if (activeTab !== 'all') {
        params.status = activeTab
      }
      const res = await transferService.list(params)
      setTransfers(res.data?.data || [])
      setMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to fetch stock transfers')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, search, fromWarehouseFilter, toWarehouseFilter, startDate, endDate])

  useEffect(() => {
    fetchTransfers()
  }, [fetchTransfers])

  // Reset pagination on filter changes
  function handleFilterChange(setter, value) {
    setter(value)
    setPage(1)
  }

  // Open Create Modal
  async function handleOpenCreate() {
    let currentWhs = warehouses
    if (currentWhs.length < 2) {
      try {
        const whRes = await warehouseService.list({ is_active: true })
        currentWhs = whRes.data?.data || whRes.data || []
        setWarehouses(currentWhs)
      } catch (err) {
        console.error('Failed to reload branches for transfer modal', err)
      }
    }

    if (currentWhs.length < 2) {
      toast.error('You need at least two branches/warehouses to transfer stock.')
      return
    }

    if (!fromWarehouseId && currentWhs.length >= 2) {
      setFromWarehouseId(currentWhs[0].id)
      setToWarehouseId(currentWhs[1].id)
    } else if (fromWarehouseId === toWarehouseId && currentWhs.length >= 2) {
      const other = currentWhs.find((w) => w.id !== fromWarehouseId)
      if (other) setToWarehouseId(other.id)
    }

    if (productList.length === 0) {
      try {
        const prodRes = await productsService.list({ per_page: 100, is_active: true })
        setProductList(prodRes.data?.data || prodRes.data || [])
      } catch (err) {
        console.error('Failed to load products on open create modal', err)
      }
    }

    setItems([{ product_id: '', quantity: 1, notes: '' }])
    setTransferNotes('')
    setIsNewOpen(true)
  }

  // Add Item to Transfer
  function handleAddItem() {
    setItems((prev) => [...prev, { product_id: '', quantity: 1, notes: '' }])
  }

  function handleRemoveItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleItemChange(idx, field, val) {
    setItems((prev) => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: val }
      return updated
    })
  }

  // Submit Transfer
  async function handleSubmitTransfer(e) {
    e.preventDefault()
    if (!fromWarehouseId || !toWarehouseId) {
      toast.error('Please select both source and destination branches.')
      return
    }
    if (fromWarehouseId === toWarehouseId) {
      toast.error('Source and destination branches cannot be the same.')
      return
    }
    if (items.length === 0) {
      toast.error('Please add at least one product to transfer.')
      return
    }
    for (let i = 0; i < items.length; i++) {
      if (!items[i].product_id) {
        toast.error(`Please select a product for row #${i + 1}`)
        return
      }
      if (!items[i].quantity || Number(items[i].quantity) <= 0) {
        toast.error(`Please specify a valid quantity for row #${i + 1}`)
        return
      }
    }

    try {
      setIsSubmitting(true)
      await transferService.create({
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        notes: transferNotes,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity),
          notes: it.notes || '',
        })),
      })
      toast.success('Stock transfer initiated successfully')
      setIsNewOpen(false)
      fetchTransfers()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to initiate transfer')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open Receive Modal
  function handleOpenReceive(transfer) {
    setTransferToReceive(transfer)
    setReceiveNotes('')
    setIsReceiveOpen(true)
  }

  // Confirm Receive
  async function handleConfirmReceive() {
    if (!transferToReceive) return
    try {
      setIsSubmitting(true)
      await transferService.receive(transferToReceive.id, { notes: receiveNotes })
      toast.success(`Transfer ${transferToReceive.transfer_number} received into destination branch!`)
      setIsReceiveOpen(false)
      setIsDetailOpen(false)
      fetchTransfers()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to receive transfer')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open Detail Modal
  async function handleViewDetail(transfer) {
    try {
      const res = await transferService.getById(transfer.id)
      setSelectedTransfer(res.data?.data || transfer)
      setIsDetailOpen(true)
    } catch {
      setSelectedTransfer(transfer)
      setIsDetailOpen(true)
    }
  }

  // Count summaries
  const inTransitCount = transfers.filter((t) => t.status === 'IN_TRANSIT').length
  const completedCount = transfers.filter((t) => t.status === 'COMPLETED').length

  const columns = [
    {
      key: 'transfer_number',
      label: 'Transfer #',
      render: (_, row) => (
        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded-lg border border-blue-200/60">
          {row.transfer_number}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (_, row) => <span className="text-xs text-slate-600">{formatDate(row.created_at)}</span>,
    },
    {
      key: 'from_warehouse',
      label: 'From (Source)',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          <span className="text-xs font-semibold text-slate-800">
            {row.source_warehouse?.name || row.from_warehouse?.name || 'N/A'}
          </span>
        </div>
      ),
    },
    {
      key: 'to_warehouse',
      label: 'To (Destination)',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs font-semibold text-slate-800">
            {row.destination_warehouse?.name || row.to_warehouse?.name || 'N/A'}
          </span>
        </div>
      ),
    },
    {
      key: 'items',
      label: 'Total Units',
      render: (_, row) => {
        const units = (row.items || []).reduce(
          (sum, it) => sum + Number(it.quantity_transferred ?? it.quantity ?? 0),
          0
        )
        return (
          <span className="text-xs font-bold text-slate-700">
            {units} <span className="text-[10px] text-slate-400 font-normal">({(row.items || []).length} items)</span>
          </span>
        )
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <TransferStatusBadge status={row.status} />,
    },
    {
      key: 'creator',
      label: 'Initiated By',
      render: (_, row) => (
        <span className="text-xs text-slate-600 font-medium">
          {row.created_by?.full_name || row.created_by?.username || row.creator?.full_name || row.creator?.username || 'System'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation()
              handleViewDetail(row)
            }}
          >
            Details
          </Button>
          {row.status === 'IN_TRANSIT' && isAdminOrManager && (
            <Button
              size="sm"
              variant="primary"
              onClick={(e) => {
                e.stopPropagation()
                handleOpenReceive(row)
              }}
            >
              Receive
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                Multi-Branch Inventory
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Inter-Branch Stock Transfers</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Move inventory securely between branches and track in-transit stock movements
            </p>
          </div>
          {isAdminOrManager && (
            <Button variant="primary" onClick={handleOpenCreate} className="shadow-primary-glow flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Initiate Transfer
            </Button>
          )}
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/80 backdrop-blur-xl border border-white/90 shadow-glass rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Transfers</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{meta.total}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Historical inter-branch transfers</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl border border-white/90 shadow-glass rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">In Transit</p>
              <h3 className="text-2xl font-bold text-amber-700 mt-1">{inTransitCount}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Awaiting destination confirmation</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1m-6 0a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl border border-white/90 shadow-glass rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Completed</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">{completedCount}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Successfully received and stocked</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Filter and Table Container */}
        <div className="bg-white/80 backdrop-blur-xl border border-white/90 shadow-glass rounded-2xl p-5 space-y-4">
          {/* Status Tabs */}
          <div className="flex border-b border-slate-200">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key)
                  setPage(1)
                }}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <Input
                placeholder="Search transfer # or notes..."
                value={search}
                onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              />
            </div>
            <div>
              <select
                value={fromWarehouseFilter}
                onChange={(e) => handleFilterChange(setFromWarehouseFilter, e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 bg-white/90 border border-slate-200/90 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">All Source Branches</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    From: {wh.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={toWarehouseFilter}
                onChange={(e) => handleFilterChange(setToWarehouseFilter, e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 bg-white/90 border border-slate-200/90 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">All Destination Branches</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    To: {wh.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleFilterChange(setStartDate, e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 bg-white/90 border border-slate-200/90 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                title="Start Date"
              />
            </div>
            <div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleFilterChange(setEndDate, e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 bg-white/90 border border-slate-200/90 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                title="End Date"
              />
            </div>
          </div>

          {/* Transfers Table */}
          <Table
            columns={columns}
            data={transfers}
            loading={loading}
            emptyMessage="No stock transfers found matching the criteria."
            onRowClick={(row) => handleViewDetail(row)}
          />

          {/* Pagination */}
          {meta.total_pages > 1 && (
            <div className="pt-2">
              <Pagination
                page={page}
                totalPages={meta.total_pages}
                total={meta.total}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          )}
        </div>

        {/* Modal: Initiate New Transfer */}
        <Modal
          isOpen={isNewOpen}
          onClose={() => !isSubmitting && setIsNewOpen(false)}
          title="Initiate Inter-Branch Transfer"
          size="lg"
        >
          <form onSubmit={handleSubmitTransfer} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Source Branch (From) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={fromWarehouseId}
                  onChange={(e) => setFromWarehouseId(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                >
                  <option value="">Select Origin Branch</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id} disabled={wh.id === toWarehouseId}>
                      {wh.name} {wh.id === toWarehouseId ? '(Destination)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Stock will be deducted from this branch immediately upon dispatch.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Destination Branch (To) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                >
                  <option value="">Select Receiving Branch</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id} disabled={wh.id === fromWarehouseId}>
                      {wh.name} {wh.id === fromWarehouseId ? '(Source)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Stock will be credited to this branch upon receipt.</p>
              </div>
            </div>

            {/* Items section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Transfer Items</h4>
                <Button type="button" size="sm" variant="secondary" onClick={handleAddItem}>
                  + Add Product
                </Button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200">
                    <div className="flex-1">
                      <select
                        value={it.product_id}
                        onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        required
                      >
                        <option value="">Select Product...</option>
                        {productList.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.name} ({prod.sku})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-28">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="Qty"
                        value={it.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        required
                      />
                    </div>

                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Remove Item"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Transfer Notes / Reason (Optional)
              </label>
              <textarea
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="e.g. Stock rebalancing, weekend peak demand..."
                className="w-full text-xs px-3 py-2 bg-slate-50/80 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none h-18"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setIsNewOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Dispatching...' : 'Dispatch Transfer'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: View Details */}
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`Transfer Details: ${selectedTransfer?.transfer_number || ''}`}
          size="lg"
        >
          {selectedTransfer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                  <div className="mt-0.5">
                    <TransferStatusBadge status={selectedTransfer.status} />
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Date</span>
                  <span className="font-semibold text-slate-700">{formatDate(selectedTransfer.created_at)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">From</span>
                  <span className="font-semibold text-slate-700">{selectedTransfer.source_warehouse?.name || selectedTransfer.from_warehouse?.name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">To</span>
                  <span className="font-semibold text-slate-700">{selectedTransfer.destination_warehouse?.name || selectedTransfer.to_warehouse?.name || 'N/A'}</span>
                </div>
              </div>

              {selectedTransfer.notes && (
                <div className="text-xs bg-blue-50/50 p-3 rounded-xl border border-blue-100/60 text-slate-700">
                  <span className="font-bold text-blue-900">Notes:</span> {selectedTransfer.notes}
                </div>
              )}

              {/* Items List */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Transferred Products</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">SKU</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Qty Sent</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Qty Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(selectedTransfer.items || []).map((it, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-medium text-slate-800">{it.product?.name || it.product_name || 'Product'}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{it.product?.sku || it.product_sku || 'N/A'}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">{it.quantity_transferred ?? it.quantity ?? 0}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-600">
                            {it.quantity_received != null ? it.quantity_received : (it.received_quantity != null ? it.received_quantity : '-')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>
                  Close
                </Button>
                {selectedTransfer.status === 'IN_TRANSIT' && isAdminOrManager && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setIsDetailOpen(false)
                      handleOpenReceive(selectedTransfer)
                    }}
                  >
                    Receive at Destination Branch
                  </Button>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Modal: Confirm Receive */}
        <Modal
          isOpen={isReceiveOpen}
          onClose={() => !isSubmitting && setIsReceiveOpen(false)}
          title={`Receive Transfer: ${transferToReceive?.transfer_number || ''}`}
        >
          {transferToReceive && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                You are verifying and accepting this stock shipment into{' '}
                <strong className="text-slate-900">{transferToReceive.destination_warehouse?.name || transferToReceive.to_warehouse?.name}</strong>.
              </p>
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100 text-xs text-emerald-800">
                Incoming stock will be credited to {transferToReceive.destination_warehouse?.name || transferToReceive.to_warehouse?.name}&apos;s inventory.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Receiving Inspection Notes (Optional)
                </label>
                <textarea
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="e.g. All packages verified in good condition..."
                  className="w-full text-xs px-3 py-2 bg-slate-50/80 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none h-16"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="secondary" onClick={() => setIsReceiveOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleConfirmReceive} disabled={isSubmitting}>
                  {isSubmitting ? 'Receiving...' : 'Confirm & Stock In'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  )
}
