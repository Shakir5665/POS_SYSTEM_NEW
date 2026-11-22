import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { purchasesService } from '../services/purchases'
import { suppliersService } from '../services/suppliers'
import { productsService } from '../services/products'
import { warehouseService } from '../services/warehouses'
import { returnsService } from '../services/returns'
import { formatCurrency, formatCompactCurrency } from '../utils/formatCurrency'

export default function PurchasesPage() {
  // Top view tab: 'ORDERS' or 'RETURNS'
  const [activeTab, setActiveTab] = useState('ORDERS')

  // Common filters
  const [search, setSearch] = useState('')
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('')
  const [warehouses, setWarehouses] = useState([])
  const [defaultWarehouseId, setDefaultWarehouseId] = useState('')

  // Purchases list state
  const [purchases, setPurchases] = useState([])
  const [orderStatusTab, setOrderStatusTab] = useState('ALL') // ALL, ORDERED, RECEIVED
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Purchase Returns list state
  const [returnsList, setReturnsList] = useState([])
  const [returnsMeta, setReturnsMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [returnsPage, setReturnsPage] = useState(1)
  const [returnsLoading, setReturnsLoading] = useState(false)
  const [selectedReturnDetails, setSelectedReturnDetails] = useState(null)

  // Creation modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [suppliersList, setSuppliersList] = useState([])
  const [productsList, setProductsList] = useState([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0])
  const [orderStatus, setOrderStatus] = useState('ORDERED') // ORDERED or RECEIVED
  const [orderNotes, setOrderNotes] = useState('')
  const [paymentType, setPaymentType] = useState('CREDIT') // CREDIT, FULL, PARTIAL
  const [customInitialPaid, setCustomInitialPaid] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')

  // Line items for new purchase
  const [lineItems, setLineItems] = useState([])
  const [curProduct, setCurProduct] = useState('')
  const [curQty, setCurQty] = useState('1')
  const [curCost, setCurCost] = useState('')
  const [curUnit, setCurUnit] = useState('pcs')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // View Details Modal
  const [selectedPurchase, setSelectedPurchase] = useState(null)
  const [receivingId, setReceivingId] = useState(null)

  // Purchase Return modal state
  const [returnPurchaseTarget, setReturnPurchaseTarget] = useState(null)
  const [, setPurchaseEligibility] = useState(null)
  const [eligibilityLoading, setEligibilityLoading] = useState(false)
  const [returnItemsState, setReturnItemsState] = useState([])
  const [returnReason, setReturnReason] = useState('')
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false)
  const [showConfirmReturnModal, setShowConfirmReturnModal] = useState(false)

  // Load warehouses
  useEffect(() => {
    async function loadWarehouses() {
      try {
        const res = await warehouseService.list()
        const list = res.data?.data || []
        setWarehouses(list)
        const def = list.find((w) => w.is_default) || list[0]
        if (def) {
          setDefaultWarehouseId(def.id)
          setSelectedWarehouseId(def.id)
        }
      } catch {
        // Silently handle failure
      }
    }
    loadWarehouses()
  }, [])

  // Fetch purchase orders
  const fetchPurchases = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page,
        per_page: 20,
        search: search.trim() || undefined,
        status: orderStatusTab !== 'ALL' ? orderStatusTab : undefined,
        warehouse_id: selectedWarehouseFilter || undefined,
      }
      const res = await purchasesService.list(params)
      setPurchases(res.data?.data || [])
      setMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
    } catch {
      toast.error('Failed to load purchases')
    } finally {
      setLoading(false)
    }
  }, [page, search, orderStatusTab, selectedWarehouseFilter])

  // Fetch purchase returns
  const fetchPurchaseReturns = useCallback(async () => {
    setReturnsLoading(true)
    try {
      const params = {
        page: returnsPage,
        per_page: 20,
        search: search.trim() || undefined,
        warehouse_id: selectedWarehouseFilter || undefined,
      }
      const res = await returnsService.listPurchaseReturns(params)
      setReturnsList(res.data?.data || [])
      setReturnsMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
    } catch {
      toast.error('Failed to load purchase returns')
    } finally {
      setReturnsLoading(false)
    }
  }, [returnsPage, search, selectedWarehouseFilter])

  useEffect(() => {
    if (activeTab === 'ORDERS') {
      fetchPurchases()
    } else {
      fetchPurchaseReturns()
    }
  }, [activeTab, fetchPurchases, fetchPurchaseReturns])

  useEffect(() => {
    setPage(1)
    setReturnsPage(1)
  }, [search, orderStatusTab, selectedWarehouseFilter])

  async function openCreateModal() {
    try {
      const [supRes, prodRes] = await Promise.all([
        suppliersService.list({ per_page: 100, is_active: true }),
        productsService.list({ per_page: 100 }),
      ])
      const sups = supRes.data?.data || []
      const prods = prodRes.data?.data || []
      setSuppliersList(sups)
      setProductsList(prods)
      if (sups.length > 0) setSelectedSupplierId(sups[0].id)
      if (prods.length > 0) {
        setCurProduct(prods[0].id)
        setCurCost(String(prods[0].cost_price || ''))
        setCurUnit(prods[0].base_unit || 'pcs')
      }
      if (defaultWarehouseId) setSelectedWarehouseId(defaultWarehouseId)
      setPurchaseDate(new Date().toISOString().split('T')[0])
      setLineItems([])
      setOrderStatus('ORDERED')
      setOrderNotes('')
      setPaymentType('CREDIT')
      setCustomInitialPaid('')
      setCreateModalOpen(true)
    } catch {
      toast.error('Failed to load suppliers and products')
    }
  }

  function handleProductSelect(prodId) {
    setCurProduct(prodId)
    const p = productsList.find((prod) => prod.id === prodId)
    if (p) {
      setCurCost(String(p.cost_price || ''))
      setCurUnit(p.base_unit || 'pcs')
    }
  }

  function addLineItem() {
    if (!curProduct) {
      toast.error('Please select a product')
      return
    }
    const q = parseFloat(curQty)
    if (isNaN(q) || q <= 0) {
      toast.error('Quantity must be greater than zero')
      return
    }
    const c = parseFloat(curCost)
    if (isNaN(c) || c < 0) {
      toast.error('Cost price must be non-negative')
      return
    }

    const p = productsList.find((prod) => prod.id === curProduct)
    const lineTotal = Number((q * c).toFixed(2))

    setLineItems((prev) => [
      ...prev,
      {
        product_id: p.id,
        product_name: p.name,
        product_sku: p.sku,
        quantity: q,
        unit: curUnit || p.base_unit || 'pcs',
        unit_cost: c,
        total_cost: lineTotal,
      },
    ])
    setCurQty('1')
  }

  function removeLineItem(idx) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const purchaseSubtotal = lineItems.reduce((sum, item) => sum + item.total_cost, 0)

  let initialPaidAmount = 0
  if (paymentType === 'FULL') {
    initialPaidAmount = purchaseSubtotal
  } else if (paymentType === 'PARTIAL') {
    initialPaidAmount = parseFloat(customInitialPaid) || 0
  }

  async function handleCreatePurchase(e) {
    e.preventDefault()
    if (!selectedSupplierId) {
      toast.error('Please select a supplier')
      return
    }
    if (lineItems.length === 0) {
      toast.error('Please add at least one product item')
      return
    }

    setIsSubmitting(true)
    try {
      await purchasesService.create({
        supplier_id: selectedSupplierId,
        warehouse_id: selectedWarehouseId || undefined,
        purchase_date: purchaseDate || undefined,
        status: orderStatus,
        initial_payment: initialPaidAmount,
        payment_method: paymentMethod,
        notes: orderNotes.trim() || undefined,
        items: lineItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          unit: item.unit,
        })),
      })

      toast.success(
        orderStatus === 'RECEIVED'
          ? 'Purchase order created and stock restocked successfully'
          : 'Purchase order created successfully'
      )
      setCreateModalOpen(false)
      fetchPurchases()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create purchase order')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleReceive(purchaseId) {
    setReceivingId(purchaseId)
    try {
      await purchasesService.receive(purchaseId)
      toast.success('Goods received! Inventory stock has been restocked.')
      fetchPurchases()
      if (selectedPurchase?.id === purchaseId) {
        openViewDetails(purchaseId)
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to receive goods')
    } finally {
      setReceivingId(null)
    }
  }

  async function openViewDetails(purchaseId) {
    try {
      const res = await purchasesService.get(purchaseId)
      setSelectedPurchase(res.data?.data)
    } catch {
      toast.error('Failed to load purchase details')
    }
  }

  // Open Supplier Return Modal
  async function openReturnModal(purchase) {
    if (purchase.is_legacy_import) {
      toast.error('Historical imported purchases cannot be returned to suppliers.')
      return
    }
    if (purchase.status !== 'RECEIVED') {
      toast.error('Only received purchases can be returned to suppliers.')
      return
    }

    setReturnPurchaseTarget(purchase)
    setEligibilityLoading(true)
    setReturnReason('')
    setShowConfirmReturnModal(false)

    try {
      const res = await returnsService.getPurchaseEligibility(purchase.id)
      const data = res.data?.data
      setPurchaseEligibility(data)
      const items = (data?.items || []).map((it) => {
        const received = parseFloat(it.quantity_received ?? it.purchased_quantity ?? 0)
        const returned = parseFloat(it.returned_quantity ?? it.already_returned ?? 0)
        const remaining = parseFloat(it.remaining_quantity ?? it.remaining_eligible ?? (received - returned))
        const stock = parseFloat(it.available_stock ?? it.current_stock ?? 0)
        return {
          purchase_item_id: it.purchase_item_id,
          product_id: it.product_id,
          product_name: it.product_name,
          sku: it.product_sku,
          quantity_received: received,
          returned_quantity: returned,
          remaining_quantity: remaining,
          available_stock: stock,
          unit_cost: Number(it.net_unit_cost ?? it.unit_cost ?? 0),
          return_qty: 0,
        }
      })
      setReturnItemsState(items)
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to check purchase return eligibility')
      setReturnPurchaseTarget(null)
    } finally {
      setEligibilityLoading(false)
    }
  }

  function handleReturnQtyChange(purchaseItemId, val) {
    setReturnItemsState((prev) =>
      prev.map((it) => {
        if (it.purchase_item_id !== purchaseItemId) return it
        const parsed = parseFloat(val) || 0
        const maxAllowed = Math.min(it.remaining_quantity, it.available_stock)
        const clamped = Math.max(0, Math.min(parsed, maxAllowed))
        return { ...it, return_qty: clamped }
      })
    )
  }

  const calculatedReturnTotal = returnItemsState.reduce((sum, it) => sum + it.return_qty * it.unit_cost, 0)
  const totalReturnUnits = returnItemsState.reduce((sum, it) => sum + it.return_qty, 0)

  async function handleSubmitPurchaseReturn() {
    if (totalReturnUnits <= 0) {
      toast.error('Please specify a return quantity greater than zero for at least one item')
      return
    }
    if (!returnReason.trim()) {
      toast.error('Please enter a reason for the supplier return')
      return
    }

    const payloadItems = returnItemsState
      .filter((it) => it.return_qty > 0)
      .map((it) => ({
        purchase_item_id: it.purchase_item_id,
        quantity: it.return_qty,
      }))

    setIsSubmittingReturn(true)
    try {
      const res = await returnsService.createPurchaseReturn({
        purchase_id: returnPurchaseTarget.id,
        items: payloadItems,
        reason: returnReason.trim(),
        idempotency_key: `pr-${returnPurchaseTarget.id}-${Date.now()}`,
      })

      const returnNumber = res.data?.data?.return_number || 'PR'
      toast.success(`Purchase return ${returnNumber} processed! Inventory stock updated.`)
      setReturnPurchaseTarget(null)
      setShowConfirmReturnModal(false)
      fetchPurchases()
      if (activeTab === 'RETURNS') fetchPurchaseReturns()
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to process purchase return')
    } finally {
      setIsSubmittingReturn(false)
    }
  }

  // Purchases Table Columns
  const purchaseColumns = [
    {
      key: 'purchase_number',
      label: 'Purchase Order #',
      render: (val, row) => (
        <div>
          <button
            onClick={() => openViewDetails(row.id)}
            className="font-mono font-semibold text-primary-600 hover:text-primary-800 text-left hover:underline"
          >
            {val}
          </button>
          {row.is_legacy_import && (
            <div className="mt-0.5">
              <span className="inline-block px-1.5 py-0.5 text-3xs font-bold uppercase rounded bg-amber-100 text-amber-800 border border-amber-200">
                Legacy Import
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'purchase_date',
      label: 'Date',
      render: (v, row) => (
        <span className="text-xs text-gray-700">
          {new Date(v || row.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'warehouse',
      label: 'Warehouse',
      render: (val) => <span className="text-xs text-gray-700">{val?.name || 'Main Warehouse'}</span>,
    },
    {
      key: 'supplier',
      label: 'Supplier',
      render: (val) => (
        <div>
          <p className="font-medium text-gray-900">{val?.name || '—'}</p>
          {val?.phone && <p className="text-xs text-gray-400">{val.phone}</p>}
        </div>
      ),
    },
    {
      key: 'items',
      label: 'Items',
      render: (val) => <span className="text-sm text-gray-600">{val?.length || 0} items</span>,
    },
    {
      key: 'total_amount',
      label: 'Total Cost',
      render: (val) => <span className="font-bold text-gray-900">{formatCurrency(val)}</span>,
    },
    {
      key: 'balance_due',
      label: 'Balance Due',
      render: (val, row) => {
        const bal = Number(val || 0)
        return bal > 0 ? (
          <div>
            <span className="font-bold text-danger-600">{formatCurrency(bal)}</span>
            <p className="text-2xs text-gray-400">Paid: {formatCurrency(row.amount_paid)}</p>
          </div>
        ) : (
          <span className="text-success-600 font-medium">Fully Paid</span>
        )
      },
    },
    {
      key: 'status',
      label: 'Delivery Status',
      render: (val) => {
        if (val === 'RECEIVED') return <Badge variant="success">Received</Badge>
        if (val === 'ORDERED') return <Badge variant="warning">Ordered</Badge>
        return <Badge variant="default">Cancelled</Badge>
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          {row.status === 'ORDERED' && (
            <Button
              size="sm"
              variant="success"
              isLoading={receivingId === row.id}
              onClick={() => handleReceive(row.id)}
            >
              Receive
            </Button>
          )}
          {row.status === 'RECEIVED' && !row.is_legacy_import && (
            <Button size="sm" variant="secondary" onClick={() => openReturnModal(row)}>
              Return
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => openViewDetails(row.id)}>
            Details
          </Button>
        </div>
      ),
    },
  ]

  // Purchase Returns Table Columns
  const returnColumns = [
    {
      key: 'return_number',
      label: 'Return #',
      render: (v, row) => (
        <button
          onClick={() => setSelectedReturnDetails(row)}
          className="font-mono font-semibold text-primary-600 hover:text-primary-800 text-left hover:underline text-xs"
        >
          {v}
        </button>
      ),
    },
    {
      key: 'return_date',
      label: 'Date',
      render: (v, row) => (
        <span className="text-xs text-gray-600">{new Date(v || row.created_at).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'purchase',
      label: 'Original PO',
      render: (v) => <span className="font-mono text-xs text-gray-700">{v?.purchase_number || '—'}</span>,
    },
    {
      key: 'supplier',
      label: 'Supplier',
      render: (v) => <span className="font-medium text-xs text-gray-900">{v?.name || '—'}</span>,
    },
    {
      key: 'warehouse',
      label: 'Warehouse',
      render: (v) => <span className="text-xs text-gray-700">{v?.name || 'Main Warehouse'}</span>,
    },
    {
      key: 'total_amount',
      label: 'Total Value',
      render: (v) => <span className="font-mono font-bold text-danger-700 text-xs">{formatCurrency(v)}</span>,
    },
    {
      key: 'settlement_status',
      label: 'Settlement',
      render: (v) => <Badge variant={v === 'SETTLED' ? 'success' : 'warning'}>{v || 'PENDING'}</Badge>,
    },
    {
      key: 'user',
      label: 'Handled By',
      render: (v) => <span className="text-xs text-gray-600">{v?.full_name || 'Staff'}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelectedReturnDetails(row)}>
          Details
        </Button>
      ),
    },
  ]

  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)
  const totalPayablesDue = purchases.reduce((sum, p) => sum + Number(p.balance_due || 0), 0)
  const pendingOrders = purchases.filter((p) => p.status === 'ORDERED').length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Purchases & Vendor Returns</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Create vendor purchase orders, receive inventory, and return defective goods to suppliers
            </p>
          </div>
          <Button variant="primary" onClick={openCreateModal}>
            + New Purchase Order
          </Button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500 font-medium">Total Orders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{meta.total || purchases.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Value: <span title={formatCurrency(totalPurchasesAmount)}>{formatCompactCurrency(totalPurchasesAmount)}</span>
            </p>
          </div>
          <div className="bg-warning-50 rounded-xl border border-warning-100 p-4">
            <p className="text-sm text-warning-700 font-medium">Pending Delivery</p>
            <p className="text-2xl font-bold text-warning-700 mt-1">{pendingOrders}</p>
            <p className="text-xs text-warning-500 mt-0.5">Ordered goods awaiting arrival</p>
          </div>
          <div className="bg-danger-50 rounded-xl border border-danger-100 p-4">
            <p className="text-sm text-danger-700 font-medium">Total Payables Due</p>
            <p className="text-2xl font-bold text-danger-700 mt-1" title={formatCurrency(totalPayablesDue)}>
              {formatCompactCurrency(totalPayablesDue)}
            </p>
            <p className="text-xs text-danger-500 mt-0.5">Outstanding supplier balances</p>
          </div>
        </div>

        {/* View Switcher: Purchase Orders vs Purchase Returns */}
        <div className="flex gap-2 border-b border-gray-200 pb-2">
          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 'ORDERS' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Purchase Orders
          </button>
          <button
            onClick={() => setActiveTab('RETURNS')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 'RETURNS' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Purchase Returns History
          </button>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
          {activeTab === 'ORDERS' ? (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
              {[
                { key: 'ALL', label: 'All Orders' },
                { key: 'ORDERED', label: 'Ordered' },
                { key: 'RECEIVED', label: 'Received' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setOrderStatusTab(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                    orderStatusTab === tab.key
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Supplier Defect & Return Log
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedWarehouseFilter}
              onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
            >
              <option value="">All Warehouses</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} ({wh.code})
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-64">
              <input
                type="text"
                role="searchbox"
                placeholder={activeTab === 'ORDERS' ? 'Search PO # or supplier…' : 'Search return #…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Table */}
        {activeTab === 'ORDERS' ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Table
              columns={purchaseColumns}
              data={purchases}
              isLoading={loading}
              emptyMessage="No purchase orders found."
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Table
              columns={returnColumns}
              data={returnsList}
              isLoading={returnsLoading}
              emptyMessage="No purchase returns recorded."
            />
          </div>
        )}

        {/* Pagination */}
        {activeTab === 'ORDERS' && meta.total_pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.total_pages} &mdash; {meta.total} orders
            </p>
            <Pagination page={meta.page} total_pages={meta.total_pages} onPageChange={setPage} />
          </div>
        )}
        {activeTab === 'RETURNS' && returnsMeta.total_pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {returnsMeta.page} of {returnsMeta.total_pages} &mdash; {returnsMeta.total} returns
            </p>
            <Pagination page={returnsMeta.page} total_pages={returnsMeta.total_pages} onPageChange={setReturnsPage} />
          </div>
        )}
      </div>

      {/* Create Purchase Order Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Purchase Order"
        size="lg"
      >
        <form onSubmit={handleCreatePurchase} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Supplier *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                required
              >
                {suppliersList.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name} {sup.phone ? `(${sup.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Warehouse Attribution *</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Date *</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Initial Status</label>
              <select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="ORDERED">ORDERED (Goods in transit / Pending Delivery)</option>
                <option value="RECEIVED">RECEIVED (Immediately Restock Sellable Inventory)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes / Instructions</label>
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="e.g. Expected Friday batch"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Add Item Section */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Add Products to Order</p>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-5">
                <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                <select
                  value={curProduct}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                >
                  {productsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Qty</label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  value={curQty}
                  onChange={(e) => setCurQty(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                <input
                  type="text"
                  value={curUnit}
                  onChange={(e) => setCurUnit(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={curCost}
                  onChange={(e) => setCurCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-1">
                <Button type="button" size="sm" variant="secondary" onClick={addLineItem} className="w-full py-1.5">
                  +
                </Button>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          {lineItems.length > 0 ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Qty</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Unit Cost</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {lineItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{item.product_name}</p>
                        <p className="text-2xs text-gray-400">{item.product_sku}</p>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(item.unit_cost)}</td>
                      <td className="px-3 py-2 text-right font-bold font-mono text-gray-900">
                        {formatCurrency(item.total_cost)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-danger-600 hover:text-danger-800 text-xs"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={3} className="px-3 py-2 text-right text-gray-700">
                      Total Order Cost:
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-primary-700 text-sm">
                      {formatCurrency(purchaseSubtotal)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-gray-400 border border-dashed rounded-lg">
              No products added yet.
            </div>
          )}

          {/* Payment Terms Section */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Payment Terms</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'CREDIT', label: 'Credit (Pay Later)', desc: 'Full balance due' },
                { id: 'FULL', label: 'Paid in Full', desc: 'Paid at order' },
                { id: 'PARTIAL', label: 'Partial Deposit', desc: 'Custom downpayment' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPaymentType(opt.id)}
                  className={`p-2 text-left rounded-lg border transition ${
                    paymentType === opt.id ? 'border-primary-500 bg-primary-50/50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className="text-xs font-bold text-gray-900">{opt.label}</p>
                  <p className="text-2xs text-gray-400">{opt.desc}</p>
                </button>
              ))}
            </div>

            {paymentType === 'PARTIAL' && (
              <Input
                label="Deposit Amount Paid"
                type="number"
                step="0.01"
                min="0"
                max={purchaseSubtotal}
                value={customInitialPaid}
                onChange={(e) => setCustomInitialPaid(e.target.value)}
                placeholder="0.00"
              />
            )}

            {paymentType !== 'CREDIT' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                >
                  <option value="CASH">Cash</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="CARD">Bank / Card</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting} disabled={lineItems.length === 0}>
              Create Purchase Order
            </Button>
          </div>
        </form>
      </Modal>

      {/* View Details Modal */}
      <Modal
        isOpen={!!selectedPurchase}
        onClose={() => setSelectedPurchase(null)}
        title={`Purchase Order: ${selectedPurchase?.purchase_number || ''}`}
        size="lg"
      >
        {selectedPurchase && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
              <div>
                <p className="text-gray-500">Supplier</p>
                <p className="font-semibold text-gray-900 mt-0.5">{selectedPurchase.supplier?.name}</p>
              </div>
              <div>
                <p className="text-gray-500">Order Date</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {new Date(selectedPurchase.purchase_date || selectedPurchase.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Delivery Status</p>
                <div className="mt-0.5">
                  {selectedPurchase.status === 'RECEIVED' ? (
                    <Badge variant="success">Received</Badge>
                  ) : (
                    <Badge variant="warning">Ordered</Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-gray-500">Warehouse</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {selectedPurchase.warehouse?.name || 'Main Warehouse'}
                </p>
              </div>
            </div>

            {/* Line Items */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Item</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Quantity</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Unit Cost</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {selectedPurchase.items?.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{item.product_name}</p>
                        <p className="text-2xs text-gray-400">{item.product_sku}</p>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(item.unit_cost)}</td>
                      <td className="px-3 py-2 text-right font-bold font-mono text-gray-900">
                        {formatCurrency(item.total_cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial summary */}
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex justify-between items-center text-xs">
              <div>
                <p className="text-gray-500">Amount Paid: <span className="font-semibold text-success-600">{formatCurrency(selectedPurchase.amount_paid)}</span></p>
                <p className="text-gray-500">Balance Due: <span className="font-bold text-danger-600">{formatCurrency(selectedPurchase.balance_due)}</span></p>
              </div>
              <div className="text-right">
                <p className="text-gray-500">Total Amount</p>
                <p className="text-lg font-bold font-mono text-gray-900">{formatCurrency(selectedPurchase.total_amount)}</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              {selectedPurchase.status === 'ORDERED' && (
                <Button
                  variant="success"
                  isLoading={receivingId === selectedPurchase.id}
                  onClick={() => handleReceive(selectedPurchase.id)}
                >
                  Receive Goods & Restock
                </Button>
              )}
              {selectedPurchase.status === 'RECEIVED' && !selectedPurchase.is_legacy_import && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedPurchase(null)
                    openReturnModal(selectedPurchase)
                  }}
                >
                  Return Items to Supplier
                </Button>
              )}
              <Button variant="ghost" onClick={() => setSelectedPurchase(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Purchase Return Creation Modal */}
      <Modal
        isOpen={!!returnPurchaseTarget}
        onClose={() => {
          if (!isSubmittingReturn) {
            setReturnPurchaseTarget(null)
            setShowConfirmReturnModal(false)
          }
        }}
        title={`Return Goods to Supplier: ${returnPurchaseTarget?.purchase_number || ''}`}
        size="lg"
      >
        {eligibilityLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Checking purchase return eligibility…</div>
        ) : returnPurchaseTarget && (
          <div className="space-y-4 text-xs">
            {/* Purchase header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg border">
              <div>
                <span className="text-gray-500">Supplier:</span>
                <p className="font-semibold text-gray-900">{returnPurchaseTarget.supplier?.name}</p>
              </div>
              <div>
                <span className="text-gray-500">Order Date:</span>
                <p className="font-semibold text-gray-900">
                  {new Date(returnPurchaseTarget.purchase_date || returnPurchaseTarget.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Warehouse:</span>
                <p className="font-semibold text-gray-900">{returnPurchaseTarget.warehouse?.name || 'Main Warehouse'}</p>
              </div>
              <div>
                <span className="text-gray-500">PO Value:</span>
                <p className="font-semibold text-gray-900">{formatCurrency(returnPurchaseTarget.total_amount)}</p>
              </div>
            </div>

            {/* Line items return selection */}
            <div>
              <p className="font-bold uppercase text-gray-600 mb-2">Select Items & Quantities to Return</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Received</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Prev. Ret.</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Eligible</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Avail. Stock</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">Return Qty</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Return Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {returnItemsState.map((it) => {
                      const maxAllowed = Math.min(it.remaining_quantity, it.available_stock)
                      const lineTotal = it.return_qty * it.unit_cost
                      return (
                        <tr key={it.purchase_item_id} className={it.return_qty > 0 ? 'bg-danger-50/20' : ''}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900">{it.product_name}</p>
                            <p className="text-2xs font-mono text-gray-400">{it.sku}</p>
                          </td>
                          <td className="px-2 py-2 text-center font-mono">{it.quantity_received}</td>
                          <td className="px-2 py-2 text-center font-mono text-gray-500">{it.returned_quantity}</td>
                          <td className="px-2 py-2 text-center font-mono font-bold text-gray-800">
                            {it.remaining_quantity}
                          </td>
                          <td className="px-2 py-2 text-center font-mono">
                            <span className={it.available_stock < it.remaining_quantity ? 'text-amber-600 font-bold' : 'text-gray-700'}>
                              {it.available_stock}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              max={maxAllowed}
                              step="any"
                              value={it.return_qty || ''}
                              onChange={(e) => handleReturnQtyChange(it.purchase_item_id, e.target.value)}
                              disabled={maxAllowed <= 0}
                              placeholder="0"
                              className="w-full px-2 py-1 text-center font-mono font-bold border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-danger-700">
                            {formatCurrency(lineTotal)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block font-medium text-gray-700 mb-1">Return Reason *</label>
              <input
                type="text"
                required
                placeholder="e.g. Defective batch, expired goods, damaged packaging, supplier recall..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Stock deduction rule reminder */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-2xs text-amber-900 space-y-1">
              <p className="font-bold">Inventory & Settlement Guarantee:</p>
              <p>
                1. Submitting this return will atomically decrement global <code>Product.quantity</code> to reflect
                goods leaving sellable inventory.
              </p>
              <p>
                2. Supplier credit/refund balance will be recorded in <code>PENDING</code> settlement status until cash
                or vendor credit is acknowledged.
              </p>
            </div>

            {/* Summary Banner */}
            <div className="bg-gray-100 rounded-lg p-3 flex justify-between items-center text-sm">
              <div>
                <p className="text-xs text-gray-700 font-medium">Total Units Returning: {totalReturnUnits}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500">Calculated Return Total:</span>
                <p className="text-lg font-bold font-mono text-danger-700">{formatCurrency(calculatedReturnTotal)}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setReturnPurchaseTarget(null)}
                disabled={isSubmittingReturn}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => setShowConfirmReturnModal(true)}
                disabled={totalReturnUnits <= 0 || !returnReason.trim()}
              >
                Review & Confirm Return
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Purchase Return Dialog */}
      <Modal
        isOpen={showConfirmReturnModal}
        onClose={() => setShowConfirmReturnModal(false)}
        title="Confirm Supplier Return"
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-sm text-gray-700">
            Confirm dispatching goods back to supplier for PO{' '}
            <span className="font-mono font-bold">{returnPurchaseTarget?.purchase_number}</span>?
          </p>
          <div className="bg-gray-50 p-3 rounded-lg space-y-1">
            <p>
              <span className="text-gray-500">Return Value:</span>{' '}
              <span className="font-bold text-danger-700 font-mono">{formatCurrency(calculatedReturnTotal)}</span>
            </p>
            <p>
              <span className="text-gray-500">Reason:</span>{' '}
              <span className="text-gray-800 italic">&ldquo;{returnReason}&rdquo;</span>
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowConfirmReturnModal(false)}
              disabled={isSubmittingReturn}
            >
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitPurchaseReturn}
              isLoading={isSubmittingReturn}
            >
              Confirm & Deduct Stock
            </Button>
          </div>
        </div>
      </Modal>

      {/* Purchase Return Details Modal */}
      <Modal
        isOpen={!!selectedReturnDetails}
        onClose={() => setSelectedReturnDetails(null)}
        title={`Purchase Return: ${selectedReturnDetails?.return_number || ''}`}
        size="md"
      >
        {selectedReturnDetails && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-lg border">
              <div>
                <span className="text-gray-500">Original PO:</span>
                <p className="font-mono font-bold text-gray-900">{selectedReturnDetails.purchase?.purchase_number || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Date:</span>
                <p className="font-medium text-gray-900">
                  {new Date(selectedReturnDetails.return_date || selectedReturnDetails.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Supplier:</span>
                <p className="font-medium text-gray-900">{selectedReturnDetails.supplier?.name || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Warehouse:</span>
                <p className="font-medium text-gray-900">{selectedReturnDetails.warehouse?.name || 'Main Warehouse'}</p>
              </div>
              <div>
                <span className="text-gray-500">Settlement Status:</span>
                <div className="mt-0.5">
                  <Badge variant={selectedReturnDetails.settlement_status === 'SETTLED' ? 'success' : 'warning'}>
                    {selectedReturnDetails.settlement_status || 'PENDING'}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-gray-500">Total Return Value:</span>
                <p className="font-bold text-danger-700 font-mono text-sm">
                  {formatCurrency(selectedReturnDetails.total_amount)}
                </p>
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Reason for Return:</p>
              <p className="p-2 bg-gray-50 rounded border text-gray-800 italic">
                {selectedReturnDetails.reason || 'No reason specified'}
              </p>
            </div>

            {/* Returned Items */}
            <div>
              <p className="font-semibold text-gray-700 mb-1">Returned Items:</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">Product</th>
                      <th className="px-2 py-1.5 text-center font-medium text-gray-600">Qty</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-600">Unit Cost</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-600">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {selectedReturnDetails.items?.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-1.5">
                          <p className="font-medium text-gray-900">{it.product?.name || 'Product'}</p>
                          <p className="text-2xs font-mono text-gray-400">{it.product?.sku}</p>
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono font-semibold">{it.quantity}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(it.unit_cost)}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-danger-700">
                          {formatCurrency(it.total_cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedReturnDetails(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}
