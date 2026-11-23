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

  // Receipt Modal
  const [receiptSale, setReceiptSale] = useState(null)

  // Refund Target Modal
  const [refundTarget, setRefundTarget] = useState(null)
  const [refunding, setRefunding] = useState(false)

  // Return creation modal state
  const [returnSaleTarget, setReturnSaleTarget] = useState(null)
  const [, setEligibilityData] = useState(null)
  const [eligibilityLoading, setEligibilityLoading] = useState(false)
  const [returnItemsState, setReturnItemsState] = useState([])
  const [returnReason, setReturnReason] = useState('')
  const [refundMethod, setRefundMethod] = useState('CASH')
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false)
  const [showConfirmReturnModal, setShowConfirmReturnModal] = useState(false)

  // 1. Sale Details Modal (Eye icon)
  const [detailsSale, setDetailsSale] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // 2. Payments History Modal (Receipt icon)
  const [paymentsSale, setPaymentsSale] = useState(null)
  const [paymentsList, setPaymentsList] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [voidTargetPayment, setVoidTargetPayment] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [isVoiding, setIsVoiding] = useState(false)

  // 3. Edit Sale Modal (Pencil icon)
  const [editSaleTarget, setEditSaleTarget] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [editDiscount, setEditDiscount] = useState('0')
  const [editNotes, setEditNotes] = useState('')
  const [isUpdatingSale, setIsUpdatingSale] = useState(false)

  // 4. Cancel/Delete Sale Modal (Trash icon)
  const [deleteSaleTarget, setDeleteSaleTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancellingSale, setIsCancellingSale] = useState(false)

  // Load warehouses
  useEffect(() => {
    async function loadWarehouses() {
      try {
        const res = await warehouseService.list()
        setWarehouses(res.data?.data || [])
      } catch {
        // Silently handle
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

  // Fetch returns
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

  // Quick receipt modal
  async function openReceipt(sale) {
    try {
      const res = await salesService.get(sale.id)
      setReceiptSale(res.data?.data ?? null)
    } catch {
      toast.error('Failed to load receipt')
    }
  }

  // 1. Open Sale Details Modal
  async function handleOpenSaleDetails(sale) {
    setLoadingDetails(true)
    try {
      const res = await salesService.get(sale.id)
      setDetailsSale(res.data?.data || sale)
    } catch {
      toast.error('Failed to load sale details')
    } finally {
      setLoadingDetails(false)
    }
  }

  // 2. Open Payments Modal
  async function handleOpenPaymentsModal(sale) {
    setPaymentsSale(sale)
    setLoadingPayments(true)
    try {
      const res = await salesService.payments(sale.id)
      setPaymentsList(res.data?.data || [])
    } catch {
      toast.error('Failed to load payment history')
    } finally {
      setLoadingPayments(false)
    }
  }

  // Void payment
  async function handleVoidPayment(e) {
    e.preventDefault()
    if (!voidTargetPayment || !paymentsSale) return
    const reason = voidReason.trim()
    if (!reason) {
      toast.error('Void reason is required')
      return
    }

    setIsVoiding(true)
    try {
      await salesService.voidPayment(paymentsSale.id, voidTargetPayment.id, { reason })
      toast.success('Payment voided successfully')
      setVoidTargetPayment(null)
      setVoidReason('')
      // Refresh payments list & sales table
      const res = await salesService.payments(paymentsSale.id)
      setPaymentsList(res.data?.data || [])
      fetchSales()
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to void payment')
    } finally {
      setIsVoiding(false)
    }
  }

  // 3. Download Invoice PDF
  async function handleDownloadInvoicePdf(sale, format = 'a4') {
    try {
      toast.loading(`Generating ${format.toUpperCase()} Invoice PDF...`, { id: 'sale-pdf' })
      const res = await salesService.downloadPdf(sale.id, format)
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Invoice-${sale.transaction_id || sale.id}-${format.toUpperCase()}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('Invoice downloaded successfully', { id: 'sale-pdf' })
    } catch {
      toast.error('Failed to download invoice PDF', { id: 'sale-pdf' })
    }
  }

  // 4. Open Edit Sale Modal
  async function handleOpenEditSale(sale) {
    if (sale.is_cancelled) {
      toast.error('Cancelled sales cannot be edited')
      return
    }
    if (sale.is_legacy_import) {
      toast.error('Legacy imported sales cannot be edited')
      return
    }

    try {
      const res = await salesService.get(sale.id)
      const fullSale = res.data?.data || sale
      setEditSaleTarget(fullSale)
      setEditDiscount(String(fullSale.discount_amount || 0))
      setEditNotes(fullSale.notes || '')
      setEditItems(
        (fullSale.items || []).map((it) => {
          const retQty = parseFloat(it.returned_quantity || 0)
          const curQty = parseFloat(it.quantity || 0)
          return {
            sale_item_id: it.id,
            product_name: it.product?.name || 'Product',
            sku: it.product?.sku || '',
            unit_price: parseFloat(it.unit_price || 0),
            discount_amount: parseFloat(it.discount_amount || 0),
            returned_quantity: retQty,
            original_quantity: curQty,
            quantity: curQty,
          }
        })
      )
    } catch {
      toast.error('Failed to load sale for editing')
    }
  }

  function handleEditItemQtyChange(saleItemId, val) {
    const parsed = parseFloat(val) || 0
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.sale_item_id !== saleItemId) return it
        const minQty = it.returned_quantity
        return {
          ...it,
          quantity: Math.max(minQty, parsed),
        }
      })
    )
  }

  // Dynamic calculations for Edit Sale modal
  const editSubtotal = editItems.reduce((acc, it) => acc + it.quantity * it.unit_price, 0)
  const editLineDiscounts = editItems.reduce((acc, it) => acc + (it.discount_amount || 0), 0)
  const editOrderDiscount = parseFloat(editDiscount) || 0
  const editTotalDiscounts = editLineDiscounts + editOrderDiscount
  const editTaxAmount = parseFloat(editSaleTarget?.tax_amount || 0)
  const editNewGrandTotal = Math.max(0, editSubtotal - editTotalDiscounts + editTaxAmount)

  async function handleSaveSaleEdit(e) {
    e.preventDefault()
    if (!editSaleTarget) return

    for (const it of editItems) {
      if (it.quantity < it.returned_quantity) {
        toast.error(`Quantity for ${it.product_name} cannot be lower than returned quantity (${it.returned_quantity})`)
        return
      }
    }

    setIsUpdatingSale(true)
    try {
      await salesService.update(editSaleTarget.id, {
        discount_amount: editOrderDiscount,
        notes: editNotes.trim(),
        items: editItems.map((it) => ({
          sale_item_id: it.sale_item_id,
          quantity: it.quantity,
          discount_amount: it.discount_amount,
        })),
      })
      toast.success('Sale updated successfully')
      setEditSaleTarget(null)
      fetchSales()
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to update sale')
    } finally {
      setIsUpdatingSale(false)
    }
  }

  // 5. Open Delete/Cancel Sale Modal
  function handleOpenCancelSale(sale) {
    if (sale.is_cancelled) {
      toast.error('Sale is already cancelled')
      return
    }
    setDeleteSaleTarget(sale)
    setCancelReason('')
  }

  async function handleConfirmCancelSale(e) {
    e.preventDefault()
    if (!deleteSaleTarget) return
    const reason = cancelReason.trim()
    if (!reason) {
      toast.error('Cancellation reason is required')
      return
    }

    setIsCancellingSale(true)
    try {
      await salesService.delete(deleteSaleTarget.id, { reason })
      toast.success(`Sale ${deleteSaleTarget.transaction_id} cancelled and stock restored`)
      setDeleteSaleTarget(null)
      fetchSales()
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to cancel sale')
    } finally {
      setIsCancellingSale(false)
    }
  }

  // Sales Return modal opening
  async function openReturnModal(sale) {
    if (sale.is_legacy_import) {
      toast.error('Legacy imported sales cannot be returned.')
      return
    }
    if (sale.is_cancelled) {
      toast.error('Cancelled sales cannot be returned.')
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
      const items = (data?.items || []).map((it) => {
        const sold = parseFloat(it.quantity_sold ?? it.sold_quantity ?? 0)
        const returned = parseFloat(it.returned_quantity ?? it.already_returned ?? 0)
        const remaining = parseFloat(it.remaining_quantity ?? it.remaining_eligible ?? (sold - returned))
        return {
          sale_item_id: it.sale_item_id,
          product_id: it.product_id,
          product_name: it.product_name,
          sku: it.product_sku,
          quantity_sold: sold,
          returned_quantity: returned,
          remaining_quantity: remaining,
          unit_price: Number(it.unit_price || 0),
          discount_amount: Number(it.discount_amount || 0),
          effective_price: Number(it.net_unit_price ?? it.unit_price ?? 0),
          return_qty: 0,
          restock: true,
        }
      })
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

  // Sales Columns with 5 standard row actions (Eye, Receipt, PDF, Pencil, Trash) + Return & Refund
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
              handleOpenSaleDetails(row)
            }}
            className="font-mono text-xs font-semibold text-primary-600 hover:text-primary-800 hover:underline"
            title="Click to view full sale details"
          >
            {v}
          </button>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {row.is_legacy_import && (
              <span className="inline-block px-1.5 py-0.5 text-3xs font-bold uppercase rounded bg-amber-100 text-amber-800 border border-amber-200">
                Legacy Import
              </span>
            )}
            {row.is_cancelled && (
              <span className="inline-block px-1.5 py-0.5 text-3xs font-bold uppercase rounded bg-danger-100 text-danger-800 border border-danger-200">
                Cancelled
              </span>
            )}
          </div>
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
        if (row.is_cancelled) {
          return <Badge variant="danger">CANCELLED</Badge>
        }
        const { label, variant } = saleStatus(row)
        return <Badge variant={variant}>{label}</Badge>
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Action 1: Eye - View Sale Details */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleOpenSaleDetails(row)}
            title="View Sale Details"
            className="p-1.5 text-gray-600 hover:text-gray-900"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="sr-only">Details</span>
          </Button>

          {/* Action 2: Receipt - View Payments */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleOpenPaymentsModal(row)}
            title="View Payments & History"
            className="p-1.5 text-gray-600 hover:text-gray-900"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
            </svg>
            <span className="sr-only">Payments</span>
          </Button>

          {/* Action 3: PDF - Download Invoice */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDownloadInvoicePdf(row, 'a4')}
            title="Download Invoice PDF (A4)"
            className="p-1.5 text-gray-600 hover:text-gray-900"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="sr-only">PDF</span>
          </Button>

          {/* Action 4: Pencil - Edit Sale */}
          {!row.is_cancelled && !row.is_legacy_import && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleOpenEditSale(row)}
              title="Edit Sale Items & Discounts"
              className="p-1.5 text-gray-600 hover:text-gray-900"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="sr-only">Edit</span>
            </Button>
          )}

          {/* Action 5: Trash - Delete / Cancel Sale */}
          {!row.is_cancelled && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleOpenCancelSale(row)}
              title="Cancel / Delete Sale"
              className="p-1.5 text-danger-600 hover:text-danger-700 hover:bg-danger-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="sr-only">Delete</span>
            </Button>
          )}

          {/* Return & Refund operations */}
          {!row.is_legacy_import && !row.is_cancelled && row.payment_status === 'COMPLETED' && (
            <Button size="sm" variant="secondary" onClick={() => openReturnModal(row)} title="Process Return">
              Return
            </Button>
          )}
          {canRefund(row) && !row.is_legacy_import && !row.is_cancelled && (
            <Button size="sm" variant="danger" onClick={() => setRefundTarget(row)} title="Gateway Refund">
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
      key: 'refund_amount',
      label: 'Refund Amount',
      render: (_, row) => {
        const amt = row.refund_amount ?? row.total_refund_amount ?? 0
        return <span className="font-bold text-danger-600 font-mono">{fmt(amt)}</span>
      },
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
              Audit past transactions, issue line-item sales returns, download invoices, and manage payment allocations.
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
                onRowClick={(row) => handleOpenSaleDetails(row)}
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

      {/* 1. VIEW SALE DETAILS MODAL */}
      <Modal
        isOpen={!!detailsSale}
        onClose={() => setDetailsSale(null)}
        title={`Sale Details: ${detailsSale?.transaction_id || ''}`}
        size="lg"
      >
        {loadingDetails ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading invoice details…</div>
        ) : detailsSale && (
          <div className="space-y-5 text-xs max-h-[80vh] overflow-y-auto pr-1">
            {/* Header info bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div>
                <span className="text-gray-500">Transaction ID:</span>
                <p className="font-mono font-bold text-gray-900">{detailsSale.transaction_id}</p>
              </div>
              <div>
                <span className="text-gray-500">Sale Date:</span>
                <p className="font-semibold text-gray-900">
                  {new Date(detailsSale.sale_date || detailsSale.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Customer:</span>
                <p className="font-semibold text-gray-900">{detailsSale.customer?.name || 'Walk-in'}</p>
                {detailsSale.customer?.phone && (
                  <p className="text-3xs text-gray-500">{detailsSale.customer.phone}</p>
                )}
              </div>
              <div>
                <span className="text-gray-500">Cashier:</span>
                <p className="font-semibold text-gray-900">{detailsSale.user?.full_name || 'Staff'}</p>
              </div>
              <div>
                <span className="text-gray-500">Warehouse:</span>
                <p className="font-semibold text-gray-900">{detailsSale.warehouse?.name || 'Main Warehouse'}</p>
              </div>
              <div>
                <span className="text-gray-500">Payment Method:</span>
                <p className="font-semibold text-gray-900">{PAYMENT_METHOD_LABELS[detailsSale.payment_method] || detailsSale.payment_method}</p>
              </div>
              <div>
                <span className="text-gray-500">Payment Status:</span>
                <div>
                  {detailsSale.is_cancelled ? (
                    <Badge variant="danger">CANCELLED</Badge>
                  ) : (
                    <Badge variant={saleStatus(detailsSale).variant}>{saleStatus(detailsSale).label}</Badge>
                  )}
                </div>
              </div>
              {detailsSale.is_cancelled && (
                <div>
                  <span className="text-gray-500">Cancellation Reason:</span>
                  <p className="text-danger-700 italic">{detailsSale.cancellation_reason || 'Cancelled'}</p>
                </div>
              )}
            </div>

            {/* Order Items Table */}
            <div>
              <h3 className="font-semibold text-gray-800 text-sm mb-2">Order Items</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Qty</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-600">Unit Price</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-600">Discount</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-600">Net Price</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {(detailsSale.items || []).map((it) => {
                      const qty = parseFloat(it.quantity || 0)
                      const unitP = parseFloat(it.unit_price || 0)
                      const disc = parseFloat(it.discount_amount || 0)
                      const netP = parseFloat(it.net_unit_price ?? (unitP - (qty > 0 ? disc / qty : 0)))
                      const sub = parseFloat(it.subtotal || qty * netP)
                      const ret = parseFloat(it.returned_quantity || 0)
                      return (
                        <tr key={it.id}>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-gray-900">{it.product?.name || 'Product'}</p>
                            <p className="text-2xs font-mono text-gray-400">{it.product?.sku}</p>
                            {ret > 0 && (
                              <span className="text-3xs text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 font-medium">
                                {ret} returned
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-bold text-gray-800">{qty}</td>
                          <td className="px-2 py-2 text-right font-mono text-gray-600">{fmt(unitP)}</td>
                          <td className="px-2 py-2 text-right font-mono text-gray-600">{fmt(disc)}</td>
                          <td className="px-2 py-2 text-right font-mono text-gray-700">{fmt(netP)}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">{fmt(sub)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary & Payment Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Payment transactions snapshot */}
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                <h4 className="font-semibold text-gray-800 text-xs mb-2">Payment Records</h4>
                {detailsSale.payments && detailsSale.payments.length > 0 ? (
                  <div className="space-y-1.5">
                    {detailsSale.payments.map((p) => (
                      <div
                        key={p.id}
                        className={`p-2 rounded border text-2xs flex justify-between items-center ${
                          p.is_void ? 'bg-danger-50/50 border-danger-200 text-danger-700' : 'bg-white border-gray-200 text-gray-800'
                        }`}
                      >
                        <div>
                          <p className="font-semibold">
                            {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                            {p.reference && <span className="font-mono text-gray-500 font-normal ml-1">({p.reference})</span>}
                          </p>
                          <p className="text-gray-400">{new Date(p.created_at).toLocaleTimeString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold">{fmt(p.amount)}</p>
                          {p.is_void ? (
                            <Badge variant="danger">VOID</Badge>
                          ) : (
                            <span className="text-success-700 font-medium">COMPLETED</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 italic">No direct payment records found.</p>
                )}
              </div>

              {/* Financial Totals */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal:</span>
                  <span className="font-mono">{fmt(detailsSale.subtotal_amount || detailsSale.total_amount)}</span>
                </div>
                {parseFloat(detailsSale.discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-success-700">
                    <span>Discount:</span>
                    <span className="font-mono">-{fmt(detailsSale.discount_amount)}</span>
                  </div>
                )}
                {parseFloat(detailsSale.tax_amount || 0) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Tax:</span>
                    <span className="font-mono">+{fmt(detailsSale.tax_amount)}</span>
                  </div>
                )}
                <div className="border-t border-gray-300 pt-1.5 flex justify-between font-bold text-gray-900 text-sm">
                  <span>Grand Total:</span>
                  <span className="font-mono">{fmt(detailsSale.total_amount)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Amount Paid:</span>
                  <span className="font-mono font-semibold text-success-800">{fmt(detailsSale.amount_paid ?? detailsSale.total_amount)}</span>
                </div>
                {parseFloat(detailsSale.balance_due || 0) > 0 && (
                  <div className="flex justify-between text-danger-700 font-semibold">
                    <span>Balance Due:</span>
                    <span className="font-mono">{fmt(detailsSale.balance_due)}</span>
                  </div>
                )}
                {parseFloat(detailsSale.change_amount || 0) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Change Given:</span>
                    <span className="font-mono">{fmt(detailsSale.change_amount)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-200">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownloadInvoicePdf(detailsSale, 'a4')}
                  className="flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  A4 Invoice PDF
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownloadInvoicePdf(detailsSale, 'a5')}
                  className="flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  A5 Invoice PDF
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openReceipt(detailsSale)}
                  className="flex items-center gap-1.5"
                >
                  Thermal Receipt
                </Button>
              </div>
              <Button variant="secondary" onClick={() => setDetailsSale(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2. VIEW PAYMENTS & VOID MODAL */}
      <Modal
        isOpen={!!paymentsSale}
        onClose={() => {
          if (!isVoiding) {
            setPaymentsSale(null)
            setVoidTargetPayment(null)
          }
        }}
        title={`Payment History: ${paymentsSale?.transaction_id || ''}`}
        size="lg"
      >
        {loadingPayments ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading payment allocations…</div>
        ) : paymentsSale && (
          <div className="space-y-4 text-xs">
            {/* Summary card */}
            <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg border text-center">
              <div>
                <span className="text-gray-500">Total Invoice Amount</span>
                <p className="text-base font-bold text-gray-900 font-mono">{fmt(paymentsSale.total_amount)}</p>
              </div>
              <div>
                <span className="text-gray-500">Total Paid</span>
                <p className="text-base font-bold text-success-700 font-mono">
                  {fmt(paymentsSale.amount_paid ?? paymentsSale.total_amount)}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Balance Due</span>
                <p className="text-base font-bold text-danger-700 font-mono">
                  {fmt(paymentsSale.balance_due ?? 0)}
                </p>
              </div>
            </div>

            {/* Payment history list */}
            <div>
              <h4 className="font-semibold text-gray-800 text-xs mb-2">Recorded Payments</h4>
              {paymentsList.length === 0 ? (
                <div className="p-6 text-center text-gray-500 border rounded-lg">No payment entries found.</div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Date & Time</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-600">Type</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-600">Method</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-600">Reference</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-600">Status</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {paymentsList.map((p) => (
                        <tr key={p.id} className={p.is_void ? 'bg-danger-50/30' : ''}>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                            {new Date(p.created_at || p.payment_date).toLocaleString('en-GH')}
                          </td>
                          <td className="px-2 py-2">
                            <span className="font-medium text-gray-800">
                              {p.type === 'CUSTOMER_ALLOCATION' ? 'Credit Allocation' : 'Checkout Payment'}
                            </span>
                          </td>
                          <td className="px-2 py-2 font-medium text-gray-700">
                            {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                          </td>
                          <td className="px-2 py-2 font-mono text-gray-500 text-2xs">{p.reference || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">
                            {fmt(p.amount)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {p.is_void ? (
                              <Badge variant="danger">VOID</Badge>
                            ) : (
                              <Badge variant="success">COMPLETED</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {!p.is_void && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => {
                                  setVoidTargetPayment(p)
                                  setVoidReason('')
                                }}
                                className="text-xs px-2 py-1"
                              >
                                Void
                              </Button>
                            )}
                            {p.is_void && (
                              <span className="text-3xs text-danger-700 italic block" title={p.void_reason}>
                                {p.void_reason || 'Voided'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Void confirmation form when a payment is selected */}
            {voidTargetPayment && (
              <form onSubmit={handleVoidPayment} className="p-3 bg-danger-50 border border-danger-200 rounded-lg space-y-3">
                <div>
                  <h5 className="font-bold text-danger-900 text-xs">
                    Confirm Voiding Payment of {fmt(voidTargetPayment.amount)}
                  </h5>
                  <p className="text-2xs text-danger-700 mt-0.5">
                    Voiding will subtract {fmt(voidTargetPayment.amount)} from Amount Paid and restore the Balance Due on this sale. Product inventory will not be modified.
                  </p>
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-danger-900 mb-1">Reason for Void *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Accidental duplicate charge, customer check bounced..."
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-danger-300 rounded focus:ring-1 focus:ring-danger-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setVoidTargetPayment(null)}
                    disabled={isVoiding}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="danger"
                    isLoading={isVoiding}
                    disabled={!voidReason.trim()}
                  >
                    Confirm Void
                  </Button>
                </div>
              </form>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setPaymentsSale(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 3. EDIT SALE MODAL (Pencil icon) */}
      <Modal
        isOpen={!!editSaleTarget}
        onClose={() => {
          if (!isUpdatingSale) setEditSaleTarget(null)
        }}
        title={`Edit Sale: ${editSaleTarget?.transaction_id || ''}`}
        size="lg"
      >
        {editSaleTarget && (
          <form onSubmit={handleSaveSaleEdit} className="space-y-4 text-xs max-h-[80vh] overflow-y-auto pr-1">
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-2xs">
              <span className="font-bold">Inventory & Price Notice:</span> Adjusting quantities here will calculate net stock diffs and automatically adjust warehouse stock with audit logs. Quantities cannot be reduced below already returned quantities.
            </div>

            {/* Editable items table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600">Unit Price</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">Quantity</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600">Disc</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {editItems.map((it) => {
                    const lineSub = it.quantity * it.unit_price - (it.discount_amount || 0)
                    return (
                      <tr key={it.sale_item_id}>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-gray-900">{it.product_name}</p>
                          <p className="text-2xs font-mono text-gray-400">{it.sku}</p>
                          {it.returned_quantity > 0 && (
                            <span className="text-3xs text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 font-medium">
                              Min allowed: {it.returned_quantity} (returned)
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-gray-600">{fmt(it.unit_price)}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={it.returned_quantity}
                            step="any"
                            value={it.quantity}
                            onChange={(e) => handleEditItemQtyChange(it.sale_item_id, e.target.value)}
                            className="w-full px-2 py-1 text-center font-mono font-bold border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-gray-500">
                          {fmt(it.discount_amount || 0)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">
                          {fmt(lineSub)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Discount and Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Order Discount Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editDiscount}
                  onChange={(e) => setEditDiscount(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Notes</label>
                <input
                  type="text"
                  placeholder="Special instructions or edit notes..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Live totals preview banner */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span className="font-mono">{fmt(editSubtotal)}</span>
              </div>
              {editTotalDiscounts > 0 && (
                <div className="flex justify-between text-success-700">
                  <span>Total Discounts:</span>
                  <span className="font-mono">-{fmt(editTotalDiscounts)}</span>
                </div>
              )}
              {editTaxAmount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tax:</span>
                  <span className="font-mono">+{fmt(editTaxAmount)}</span>
                </div>
              )}
              <div className="border-t border-gray-300 pt-1 flex justify-between font-bold text-gray-900 text-sm">
                <span>New Grand Total:</span>
                <span className="font-mono text-primary-700">{fmt(editNewGrandTotal)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditSaleTarget(null)}
                disabled={isUpdatingSale}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isUpdatingSale}
              >
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* 4. CANCEL / DELETE SALE MODAL (Trash icon) */}
      <Modal
        isOpen={!!deleteSaleTarget}
        onClose={() => {
          if (!isCancellingSale) setDeleteSaleTarget(null)
        }}
        title={`Cancel Sale: ${deleteSaleTarget?.transaction_id || ''}`}
        size="md"
      >
        {deleteSaleTarget && (
          <form onSubmit={handleConfirmCancelSale} className="space-y-4 text-xs">
            <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg text-danger-900 space-y-2">
              <p className="font-bold text-sm">
                Are you sure you want to cancel transaction {deleteSaleTarget.transaction_id}?
              </p>
              <p className="text-2xs text-danger-700">
                • Unreturned inventory will be returned to the warehouse ({deleteSaleTarget.warehouse?.name || 'Main Warehouse'}).
                <br />• Any loyalty points awarded for this transaction will be reversed.
                <br />• If payment was on customer credit, the customer balance will be adjusted accordingly.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Reason for Cancellation *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Customer cancelled order before dispatch, test entry..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-danger-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteSaleTarget(null)}
                disabled={isCancellingSale}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="danger"
                isLoading={isCancellingSale}
                disabled={!cancelReason.trim()}
              >
                Confirm Cancellation
              </Button>
            </div>
          </form>
        )}
      </Modal>

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
                <p className="font-bold text-danger-700 font-mono text-sm">
                  {fmt(selectedReturnDetails.refund_amount ?? selectedReturnDetails.total_refund_amount ?? 0)}
                </p>
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
