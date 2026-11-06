import { useState, useEffect, useCallback } from 'react'
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
import { useSettings } from '../hooks/useSettings'
import { formatCurrency } from '../utils/formatCurrency'
import { saleStatus, canRefund, PAYMENT_METHOD_LABELS } from '../utils/saleStatus'

export default function SalesPage() {
  const settings = useSettings()
  const fmt = (v) => formatCurrency(v, settings.currency_symbol || 'GH₵')

  const [sales, setSales] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1 })
  const [page, setPage] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)

  const [receiptSale, setReceiptSale] = useState(null)
  const [refundTarget, setRefundTarget] = useState(null)
  const [refunding, setRefunding] = useState(false)

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const res = await salesService.list({
        page,
        per_page: 20,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      })
      setSales(res.data?.data ?? [])
      setMeta(res.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load sales')
    } finally {
      setLoading(false)
    }
  }, [page, startDate, endDate])

  useEffect(() => {
    fetchSales()
  }, [fetchSales])

  function changeFilter(setter) {
    return (e) => {
      setter(e.target.value)
      setPage(1)
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

  const columns = [
    { key: 'transaction_id', label: 'Transaction', render: (v) => <span className="font-mono text-xs font-medium text-gray-900">{v}</span> },
    { key: 'created_at', label: 'Date', render: (v) => new Date(v).toLocaleString('en-GH') },
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
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => openReceipt(row)}>
            Receipt
          </Button>
          {canRefund(row) && (
            <Button size="sm" variant="danger" onClick={() => setRefundTarget(row)}>
              Refund
            </Button>
          )}
        </div>
      ),
    },
  ]

  const isCashRefund = refundTarget?.payment_method === 'CASH'

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-sm text-gray-500 mt-1">Past sales, receipts and refunds</p>
        </div>

        <UnmatchedPayments />

        <div className="flex flex-wrap items-end gap-4">
          <Input label="From" type="date" value={startDate} onChange={changeFilter(setStartDate)} />
          <Input label="To" type="date" value={endDate} onChange={changeFilter(setEndDate)} />
          {(startDate || endDate) && (
            <Button variant="ghost" onClick={() => { setStartDate(''); setEndDate(''); setPage(1) }}>
              Clear dates
            </Button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table columns={columns} data={sales} isLoading={loading} emptyMessage="No sales found." />
        </div>

        <Pagination page={meta.page} total_pages={meta.total_pages} onPageChange={setPage} />
      </div>

      <Modal isOpen={!!receiptSale} onClose={() => setReceiptSale(null)} title="Receipt" size="sm">
        <Receipt sale={receiptSale} onClose={() => setReceiptSale(null)} />
      </Modal>

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
