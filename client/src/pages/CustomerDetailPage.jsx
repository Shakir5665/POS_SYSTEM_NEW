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
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 border-b border-gray-100 last:border-0">
      <dt className="text-sm font-medium text-gray-500 sm:w-36 flex-shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? <span className="text-gray-400">—</span>}</dd>
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
          <div className="bg-danger-50 border border-danger-200 text-danger-700 rounded-lg p-3 text-xs">
            {error}
          </div>
        )}

        <div className="bg-primary-50 border border-primary-100 rounded-xl p-3 flex justify-between items-center">
          <div>
            <p className="text-2xs text-primary-600 font-semibold uppercase">Current Outstanding Debt</p>
            <p className="text-xl font-bold text-danger-700">{formatCurrency(maxDebt)}</p>
          </div>
          <button
            type="button"
            onClick={() => { setAmount(String(maxDebt)); setError('') }}
            className="text-xs bg-white border border-primary-200 text-primary-700 px-2.5 py-1 rounded-md font-medium hover:bg-primary-50 transition"
          >
            Pay Full Debt
          </button>
        </div>

        <Input
          label="Amount to Pay *"
          type="number"
          step="any"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError('') }}
          placeholder="0.00"
          autoFocus
          required
        />

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {['CASH', 'MOBILE_MONEY', 'CARD'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`py-2 text-xs font-semibold rounded-lg border transition ${
                  paymentMethod === m
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Payment Reference / Receipt #"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. Bank slip, MoMo Txn ID"
        />

        <Input
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional payment notes"
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="success" type="submit" isLoading={isLoading}>
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
  const [activeTab, setActiveTab] = useState('purchases') // purchases | credit_sales | repayments | statement

  // Purchases
  const [purchases, setPurchases] = useState([])
  const [purchasesMeta, setPurchasesMeta] = useState({ page: 1, total_pages: 1 })
  const [purchasesPage, setPurchasesPage] = useState(1)
  const [loadingPurchases, setLoadingPurchases] = useState(true)

  // Credit Sales
  const [creditSales, setCreditSales] = useState([])
  const [creditMeta, setCreditMeta] = useState({ page: 1, total_pages: 1 })
  const [creditPage, setCreditPage] = useState(1)
  const [loadingCreditSales, setLoadingCreditSales] = useState(false)

  // Debt Repayments
  const [repayments, setRepayments] = useState([])
  const [repaymentsMeta, setRepaymentsMeta] = useState({ page: 1, total_pages: 1 })
  const [repaymentsPage, setRepaymentsPage] = useState(1)
  const [loadingRepayments, setLoadingRepayments] = useState(false)

  // Statement
  const [statementData, setStatementData] = useState(null)
  const [loadingStatement, setLoadingStatement] = useState(false)

  const [loadingCustomer, setLoadingCustomer] = useState(true)
  const [error, setError] = useState(null)
  const [showRepaymentModal, setShowRepaymentModal] = useState(false)

  const fetchCustomer = useCallback(async () => {
    setLoadingCustomer(true)
    try {
      const res = await customersService.get(id)
      setCustomer(res.data?.data ?? res.data)
    } catch {
      setError('Customer not found or could not be loaded.')
    } finally {
      setLoadingCustomer(false)
    }
  }, [id])

  useEffect(() => {
    fetchCustomer()
  }, [fetchCustomer])

  const fetchPurchases = useCallback(async () => {
    setLoadingPurchases(true)
    try {
      const res = await customersService.purchases(id, { page: purchasesPage, per_page: 20 })
      setPurchases(res.data?.data ?? res.data ?? [])
      setPurchasesMeta(res.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load purchase history')
    } finally {
      setLoadingPurchases(false)
    }
  }, [id, purchasesPage])

  const fetchCreditSales = useCallback(async () => {
    setLoadingCreditSales(true)
    try {
      const res = await customersService.creditSales(id, { page: creditPage, per_page: 20 })
      setCreditSales(res.data?.data ?? res.data ?? [])
      setCreditMeta(res.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load credit sales')
    } finally {
      setLoadingCreditSales(false)
    }
  }, [id, creditPage])

  const fetchRepayments = useCallback(async () => {
    setLoadingRepayments(true)
    try {
      const res = await customersService.payments(id, { page: repaymentsPage, per_page: 20 })
      setRepayments(res.data?.data ?? res.data ?? [])
      setRepaymentsMeta(res.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load debt repayments')
    } finally {
      setLoadingRepayments(false)
    }
  }, [id, repaymentsPage])

  const fetchStatement = useCallback(async () => {
    setLoadingStatement(true)
    try {
      const res = await customersService.statement(id)
      setStatementData(res.data?.data ?? res.data)
    } catch {
      toast.error('Failed to load customer statement')
    } finally {
      setLoadingStatement(false)
    }
  }, [id])

  useEffect(() => {
    if (activeTab === 'purchases') fetchPurchases()
    else if (activeTab === 'credit_sales') fetchCreditSales()
    else if (activeTab === 'repayments') fetchRepayments()
    else if (activeTab === 'statement') fetchStatement()
  }, [activeTab, fetchPurchases, fetchCreditSales, fetchRepayments, fetchStatement])

  function handleRepaymentSuccess() {
    fetchCustomer()
    if (activeTab === 'credit_sales') fetchCreditSales()
    else if (activeTab === 'repayments') fetchRepayments()
    else if (activeTab === 'statement') fetchStatement()
    else fetchPurchases()
  }

  // Purchases columns
  const purchaseColumns = [
    {
      key: 'transaction_id',
      label: 'Transaction ID',
      render: (v) => <span className="font-mono text-xs text-primary-700 font-medium">{v}</span>,
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (v) =>
        v
          ? new Date(v).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
    },
    {
      key: 'items_count',
      label: 'Items',
      render: (v) => v ?? '—',
    },
    {
      key: 'total_amount',
      label: 'Total',
      render: (v) => <span className="font-semibold">{formatCurrency(v ?? 0)}</span>,
    },
    {
      key: 'payment_method',
      label: 'Payment',
      render: (v) => v ? <Badge variant={PAYMENT_BADGE[v] ?? 'default'}>{v.replace('_', ' ')}</Badge> : '—',
    },
  ]

  // Credit Sales columns
  const creditColumns = [
    {
      key: 'transaction_id',
      label: 'Transaction ID',
      render: (v) => <span className="font-mono text-xs text-primary-700 font-medium">{v}</span>,
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (v) =>
        v
          ? new Date(v).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
    },
    {
      key: 'total_amount',
      label: 'Total Invoice',
      render: (v) => <span className="font-semibold">{formatCurrency(v ?? 0)}</span>,
    },
    {
      key: 'amount_paid',
      label: 'Amount Paid',
      render: (v) => <span className="text-success-700 font-medium">{formatCurrency(v ?? 0)}</span>,
    },
    {
      key: 'balance_due',
      label: 'Balance Due',
      render: (v) => (
        <span className={`font-bold ${Number(v) > 0 ? 'text-danger-600' : 'text-gray-400'}`}>
          {formatCurrency(v ?? 0)}
        </span>
      ),
    },
    {
      key: 'payment_status',
      label: 'Status',
      render: (v) => <Badge variant={STATUS_BADGE[v] ?? 'default'}>{v ? v.replace('_', ' ') : '—'}</Badge>,
    },
  ]

  // Repayments columns
  const repaymentColumns = [
    {
      key: 'created_at',
      label: 'Date',
      render: (v) =>
        v
          ? new Date(v).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '—',
    },
    {
      key: 'amount',
      label: 'Amount Paid',
      render: (v) => <span className="font-bold text-success-700">{formatCurrency(v ?? 0)}</span>,
    },
    {
      key: 'payment_method',
      label: 'Method',
      render: (v) => <Badge variant={PAYMENT_BADGE[v] ?? 'default'}>{v?.replace('_', ' ') || 'CASH'}</Badge>,
    },
    {
      key: 'reference',
      label: 'Reference / Notes',
      render: (v, row) => (
        <div className="text-xs">
          <p className="font-mono text-gray-800">{v || '—'}</p>
          {row.notes && <p className="text-gray-400">{row.notes}</p>}
        </div>
      ),
    },
    {
      key: 'user',
      label: 'Received By',
      render: (v) => <span className="text-xs text-gray-600">{v?.full_name || 'Staff'}</span>,
    },
  ]

  // Statement columns
  const statementColumns = [
    {
      key: 'date',
      label: 'Date',
      render: (v) =>
        v
          ? new Date(v).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
    },
    {
      key: 'reference',
      label: 'Reference',
      render: (v, row) => (
        <div>
          <span className="font-mono text-xs text-primary-700 font-medium">{v}</span>
          <p className="text-2xs text-gray-400">{row.description}</p>
        </div>
      ),
    },
    {
      key: 'debit',
      label: 'Debit (+Debt)',
      render: (v) => v > 0 ? <span className="text-danger-600 font-semibold">+{formatCurrency(v)}</span> : <span className="text-gray-300">—</span>,
    },
    {
      key: 'credit',
      label: 'Credit (-Payment)',
      render: (v) => v > 0 ? <span className="text-success-700 font-semibold">-{formatCurrency(v)}</span> : <span className="text-gray-300">—</span>,
    },
    {
      key: 'running_balance',
      label: 'Running Balance',
      render: (v) => (
        <span className={`font-bold ${v > 0 ? 'text-danger-700' : 'text-gray-700'}`}>
          {formatCurrency(v ?? 0)}
        </span>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back button */}
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/customers')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Customers
          </Button>
        </div>

        {error && (
          <div className="bg-danger-50 border border-danger-200 text-danger-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Customer info card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          {loadingCustomer ? (
            <div className="animate-pulse space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-200 rounded-full" />
                <div className="space-y-2 flex-1">
                  <div className="h-6 bg-gray-200 rounded w-1/3" />
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ) : customer ? (
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                  {customer.name?.[0]?.toUpperCase() ?? '?'}
                </div>

                {/* Details */}
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
                  <p className="text-sm text-gray-500 mt-0.5">{customer.email ?? 'No email'}</p>
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                    <div>
                      <span className="font-medium text-gray-400">Phone: </span>
                      <span>{customer.phone || '—'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-400">Address: </span>
                      <span>{customer.address || '—'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-400">Loyalty: </span>
                      <span className="font-bold text-gray-800">{customer.loyalty_points ?? 0} pts</span>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Outstanding Debt & Action Card */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-[280px]">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outstanding Debt</p>
                  <p className={`text-2xl font-black mt-0.5 ${Number(customer.outstanding_debt || 0) > 0 ? 'text-danger-600' : 'text-success-600'}`}>
                    {formatCurrency(customer.outstanding_debt || 0)}
                  </p>
                  <p className="text-2xs text-gray-400 mt-0.5">
                    {Number(customer.outstanding_debt || 0) > 0 ? 'Credit balance awaiting settlement' : 'Account is fully paid'}
                  </p>
                </div>
                {Number(customer.outstanding_debt || 0) > 0 && (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => setShowRepaymentModal(true)}
                    className="flex-shrink-0"
                  >
                    Accept Repayment
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Tab navigation */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100 px-6 gap-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab('purchases')}
              className={`py-3.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'purchases'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              All Purchases
            </button>
            <button
              onClick={() => setActiveTab('credit_sales')}
              className={`py-3.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'credit_sales'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Credit Invoices
            </button>
            <button
              onClick={() => setActiveTab('repayments')}
              className={`py-3.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'repayments'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Debt Repayments
            </button>
            <button
              onClick={() => setActiveTab('statement')}
              className={`py-3.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === 'statement'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Account Statement
            </button>
          </div>

          {/* TAB 1: ALL PURCHASES */}
          {activeTab === 'purchases' && (
            <div>
              <Table
                columns={purchaseColumns}
                data={purchases}
                isLoading={loadingPurchases}
                emptyMessage="No purchases found for this customer."
              />
              {purchasesMeta.total_pages > 1 && (
                <div className="flex justify-end px-6 py-4 border-t border-gray-100">
                  <Pagination page={purchasesMeta.page ?? purchasesPage} total_pages={purchasesMeta.total_pages} onPageChange={setPurchasesPage} />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREDIT INVOICES */}
          {activeTab === 'credit_sales' && (
            <div>
              <Table
                columns={creditColumns}
                data={creditSales}
                isLoading={loadingCreditSales}
                emptyMessage="No credit sales or outstanding invoices found."
              />
              {creditMeta.total_pages > 1 && (
                <div className="flex justify-end px-6 py-4 border-t border-gray-100">
                  <Pagination page={creditMeta.page ?? creditPage} total_pages={creditMeta.total_pages} onPageChange={setCreditPage} />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DEBT REPAYMENTS */}
          {activeTab === 'repayments' && (
            <div>
              <Table
                columns={repaymentColumns}
                data={repayments}
                isLoading={loadingRepayments}
                emptyMessage="No debt repayments recorded for this customer."
              />
              {repaymentsMeta.total_pages > 1 && (
                <div className="flex justify-end px-6 py-4 border-t border-gray-100">
                  <Pagination page={repaymentsMeta.page ?? repaymentsPage} total_pages={repaymentsMeta.total_pages} onPageChange={setRepaymentsPage} />
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ACCOUNT STATEMENT */}
          {activeTab === 'statement' && (
            <div>
              {statementData && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 bg-gray-50/50 border-b border-gray-100 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-gray-500 font-medium">Total Credit Granted</p>
                    <p className="text-base font-bold text-gray-900 mt-0.5">{formatCurrency(statementData.total_credit_granted || 0)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-gray-500 font-medium">Total Repayments</p>
                    <p className="text-base font-bold text-success-700 mt-0.5">{formatCurrency(statementData.total_repayments || 0)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-gray-500 font-medium">Current Balance Due</p>
                    <p className={`text-base font-bold mt-0.5 ${Number(statementData.current_balance || 0) > 0 ? 'text-danger-600' : 'text-gray-900'}`}>
                      {formatCurrency(statementData.current_balance || 0)}
                    </p>
                  </div>
                </div>
              )}
              <Table
                columns={statementColumns}
                data={statementData?.statement || []}
                isLoading={loadingStatement}
                emptyMessage="No ledger entries found."
              />
            </div>
          )}
        </div>
      </div>

      {/* Debt Repayment Modal */}
      {showRepaymentModal && (
        <DebtRepaymentModal
          isOpen
          onClose={() => setShowRepaymentModal(false)}
          customer={customer}
          onSuccess={handleRepaymentSuccess}
        />
      )}
    </DashboardLayout>
  )
}
