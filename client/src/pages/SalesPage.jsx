import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { Receipt } from '../components/Receipt'
import { UnmatchedPayments } from '../components/UnmatchedPayments'
import { salesService } from '../services/sales'
import { warehouseService } from '../services/warehouses'
import { returnsService } from '../services/returns'
import { useSettings } from '../hooks/useSettings'
import { formatCurrency } from '../utils/formatCurrency'
import { saleStatus, canRefund, PAYMENT_METHOD_LABELS } from '../utils/saleStatus'

export default function SalesPage() {
  const settings = useSettings()
  const fmt = (v) => formatCurrency(v, settings.currency_symbol || 'LKR')

  const [searchParams, setSearchParams] = useSearchParams()
  const initialStart = searchParams.get('startDate') || ''
  const initialEnd = searchParams.get('endDate') || ''

  // Top Tab: 'SALES' or 'RETURNS'
  const [activeTab, setActiveTab] = useState('SALES')

  // Common filters
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [warehouses, setWarehouses] = useState([])

  // Sales state
  const [sales, setSales] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Returns state
  const [returnsList, setReturnsList] = useState([])
  const [returnsMeta, setReturnsMeta] = useState({ page: 1, total_pages: 1 })
  const [returnsPage, setReturnsPage] = useState(1)
  const [returnsLoading, setReturnsLoading] = useState(false)
  const [selectedReturnDetails, setSelectedReturnDetails] = useState(null)

  // Modals state
  const [receiptSale, setReceiptSale] = useState(null)
  const [refundTarget, setRefundTarget] = useState(null)
  const [refunding, setRefunding] = useState(false)

  // Return creation modal state
  const [returnSaleTarget, setReturnSaleTarget] = useState(null)
  const [, setEligibilityData] = useState(null)
  const [eligibilityLoading, setEligibilityLoading] = useState(false)
  const [returnItemsState, setReturnItemsState] = useState([]) // [{ sale_item_id, product_name, sku, remaining_quantity, unit_price, return_qty, restock }]
  const [returnReason, setReturnReason] = useState('')
  const [refundMethod, setRefundMethod] = useState('CASH')
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false)
  const [showConfirmReturnModal, setShowConfirmReturnModal] = useState(false)

  // Load warehouses
  useEffect(() => {
    async function loadWarehouses() {
      try {
        const res = await warehouseService.list()
        setWarehouses(res.data?.data || [])
      } catch {
        // Silently handle warehouse load failure
      }
    }
    loadWarehouses()
  }, [])

  useEffect(() => {
    const paramStart = searchParams.get('startDate') || ''
    const paramEnd = searchParams.get('endDate') || ''
    if (paramStart !== startDate || paramEnd !== endDate) {
      setStartDate(paramStart)
      setEndDate(paramEnd)
      setPage(1)
      setReturnsPage(1)
    }
  }, [searchParams, startDate, endDate])

  // Fetch sales
  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const res = await salesService.list({
        page,
        per_page: 20,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        search: search.trim() || undefined,
        warehouse_id: selectedWarehouse || undefined,
      })
      setSales(res.data?.data ?? [])
      setMeta(res.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load sales')
    } finally {
      setLoading(false)
    }
  }, [page, startDate, endDate, search, selectedWarehouse])

  // Fetch sales returns
  const fetchReturns = useCallback(async () => {
    setReturnsLoading(true)
    try {
      const res = await returnsService.listSalesReturns({
        page: returnsPage,
        per_page: 20,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        search: search.trim() || undefined,
        warehouse_id: selectedWarehouse || undefined,
      })
      setReturnsList(res.data?.data ?? [])
      setReturnsMeta(res.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load sales returns')
    } finally {
      setReturnsLoading(false)
    }
  }, [returnsPage, startDate, endDate, search, selectedWarehouse])

  useEffect(() => {
    if (activeTab === 'SALES') {
      fetchSales()
    } else {
      fetchReturns()
    }
  }, [activeTab, fetchSales, fetchReturns])

  function changeFilter(setter) {
    return (e) => {
      setter(e.target.value)
      setPage(1)
      setReturnsPage(1)
    }
  }

  async function openReceipt(sale) {
    try {
      const res = await salesService.get(sale.id)
      setReceiptSale(res.data?.data ?? null)
    } catch {
      toast.error('Failed to load receipt')
    }
  }

  // Open Sales Return Modal
  async function openReturnModal(sale) {
    if (sale.is_legacy_import) {
      toast.error('Legacy imported sales cannot be returned. Only live sales are eligible for return processing.')
      return
    }
    setReturnSaleTarget(sale)
    setEligibilityLoading(true)
    setReturnReason('')
    setRefundMethod(sale.payment_method || 'CASH')
    setShowConfirmReturnModal(false)

    try {
      const res = await returnsService.getSaleEligibility(sale.id)
      const data = res.data?.data
      setEligibilityData(data)
      const items = (data?.items || []).map((it) => ({
        sale_item_id: it.sale_item_id,
        product_id: it.product_id,
        product_name: it.product_name,
        sku: it.product_sku,
        quantity_sold: it.quantity_sold,
        returned_quantity: it.returned_quantity,
        remaining_quantity: it.remaining_quantity,
        unit_price: Number(it.unit_price || 0),
        discount_amount: Number(it.discount_amount || 0),
        effective_price: Number(it.unit_price || 0),
        return_qty: 0,
        restock: true,
      }))
      setReturnItemsState(items)
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to check return eligibility')
      setReturnSaleTarget(null)
    } finally {
      setEligibilityLoading(false)
    }
  }

  function handleReturnQtyChange(saleItemId, val) {
    setReturnItemsState((prev) =>
      prev.map((it) => {
        if (it.sale_item_id !== saleItemId) return it
        const parsed = parseFloat(val) || 0
        const clamped = Math.max(0, Math.min(parsed, it.remaining_quantity))
        return { ...it, return_qty: clamped }
      })
    )
  }

  function handleRestockToggle(saleItemId, checked) {
    setReturnItemsState((prev) =>
      prev.map((it) => (it.sale_item_id === saleItemId ? { ...it, restock: checked } : it))
    )
  }

  // Calculated refund total
  const calculatedRefundTotal = returnItemsState.reduce((sum, it) => sum + it.return_qty * it.effective_price, 0)
  const totalItemsToReturn = returnItemsState.reduce((sum, it) => sum + it.return_qty, 0)

  async function handleSubmitReturn() {
    if (totalItemsToReturn <= 0) {
      toast.error('Please enter a return quantity greater than zero for at least one item')
      return
    }
    if (!returnReason.trim()) {
      toast.error('Please enter a reason for the return')
      return
    }

    const payloadItems = returnItemsState
      .filter((it) => it.return_qty > 0)
      .map((it) => ({
        sale_item_id: it.sale_item_id,
        quantity: it.return_qty,
        restock: it.restock,
      }))

    setIsSubmittingReturn(true)
    try {
      const res = await returnsService.createSalesReturn({
        sale_id: returnSaleTarget.id,
        items: payloadItems,
        reason: returnReason.trim(),
        refund_method: refundMethod,
        idempotency_key: `sr-${returnSaleTarget.id}-${Date.now()}`,
      })

      const returnNumber = res.data?.data?.return_number || 'SR'
      toast.success(`Sales return ${returnNumber} processed successfully!`)
      setReturnSaleTarget(null)
      setShowConfirmReturnModal(false)
      fetchSales()
      if (activeTab === 'RETURNS') fetchReturns()
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to process sales return')
    } finally {
      setIsSubmittingReturn(false)
    }
  }

  async function confirmRefund() {
    setRefunding(true)
    try {
      const res = await salesService.refund(refundTarget.id)
      if (res.status === 202) {
        toast.success('Refund requested. It will complete when Paystack confirms it.')
      } else {
        toast.success(`Sale ${refundTarget.transaction_id} refunded`)
      }
      setRefundTarget(null)
      fetchSales()
    } catch (err) {
      toast.error(err?.response?.data?.error?.message ?? 'Refund failed')
    } finally {
      setRefunding(false)
    }
  }

  // Sales Columns
  const salesColumns = [
    {
      key: 'transaction_id',
      label: 'Transaction',
      render: (v, row) => (
        <div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openReceipt(row)
            }}
            className="font-mono text-xs font-semibold text-primary-600 hover:text-primary-800 hover:underline"
            title="Click to view receipt"
          >
            {v}
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
      key: 'sale_date',
      label: 'Business Date',
      render: (v, row) => new Date(v || row.created_at).toLocaleDateString('en-GH'),
    },
    {
      key: 'warehouse',
      label: 'Warehouse',
      render: (v) => <span className="text-xs text-gray-700">{v?.name || 'Main Warehouse'}</span>,
    },
    { key: 'user', label: 'Cashier', render: (v) => v?.full_name ?? '—' },
    { key: 'customer', label: 'Customer', render: (v) => v?.name ?? <span className="text-gray-400">—</span> },
    { key: 'payment_method', label: 'Payment', render: (v) => PAYMENT_METHOD_LABELS[v] ?? v },
    { key: 'total_amount', label: 'Total', render: (v) => <span className="font-medium">{fmt(v)}</span> },
    {
      key: 'payment_status',
      label: 'Status',
      render: (_, row) => {
        const { label, variant } = saleStatus(row)
        return <Badge variant={variant}>{label}</Badge>
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => openReceipt(row)}>
            Receipt
          </Button>
          {!row.is_legacy_import && row.payment_status === 'COMPLETED' && (
            <Button size="sm" variant="secondary" onClick={() => openReturnModal(row)}>
              Return
            </Button>
          )}
          {canRefund(row) && !row.is_legacy_import && (
            <Button size="sm" variant="danger" onClick={() => setRefundTarget(row)}>
              Refund
            </Button>
          )}
        </div>
      ),
    },
  ]

  // Returns Columns
  const returnsColumns = [
    {
      key: 'return_number',
      label: 'Return #',
      render: (v, row) => (
        <button
          type="button"
          onClick={() => setSelectedReturnDetails(row)}
          className="font-mono text-xs font-semibold text-primary-600 hover:text-primary-800 hover:underline"
        >
          {v}
        </button>
      ),
    },
    {
      key: 'return_date',
      label: 'Date',
      render: (v, row) => new Date(v || row.created_at).toLocaleString('en-GH'),
    },
    {
      key: 'sale',
      label: 'Original Sale',
      render: (v) => <span className="font-mono text-xs text-gray-700">{v?.transaction_id || '—'}</span>,
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (v) => <span className="text-xs font-medium text-gray-900">{v?.name || 'Walk-in'}</span>,
    },
    {
      key: 'warehouse',
      label: 'Warehouse',
      render: (v) => <span className="text-xs text-gray-700">{v?.name || 'Main Warehouse'}</span>,
    },
    {
      key: 'total_refund_amount',
      label: 'Refund Amount',
      render: (v) => <span className="font-bold text-danger-600 font-mono">{fmt(v)}</span>,
    },
    {
      key: 'refund_status',
      label: 'Refund Status',
      render: (v) => <Badge variant={v === 'COMPLETED' ? 'success' : 'warning'}>{v || 'COMPLETED'}</Badge>,
    },
    {
      key: 'user',
      label: 'Handled By',
      render: (v) => <span className="text-xs text-gray-600">{v?.full_name || '—'}</span>,
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

  const isCashRefund = refundTarget?.payment_method === 'CASH'

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales & Customer Returns</h1>
            <p className="text-sm text-gray-500 mt-1">
              Audit past transactions, issue line-item sales returns, and restore inventory
            </p>
          </div>
        </div>

        <UnmatchedPayments />

        {/* Top Tab Bar: Sales Transactions vs Sales Returns */}
        <div className="flex gap-2 border-b border-gray-200 pb-2">
          <button
            onClick={() => {
              setActiveTab('SALES')
              setPage(1)
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 'SALES' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Sales Transactions
          </button>
          <button
            onClick={() => {
              setActiveTab('RETURNS')
              setReturnsPage(1)
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 'RETURNS' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Sales Returns History
          </button>
        </div>

        {/* Filter Controls */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end justify-between">
            <div className="flex-1 max-w-md">
              <Input
                label="Search"
                placeholder={
                  activeTab === 'SALES'
                    ? 'Search by Transaction ID, Customer, or Cashier…'
                    : 'Search by Return # or Original Sale…'
                }
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  if (activeTab === 'SALES') setPage(1)
                  else setReturnsPage(1)
                }}
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Warehouse</label>
                <select
                  value={selectedWarehouse}
                  onChange={changeFilter(setSelectedWarehouse)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">All Warehouses</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </option>
                  ))}
                </select>
              </div>

              <Input label="From" type="date" value={startDate} onChange={changeFilter(setStartDate)} />
              <Input label="To" type="date" value={endDate} onChange={changeFilter(setEndDate)} />
              {(startDate || endDate || search || selectedWarehouse) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStartDate('')
                    setEndDate('')
                    setSearch('')
                    setSelectedWarehouse('')
                    setPage(1)
                    setReturnsPage(1)
                    setSearchParams({}, { replace: true })
                  }}
                >
                  Reset filters
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Table */}
        {activeTab === 'SALES' ? (
          <>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <Table
                columns={salesColumns}
                data={sales}
                isLoading={loading}
                emptyMessage="No sales found."
                onRowClick={(row) => openReceipt(row)}
              />
            </div>
            <Pagination page={meta.page} total_pages={meta.total_pages} onPageChange={setPage} />
          </>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <Table
                columns={returnsColumns}
                data={returnsList}
                isLoading={returnsLoading}
                emptyMessage="No sales returns found."
                onRowClick={(row) => setSelectedReturnDetails(row)}
              />
            </div>
            <Pagination page={returnsMeta.page} total_pages={returnsMeta.total_pages} onPageChange={setReturnsPage} />
          </>
        )}
      </div>

      {/* Sale Receipt Modal */}
      <Modal isOpen={!!receiptSale} onClose={() => setReceiptSale(null)} title="Receipt" size="sm">
        <Receipt sale={receiptSale} onClose={() => setReceiptSale(null)} />
      </Modal>

      {/* Process Sales Return Modal */}
      <Modal
        isOpen={!!returnSaleTarget}
        onClose={() => {
          if (!isSubmittingReturn) {
            setReturnSaleTarget(null)
            setShowConfirmReturnModal(false)
          }
        }}
        title={`Process Customer Return: ${returnSaleTarget?.transaction_id || ''}`}
        size="lg"
      >
        {eligibilityLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Checking sale return eligibility…</div>
        ) : returnSaleTarget && (
          <div className="space-y-4">
            {/* Sale summary box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg border text-xs">
              <div>
                <span className="text-gray-500">Customer:</span>
                <p className="font-semibold text-gray-900">{returnSaleTarget.customer?.name || 'Walk-in'}</p>
              </div>
              <div>
                <span className="text-gray-500">Sale Date:</span>
                <p className="font-semibold text-gray-900">
                  {new Date(returnSaleTarget.sale_date || returnSaleTarget.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Warehouse:</span>
                <p className="font-semibold text-gray-900">{returnSaleTarget.warehouse?.name || 'Main Warehouse'}</p>
              </div>
              <div>
                <span className="text-gray-500">Sale Total:</span>
                <p className="font-semibold text-gray-900">{fmt(returnSaleTarget.total_amount)}</p>
              </div>
            </div>

            {/* Line items return table */}
            <div>
              <p className="text-xs font-bold uppercase text-gray-600 mb-2">Select Items & Quantities to Return</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Sold</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Prev. Ret.</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Eligible</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">Return Qty</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Restock Stock?</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Refund</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {returnItemsState.map((it) => {
                      const lineRefund = it.return_qty * it.effective_price
                      return (
                        <tr key={it.sale_item_id} className={it.return_qty > 0 ? 'bg-primary-50/30' : ''}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900">{it.product_name}</p>
                            <p className="text-2xs font-mono text-gray-400">{it.sku}</p>
                          </td>
                          <td className="px-2 py-2 text-center font-mono">{it.quantity_sold}</td>
                          <td className="px-2 py-2 text-center font-mono text-gray-500">{it.returned_quantity}</td>
                          <td className="px-2 py-2 text-center font-mono font-bold text-gray-800">
                            {it.remaining_quantity}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              max={it.remaining_quantity}
                              step="any"
                              value={it.return_qty || ''}
                              onChange={(e) => handleReturnQtyChange(it.sale_item_id, e.target.value)}
                              disabled={it.remaining_quantity <= 0}
                              placeholder="0"
                              className="w-full px-2 py-1 text-center font-mono font-bold border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={it.restock}
                                onChange={(e) => handleRestockToggle(it.sale_item_id, e.target.checked)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-2xs text-gray-600 font-medium">
                                {it.restock ? 'Restock' : 'Damaged / No Restock'}
                              </span>
                            </label>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">
                            {fmt(lineRefund)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Return Settings: Reason & Refund Method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Return Reason *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Customer changed mind, wrong size, defective..."
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Refund Resolution *</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="CASH">Cash Refund</option>
                  <option value="CARD">Original Payment (Card)</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="STORE_CREDIT">Store Credit</option>
                </select>
              </div>
            </div>

            {/* Refund Total Summary Banner */}
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 flex justify-between items-center text-sm">
              <div>
                <p className="text-xs text-primary-800 font-medium">Total Items to Return: {totalItemsToReturn}</p>
                <p className="text-2xs text-primary-600">Restocked items will atomically update Product.quantity</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-primary-800">Total Calculated Refund:</span>
                <p className="text-lg font-bold font-mono text-primary-900">{fmt(calculatedRefundTotal)}</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setReturnSaleTarget(null)}
                disabled={isSubmittingReturn}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => setShowConfirmReturnModal(true)}
                disabled={totalItemsToReturn <= 0 || !returnReason.trim()}
              >
                Review & Confirm Return
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation Step Dialog for Sales Return */}
      <Modal
        isOpen={showConfirmReturnModal}
        onClose={() => setShowConfirmReturnModal(false)}
        title="Confirm Return Submission"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Are you sure you want to process this return for transaction{' '}
            <span className="font-mono font-bold">{returnSaleTarget?.transaction_id}</span>?
          </p>
          <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-1">
            <p>
              <span className="text-gray-500">Refund Amount:</span>{' '}
              <span className="font-bold text-danger-700">{fmt(calculatedRefundTotal)}</span>
            </p>
            <p>
              <span className="text-gray-500">Refund Method:</span>{' '}
              <span className="font-semibold text-gray-800">{refundMethod}</span>
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
              onClick={handleSubmitReturn}
              isLoading={isSubmittingReturn}
            >
              Confirm & Commit Return
            </Button>
          </div>
        </div>
      </Modal>

      {/* Sales Return Details Modal */}
      <Modal
        isOpen={!!selectedReturnDetails}
        onClose={() => setSelectedReturnDetails(null)}
        title={`Sales Return: ${selectedReturnDetails?.return_number || ''}`}
        size="md"
      >
        {selectedReturnDetails && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-lg border">
              <div>
                <span className="text-gray-500">Original Sale:</span>
                <p className="font-mono font-bold text-gray-900">{selectedReturnDetails.sale?.transaction_id || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Return Date:</span>
                <p className="font-medium text-gray-900">
                  {new Date(selectedReturnDetails.return_date || selectedReturnDetails.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Customer:</span>
                <p className="font-medium text-gray-900">{selectedReturnDetails.customer?.name || 'Walk-in'}</p>
              </div>
              <div>
                <span className="text-gray-500">Processed By:</span>
                <p className="font-medium text-gray-900">{selectedReturnDetails.user?.full_name || 'Staff'}</p>
              </div>
              <div>
                <span className="text-gray-500">Refund Method:</span>
                <p className="font-medium text-gray-900">{selectedReturnDetails.refund_method}</p>
              </div>
              <div>
                <span className="text-gray-500">Refund Amount:</span>
                <p className="font-bold text-danger-700 font-mono text-sm">{fmt(selectedReturnDetails.total_refund_amount)}</p>
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Reason for Return:</p>
              <p className="p-2 bg-gray-50 rounded border text-gray-800 italic">
                {selectedReturnDetails.reason || 'No reason specified'}
              </p>
            </div>

            {/* Items returned */}
            <div>
              <p className="font-semibold text-gray-700 mb-1">Returned Items:</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">Product</th>
                      <th className="px-2 py-1.5 text-center font-medium text-gray-600">Qty</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-600">Unit Price</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-600">Refund</th>
                      <th className="px-2 py-1.5 text-center font-medium text-gray-600">Disposition</th>
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
                        <td className="px-2 py-1.5 text-right font-mono">{fmt(it.unit_price)}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-gray-900">{fmt(it.total_refund)}</td>
                        <td className="px-2 py-1.5 text-center">
                          {it.restocked ? (
                            <Badge variant="success">Restocked</Badge>
                          ) : (
                            <Badge variant="default">Damaged / Discarded</Badge>
                          )}
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

      {/* Sale Refund Modal (Whole Payment Gateway / Cash Refund) */}
      <Modal isOpen={!!refundTarget} onClose={() => setRefundTarget(null)} title="Refund sale" size="sm">
        {refundTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Refund <span className="font-mono font-medium">{refundTarget.transaction_id}</span> for{' '}
              <span className="font-semibold">{fmt(refundTarget.total_amount)}</span>?
            </p>
            <p className="text-sm text-gray-500">
              {isCashRefund
                ? 'Give the customer the amount in cash. Stock is restored and any loyalty points earned are reversed straight away.'
                : 'Paystack will return the amount to the customer. The sale shows as "Refund pending" until Paystack confirms it, then stock and loyalty points are updated.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRefundTarget(null)} disabled={refunding}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmRefund} isLoading={refunding}>
                Refund {fmt(refundTarget.total_amount)}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}
