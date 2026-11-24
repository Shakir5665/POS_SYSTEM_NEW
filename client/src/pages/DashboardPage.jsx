import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { reportsService } from '../services/reports'
import { formatCurrency, formatCompactCurrency } from '../utils/formatCurrency'
import { useSettings } from '../hooks/useSettings'

const PIE_COLORS = ['#2563EB', '#6366F1', '#10B981', '#F59E0B', '#EC4899', '#06B6D4']

function SkeletonCard() {
  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 sm:p-6 border border-white/90 shadow-glass-sm animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="h-3.5 bg-slate-200/70 rounded-md w-1/2 mb-3" />
          <div className="h-8 bg-slate-200/70 rounded-lg w-3/4 mb-2" />
          <div className="h-3 bg-slate-200/50 rounded-md w-1/3" />
        </div>
        <div className="w-12 h-12 bg-slate-200/70 rounded-xl flex-shrink-0" />
      </div>
    </div>
  )
}

function KpiCard({ title, value, subtitle, icon, iconBg, tooltip, to }) {
  const displayTooltip =
    tooltip !== undefined
      ? tooltip
      : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : undefined

  const cardContent = (
    <div
      className={`relative overflow-hidden bg-white/85 backdrop-blur-md rounded-2xl p-5 sm:p-6 border border-white/90 shadow-glass-sm transition-all duration-200 ${
        to
          ? 'hover:shadow-glass hover:border-indigo-100 hover:-translate-y-0.5 cursor-pointer group'
          : ''
      }`}
      title={displayTooltip}
    >
      {/* Subtle ambient corner gradient */}
      <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 rounded-full bg-gradient-to-br from-indigo-100/40 to-primary-100/0 pointer-events-none" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-primary-600 transition-colors">
            {title}
          </p>
          <p
            className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2 truncate"
            title={displayTooltip}
          >
            {value}
          </p>
          {subtitle && <p className="text-xs text-slate-400 mt-1.5 truncate">{subtitle}</p>}
        </div>

        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-2xs transition-transform duration-200 ${
            to ? 'group-hover:scale-105' : ''
          } ${iconBg}`}
        >
          {icon}
        </div>
      </div>

      {to && (
        <div className="mt-3 pt-3 border-t border-slate-100/80 flex items-center justify-between text-xs font-medium text-slate-400 group-hover:text-primary-600 transition-colors">
          <span>View details</span>
          <svg
            className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </div>
  )

  if (to) {
    return (
      <Link
        to={to}
        className="block focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-2xl"
      >
        {cardContent}
      </Link>
    )
  }

  return cardContent
}

function CustomTooltip({ active, payload, label, currencySymbol }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/90 shadow-glass text-xs">
        <p className="font-semibold text-slate-700">{label}</p>
        <p className="font-bold text-primary-600 mt-0.5">
          {formatCurrency(payload[0].value, currencySymbol)}
        </p>
      </div>
    )
  }
  return null
}

export default function DashboardPage() {
  const { currency_symbol: currencySymbol = 'LKR' } = useSettings()
  const today = new Date().toISOString().split('T')[0]

  const [summary, setSummary] = useState(null)
  const [dashboardMetrics, setDashboardMetrics] = useState(null)
  const [dailySales, setDailySales] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [inventoryStatus, setInventoryStatus] = useState(null)

  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingCharts, setLoadingCharts] = useState(true)
  const [loadingInventory, setLoadingInventory] = useState(true)
  const [error, setError] = useState(null)

  // Compute last-7-days range
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  useEffect(() => {
    async function fetchSummary() {
      try {
        const [sumRes, dashRes] = await Promise.all([
          reportsService.salesSummary({ start_date: today, end_date: today }),
          reportsService.dashboard(),
        ])
        setSummary(sumRes.data?.data ?? sumRes.data)
        setDashboardMetrics(dashRes.data?.data ?? dashRes.data)
      } catch {
        setError('Failed to load summary data.')
      } finally {
        setLoadingSummary(false)
      }
    }
    fetchSummary()
  }, [today])

  useEffect(() => {
    async function fetchCharts() {
      try {
        const [dailyRes, topRes, catRes] = await Promise.all([
          reportsService.salesByDay({ start_date: sevenDaysAgoStr, end_date: today }),
          reportsService.topProducts({ limit: 5, start_date: sevenDaysAgoStr, end_date: today }),
          reportsService.categoryPerformance({ start_date: sevenDaysAgoStr, end_date: today }),
        ])
        setDailySales(dailyRes.data?.data ?? dailyRes.data ?? [])
        setTopProducts(topRes.data?.data ?? topRes.data ?? [])
        setCategories(catRes.data?.data ?? catRes.data ?? [])
      } catch {
        // non-fatal
      } finally {
        setLoadingCharts(false)
      }
    }
    fetchCharts()
  }, [sevenDaysAgoStr, today])

  useEffect(() => {
    async function fetchInventory() {
      try {
        const res = await reportsService.inventoryStatus()
        setInventoryStatus(res.data?.data ?? res.data)
      } catch {
        // non-fatal
      } finally {
        setLoadingInventory(false)
      }
    }
    fetchInventory()
  }, [])

  const lowStockItems = inventoryStatus?.low_stock ?? []

  const todayRevenue = dashboardMetrics?.today_revenue ?? summary?.total_revenue ?? 0
  const todayCollections = dashboardMetrics?.today_collections ?? summary?.total_collected ?? 0
  const todayCredit = dashboardMetrics?.today_credit_sales ?? summary?.total_credit ?? 0
  const customerReceivables = dashboardMetrics?.total_customer_receivables ?? 0
  const supplierPayables = dashboardMetrics?.total_supplier_payables ?? 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">
              {new Date().toLocaleDateString('en-GH', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/pos"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-2xs hover:shadow-primary-glow transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Open Terminal (POS)
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50/90 border border-rose-200/80 text-rose-700 rounded-2xl px-4 py-3 text-xs font-medium shadow-2xs">
            {error}
          </div>
        )}

        {/* KPI cards - Sales & Collections */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loadingSummary ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <KpiCard
                title="Today's Revenue"
                value={formatCompactCurrency(todayRevenue)}
                tooltip={formatCurrency(todayRevenue)}
                subtitle="Total value of goods sold"
                iconBg="bg-blue-50 text-blue-600 border border-blue-100"
                to={`/sales?startDate=${today}&endDate=${today}`}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <KpiCard
                title="Cash Collected Today"
                value={formatCompactCurrency(todayCollections)}
                tooltip={formatCurrency(todayCollections)}
                subtitle="Physical cash & electronic receipts"
                iconBg="bg-emerald-50 text-emerald-600 border border-emerald-100"
                to="/finance"
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
              />
              <KpiCard
                title="Today's Credit Sales"
                value={formatCompactCurrency(todayCredit)}
                tooltip={formatCurrency(todayCredit)}
                subtitle="Dispatched on customer credit"
                iconBg="bg-indigo-50 text-indigo-600 border border-indigo-100"
                to="/customers"
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                }
              />
              <KpiCard
                title="Today's Transactions"
                value={dashboardMetrics?.today_transactions ?? summary?.transaction_count ?? 0}
                subtitle="Completed checkouts"
                iconBg="bg-teal-50 text-teal-600 border border-teal-100"
                to={`/sales?startDate=${today}&endDate=${today}`}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                }
              />
            </>
          )}
        </div>

        {/* KPI cards - Balance & Inventory */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Customer Receivables"
            value={formatCompactCurrency(customerReceivables)}
            tooltip={formatCurrency(customerReceivables)}
            subtitle="Outstanding credit due from customers"
            iconBg="bg-amber-50 text-amber-600 border border-amber-100"
            to="/customers"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <KpiCard
            title="Supplier Payables"
            value={formatCompactCurrency(supplierPayables)}
            tooltip={formatCurrency(supplierPayables)}
            subtitle="Outstanding payables due to vendors"
            iconBg="bg-rose-50 text-rose-600 border border-rose-100"
            to="/suppliers"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
              </svg>
            }
          />
          <KpiCard
            title="Low Stock Alerts"
            value={loadingInventory ? '...' : dashboardMetrics?.low_stock_alerts ?? lowStockItems.length}
            subtitle="Products below reorder threshold"
            iconBg="bg-orange-50 text-orange-600 border border-orange-100"
            to="/inventory?tab=low"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
          <KpiCard
            title="Total Active Products"
            value={inventoryStatus?.total_products ?? (loadingInventory ? '...' : 0)}
            subtitle="Catalog items active in inventory"
            iconBg="bg-purple-50 text-purple-600 border border-purple-100"
            to="/products"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            }
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Revenue line chart */}
          <div className="xl:col-span-2 bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold tracking-tight text-slate-900">Revenue — Last 7 Days</h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                Performance
              </span>
            </div>
            {loadingCharts ? (
              <div className="h-60 bg-slate-100/60 rounded-xl animate-pulse" />
            ) : dailySales.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-slate-400 text-xs font-medium">
                No revenue recorded in the last 7 days
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={dailySales} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${currencySymbol}${v}`}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip currencySymbol={currencySymbol} />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#2563EB"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#2563EB', stroke: '#ffffff', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#1D4ED8', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Category pie chart */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6">
            <h2 className="text-sm font-bold tracking-tight text-slate-900 mb-4">Sales by Category</h2>
            {loadingCharts ? (
              <div className="h-60 bg-slate-100/60 rounded-xl animate-pulse" />
            ) : categories.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-slate-400 text-xs font-medium">
                No categorical sales recorded
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={48}
                    paddingAngle={3}
                    labelLine={false}
                  >
                    {categories.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="#ffffff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(v, currencySymbol)} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#475569' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Top 5 products */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold tracking-tight text-slate-900">Top 5 Products (Last 7 Days)</h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                Best Sellers
              </span>
            </div>
            {loadingCharts ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100/70 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : topProducts.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center font-medium">No sales recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                      <th className="pb-3 w-8">#</th>
                      <th className="pb-3">Product</th>
                      <th className="pb-3 text-right">Qty</th>
                      <th className="pb-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80">
                    {topProducts.map((p, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="py-3 text-slate-400 font-bold">{i + 1}</td>
                        <td className="py-3 text-slate-900 font-semibold truncate max-w-[180px]">
                          {p.name || p.label}
                        </td>
                        <td className="py-3 text-right text-slate-600 font-medium">
                          {p.quantity_sold ?? p.quantity ?? '—'}
                        </td>
                        <td className="py-3 text-right font-bold text-slate-900">
                          {formatCurrency(p.revenue ?? p.value ?? 0, currencySymbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Low stock alerts */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-slate-900">Low Stock Alerts</h2>
                {lowStockItems.length > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    {lowStockItems.length}
                  </span>
                )}
              </div>
              <Link
                to="/inventory"
                className="text-xs font-semibold text-primary-600 hover:text-indigo-600 transition-colors"
              >
                View all inventory →
              </Link>
            </div>
            {loadingInventory ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100/70 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : lowStockItems.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2 border border-emerald-100">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-600">All products are well stocked</p>
                <p className="text-2xs text-slate-400 mt-0.5">No products currently below their reorder threshold</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {lowStockItems.slice(0, 8).map((item, i) => (
                  <li
                    key={item.id ?? i}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-slate-50/60 hover:bg-slate-100/60 border border-slate-100 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">SKU: {item.sku}</p>
                    </div>
                    <span
                      className={`ml-3 text-xs font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 border ${
                        item.quantity === 0
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {item.quantity === 0 ? 'Out of stock' : `${item.quantity} left`}
                    </span>
                  </li>
                ))}
                {lowStockItems.length > 8 && (
                  <li className="pt-2 text-center">
                    <Link to="/inventory" className="text-xs font-semibold text-primary-600 hover:underline">
                      +{lowStockItems.length - 8} more items needing attention
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
