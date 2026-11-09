import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { reportsService } from '../services/reports'
import { formatCurrency, formatCompactCurrency, formatCompactNumber } from '../utils/formatCurrency'
import { useSettings } from '../hooks/useSettings'

const PIE_COLORS = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2']

const TABS = [
  { id: 'summary', label: 'Sales Summary' },
  { id: 'daily', label: 'Daily Sales' },
  { id: 'top-products', label: 'Top Products' },
  { id: 'category', label: 'Category' },
  { id: 'cashier', label: 'Cashier Performance' },
  { id: 'profit', label: 'Profit' },
  { id: 'financial-statement', label: 'Financial Statement (P&L)' },
]

function formatDate(d) {
  const date = new Date()
  date.setDate(date.getDate() + d)
  return date.toISOString().split('T')[0]
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <svg className="animate-spin h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  )
}

function KpiCard({ label, value, tooltip }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm" title={tooltip}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function exportCsv(filename, headers, rows) {
  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const { currency_symbol: currencySymbol = 'LKR' } = useSettings()
  const [activeTab, setActiveTab] = useState('summary')
  const [startDate, setStartDate] = useState(formatDate(-29))
  const [endDate, setEndDate] = useState(formatDate(0))
  const [loading, setLoading] = useState(false)

  const [summaryData, setSummaryData] = useState(null)
  const [dailyData, setDailyData] = useState([])
  const [topData, setTopData] = useState([])
  const [catData, setCatData] = useState([])
  const [cashierData, setCashierData] = useState([])
  const [profitData, setProfitData] = useState([])
  const [financialData, setFinancialData] = useState(null)

  const fetchTab = useCallback(
    async (tab) => {
      if (!startDate || !endDate) return
      setLoading(true)
      const params = { start_date: startDate, end_date: endDate }
      try {
        if (tab === 'summary') {
          const res = await reportsService.salesSummary(params)
          setSummaryData(res.data?.data ?? res.data)
        } else if (tab === 'daily') {
          const res = await reportsService.salesByDay(params)
          setDailyData(res.data?.data ?? res.data ?? [])
        } else if (tab === 'top-products') {
          const res = await reportsService.topProducts({ ...params, limit: 50 })
          setTopData(res.data?.data ?? res.data ?? [])
        } else if (tab === 'category') {
          const res = await reportsService.categoryPerformance(params)
          setCatData(res.data?.data ?? res.data ?? [])
        } else if (tab === 'cashier') {
          const res = await reportsService.cashierPerformance(params)
          setCashierData(res.data?.data ?? res.data ?? [])
        } else if (tab === 'profit') {
          const res = await reportsService.profit(params)
          setProfitData(res.data?.data ?? res.data ?? [])
        } else if (tab === 'financial-statement') {
          const res = await reportsService.financialStatement(params)
          setFinancialData(res.data?.data ?? res.data)
        }
      } catch {
        toast.error('Failed to load report data.')
      } finally {
        setLoading(false)
      }
    },
    [startDate, endDate]
  )

  useEffect(() => {
    fetchTab(activeTab)
  }, [activeTab, fetchTab])

  function handleTabChange(tab) {
    setActiveTab(tab)
  }

  function handleApply() {
    fetchTab(activeTab)
  }

  // Export helpers
  function exportSummary() {
    if (!summaryData) return
    exportCsv(
      'sales-summary.csv',
      ['Metric', 'Value'],
      [
        ['Total Revenue', summaryData.total_revenue ?? 0],
        ['Transaction Count', summaryData.transaction_count ?? 0],
        ['Average Sale', summaryData.average_sale ?? 0],
        ['Total Discount', summaryData.total_discount ?? 0],
        ['Total Tax', summaryData.total_tax ?? 0],
      ]
    )
  }
  function exportDaily() {
    exportCsv('daily-sales.csv', ['Date', 'Revenue'], dailyData.map((d) => [d.label, d.value ?? 0]))
  }
  function exportTopProducts() {
    exportCsv(
      'top-products.csv',
      ['Rank', 'Product', 'Quantity Sold', 'Revenue'],
      topData.map((p, i) => [i + 1, `"${p.name ?? p.label}"`, p.quantity_sold ?? p.quantity ?? 0, p.revenue ?? p.value ?? 0])
    )
  }
  function exportCategory() {
    exportCsv('category-performance.csv', ['Category', 'Revenue'], catData.map((c) => [`"${c.label}"`, c.value ?? 0]))
  }
  function exportCashier() {
    exportCsv(
      'cashier-performance.csv',
      ['Cashier', 'Transactions', 'Total Revenue'],
      cashierData.map((c) => [`"${c.name ?? c.label}"`, c.transaction_count ?? c.count ?? 0, c.total_revenue ?? c.value ?? 0])
    )
  }
  function exportProfit() {
    exportCsv(
      'profit.csv',
      ['Product', 'Revenue', 'Cost', 'Profit', 'Margin %'],
      profitData.map((p) => [
        `"${p.name ?? p.label}"`,
        p.revenue ?? 0,
        p.cost ?? 0,
        p.profit ?? 0,
        p.margin != null ? `${p.margin.toFixed(1)}%` : '—',
      ])
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Business analytics and performance insights</p>
        </div>

        {/* Date range */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Start Date</label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">End Date</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <Button onClick={handleApply} isLoading={loading}>
            Apply
          </Button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div>
          {/* Sales Summary */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={exportSummary}>
                  Export CSV
                </Button>
              </div>
              {loading ? (
                <Spinner />
              ) : !summaryData ? (
                <p className="text-center text-gray-400 py-10">No data available</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  <KpiCard
                    label="Total Revenue"
                    value={formatCompactCurrency(summaryData.total_revenue ?? 0)}
                    tooltip={formatCurrency(summaryData.total_revenue ?? 0)}
                  />
                  <KpiCard
                    label="Transactions"
                    value={summaryData.transaction_count != null && summaryData.transaction_count >= 1000 ? formatCompactNumber(summaryData.transaction_count) : (summaryData.transaction_count ?? 0)}
                    tooltip={String(summaryData.transaction_count ?? 0)}
                  />
                  <KpiCard
                    label="Average Sale"
                    value={formatCompactCurrency(summaryData.average_sale ?? 0)}
                    tooltip={formatCurrency(summaryData.average_sale ?? 0)}
                  />
                  <KpiCard
                    label="Total Discount"
                    value={formatCompactCurrency(summaryData.total_discount ?? 0)}
                    tooltip={formatCurrency(summaryData.total_discount ?? 0)}
                  />
                  <KpiCard
                    label="Total Tax"
                    value={formatCompactCurrency(summaryData.total_tax ?? 0)}
                    tooltip={formatCurrency(summaryData.total_tax ?? 0)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Daily Sales */}
          {activeTab === 'daily' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={exportDaily}>
                  Export CSV
                </Button>
              </div>
              {loading ? (
                <Spinner />
              ) : dailyData.length === 0 ? (
                <p className="text-center text-gray-400 py-10">No data available</p>
              ) : (
                <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Daily Revenue</h2>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} />
                      <YAxis tickFormatter={(v) => `${currencySymbol}${v}`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={72} />
                      <Tooltip formatter={(v) => [formatCurrency(v), 'Revenue']} />
                      <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Top Products */}
          {activeTab === 'top-products' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={exportTopProducts}>
                  Export CSV
                </Button>
              </div>
              {loading ? (
                <Spinner />
              ) : topData.length === 0 ? (
                <p className="text-center text-gray-400 py-10">No data available</p>
              ) : (
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {['#', 'Product', 'Qty Sold', 'Revenue'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {topData.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-500">{i + 1}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.name ?? p.label}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{p.quantity_sold ?? p.quantity ?? '—'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(p.revenue ?? p.value ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Category */}
          {activeTab === 'category' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={exportCategory}>
                  Export CSV
                </Button>
              </div>
              {loading ? (
                <Spinner />
              ) : catData.length === 0 ? (
                <p className="text-center text-gray-400 py-10">No data available</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Category', 'Revenue'].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {catData.map((c, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.label}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(c.value ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={catData} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={100}>
                          {catData.map((_, index) => (
                            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                        <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cashier Performance */}
          {activeTab === 'cashier' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={exportCashier}>
                  Export CSV
                </Button>
              </div>
              {loading ? (
                <Spinner />
              ) : cashierData.length === 0 ? (
                <p className="text-center text-gray-400 py-10">No data available</p>
              ) : (
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Cashier', 'Transactions', 'Total Revenue'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {cashierData.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.name ?? c.label}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{c.transaction_count ?? c.count ?? 0}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(c.total_revenue ?? c.value ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Profit */}
          {activeTab === 'profit' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={exportProfit}>
                  Export CSV
                </Button>
              </div>
              {loading ? (
                <Spinner />
              ) : profitData.length === 0 ? (
                <p className="text-center text-gray-400 py-10">No data available</p>
              ) : (
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Product', 'Revenue', 'Cost', 'Profit', 'Margin %'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {profitData.map((p, i) => {
                        const margin = p.unrecorded_cost ? null : (p.margin ?? (p.revenue && p.profit != null ? ((p.profit / p.revenue) * 100) : null))
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.name ?? p.label}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{formatCurrency(p.revenue ?? 0)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {p.unrecorded_cost ? (
                                <span className="text-gray-400 italic">Unrecorded</span>
                              ) : (
                                formatCurrency(p.cost ?? 0)
                              )}
                            </td>
                            <td className={`px-4 py-3 text-sm font-semibold ${(p.profit ?? 0) >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
                              {p.unrecorded_cost ? (
                                <span className="text-gray-400 italic">—</span>
                              ) : (
                                formatCurrency(p.profit ?? 0)
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {margin != null ? `${margin.toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Financial Statement Tab */}
          {activeTab === 'financial-statement' && (
            <div className="space-y-6">
              {loading ? (
                <Spinner />
              ) : !financialData ? (
                <p className="text-center text-gray-400 py-10">No financial data available</p>
              ) : (
                <div className="space-y-6">
                  {/* P&L Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm" title={formatCurrency(financialData.gross_sales)}>
                      <p className="text-sm text-gray-500">Gross Sales Revenue</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {formatCompactCurrency(financialData.gross_sales)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Total billing volume</p>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm" title={formatCurrency(financialData.cogs)}>
                      <p className="text-sm text-gray-500">Cost of Goods Sold (COGS)</p>
                      <p className="text-2xl font-bold text-gray-700 mt-1">
                        {formatCompactCurrency(financialData.cogs)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Product acquisition cost</p>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm" title={formatCurrency(financialData.gross_profit)}>
                      <p className="text-sm text-gray-500">Gross Profit (Margin)</p>
                      <p className="text-2xl font-bold text-primary-600 mt-1">
                        {formatCompactCurrency(financialData.gross_profit)}
                      </p>
                      <p className="text-xs text-primary-500 mt-1">
                        Margin: {financialData.gross_profit_margin}%
                      </p>
                    </div>

                    <div
                      className={`border rounded-xl p-5 shadow-sm ${financialData.net_profit >= 0 ? 'bg-success-50/50 border-success-100' : 'bg-danger-50/50 border-danger-100'}`}
                      title={formatCurrency(financialData.net_profit)}
                    >
                      <p className="text-sm text-gray-600 font-medium">Net Profit (Operating)</p>
                      <p className={`text-2xl font-bold mt-1 ${financialData.net_profit >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
                        {formatCompactCurrency(financialData.net_profit)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        After OpEx: {financialData.net_profit_margin}%
                      </p>
                    </div>
                  </div>

                  {/* Cash Flow & Position */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Sales Realization in Period</p>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-gray-600">Immediate Cash / Digital Payments</span>
                        <span className="text-sm font-mono font-bold text-success-600" title={formatCurrency(financialData.cash_collected)}>
                          {formatCompactCurrency(financialData.cash_collected)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-gray-600">Uncollected Credit Extended</span>
                        <span className="text-sm font-mono font-bold text-warning-700" title={formatCurrency(financialData.credit_sales)}>
                          {formatCompactCurrency(financialData.credit_sales)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-sm font-medium text-gray-700">Total Period Billed</span>
                        <span className="text-base font-mono font-bold text-gray-900" title={formatCurrency(financialData.gross_sales)}>
                          {formatCompactCurrency(financialData.gross_sales)}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Global Working Debt Balance</p>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-gray-600">Customer Receivables (Money owed to you)</span>
                        <span className="text-sm font-mono font-bold text-primary-700" title={formatCurrency(financialData.total_customer_receivables)}>
                          {formatCompactCurrency(financialData.total_customer_receivables)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-gray-600">Supplier Payables (Money you owe vendors)</span>
                        <span className="text-sm font-mono font-bold text-danger-600" title={formatCurrency(financialData.total_supplier_payables)}>
                          {formatCompactCurrency(financialData.total_supplier_payables)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-sm font-medium text-gray-700">Net Working Capital Stance</span>
                        <span
                          className={`text-base font-mono font-bold ${financialData.total_customer_receivables >= financialData.total_supplier_payables ? 'text-success-600' : 'text-danger-600'}`}
                          title={formatCurrency(financialData.total_customer_receivables - financialData.total_supplier_payables)}
                        >
                          {formatCompactCurrency(financialData.total_customer_receivables - financialData.total_supplier_payables)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expenses by Category Table */}
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-gray-900">Operating Expenses in Period</h3>
                      <span className="text-sm font-bold text-danger-600 font-mono" title={formatCurrency(financialData.operating_expenses)}>
                        Total OpEx: {formatCompactCurrency(financialData.operating_expenses)}
                      </span>
                    </div>

                    {financialData.expenses_by_category?.length > 0 ? (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">% of OpEx</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {financialData.expenses_by_category.map((item, idx) => {
                              const pct = financialData.operating_expenses > 0
                                ? ((item.amount / financialData.operating_expenses) * 100).toFixed(1)
                                : '0.0'
                              return (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-4 py-2 font-medium text-gray-900">{item.category}</td>
                                  <td className="px-4 py-2 text-right font-mono text-danger-600">{formatCurrency(item.amount)}</td>
                                  <td className="px-4 py-2 text-right text-gray-500 text-xs">{pct}%</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 py-3 text-center">No operating expenses recorded in this period.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
