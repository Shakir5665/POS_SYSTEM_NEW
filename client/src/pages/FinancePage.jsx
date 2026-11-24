import { useState, useEffect, useCallback } from 'react'
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
import { MetricCard } from '../components/MetricCard'
import { financeService } from '../services/finance'
import { warehouseService } from '../services/warehouses'
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
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')

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
    warehouse_id: '',
    amount: '',
    payment_method: 'CASH',
    payee: '',
    reference: '',
    notes: '',
    expense_date: new Date().toISOString().split('T')[0],
  })
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)

  // Load active warehouses / branches
  useEffect(() => {
    async function loadWarehouses() {
      try {
        const { data } = await warehouseService.list({ is_active: true })
        setWarehouses(data?.data || [])
      } catch (err) {
        console.error('Failed to load branches for finance', err)
      }
    }
    loadWarehouses()
  }, [])

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
      const res = await financeService.summary({
        warehouse_id: selectedWarehouseId || undefined,
      })
      setSummary(res.data?.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [selectedWarehouseId])

  // Fetch expenses
  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await financeService.expenses({
        page: expensePage,
        per_page: 20,
        category_id: selectedCategory || undefined,
        warehouse_id: selectedWarehouseId || undefined,
        search: expenseSearch.trim() || undefined,
      })
      setExpenses(res.data?.data || [])
      setExpenseMeta(res.data?.meta || {})
    } catch {
      toast.error('Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }, [expensePage, selectedCategory, selectedWarehouseId, expenseSearch])

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

  function openExpenseModal() {
    let catId = expenseForm.category_id
    if (!catId && categories.length > 0) {
      catId = categories[0].id
    }
    setExpenseForm((prev) => ({
      ...prev,
      category_id: catId,
      expense_date: prev.expense_date || new Date().toISOString().split('T')[0],
    }))
    setExpenseModalOpen(true)
  }

  async function handleCreateCategory(e) {
    e.preventDefault()
    const name = newCatName.trim()
    if (!name) return
    setCreatingCat(true)
    try {
      const res = await financeService.createCategory({ name })
      const newCat = res.data?.data
      toast.success('Category created')
      setNewCatName('')
      setShowAddCategory(false)
      const catRes = await financeService.categories()
      const cats = catRes.data?.data || []
      setCategories(cats)
      if (newCat?.id) {
        setExpenseForm((f) => ({ ...f, category_id: newCat.id }))
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create category')
    } finally {
      setCreatingCat(false)
    }
  }

  // Handle Add Expense
  async function handleAddExpense(e) {
    e.preventDefault()
    const amt = parseFloat(expenseForm.amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount greater than 0')
      return
    }

    const catId = expenseForm.category_id || categories[0]?.id
    if (!catId) {
      toast.error('Please select an expense category')
      return
    }

    setExpenseSubmitting(true)
    try {
      const payload = {
        category_id: catId,
        amount: amt,
        payment_method: expenseForm.payment_method || 'CASH',
      }
      if (expenseForm.warehouse_id) payload.warehouse_id = expenseForm.warehouse_id
      if (expenseForm.expense_date) payload.expense_date = new Date(expenseForm.expense_date).toISOString()
      if (expenseForm.payee?.trim()) payload.payee = expenseForm.payee.trim()
      if (expenseForm.reference?.trim()) payload.reference = expenseForm.reference.trim()
      if (expenseForm.notes?.trim()) payload.notes = expenseForm.notes.trim()

      await financeService.createExpense(payload)
      toast.success('Operating expense recorded successfully')
      setExpenseModalOpen(false)
      setExpenseForm({
        category_id: categories[0]?.id || '',
        warehouse_id: '',
        amount: '',
        payment_method: 'CASH',
        payee: '',
        reference: '',
        notes: '',
        expense_date: new Date().toISOString().split('T')[0],
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
      key: 'warehouse',
      label: 'Branch / Location',
      render: (val) => (
        <span className="text-xs font-semibold text-slate-700">
          {val?.name || 'General'}
        </span>
      ),
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
        <PageHeader
          title="Business Finance Management"
          subtitle="Track operating expenses, equipment & assets, and owner equity"
          action={
            <div className="flex items-center gap-2">
              {(activeTab === 'overview' || activeTab === 'expenses') && (
                <Button variant="primary" onClick={openExpenseModal}>
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
          }
        />

        {/* Top Navigation Tabs */}
        <div className="flex gap-1.5 p-1 bg-white/70 backdrop-blur-md rounded-2xl border border-white/80 shadow-glass-sm w-fit overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-150 whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-primary-glow font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ----------------- TAB: OVERVIEW ----------------- */}
        {activeTab === 'overview' && summary && (
          <div className="space-y-6">
            {warehouses.length > 0 && (
              <div className="flex items-center justify-between bg-white/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Branch P&L Scope:</span>
                </div>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-primary-500/20 cursor-pointer"
                >
                  <option value="">All Branches & Warehouses (Consolidated)</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} {wh.is_default ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <MetricCard
                size="compact"
                title="Operating Expenses"
                value={formatCompactCurrency(summary.total_expenses)}
                tooltip={formatCurrency(summary.total_expenses)}
                subtitle="Rent, utilities & logistics"
                color="red"
                valueClassName="text-rose-600 font-bold"
                iconBg="bg-rose-50 text-rose-600 border border-rose-100"
                icon={
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                }
              />
              <MetricCard
                size="compact"
                title="Assets Valuation"
                value={formatCompactCurrency(summary.total_asset_value)}
                tooltip={formatCurrency(summary.total_asset_value)}
                subtitle="Equipment & electronics"
                color="indigo"
                valueClassName="text-indigo-600 font-bold"
                iconBg="bg-indigo-50 text-indigo-600 border border-indigo-100"
                icon={
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                }
              />
              <MetricCard
                size="compact"
                title="Net Owner Capital"
                value={formatCompactCurrency(summary.net_capital)}
                tooltip={formatCurrency(summary.net_capital)}
                subtitle={`In: ${formatCompactCurrency(summary.total_contributions)} | Out: ${formatCompactCurrency(summary.total_withdrawals || 0)}`}
                color="green"
                valueClassName="text-emerald-600 font-bold"
                iconBg="bg-emerald-50 text-emerald-600 border border-emerald-100"
                icon={
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <MetricCard
                size="compact"
                title="Total Business Equity"
                value={formatCompactCurrency(summary.total_equity ?? summary.net_capital)}
                tooltip={formatCurrency(summary.total_equity ?? summary.net_capital)}
                subtitle={`Retained Profit: ${formatCompactCurrency(summary.retained_earnings || 0)}`}
                color="blue"
                valueClassName="text-blue-600 font-bold"
                iconBg="bg-blue-50 text-blue-600 border border-blue-100"
                icon={
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                }
              />
              <MetricCard
                size="compact"
                title="Outstanding Payables"
                value={formatCompactCurrency(summary.total_supplier_payables)}
                tooltip={formatCurrency(summary.total_supplier_payables)}
                subtitle="Unpaid vendor invoices"
                color="amber"
                valueClassName="text-amber-600 font-bold"
                iconBg="bg-amber-50 text-amber-600 border border-amber-100"
                icon={
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </div>

            {/* Quick Balance Health */}
            <GlassCard className="p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4">Balance Sheet Quick View</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/70 p-4 rounded-xl border border-white/90 shadow-2xs space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Assets & Receivables</p>
                  <div className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                    <span className="text-slate-600 font-medium">Fixed & Operating Assets</span>
                    <span className="font-mono font-bold text-indigo-600" title={formatCurrency(summary.total_asset_value)}>{formatCompactCurrency(summary.total_asset_value)}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1.5">
                    <span className="text-slate-600 font-medium">Customer Credit Receivables</span>
                    <span className="font-mono font-bold text-blue-600" title={formatCurrency(summary.total_customer_receivables)}>{formatCompactCurrency(summary.total_customer_receivables)}</span>
                  </div>
                </div>

                <div className="bg-white/70 p-4 rounded-xl border border-white/90 shadow-2xs space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Liabilities & Equity</p>
                  <div className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                    <span className="text-slate-600 font-medium">Supplier Payables (Debt)</span>
                    <span className="font-mono font-bold text-rose-600" title={formatCurrency(summary.total_supplier_payables)}>
                      {formatCompactCurrency(summary.total_supplier_payables)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                    <span className="text-slate-600 font-medium">Contributed Owner Capital</span>
                    <span className="font-mono font-bold text-emerald-600" title={formatCurrency(summary.net_capital)}>
                      {formatCompactCurrency(summary.net_capital)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                    <span className="text-slate-600 font-medium">Retained Earnings (Operating Profit)</span>
                    <span className="font-mono font-bold text-slate-800" title={formatCurrency(summary.retained_earnings || 0)}>
                      {formatCompactCurrency(summary.retained_earnings || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm py-1.5 font-bold">
                    <span className="text-slate-900">Total Business Equity</span>
                    <span className="font-mono text-emerald-600" title={formatCurrency(summary.total_equity ?? summary.net_capital)}>
                      {formatCompactCurrency(summary.total_equity ?? summary.net_capital)}
                    </span>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* ----------------- TAB: EXPENSES ----------------- */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            <GlassCard className="p-4 flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="px-3.5 py-2 text-sm border border-slate-200/80 rounded-xl bg-white/90 shadow-2xs font-semibold text-slate-800 focus:ring-2 focus:ring-primary-500/20 cursor-pointer"
                >
                  <option value="">All Branches</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} {wh.is_default ? '(Default)' : ''}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3.5 py-2 text-sm border border-slate-200/80 rounded-xl bg-white/90 shadow-2xs font-medium text-slate-800 focus:ring-2 focus:ring-primary-500/20"
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
                  className="px-3.5 py-2 text-sm border border-slate-200/80 rounded-xl bg-white/90 shadow-2xs font-medium text-slate-800 w-full sm:w-64 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="text-right">
                <p className="text-xs text-slate-500 font-medium">Total Filtered Expenses</p>
                <p className="text-lg font-bold text-danger-600 font-mono" title={formatCurrency(expenseMeta.total_expenses_amount || 0)}>
                  {formatCompactCurrency(expenseMeta.total_expenses_amount || 0)}
                </p>
              </div>
            </GlassCard>

            <GlassCard className="overflow-hidden p-0 border border-white/80 shadow-glass-sm rounded-2xl">
              <Table
                columns={expenseColumns}
                data={expenses}
                isLoading={loading}
                emptyMessage="No expenses recorded."
              />
            </GlassCard>
          </div>
        )}

        {/* ----------------- TAB: ASSETS ----------------- */}
        {activeTab === 'assets' && (
          <div className="space-y-4">
            <GlassCard className="p-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-500 font-semibold">Total Assets Tracked</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{assetMeta.total || assets.length} assets</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 font-semibold">Total Current Valuation</p>
                <p className="text-2xl font-bold font-mono text-primary-600 mt-0.5" title={formatCurrency(assetMeta.total_current_value || 0)}>
                  {formatCompactCurrency(assetMeta.total_current_value || 0)}
                </p>
              </div>
            </GlassCard>

            <GlassCard className="overflow-hidden p-0 border border-white/80 shadow-glass-sm rounded-2xl">
              <Table
                columns={assetColumns}
                data={assets}
                isLoading={loading}
                emptyMessage="No business assets registered."
              />
            </GlassCard>
          </div>
        )}

        {/* ----------------- TAB: EQUITY ----------------- */}
        {activeTab === 'equity' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MetricCard
                size="compact"
                title="Total Owner Contributions"
                value={`+${formatCompactCurrency(equityMeta.summary?.total_contributions || 0)}`}
                tooltip={formatCurrency(equityMeta.summary?.total_contributions || 0)}
                subtitle="Capital injected into business"
                color="green"
                valueClassName="text-emerald-600 font-bold"
                iconBg="bg-emerald-50 text-emerald-600 border border-emerald-100"
                icon={
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <MetricCard
                size="compact"
                title="Total Owner Drawings"
                value={`-${formatCompactCurrency(equityMeta.summary?.total_withdrawals || 0)}`}
                tooltip={formatCurrency(equityMeta.summary?.total_withdrawals || 0)}
                subtitle="Capital taken out for personal use"
                color="red"
                valueClassName="text-rose-600 font-bold"
                iconBg="bg-rose-50 text-rose-600 border border-rose-100"
                icon={
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <MetricCard
                size="compact"
                title="Net Owner Capital"
                value={formatCompactCurrency(equityMeta.summary?.net_owner_equity || 0)}
                tooltip={formatCurrency(equityMeta.summary?.net_owner_equity || 0)}
                subtitle="Current net capital invested"
                color="blue"
                valueClassName="text-blue-600 font-bold"
                iconBg="bg-blue-50 text-blue-600 border border-blue-100"
                icon={
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
              />
            </div>

            <GlassCard className="overflow-hidden p-0 border border-white/80 shadow-glass-sm rounded-2xl">
              <Table
                columns={equityColumns}
                data={transactions}
                isLoading={loading}
                emptyMessage="No owner transactions recorded."
              />
            </GlassCard>
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Expense Category *</label>
              <button
                type="button"
                onClick={() => setShowAddCategory(!showAddCategory)}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                {showAddCategory ? 'Cancel' : '+ New Category'}
              </button>
            </div>

            {showAddCategory ? (
              <div className="flex gap-2 mb-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                <input
                  type="text"
                  placeholder="New category name (e.g. Repairs)"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 bg-white"
                />
                <Button
                  size="sm"
                  type="button"
                  variant="primary"
                  onClick={handleCreateCategory}
                  isLoading={creatingCat}
                >
                  Add
                </Button>
              </div>
            ) : null}

            <select
              value={expenseForm.category_id}
              onChange={(e) => setExpenseForm((f) => ({ ...f, category_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              required
            >
              {categories.length === 0 && <option value="">No categories available</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Operating Branch (Optional)</label>
            <select
              value={expenseForm.warehouse_id}
              onChange={(e) => setExpenseForm((f) => ({ ...f, warehouse_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white mt-1 cursor-pointer"
            >
              <option value="">General (All Branches / Company)</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} {wh.is_default ? '(Default)' : ''}
                </option>
              ))}
            </select>
            <p className="text-2xs text-gray-400 mt-0.5">Attribute expense to a specific operating location or store</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Amount *"
              type="number"
              step="0.01"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              required
            />
            <Input
              label="Expense Date"
              type="date"
              value={expenseForm.expense_date || ''}
              onChange={(e) => setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))}
            />
          </div>

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
