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
import { PageHeader } from '../components/PageHeader'
import { GlassCard } from '../components/GlassCard'
import { reportsService } from '../services/reports'
import { formatCurrency, formatCompactCurrency, formatCompactNumber } from '../utils/formatCurrency'
import { useSettings } from '../hooks/useSettings'
import { exportCsv } from '../utils/csv'

const PIE_COLORS = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2']

const TABS = [
  { id: 'summary', label: 'Sales Summary' },
  { id: 'purchases-summary', label: 'Purchases Summary' },
  { id: 'sales-returns', label: 'Sales Returns Report' },
  { id: 'purchase-returns', label: 'Purchase Returns Report' },
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

function KpiCard({ label, value, tooltip, subtitle, highlight = false, danger = false }) {
  let borderColor = 'border-white/80'
  let bgGradient = 'bg-white/80'
  let valColor = 'text-slate-900'

  if (danger) {
    borderColor = 'border-red-200/60'
    bgGradient = 'bg-gradient-to-br from-red-50/60 to-white/80'
    valColor = 'text-red-600'
  } else if (highlight) {
    borderColor = 'border-primary-200/60'
    bgGradient = 'bg-gradient-to-br from-blue-50/60 to-indigo-50/40'
    valColor = 'text-primary-700'
  }

  return (
    <div
      className={`rounded-2xl p-5 backdrop-blur-md border ${borderColor} ${bgGradient} shadow-glass-sm transition-all duration-200 hover:shadow-glass hover:-translate-y-0.5`}
      title={tooltip}
    >
      <p className="text-xs uppercase tracking-wider font-bold text-slate-500">{label}</p>
      <p className={`text-2xl font-black font-mono mt-1 ${valColor}`}>
        {value}
      </p>
      {subtitle && <p className="text-2xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  )
}

export default function ReportsPage() {
  const { currency_symbol: currencySymbol = 'LKR' } = useSettings()
  const fmt = (v) => formatCurrency(v, currencySymbol)

  const [activeTab, setActiveTab] = useState('summary')
  const [startDate, setStartDate] = useState(formatDate(-29))
  const [endDate, setEndDate] = useState(formatDate(0))
  const [loading, setLoading] = useState(false)

  const [summaryData, setSummaryData] = useState(null)
  const [purchasesSummaryData, setPurchasesSummaryData] = useState(null)
  const [salesReturnsData, setSalesReturnsData] = useState(null)
  const [purchaseReturnsData, setPurchaseReturnsData] = useState(null)
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
        } else if (tab === 'purchases-summary') {
          const res = await reportsService.purchasesSummary(params)
          setPurchasesSummaryData(res.data?.data ?? res.data)
        } else if (tab === 'sales-returns') {
          const res = await reportsService.salesReturns(params)
          setSalesReturnsData(res.data?.data ?? res.data)
        } else if (tab === 'purchase-returns') {
          const res = await reportsService.purchaseReturns(params)
          setPurchaseReturnsData(res.data?.data ?? res.data)
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
        ['Gross Sales', summaryData.gross_sales ?? summaryData.total_revenue ?? 0],
        ['Sales Returns', summaryData.sales_returns ?? 0],
        ['Net Sales Revenue', summaryData.net_sales ?? summaryData.total_revenue ?? 0],
        ['Transaction Count', summaryData.transaction_count ?? 0],
        ['Returns Count', summaryData.sales_return_count ?? 0],
        ['Average Sale', summaryData.average_sale ?? 0],
        ['Total Discount', summaryData.total_discount ?? 0],
        ['Total Tax', summaryData.total_tax ?? 0],
      ]
    )
  }

  function exportPurchasesSummary() {
    if (!purchasesSummaryData) return
    exportCsv(
      'purchases-summary.csv',
      ['Metric', 'Value'],
      [
        ['Gross Purchases', purchasesSummaryData.gross_purchases ?? 0],
        ['Purchase Returns', purchasesSummaryData.purchase_returns ?? 0],
        ['Net Purchases Cost', purchasesSummaryData.net_purchases ?? 0],
        ['Orders Count', purchasesSummaryData.order_count ?? purchasesSummaryData.purchase_count ?? 0],
        ['Returns Count', purchasesSummaryData.return_count ?? purchasesSummaryData.purchase_return_count ?? 0],
        ['Average Order', purchasesSummaryData.average_order ?? 0],
      ]
    )
  }

  function exportSalesReturns() {
    if (!salesReturnsData?.returns) return
    exportCsv(
      'sales-returns.csv',
      ['Return #', 'Date', 'Original Sale', 'Customer', 'Refund Amount', 'Refund Method', 'Reason', 'Handled By'],
      salesReturnsData.returns.map((r) => [
        `"${r.return_number}"`,
        `"${new Date(r.return_date || r.created_at).toLocaleDateString()}"`,
        `"${r.sale?.transaction_id || ''}"`,
        `"${r.customer?.name || 'Walk-in'}"`,
        r.total_refund_amount ?? 0,
        `"${r.refund_method || 'CASH'}"`,
        `"${r.reason || ''}"`,
        `"${r.user?.full_name || ''}"`,
      ])
    )
  }

  function exportPurchaseReturns() {
    if (!purchaseReturnsData?.returns) return
    exportCsv(
      'purchase-returns.csv',
      ['Return #', 'Date', 'Original PO', 'Supplier', 'Total Amount', 'Status', 'Reason', 'Handled By'],
      purchaseReturnsData.returns.map((r) => [
        `"${r.return_number}"`,
        `"${new Date(r.return_date || r.created_at).toLocaleDateString()}"`,
        `"${r.purchase?.purchase_number || ''}"`,
        `"${r.supplier?.name || ''}"`,
        r.total_amount ?? 0,
        `"${r.settlement_status || 'PENDING'}"`,
        `"${r.reason || ''}"`,
        `"${r.user?.full_name || ''}"`,
      ])
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
      cashierData.map((c) => [`"${c.name ?? c.label}"`, c.transactions ?? c.transaction_count ?? c.count ?? 0, c.total_revenue ?? c.value ?? 0])
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
        <PageHeader
          title="Reports & Business Analytics"
          subtitle="Financial performance, net revenue accounting, customer & supplier returns, and profitability"
        />

        {/* Date range */}
        <GlassCard className="p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-200/80 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white/90 shadow-2xs font-medium text-slate-800"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">End Date</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-200/80 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white/90 shadow-2xs font-medium text-slate-800"
            />
          </div>
          <Button onClick={handleApply} isLoading={loading}>
            Apply Filters
          </Button>
        </GlassCard>

        {/* Tabs */}
        <div className="flex gap-1.5 p-1 bg-white/70 backdrop-blur-md rounded-2xl border border-white/80 shadow-glass-sm w-fit overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-150 ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-primary-glow font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {/* 1. Sales Summary */}
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
                <div className="space-y-4">
                  {/* Top Net Sales Breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard
                      label="Gross Sales"
                      value={fmt(summaryData.gross_sales ?? summaryData.total_revenue ?? 0)}
                      tooltip={fmt(summaryData.gross_sales ?? summaryData.total_revenue ?? 0)}
                      subtitle="Total transaction billing volume"
                    />
                    <KpiCard
                      label="Sales Returns (Refunds)"
                      value={fmt(summaryData.sales_returns ?? 0)}
                      tooltip={fmt(summaryData.sales_returns ?? 0)}
                      subtitle={`${summaryData.sales_return_count ?? 0} returns processed`}
                      danger
                    />
                    <KpiCard
                      label="Net Sales Revenue"
                      value={fmt(summaryData.net_sales ?? summaryData.total_revenue ?? 0)}
                      tooltip={fmt(summaryData.net_sales ?? summaryData.total_revenue ?? 0)}
                      subtitle="Gross Sales minus Customer Returns"
                      highlight
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <KpiCard
                      label="Transactions"
                      value={
                        summaryData.transaction_count != null && summaryData.transaction_count >= 1000
                          ? formatCompactNumber(summaryData.transaction_count)
                          : summaryData.transaction_count ?? 0
                      }
                      tooltip={String(summaryData.transaction_count ?? 0)}
                    />
                    <KpiCard
                      label="Average Sale"
                      value={formatCompactCurrency(summaryData.average_sale ?? 0)}
                      tooltip={fmt(summaryData.average_sale ?? 0)}
                    />
                    <KpiCard
                      label="Total Discount"
                      value={formatCompactCurrency(summaryData.total_discount ?? 0)}
                      tooltip={fmt(summaryData.total_discount ?? 0)}
                    />
                    <KpiCard
                      label="Total Tax"
                      value={formatCompactCurrency(summaryData.total_tax ?? 0)}
                      tooltip={fmt(summaryData.total_tax ?? 0)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Purchases Summary */}
          {activeTab === 'purchases-summary' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={exportPurchasesSummary}>
                  Export CSV
                </Button>
              </div>
              {loading ? (
                <Spinner />
              ) : !purchasesSummaryData ? (
                <p className="text-center text-gray-400 py-10">No purchases data available</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard
                      label="Gross Purchases"
                      value={fmt(purchasesSummaryData.gross_purchases ?? 0)}
                      tooltip={fmt(purchasesSummaryData.gross_purchases ?? 0)}
                      subtitle="Total PO invoice volume"
                    />
                    <KpiCard
                      label="Purchase Returns (Defects)"
                      value={fmt(purchasesSummaryData.purchase_returns ?? 0)}
                      tooltip={fmt(purchasesSummaryData.purchase_returns ?? 0)}
                      subtitle={`${purchasesSummaryData.return_count ?? purchasesSummaryData.purchase_return_count ?? 0} supplier returns`}
                      danger
                    />
                    <KpiCard
                      label="Net Purchases Cost"
                      value={fmt(purchasesSummaryData.net_purchases ?? 0)}
                      tooltip={fmt(purchasesSummaryData.net_purchases ?? 0)}
                      subtitle="Gross Purchases minus Supplier Returns"
                      highlight
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <KpiCard
                      label="Total Purchase Orders"
                      value={purchasesSummaryData.order_count ?? purchasesSummaryData.purchase_count ?? 0}
                      tooltip={String(purchasesSummaryData.order_count ?? purchasesSummaryData.purchase_count ?? 0)}
                    />
                    <KpiCard
                      label="Average Purchase Order"
                      value={fmt(purchasesSummaryData.average_order ?? 0)}
                      tooltip={fmt(purchasesSummaryData.average_order ?? 0)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Sales Returns Report */}
          {activeTab === 'sales-returns' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={exportSalesReturns}>
                  Export CSV
                </Button>
              </div>
              {loading ? (
                <Spinner />
              ) : !salesReturnsData ? (
                <p className="text-center text-gray-400 py-10">No sales returns data available</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <KpiCard
                      label="Total Customer Refunds in Period"
                      value={fmt(salesReturnsData.total_refunded ?? salesReturnsData.total_refund_amount ?? 0)}
                      danger
                    />
                    <KpiCard
                      label="Total Returns Count"
                      value={salesReturnsData.count ?? salesReturnsData.total_returns_count ?? 0}
                    />
                  </div>

                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Return #</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Original Sale</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Customer</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Reason</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Refund Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {(salesReturnsData.returns || []).map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono font-semibold text-primary-600">{r.return_number}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {new Date(r.return_date || r.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 font-mono text-gray-700">{r.sale?.transaction_id || '—'}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{r.customer?.name || 'Walk-in'}</td>
                            <td className="px-4 py-3 text-gray-600 italic">{r.reason || '—'}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-danger-700">
                              {fmt(r.total_refund_amount ?? r.refund_amount ?? 0)}
                            </td>
                          </tr>
                        ))}
                        {(!salesReturnsData.returns || salesReturnsData.returns.length === 0) && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                              No customer sales returns recorded in this date range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Purchase Returns Report */}
          {activeTab === 'purchase-returns' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={exportPurchaseReturns}>
                  Export CSV
                </Button>
              </div>
              {loading ? (
                <Spinner />
              ) : !purchaseReturnsData ? (
                <p className="text-center text-gray-400 py-10">No purchase returns data available</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <KpiCard
                      label="Total Supplier Returns in Period"
                      value={fmt(purchaseReturnsData.total_returned ?? purchaseReturnsData.total_return_amount ?? 0)}
                      danger
                    />
                    <KpiCard
                      label="Total Defect Dispatches Count"
                      value={purchaseReturnsData.count ?? purchaseReturnsData.total_returns_count ?? 0}
                    />
                  </div>

                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Return #</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Original PO</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Supplier</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Reason</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Return Value</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {(purchaseReturnsData.returns || []).map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono font-semibold text-primary-600">{r.return_number}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {new Date(r.return_date || r.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 font-mono text-gray-700">{r.purchase?.purchase_number || '—'}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{r.supplier?.name || '—'}</td>
                            <td className="px-4 py-3 text-gray-600 italic">{r.reason || '—'}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-danger-700">
                              {fmt(r.total_amount ?? r.return_value ?? 0)}
                            </td>
                          </tr>
                        ))}
                        {(!purchaseReturnsData.returns || purchaseReturnsData.returns.length === 0) && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                              No vendor purchase returns recorded in this date range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. Daily Sales */}
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

          {/* 6. Top Products */}
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

          {/* 7. Category */}
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

          {/* 8. Cashier Performance */}
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
                          <td className="px-4 py-3 text-sm text-gray-700">{c.transactions ?? c.transaction_count ?? c.count ?? 0}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(c.total_revenue ?? c.value ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 9. Profit */}
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

          {/* 10. Financial Statement Tab */}
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
