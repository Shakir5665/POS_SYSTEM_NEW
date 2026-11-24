import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { PageHeader } from '../components/PageHeader'
import { GlassCard } from '../components/GlassCard'
import { returnsService } from '../services/returns'
import { warehouseService } from '../services/warehouses'
import { useSettings } from '../hooks/useSettings'
import { formatCurrency } from '../utils/formatCurrency'

export default function SalesReturnsPage() {
  const navigate = useNavigate()
  const settings = useSettings()
  const fmt = (v) => formatCurrency(v, settings.currency_symbol || 'LKR')

  const [returnsList, setReturnsList] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [warehouses, setWarehouses] = useState([])

  // Modal states
  const [selectedReturn, setSelectedReturn] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)

  // Load warehouses
  useEffect(() => {
    warehouseService.list()
      .then((res) => setWarehouses(res.data?.data || []))
      .catch(() => {})
  }, [])

  const fetchReturns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await returnsService.listSalesReturns({
        page,
        per_page: 20,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        search: search.trim() || undefined,
        warehouse_id: selectedWarehouse || undefined,
      })
      setReturnsList(res.data?.data || [])
      setMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
    } catch {
      toast.error('Failed to load sales returns')
    } finally {
      setLoading(false)
    }
  }, [page, startDate, endDate, search, selectedWarehouse])

  useEffect(() => {
    fetchReturns()
  }, [fetchReturns])

  async function handleDownloadCreditNote(sr) {
    try {
      toast.loading('Generating Credit Note PDF...', { id: 'pdf-toast' })
      const res = await returnsService.downloadPdf(sr.id, 'a4')
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Credit-Note-${sr.return_number || sr.id}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('Credit note downloaded successfully', { id: 'pdf-toast' })
    } catch {
      toast.error('Failed to download credit note PDF', { id: 'pdf-toast' })
    }
  }

  async function handleCancelReturn(e) {
    e.preventDefault()
    if (!deleteTarget) return
    const reason = cancelReason.trim()
    if (!reason) {
      toast.error('Cancellation reason is required')
      return
    }

    setIsCancelling(true)
    try {
      await returnsService.deleteSalesReturn(deleteTarget.id, { reason })
      toast.success(`Sales Return #${deleteTarget.return_number} cancelled. Restocked stock reversed.`)
      setDeleteTarget(null)
      setCancelReason('')
      fetchReturns()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to cancel sales return')
    } finally {
      setIsCancelling(false)
    }
  }

  const columns = [
    {
      key: 'return_date',
      label: 'Date',
      render: (v, row) => (
        <span className="text-xs text-gray-700">
          {new Date(v || row.created_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'return_number',
      label: 'Return Reference',
      render: (v, row) => (
        <div>
          <button
            type="button"
            onClick={() => setSelectedReturn(row)}
            className="font-mono text-xs font-semibold text-primary-600 hover:text-primary-800 hover:underline"
            title="View Return Details"
          >
            {v}
          </button>
          {row.is_cancelled && (
            <span className="ml-2 inline-block px-1.5 py-0.2 text-xs rounded bg-danger-100 text-danger-500">
              Cancelled
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'sale',
      label: 'Sale Reference',
      render: (v) => <span className="font-mono text-xs text-gray-800">{v?.transaction_id || '—'}</span>,
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (v) => <span className="text-sm font-medium text-gray-900">{v?.name || 'Walk-in'}</span>,
    },
    {
      key: 'warehouse',
      label: 'Warehouse',
      render: (v) => <span className="text-xs text-gray-600">{v?.name || '—'}</span>,
    },
    {
      key: 'refund_amount',
      label: 'Return Amount',
      render: (v) => <span className="font-bold text-gray-900">{fmt(v)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedReturn(row)}
            title="View Return Details"
          >
            <svg className="w-4 h-4 text-gray-600 hover:text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="sr-only">View</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDownloadCreditNote(row)}
            title="Download Credit Note PDF"
          >
            <svg className="w-4 h-4 text-gray-600 hover:text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="sr-only">PDF</span>
          </Button>

          {!row.is_cancelled && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDeleteTarget(row)
                setCancelReason('')
              }}
              title="Cancel / Delete Sales Return"
              className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="sr-only">Delete</span>
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Sales Return"
          subtitle="Manage product returns, credit notes, and restocking operations."
          action={
            <Button onClick={() => navigate('/app/sale-return/create')} className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Sale Return
            </Button>
          }
        />

        {/* Filters */}
        <GlassCard className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            type="search"
            placeholder="Search return #, sale #, reason..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
          <Input
            type="date"
            placeholder="Start date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setPage(1)
            }}
          />
          <Input
            type="date"
            placeholder="End date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              setPage(1)
            }}
          />
          <select
            value={selectedWarehouse}
            onChange={(e) => {
              setSelectedWarehouse(e.target.value)
              setPage(1)
            }}
            className="w-full px-3.5 py-2.5 text-sm border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white/90 shadow-2xs font-medium text-slate-800"
          >
            <option value="">All Warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </GlassCard>

        {/* Table */}
        <GlassCard className="overflow-hidden p-0 border border-white/80 shadow-glass-sm rounded-2xl">
          <Table
            columns={columns}
            data={returnsList}
            loading={loading}
            emptyMessage="No sales returns found."
          />
          {meta.total_pages > 1 && (
            <div className="p-4 border-t border-slate-100">
              <Pagination
                page={page}
                totalPages={meta.total_pages}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          )}
        </GlassCard>
      </div>

      {/* View Return Details Modal */}
      <Modal
        isOpen={Boolean(selectedReturn)}
        onClose={() => setSelectedReturn(null)}
        title={`Sales Return Details: ${selectedReturn?.return_number || ''}`}
        size="lg"
      >
        {selectedReturn && (
          <div className="space-y-4">
            {/* Meta summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg border text-xs">
              <div>
                <span className="text-gray-500 block">Original Sale:</span>
                <p className="font-mono font-semibold text-gray-900">{selectedReturn.sale?.transaction_id || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 block">Customer:</span>
                <p className="font-semibold text-gray-900">{selectedReturn.customer?.name || 'Walk-in'}</p>
              </div>
              <div>
                <span className="text-gray-500 block">Processed By:</span>
                <p className="font-semibold text-gray-900">{selectedReturn.user?.full_name || selectedReturn.user?.username || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500 block">Refund Total:</span>
                <p className="font-bold font-mono text-danger-700 text-sm">{fmt(selectedReturn.refund_amount)}</p>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border text-xs">
              <span className="text-gray-500 font-semibold block mb-0.5">Return Reason:</span>
              <p className="text-gray-800 italic">{selectedReturn.reason || 'None specified'}</p>
            </div>

            {/* Returned Items */}
            <div>
              <p className="text-xs font-bold uppercase text-gray-700 mb-2">Returned Line Items</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Qty</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-600">Unit Price</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-600">Refund Amount</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Restock Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {selectedReturn.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{item.product_name}</p>
                          <p className="text-3xs font-mono text-gray-400">{item.product_sku}</p>
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-semibold">
                          {Number(item.quantity)} {item.unit || 'pcs'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">{fmt(item.unit_price)}</td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-gray-900">{fmt(item.refund_subtotal)}</td>
                        <td className="px-2 py-2 text-center">
                          {item.restock ? (
                            <Badge variant="success">Restocked</Badge>
                          ) : (
                            <Badge variant="default">Damaged</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleDownloadCreditNote(selectedReturn)}
                className="flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Credit Note PDF
              </Button>
              <Button variant="ghost" onClick={() => setSelectedReturn(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel Return Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Cancel Sales Return"
      >
        <form onSubmit={handleCancelReturn} className="space-y-4">
          <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-800">
            <p className="font-semibold">Important Inventory Warning</p>
            <p className="text-xs mt-1">
              Cancelling Return <strong>#{deleteTarget?.return_number}</strong> will automatically <strong>reverse restocked inventory</strong> by deducting the previously restocked quantities from the warehouse stock.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Cancellation Reason <span className="text-danger-500">*</span>
            </label>
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Return recorded in error, customer kept item"
              required
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={isCancelling}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={isCancelling}
            >
              Confirm Cancellation
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  )
}
