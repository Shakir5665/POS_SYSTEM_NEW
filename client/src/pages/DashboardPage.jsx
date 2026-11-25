import { memo, useState, useEffect, useCallback, useRef } from 'react'
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
  Label,
} from 'recharts'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { reportsService } from '../services/reports'
import { warehouseService } from '../services/warehouses'
import { formatCurrency, formatCompactCurrency } from '../utils/formatCurrency'
import { useSettings } from '../hooks/useSettings'
import { subscribeRealtimeEvents } from '../utils/realtime'

// Distinct, restrained jewel tones keep neighboring product slices easy to compare.
const PIE_COLORS = [
  '#3267D8', // Blue
  '#138A78', // Teal
  '#D99624', // Amber
  '#D6536D', // Rose
  '#7656C9', // Violet
  '#1686A3', // Cyan
  '#B85D3B', // Terracotta
  '#56864A', // Leaf green
]

function ProductPieLabel({ name, label, percent, x, y, cx }) {
  const productName = String(name || label || 'Product')
  const compactName = productName.length > 13 ? `${productName.slice(0, 12)}…` : productName
  const share = `${Math.round((percent || 0) * 100)}%`

  return (
    <text
      x={x}
      y={y}
      textAnchor={x >= cx ? 'start' : 'end'}
      dominantBaseline="central"
      fill="#52627a"
      fontSize={9}
      fontWeight={600}
    >
      {`${compactName} ${share}`}
    </text>
  )
}

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

function KpiCard({ title, value, subtitle, icon, iconBg, valueColor = 'text-slate-900', tooltip, to }) {
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
            className={`text-2xl sm:text-3xl font-bold tracking-tight ${valueColor} mt-2 truncate`}
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

const ProductSalesPie = memo(function ProductSalesPie({ productSales, loadingCharts, currencySymbol }) {
  return (
    <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold tracking-tight text-slate-900">Sales by Product</h2>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
          Revenue Share
        </span>
      </div>
      {loadingCharts ? (
        <div className="h-60 bg-slate-100/60 rounded-xl animate-pulse" />
      ) : productSales.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-slate-400 text-xs font-medium">
          No product sales recorded
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={productSales}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={66}
              innerRadius={42}
              paddingAngle={2.5}
              isAnimationActive="auto"
              animationDuration={750}
              animationEasing="ease-out"
              labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
              label={ProductPieLabel}
            >
              {productSales.map((_, index) => (
                <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="#ffffff" strokeWidth={2} />
              ))}
              <Label value="PRODUCTS" position="center" fill="#94a3b8" fontSize={8} fontWeight={700} />
            </Pie>
            <Tooltip formatter={(v) => formatCurrency(v, currencySymbol)} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
})

function getBusinessDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return `${value.year}-${value.month}-${value.day}`
}

function shiftBusinessDate(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

export default function DashboardPage() {
  const { currency_symbol: currencySymbol = 'LKR' } = useSettings()
  const today = getBusinessDateString()

  const [summary, setSummary] = useState(null)
  const [allTimeSales, setAllTimeSales] = useState(null)
  const [allTimePurchases, setAllTimePurchases] = useState(null)
  const [dashboardMetrics, setDashboardMetrics] = useState(null)
  const [dailySales, setDailySales] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [productSales, setProductSales] = useState([])
  const [inventoryStatus, setInventoryStatus] = useState(null)
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')

  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingCharts, setLoadingCharts] = useState(true)
  const [loadingInventory, setLoadingInventory] = useState(true)
  const [isRefreshingRealtime, setIsRefreshingRealtime] = useState(false)
  const [error, setError] = useState(null)

  // Load active warehouses/branches
  useEffect(() => {
    async function loadWarehouses() {
      try {
        const { data } = await warehouseService.list({ is_active: true })
        setWarehouses(data?.data || [])
      } catch (err) {
        console.error('Failed to load branches', err)
      }
    }
    loadWarehouses()
  }, [])

  // Compute last-7-days range using the business calendar (Asia/Colombo).
  const sevenDaysAgoStr = shiftBusinessDate(today, -6)

  const fetchSummary = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoadingSummary(true)
      const whId = selectedWarehouseId || undefined
      const [sumRes, dashRes, allSalesRes, allPurchasesRes] = await Promise.all([
        reportsService.salesSummary({ start_date: today, end_date: today, warehouse_id: whId }),
        reportsService.dashboard({ warehouse_id: whId }),
        reportsService.salesSummary({ start_date: '2000-01-01', end_date: today, warehouse_id: whId }),
        reportsService.purchasesSummary({ start_date: '2000-01-01', end_date: today, warehouse_id: whId }),
      ])
      setSummary(sumRes.data?.data ?? sumRes.data)
      setDashboardMetrics(dashRes.data?.data ?? dashRes.data)
      setAllTimeSales(allSalesRes.data?.data ?? allSalesRes.data)
      setAllTimePurchases(allPurchasesRes.data?.data ?? allPurchasesRes.data)
    } catch {
      if (!isBackground) setError('Failed to load summary data.')
    } finally {
      if (!isBackground) setLoadingSummary(false)
    }
  }, [today, selectedWarehouseId])

  const fetchCharts = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoadingCharts(true)
      const whId = selectedWarehouseId || undefined
      const [dailyRes, topRes, productsRes] = await Promise.all([
        reportsService.salesByDay({ start_date: sevenDaysAgoStr, end_date: today, warehouse_id: whId }),
        reportsService.topProducts({ limit: 5, start_date: sevenDaysAgoStr, end_date: today, warehouse_id: whId }),
        reportsService.topProducts({ limit: 8, start_date: sevenDaysAgoStr, end_date: today, warehouse_id: whId }),
      ])
      setDailySales(dailyRes.data?.data ?? dailyRes.data ?? [])
      setTopProducts(topRes.data?.data ?? topRes.data ?? [])
      setProductSales(productsRes.data?.data ?? productsRes.data ?? [])
    } catch {
      // non-fatal
    } finally {
      if (!isBackground) setLoadingCharts(false)
    }
  }, [sevenDaysAgoStr, today, selectedWarehouseId])

  const fetchInventory = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoadingInventory(true)
      const whId = selectedWarehouseId || undefined
      const res = await reportsService.inventoryStatus({ warehouse_id: whId })
      setInventoryStatus(res.data?.data ?? res.data)
    } catch {
      // non-fatal
    } finally {
      if (!isBackground) setLoadingInventory(false)
    }
  }, [selectedWarehouseId])

  // Initial data load
  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    fetchCharts()
  }, [fetchCharts])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  // Real-time synchronization: instant update on sale events + visibility change + automatic 10s polling
  const refreshTimerRef = useRef(null)
  const refreshAllRealtime = useCallback(async () => {
    setIsRefreshingRealtime(true)
    await Promise.all([
      fetchSummary(true),
      fetchCharts(true),
      fetchInventory(true),
    ])
    setTimeout(() => setIsRefreshingRealtime(false), 600)
  }, [fetchSummary, fetchCharts, fetchInventory])

  useEffect(() => {
    // 1. Listen for real-time events broadcast locally or across tabs
    const unsubscribe = subscribeRealtimeEvents(
      ['sale:created', 'sale:updated', 'sale:cancelled', 'sale:refunded', 'inventory:updated'],
      () => {
        // Debounce rapid events
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = setTimeout(() => {
          refreshAllRealtime()
        }, 150)
      }
    )

    // 2. Poll every 10 seconds while the dashboard tab is active/visible
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshAllRealtime()
      }
    }, 10000)

    // 3. Re-sync immediately when user switches back to this tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAllRealtime()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      unsubscribe()
      clearInterval(interval)
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshAllRealtime])

  const lowStockItems = inventoryStatus?.low_stock ?? []

  const todayRevenue = dashboardMetrics?.today_revenue ?? summary?.total_revenue ?? 0
  const customerReceivables = dashboardMetrics?.total_customer_receivables ?? 0
  const supplierPayables = dashboardMetrics?.total_supplier_payables ?? 0

  const totalSalesAllTime = allTimeSales?.gross_sales ?? allTimeSales?.total_revenue ?? 0
  const salesReturnsAllTime = allTimeSales?.sales_returns ?? 0
  const totalPurchasesAllTime = allTimePurchases?.gross_purchases ?? 0
  const purchaseReturnsAllTime = allTimePurchases?.purchase_returns ?? 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">
              {new Date().toLocaleDateString('en-GH', {
                timeZone: 'Asia/Colombo',
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Branch / Warehouse selector */}
            {warehouses.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/90 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Branch:</span>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  aria-label="Filter dashboard by branch"
                >
                  <option value="">All Branches & Warehouses</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} {wh.is_default ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

        {/* KPI cards - Sales & Operations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loadingSummary ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <KpiCard
                title="Today's Revenue"
                value={formatCompactCurrency(todayRevenue)}
                tooltip={formatCurrency(todayRevenue)}
                subtitle="Daily gross sales performance"
                valueColor="text-blue-700"
                iconBg="bg-blue-50 text-blue-600 border border-blue-100"
                to={`/sales?startDate=${today}&endDate=${today}`}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <KpiCard
                title="Total Sales"
                value={formatCompactCurrency(totalSalesAllTime)}
                tooltip={formatCurrency(totalSalesAllTime)}
                subtitle="All-time gross sales turnover"
                valueColor="text-emerald-700"
                iconBg="bg-emerald-50 text-emerald-600 border border-emerald-100"
                to="/sales"
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                }
              />
              <KpiCard
                title="Sales Returns"
                value={formatCompactCurrency(salesReturnsAllTime)}
                tooltip={formatCurrency(salesReturnsAllTime)}
                subtitle="Customer refunds & return credits"
                valueColor="text-rose-700"
                iconBg="bg-rose-50 text-rose-600 border border-rose-100"
                to="/sale-return"
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                }
              />
              <KpiCard
                title="Customer Receivables"
                value={formatCompactCurrency(customerReceivables)}
                tooltip={formatCurrency(customerReceivables)}
                subtitle="Outstanding credit due from customers"
                valueColor="text-amber-700"
                iconBg="bg-amber-50 text-amber-600 border border-amber-100"
                to="/customers"
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              />
            </>
          )}
        </div>

        {/* KPI cards - Purchases & Inventory */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loadingSummary ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <KpiCard
                title="Total Purchases"
                value={formatCompactCurrency(totalPurchasesAllTime)}
                tooltip={formatCurrency(totalPurchasesAllTime)}
                subtitle="All-time inventory procurement"
                valueColor="text-teal-700"
                iconBg="bg-teal-50 text-teal-700 border border-teal-100"
                to="/purchases"
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                }
              />
              <KpiCard
                title="Purchase Returns"
                value={formatCompactCurrency(purchaseReturnsAllTime)}
                tooltip={formatCurrency(purchaseReturnsAllTime)}
                subtitle="Goods returned to suppliers"
                valueColor="text-fuchsia-700"
                iconBg="bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100"
                to="/purchases?tab=returns"
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                }
              />
              <KpiCard
                title="Supplier Payables"
                value={formatCompactCurrency(supplierPayables)}
                tooltip={formatCurrency(supplierPayables)}
                subtitle="Outstanding payables due to vendors"
                valueColor="text-cyan-800"
                iconBg="bg-cyan-50 text-cyan-700 border border-cyan-100"
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
                valueColor="text-orange-700"
                iconBg="bg-orange-50 text-orange-600 border border-orange-100"
                to="/inventory?tab=low"
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                }
              />
            </>
          )}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Revenue line chart */}
          <div className="xl:col-span-2 bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-slate-900">Revenue - Last 7 Days</h2>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isRefreshingRealtime ? 'animate-ping' : ''}`} />
                  Live
                </span>
              </div>
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

          {/* Product pie chart */}
          <ProductSalesPie
            productSales={productSales}
            loadingCharts={loadingCharts}
            currencySymbol={currencySymbol}
          />
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
