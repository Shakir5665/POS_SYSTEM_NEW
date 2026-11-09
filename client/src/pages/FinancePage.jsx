import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { financeService } from '../services/finance'
import { formatCurrency, formatCompactCurrency } from '../utils/formatCurrency'

const TABS = [
  { key: 'overview', label: 'Financial Overview' },
  { key: 'expenses', label: 'Operating Expenses' },
  { key: 'assets', label: 'Business Assets' },
  { key: 'equity', label: 'Owner Capital & Drawings' },
]

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  // ------------------ Expenses State ------------------
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [expenseMeta, setExpenseMeta] = useState({ page: 1, total_pages: 1, total: 0, total_expenses_amount: 0 })
  const [expensePage] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [expenseSearch, setExpenseSearch] = useState('')
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    category_id: '',
    amount: '',
    payment_method: 'CASH',
    payee: '',
    reference: '',
    notes: '',
  })
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)

  // ------------------ Assets State ------------------
  const [assets, setAssets] = useState([])
  const [assetMeta, setAssetMeta] = useState({ page: 1, total_pages: 1, total: 0, total_current_value: 0 })
  const [assetPage] = useState(1)
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [assetForm, setAssetForm] = useState({
    name: '',
    asset_code: '',
    category: 'Equipment',
    acquisition_cost: '',
    current_value: '',
    location: '',
    notes: '',
  })
  const [assetSubmitting, setAssetSubmitting] = useState(false)

  // ------------------ Owner Equity State ------------------
  const [transactions, setTransactions] = useState([])
  const [equityMeta, setEquityMeta] = useState({ page: 1, total_pages: 1, total: 0, summary: {} })
  const [equityPage] = useState(1)
  const [equityModalOpen, setEquityModalOpen] = useState(false)
  const [equityForm, setEquityForm] = useState({
    type: 'CONTRIBUTION',
    amount: '',
    payment_method: 'CASH',
    reference: '',
    notes: '',
  })
  const [equitySubmitting, setEquitySubmitting] = useState(false)

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await financeService.summary()
      setSummary(res.data?.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch expenses
  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await financeService.expenses({
        page: expensePage,
        per_page: 20,
        category_id: selectedCategory || undefined,
        search: expenseSearch.trim() || undefined,
      })
      setExpenses(res.data?.data || [])
      setExpenseMeta(res.data?.meta || {})
    } catch {
      toast.error('Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }, [expensePage, selectedCategory, expenseSearch])

  // Fetch assets
  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await financeService.assets({ page: assetPage, per_page: 20 })
      setAssets(res.data?.data || [])
      setAssetMeta(res.data?.meta || {})
    } catch {
      toast.error('Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [assetPage])

  // Fetch owner equity transactions
  const fetchEquity = useCallback(async () => {
    setLoading(true)
    try {
      const res = await financeService.ownerTransactions({ page: equityPage, per_page: 20 })
      setTransactions(res.data?.data || [])
      setEquityMeta(res.data?.meta || {})
    } catch {
      toast.error('Failed to load equity records')
    } finally {
      setLoading(false)
    }
  }, [equityPage])

  // Initial load
  useEffect(() => {
    fetchSummary()
    financeService.categories().then((res) => {
      const cats = res.data?.data || []
      setCategories(cats)
      if (cats.length > 0) setExpenseForm((f) => ({ ...f, category_id: cats[0].id }))
    })
  }, [fetchSummary])

  useEffect(() => {
    if (activeTab === 'overview') fetchSummary()
    if (activeTab === 'expenses') fetchExpenses()
    if (activeTab === 'assets') fetchAssets()
    if (activeTab === 'equity') fetchEquity()
  }, [activeTab, fetchSummary, fetchExpenses, fetchAssets, fetchEquity])

  // Handle Add Expense
  async function handleAddExpense(e) {
    e.preventDefault()
    const amt = parseFloat(expenseForm.amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount greater than 0')
      return
    }

    setExpenseSubmitting(true)
    try {
      await financeService.createExpense({
        ...expenseForm,
        amount: amt,
      })
      toast.success('Operating expense recorded successfully')
      setExpenseModalOpen(false)
      setExpenseForm({
        category_id: categories[0]?.id || '',
        amount: '',
        payment_method: 'CASH',
        payee: '',
        reference: '',
        notes: '',
      })
      fetchExpenses()
      fetchSummary()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to record expense')
    } finally {
      setExpenseSubmitting(false)
    }
  }

  // Handle Add Asset
  async function handleAddAsset(e) {
    e.preventDefault()
    const cost = parseFloat(assetForm.acquisition_cost)
    if (isNaN(cost) || cost < 0) {
      toast.error('Please enter a valid cost')
      return
    }

    setAssetSubmitting(true)
    try {
      await financeService.createAsset({
        ...assetForm,
        acquisition_cost: cost,
        current_value: assetForm.current_value ? parseFloat(assetForm.current_value) : cost,
      })
      toast.success('Business asset registered successfully')
      setAssetModalOpen(false)
      setAssetForm({
        name: '',
        asset_code: '',
        category: 'Equipment',
        acquisition_cost: '',
        current_value: '',
        location: '',
        notes: '',
      })
      fetchAssets()
      fetchSummary()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to register asset')
    } finally {
      setAssetSubmitting(false)
    }
  }

  // Handle Add Equity
  async function handleAddEquity(e) {
    e.preventDefault()
    const amt = parseFloat(equityForm.amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount greater than 0')
      return
    }

    setEquitySubmitting(true)
    try {
      await financeService.createOwnerTransaction({
        ...equityForm,
        amount: amt,
      })
      toast.success(
        equityForm.type === 'CONTRIBUTION'
          ? 'Capital contribution recorded successfully'
          : 'Owner withdrawal recorded successfully'
      )
      setEquityModalOpen(false)
      setEquityForm({
        type: 'CONTRIBUTION',
        amount: '',
        payment_method: 'CASH',
        reference: '',
        notes: '',
      })
      fetchEquity()
      fetchSummary()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to record transaction')
    } finally {
      setEquitySubmitting(false)
    }
  }

  // Expenses Table Columns
  const expenseColumns = [
    {
      key: 'expense_date',
      label: 'Date',
      render: (val) => new Date(val).toLocaleDateString(),
    },
    {
      key: 'category',
      label: 'Category',
      render: (val) => <Badge variant="secondary">{val?.name}</Badge>,
    },
    {
      key: 'payee',
      label: 'Payee / Description',
      render: (val, row) => (
        <div>
          <p className="font-medium text-gray-900">{val || '—'}</p>
          {row.notes && <p className="text-2xs text-gray-400">{row.notes}</p>}
        </div>
      ),
    },
    {
      key: 'payment_method',
      label: 'Method',
      render: (val) => <span className="text-xs text-gray-600 font-medium">{val}</span>,
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (val) => <span className="font-bold font-mono text-danger-600">{formatCurrency(val)}</span>,
    },
  ]

  // Asset Table Columns
  const assetColumns = [
    {
      key: 'name',
      label: 'Asset Name',
      render: (val, row) => (
        <div>
          <p className="font-semibold text-gray-900">{val}</p>
          {row.asset_code && <p className="text-2xs font-mono text-gray-400">{row.asset_code}</p>}
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (val) => <Badge variant="outline">{val}</Badge>,
    },
    {
      key: 'acquisition_cost',
      label: 'Acquisition Cost',
      render: (val) => <span className="text-gray-600 font-mono text-sm">{formatCurrency(val)}</span>,
    },
    {
      key: 'current_value',
      label: 'Current Valuation',
      render: (val) => <span className="font-bold text-gray-900 font-mono text-sm">{formatCurrency(val)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <Badge variant={val === 'ACTIVE' ? 'success' : 'warning'}>{val}</Badge>,
    },
    {
      key: 'location',
      label: 'Location',
      render: (val) => <span className="text-xs text-gray-500">{val || '—'}</span>,
    },
  ]

  // Equity Table Columns
  const equityColumns = [
    {
      key: 'transaction_date',
      label: 'Date',
      render: (val) => new Date(val).toLocaleDateString(),
    },
    {
      key: 'type',
      label: 'Type',
      render: (val) =>
        val === 'CONTRIBUTION' ? (
          <Badge variant="success">Capital Contribution (+)</Badge>
        ) : (
          <Badge variant="danger">Drawings / Withdrawal (-)</Badge>
        ),
    },
    {
      key: 'payment_method',
      label: 'Payment Method',
      render: (val) => <span className="text-xs text-gray-600 font-medium">{val}</span>,
    },
    {
      key: 'notes',
      label: 'Notes / Reference',
      render: (val, row) => (
        <div>
          <p className="text-sm text-gray-900">{val || '—'}</p>
          {row.reference && <p className="text-2xs font-mono text-gray-400">{row.reference}</p>}
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (val, row) => (
        <span
          className={`font-bold font-mono text-sm ${
            row.type === 'CONTRIBUTION' ? 'text-success-600' : 'text-danger-600'
          }`}
        >
          {row.type === 'CONTRIBUTION' ? '+' : '-'}
          {formatCurrency(val)}
        </span>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Business Finance Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Track operating expenses, equipment & assets, and owner equity
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'expenses' && (
              <Button variant="primary" onClick={() => setExpenseModalOpen(true)}>
                + Record Expense
              </Button>
            )}
            {activeTab === 'assets' && (
              <Button variant="primary" onClick={() => setAssetModalOpen(true)}>
                + Register Asset
              </Button>
            )}
            {activeTab === 'equity' && (
              <Button variant="primary" onClick={() => setEquityModalOpen(true)}>
                + Capital / Drawing
              </Button>
            )}
          </div>
        </div>

        {/* Top Navigation Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map((tab) => (
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

        {/* ----------------- TAB: OVERVIEW ----------------- */}
        {activeTab === 'overview' && summary && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs" title={formatCurrency(summary.total_expenses)}>
                <p className="text-sm font-medium text-gray-500">Total Operating Expenses</p>
                <p className="text-2xl font-bold text-danger-600 mt-1">{formatCompactCurrency(summary.total_expenses)}</p>
                <p className="text-xs text-gray-400 mt-1">Rent, utilities & logistics</p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs" title={formatCurrency(summary.total_asset_value)}>
                <p className="text-sm font-medium text-gray-500">Business Assets Valuation</p>
                <p className="text-2xl font-bold text-primary-600 mt-1">{formatCompactCurrency(summary.total_asset_value)}</p>
                <p className="text-xs text-gray-400 mt-1">Equipment & electronics</p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs" title={formatCurrency(summary.net_capital)}>
                <p className="text-sm font-medium text-gray-500">Net Owner Capital</p>
                <p className="text-2xl font-bold text-success-600 mt-1">{formatCompactCurrency(summary.net_capital)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  In: <span title={formatCurrency(summary.total_contributions)}>{formatCompactCurrency(summary.total_contributions)}</span> | Out: <span title={formatCurrency(summary.total_withdrawals || 0)}>{formatCompactCurrency(summary.total_withdrawals || 0)}</span>
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs" title={formatCurrency(summary.total_equity ?? summary.net_capital)}>
                <p className="text-sm font-medium text-gray-500">Total Business Equity</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCompactCurrency(summary.total_equity ?? summary.net_capital)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Capital + Profit: <span title={formatCurrency(summary.retained_earnings || 0)}>{formatCompactCurrency(summary.retained_earnings || 0)}</span>
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs" title={formatCurrency(summary.total_supplier_payables)}>
                <p className="text-sm font-medium text-gray-500">Outstanding Payables</p>
                <p className="text-2xl font-bold text-warning-700 mt-1">
                  {formatCompactCurrency(summary.total_supplier_payables)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Unpaid vendor invoices</p>
              </div>
            </div>

            {/* Quick Balance Health */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Balance Sheet Quick View</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Assets & Receivables</p>
                  <div className="flex justify-between text-sm py-1 border-b">
                    <span className="text-gray-600">Fixed & Operating Assets</span>
                    <span className="font-mono font-medium" title={formatCurrency(summary.total_asset_value)}>{formatCompactCurrency(summary.total_asset_value)}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-gray-600">Customer Credit Receivables</span>
                    <span className="font-mono font-medium" title={formatCurrency(summary.total_customer_receivables)}>{formatCompactCurrency(summary.total_customer_receivables)}</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Liabilities & Equity</p>
                  <div className="flex justify-between text-sm py-1 border-b">
                    <span className="text-gray-600">Supplier Payables (Debt)</span>
                    <span className="font-mono font-medium text-danger-600" title={formatCurrency(summary.total_supplier_payables)}>
                      {formatCompactCurrency(summary.total_supplier_payables)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm py-1 border-b">
                    <span className="text-gray-600">Contributed Owner Capital</span>
                    <span className="font-mono font-medium text-success-600" title={formatCurrency(summary.net_capital)}>
                      {formatCompactCurrency(summary.net_capital)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm py-1 border-b">
                    <span className="text-gray-600">Retained Earnings (Operating Profit)</span>
                    <span className="font-mono font-medium text-gray-900" title={formatCurrency(summary.retained_earnings || 0)}>
                      {formatCompactCurrency(summary.retained_earnings || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm py-1 font-bold">
                    <span className="text-gray-800">Total Business Equity</span>
                    <span className="font-mono text-emerald-700" title={formatCurrency(summary.total_equity ?? summary.net_capital)}>
                      {formatCompactCurrency(summary.total_equity ?? summary.net_capital)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- TAB: EXPENSES ----------------- */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-white p-3 rounded-xl border border-gray-200">
              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Search payee or notes..."
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg w-full sm:w-64"
                />
              </div>

              <div className="text-right">
                <p className="text-xs text-gray-500">Total Filtered Expenses</p>
                <p className="text-lg font-bold text-danger-600 font-mono" title={formatCurrency(expenseMeta.total_expenses_amount || 0)}>
                  {formatCompactCurrency(expenseMeta.total_expenses_amount || 0)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table
                columns={expenseColumns}
                data={expenses}
                isLoading={loading}
                emptyMessage="No expenses recorded."
              />
            </div>
          </div>
        )}

        {/* ----------------- TAB: ASSETS ----------------- */}
        {activeTab === 'assets' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Assets Tracked</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{assetMeta.total || assets.length} assets</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 font-medium">Total Current Valuation</p>
                <p className="text-2xl font-bold font-mono text-primary-600 mt-0.5" title={formatCurrency(assetMeta.total_current_value || 0)}>
                  {formatCompactCurrency(assetMeta.total_current_value || 0)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table
                columns={assetColumns}
                data={assets}
                isLoading={loading}
                emptyMessage="No business assets registered."
              />
            </div>
          </div>
        )}

        {/* ----------------- TAB: EQUITY ----------------- */}
        {activeTab === 'equity' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200" title={formatCurrency(equityMeta.summary?.total_contributions || 0)}>
                <p className="text-xs text-gray-500">Total Owner Contributions</p>
                <p className="text-xl font-bold text-success-600 font-mono mt-1">
                  +{formatCompactCurrency(equityMeta.summary?.total_contributions || 0)}
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200" title={formatCurrency(equityMeta.summary?.total_withdrawals || 0)}>
                <p className="text-xs text-gray-500">Total Owner Drawings</p>
                <p className="text-xl font-bold text-danger-600 font-mono mt-1">
                  -{formatCompactCurrency(equityMeta.summary?.total_withdrawals || 0)}
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200" title={formatCurrency(equityMeta.summary?.net_owner_equity || 0)}>
                <p className="text-xs text-gray-500">Net Owner Capital</p>
                <p className="text-xl font-bold text-gray-900 font-mono mt-1">
                  {formatCompactCurrency(equityMeta.summary?.net_owner_equity || 0)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table
                columns={equityColumns}
                data={transactions}
                isLoading={loading}
                emptyMessage="No owner transactions recorded."
              />
            </div>
          </div>
        )}
      </div>

      {/* Record Expense Modal */}
      <Modal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title="Record Operating Expense"
        size="md"
      >
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expense Category *</label>
            <select
              value={expenseForm.category_id}
              onChange={(e) => setExpenseForm((f) => ({ ...f, category_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Amount *"
            type="number"
            step="0.01"
            value={expenseForm.amount}
            onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Payee / Vendor"
              value={expenseForm.payee}
              onChange={(e) => setExpenseForm((f) => ({ ...f, payee: e.target.value }))}
              placeholder="e.g. ECG or Cleaner"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={expenseForm.payment_method}
                onChange={(e) => setExpenseForm((f) => ({ ...f, payment_method: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              >
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="CARD">Bank / Card</option>
              </select>
            </div>
          </div>

          <Input
            label="Receipt / Reference #"
            value={expenseForm.reference}
            onChange={(e) => setExpenseForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="e.g. REC-9901"
          />

          <Input
            label="Notes / Purpose"
            value={expenseForm.notes}
            onChange={(e) => setExpenseForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="e.g. Power bill for shop counter"
          />

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setExpenseModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={expenseSubmitting}>
              Record Expense
            </Button>
          </div>
        </form>
      </Modal>

      {/* Register Asset Modal */}
      <Modal
        isOpen={assetModalOpen}
        onClose={() => setAssetModalOpen(false)}
        title="Register Business Asset"
        size="md"
      >
        <form onSubmit={handleAddAsset} className="space-y-4">
          <Input
            label="Asset Name *"
            value={assetForm.name}
            onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. POS Touchscreen Terminal"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Asset Code / Tag #"
              value={assetForm.asset_code}
              onChange={(e) => setAssetForm((f) => ({ ...f, asset_code: e.target.value }))}
              placeholder="e.g. AST-POS-01"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={assetForm.category}
                onChange={(e) => setAssetForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              >
                <option value="Equipment">Equipment & Machinery</option>
                <option value="Electronics">Electronics & Computers</option>
                <option value="Furniture">Furniture & Fixtures</option>
                <option value="Vehicle">Vehicles & Transport</option>
                <option value="Premises">Premises & Renovation</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Acquisition Cost *"
              type="number"
              step="0.01"
              value={assetForm.acquisition_cost}
              onChange={(e) => setAssetForm((f) => ({ ...f, acquisition_cost: e.target.value }))}
              placeholder="0.00"
              required
            />
            <Input
              label="Current Valuation"
              type="number"
              step="0.01"
              value={assetForm.current_value}
              onChange={(e) => setAssetForm((f) => ({ ...f, current_value: e.target.value }))}
              placeholder="Defaults to cost"
            />
          </div>

          <Input
            label="Physical Location"
            value={assetForm.location}
            onChange={(e) => setAssetForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="e.g. Cashier Counter 1"
          />

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setAssetModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={assetSubmitting}>
              Register Asset
            </Button>
          </div>
        </form>
      </Modal>

      {/* Owner Equity Modal */}
      <Modal
        isOpen={equityModalOpen}
        onClose={() => setEquityModalOpen(false)}
        title="Record Owner Capital / Drawings"
        size="sm"
      >
        <form onSubmit={handleAddEquity} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type *</label>
            <select
              value={equityForm.type}
              onChange={(e) => setEquityForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white font-medium"
            >
              <option value="CONTRIBUTION">Capital Contribution (Money in)</option>
              <option value="WITHDRAWAL">Owner Drawings (Money out for personal use)</option>
            </select>
          </div>

          <Input
            label="Amount *"
            type="number"
            step="0.01"
            value={equityForm.amount}
            onChange={(e) => setEquityForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              value={equityForm.payment_method}
              onChange={(e) => setEquityForm((f) => ({ ...f, payment_method: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
            >
              <option value="CASH">Cash</option>
              <option value="CARD">Bank Transfer / Card</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
            </select>
          </div>

          <Input
            label="Reference / Check #"
            value={equityForm.reference}
            onChange={(e) => setEquityForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="e.g. Bank Ref"
          />

          <Input
            label="Notes / Reason"
            value={equityForm.notes}
            onChange={(e) => setEquityForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="e.g. Additional working capital"
          />

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setEquityModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={equitySubmitting}>
              Save Transaction
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  )
}
