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
import { formatCurrency } from '../utils/formatCurrency'

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('ALL') // ALL, ORDERED, RECEIVED
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Creation modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [suppliersList, setSuppliersList] = useState([])
  const [productsList, setProductsList] = useState([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
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
  const [, setDetailsLoading] = useState(false)
  const [receivingId, setReceivingId] = useState(null)

  const fetchPurchases = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page,
        per_page: 20,
        search: search.trim() || undefined,
        status: activeTab !== 'ALL' ? activeTab : undefined,
      }
      const res = await purchasesService.list(params)
      setPurchases(res.data?.data || [])
      setMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
    } catch {
      toast.error('Failed to load purchases')
    } finally {
      setLoading(false)
    }
  }, [page, search, activeTab])

  useEffect(() => {
    fetchPurchases()
  }, [fetchPurchases])

  useEffect(() => {
    setPage(1)
  }, [search, activeTab])

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
    setDetailsLoading(true)
    try {
      const res = await purchasesService.get(purchaseId)
      setSelectedPurchase(res.data?.data)
    } catch {
      toast.error('Failed to load purchase details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const columns = [
    {
      key: 'purchase_number',
      label: 'Purchase Order #',
      render: (val, row) => (
        <div>
          <button
            onClick={() => openViewDetails(row.id)}
            className="font-mono font-semibold text-primary-600 hover:text-primary-800 text-left"
          >
            {val}
          </button>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(row.created_at).toLocaleDateString()}
          </p>
        </div>
      ),
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
      key: 'payment_status',
      label: 'Payment',
      render: (val) => {
        if (val === 'COMPLETED') return <Badge variant="success">Completed</Badge>
        if (val === 'PARTIALLY_PAID') return <Badge variant="warning">Partial</Badge>
        return <Badge variant="danger">Unpaid</Badge>
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
        <div className="flex items-center gap-2">
          {row.status === 'ORDERED' && (
            <Button
              size="sm"
              variant="success"
              isLoading={receivingId === row.id}
              onClick={() => handleReceive(row.id)}
            >
              Receive Goods
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => openViewDetails(row.id)}>
            Details
          </Button>
        </div>
      ),
    },
  ]

  // Metric stats
  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)
  const totalPayablesDue = purchases.reduce((sum, p) => sum + Number(p.balance_due || 0), 0)
  const pendingOrders = purchases.filter((p) => p.status === 'ORDERED').length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Purchases & Inventory Restock</h1>
            <p className="text-sm text-gray-500 mt-0.5">Create vendor purchase orders, receive inventory, and track payables</p>
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
            <p className="text-xs text-gray-400 mt-0.5">Value: {formatCurrency(totalPurchasesAmount)}</p>
          </div>
          <div className="bg-warning-50 rounded-xl border border-warning-100 p-4">
            <p className="text-sm text-warning-700 font-medium">Pending Delivery</p>
            <p className="text-2xl font-bold text-warning-700 mt-1">{pendingOrders}</p>
            <p className="text-xs text-warning-500 mt-0.5">Ordered goods awaiting arrival</p>
          </div>
          <div className="bg-danger-50 rounded-xl border border-danger-100 p-4">
            <p className="text-sm text-danger-700 font-medium">Total Payables Due</p>
            <p className="text-2xl font-bold text-danger-700 mt-1">{formatCurrency(totalPayablesDue)}</p>
            <p className="text-xs text-danger-500 mt-0.5">Outstanding supplier balances</p>
          </div>
        </div>

        {/* Tabs & Search Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {[
              { key: 'ALL', label: 'All Orders' },
              { key: 'ORDERED', label: 'Ordered' },
              { key: 'RECEIVED', label: 'Received' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-80">
            <input
              type="text"
              role="searchbox"
              placeholder="Search by PO # or supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Purchases Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table
            columns={columns}
            data={purchases}
            isLoading={loading}
            emptyMessage="No purchase orders found."
          />
        </div>

        {/* Pagination */}
        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.total_pages} &mdash; {meta.total} orders
            </p>
            <Pagination page={meta.page} total_pages={meta.total_pages} onPageChange={setPage} />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="ORDERED">ORDERED (Pending Delivery)</option>
                <option value="RECEIVED">RECEIVED (Immediately Restock Stock)</option>
              </select>
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
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
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
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                <input
                  type="text"
                  value={curUnit}
                  onChange={(e) => setCurUnit(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
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
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-1">
                <Button type="button" size="sm" variant="secondary" onClick={addLineItem} className="w-full py-2">
                  +
                </Button>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          {lineItems.length > 0 ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
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
                      <td className="px-3 py-2 text-right">
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
                    <td className="px-3 py-2 text-right font-mono text-primary-700 text-base">
                      {formatCurrency(purchaseSubtotal)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-gray-400 border border-dashed rounded-lg">
              No products added yet. Select products above to add to this order.
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
                  className={`p-2.5 text-left rounded-lg border transition ${
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
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                >
                  <option value="CASH">Cash</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="CARD">Bank / Card</option>
                </select>
              </div>
            )}
          </div>

          <Input
            label="Notes / Delivery instructions"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="e.g. Expected delivery Friday noon"
          />

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm">
              <div>
                <p className="text-xs text-gray-500">Supplier</p>
                <p className="font-semibold text-gray-900 mt-0.5">{selectedPurchase.supplier?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Order Date</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {new Date(selectedPurchase.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Delivery Status</p>
                <div className="mt-0.5">
                  {selectedPurchase.status === 'RECEIVED' ? (
                    <Badge variant="success">Received</Badge>
                  ) : (
                    <Badge variant="warning">Ordered</Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Payment Status</p>
                <div className="mt-0.5">
                  {selectedPurchase.payment_status === 'COMPLETED' ? (
                    <Badge variant="success">Completed</Badge>
                  ) : selectedPurchase.payment_status === 'PARTIALLY_PAID' ? (
                    <Badge variant="warning">Partial</Badge>
                  ) : (
                    <Badge variant="danger">Pending</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
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
                      <td className="px-3 py-2 text-right">
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
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex justify-between items-center text-sm">
              <div>
                <p className="text-gray-500">Amount Paid: <span className="font-semibold text-success-600">{formatCurrency(selectedPurchase.amount_paid)}</span></p>
                <p className="text-gray-500">Balance Due: <span className="font-bold text-danger-600">{formatCurrency(selectedPurchase.balance_due)}</span></p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Total Amount</p>
                <p className="text-xl font-bold font-mono text-gray-900">{formatCurrency(selectedPurchase.total_amount)}</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              {selectedPurchase.status === 'ORDERED' && (
                <Button
                  variant="success"
                  isLoading={receivingId === selectedPurchase.id}
                  onClick={() => handleReceive(selectedPurchase.id)}
                >
                  Receive Goods & Restock
                </Button>
              )}
              <Button variant="secondary" onClick={() => setSelectedPurchase(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}
