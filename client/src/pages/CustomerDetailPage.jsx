import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Table } from '../components/Table'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { Pagination } from '../components/Pagination'
import { customersService } from '../services/customers'
import { formatCurrency } from '../utils/formatCurrency'

const PAYMENT_BADGE = {
  CASH: 'default',
  MOBILE_MONEY: 'primary',
  CARD: 'success',
  CREDIT: 'warning',
}

const STATUS_BADGE = {
  COMPLETED: 'success',
  PARTIALLY_PAID: 'warning',
  PENDING: 'danger',
  REFUNDED: 'default',
}

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2.5 border-b border-slate-100/80 last:border-0">
      <dt className="text-xs font-semibold text-slate-500 sm:w-36 flex-shrink-0">{label}</dt>
      <dd className="text-xs font-medium text-slate-900">{value ?? <span className="text-slate-400">—</span>}</dd>
    </div>
  )
}

// ─── Debt Repayment Modal ───────────────────────────────────────────────────────
function DebtRepaymentModal({ isOpen, onClose, customer, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const maxDebt = Number(customer?.outstanding_debt || 0)

  async function handleSubmit(e) {
    if (e) e.preventDefault()
    const num = parseFloat(amount)
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid payment amount greater than zero')
      return
    }
    if (num > maxDebt) {
      setError(`Payment cannot exceed current outstanding debt of ${formatCurrency(maxDebt)}`)
      return
    }

    setIsLoading(true)
    setError('')
    try {
      await customersService.recordPayment(customer.id, {
        amount: num,
        payment_method: paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      toast.success(`Payment of ${formatCurrency(num)} recorded and applied successfully!`)
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to record repayment'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Record Debt Repayment — ${customer?.name}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-rose-50/90 border border-rose-200 text-rose-700 rounded-xl p-3 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="bg-blue-50/80 border border-blue-100 rounded-2xl p-4 flex justify-between items-center">
          <div>
            <p className="text-[10px] text-primary-700 font-bold uppercase tracking-wider">Current Outstanding Debt</p>
            <p className="text-2xl font-bold text-rose-600 mt-0.5">{formatCurrency(maxDebt)}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAmount(String(maxDebt))
              setError('')
            }}
            className="text-xs bg-white border border-blue-200 text-primary-700 px-3 py-1.5 rounded-xl font-bold hover:bg-blue-50 shadow-2xs transition"
          >
            Pay Full Debt
          </button>
        </div>

        <Input
          label="Repayment Amount *"
          type="number"
          step="any"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            setError('')
          }}
          placeholder="0.00"
          autoFocus
        />

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1.5">Payment Method *</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
          >
            <option value="CASH">Cash</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
            <option value="CARD">Bank Card</option>
          </select>
        </div>

        <Input
          label="Transaction Reference / Note"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. Receipt #, MoMo Ref"
        />

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1.5">Internal Notes (Optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Cash collected at counter..."
            className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all placeholder:text-slate-400"
          />
        </div>

        <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={isLoading}>
            Confirm Repayment
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [customer, setCustomer] = useState(null)
  const [sales, setSales] = useState([])
  const [salesMeta, setSalesMeta] = useState({ page: 1, total_pages: 1 })
  const [salesPage, setSalesPage] = useState(1)

  const [payments, setPayments] = useState([])
  const [paymentsMeta, setPaymentsMeta] = useState({ page: 1, total_pages: 1 })
  const [paymentsPage, setPaymentsPage] = useState(1)

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('sales')
  const [isRepaymentOpen, setIsRepaymentOpen] = useState(false)

  const reloadData = useCallback(async () => {
    try {
      const [custRes, salesRes, payRes] = await Promise.all([
        customersService.get(id),
        customersService.sales(id, { page: salesPage, per_page: 10 }),
        customersService.payments(id, { page: paymentsPage, per_page: 10 }),
      ])
      setCustomer(custRes.data?.data ?? custRes.data)
      setSales(salesRes.data?.data ?? salesRes.data ?? [])
      setSalesMeta(salesRes.data?.meta ?? { page: 1, total_pages: 1 })
      setPayments(payRes.data?.data ?? payRes.data ?? [])
      setPaymentsMeta(payRes.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load customer profile')
      navigate('/customers')
    } finally {
      setLoading(false)
    }
  }, [id, salesPage, paymentsPage, navigate])

  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        const [custRes, salesRes, payRes] = await Promise.all([
          customersService.get(id),
          customersService.sales(id, { page: salesPage, per_page: 10 }),
          customersService.payments(id, { page: paymentsPage, per_page: 10 }),
        ])
        if (!ignore) {
          setCustomer(custRes.data?.data ?? custRes.data)
          setSales(salesRes.data?.data ?? salesRes.data ?? [])
          setSalesMeta(salesRes.data?.meta ?? { page: 1, total_pages: 1 })
          setPayments(payRes.data?.data ?? payRes.data ?? [])
          setPaymentsMeta(payRes.data?.meta ?? { page: 1, total_pages: 1 })
        }
      } catch {
        if (!ignore) {
          toast.error('Failed to load customer profile')
          navigate('/customers')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      ignore = true
    }
  }, [id, salesPage, paymentsPage, navigate])

  if (loading && !customer) {
    return (
      <DashboardLayout>
        <div className="p-12 text-center text-slate-500">
          <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Loading customer account...</span>
        </div>
      </DashboardLayout>
    )
  }

  const debt = Number(customer?.outstanding_debt || 0)

  const salesColumns = [
    {
      key: 'invoice_number',
      label: 'Invoice #',
      render: (v) => <span className="font-mono font-bold text-slate-900">{v || '—'}</span>,
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (v) => (v ? new Date(v).toLocaleDateString() : '—'),
    },
    {
      key: 'total_amount',
      label: 'Total',
      render: (v) => <span className="font-semibold text-slate-900">{formatCurrency(v)}</span>,
    },
    {
      key: 'amount_paid',
      label: 'Paid',
      render: (v) => <span className="text-emerald-700 font-medium">{formatCurrency(v)}</span>,
    },
    {
      key: 'payment_status',
      label: 'Status',
      render: (v) => <Badge variant={STATUS_BADGE[v] || 'default'}>{v}</Badge>,
    },
    {
      key: 'payment_method',
      label: 'Method',
      render: (v) => <Badge variant={PAYMENT_BADGE[v] || 'default'}>{v}</Badge>,
    },
  ]

  const paymentColumns = [
    {
      key: 'created_at',
      label: 'Date',
      render: (v) => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      key: 'amount',
      label: 'Amount Paid',
      render: (v) => <span className="font-bold text-emerald-700">{formatCurrency(v)}</span>,
    },
    {
      key: 'payment_method',
      label: 'Method',
      render: (v) => <Badge variant={PAYMENT_BADGE[v] || 'default'}>{v}</Badge>,
    },
    {
      key: 'reference',
      label: 'Reference',
      render: (v) => <span className="font-mono text-xs">{v || '—'}</span>,
    },
    {
      key: 'notes',
      label: 'Notes',
      render: (v) => <span className="text-slate-500 text-xs">{v || '—'}</span>,
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="text-xs font-semibold text-slate-500 hover:text-primary-600 flex items-center gap-1.5 mb-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Customers
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{customer?.name}</h1>
              
            </div>
            {debt > 0 && (
              <Button variant="primary" onClick={() => setIsRepaymentOpen(true)}>
                Record Debt Repayment
              </Button>
            )}
          </div>
        </div>

        {/* Profile & KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Customer Details Card */}
          <div className="md:col-span-2 bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Customer Information</h2>
            <dl className="divide-y divide-slate-100">
              <InfoRow label="Full Name" value={customer?.name} />
              <InfoRow label="Phone" value={customer?.phone} />
              <InfoRow label="Email" value={customer?.email} />
              <InfoRow label="Address" value={customer?.address} />
              <InfoRow label="Account Created" value={customer?.created_at ? new Date(customer.created_at).toLocaleDateString() : null} />
            </dl>
          </div>

          {/* Debt Summary Card */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Credit Status</h2>
              <p className="text-xs text-slate-500">Current Outstanding Debt</p>
              <p className={`text-3xl font-bold tracking-tight mt-1 ${debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {formatCurrency(debt)}
              </p>
              <p className="text-xs text-slate-400 mt-2">
                {debt > 0 ? 'This customer has unpaid credit balances.' : 'Account is fully paid and clear.'}
              </p>
            </div>
            {debt > 0 && (
              <Button variant="primary" className="mt-4 w-full" onClick={() => setIsRepaymentOpen(true)}>
                Pay Debt Now
              </Button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'sales'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Sales History ({sales.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'payments'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Debt Repayments Log ({payments.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'sales' && (
          <div className="space-y-4">
            <Table
              columns={salesColumns}
              data={sales}
              emptyMessage="No sales recorded for this customer."
            />
            {salesMeta.total_pages > 1 && (
              <div className="flex justify-end pt-2">
                <Pagination
                  page={salesPage}
                  total_pages={salesMeta.total_pages}
                  onPageChange={setSalesPage}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="space-y-4">
            <Table
              columns={paymentColumns}
              data={payments}
              emptyMessage="No debt repayments recorded for this customer."
            />
            {paymentsMeta.total_pages > 1 && (
              <div className="flex justify-end pt-2">
                <Pagination
                  page={paymentsPage}
                  total_pages={paymentsMeta.total_pages}
                  onPageChange={setPaymentsPage}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <DebtRepaymentModal
        isOpen={isRepaymentOpen}
        onClose={() => setIsRepaymentOpen(false)}
        customer={customer}
        onSuccess={() => {
          reloadData()
        }}
      />
    </DashboardLayout>
  )
}
