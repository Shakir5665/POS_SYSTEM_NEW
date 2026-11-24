import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

function NavItem({ to, icon, label, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
          isActive
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-2xs shadow-blue-500/20'
            : 'text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:shadow-2xs'
        }`
      }
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

function SubNavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          isActive
            ? 'bg-blue-600 text-white font-semibold shadow-2xs'
            : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
        }`
      }
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

function ExpandableNavGroup({ icon, label, children, activePaths = [] }) {
  const location = useLocation()
  const isAnyChildActive = activePaths.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
  )
  const [open, setOpen] = useState(isAnyChildActive)

  useEffect(() => {
    if (isAnyChildActive) {
      setOpen(true)
    }
  }, [isAnyChildActive])

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
          isAnyChildActive
            ? 'text-primary-700 bg-blue-50/80 font-bold border border-blue-100/60'
            : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 flex-shrink-0">{icon}</span>
          <span>{label}</span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-90 text-primary-600' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="pl-6 pr-1 py-1 space-y-1 border-l-2 border-indigo-100 ml-4">
          {children}
        </div>
      )}
    </div>
  )
}

const icons = {
  pos: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  products: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  inventory: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  customers: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  sales: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
    </svg>
  ),
  dashboard: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zm0 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  ),
  reports: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  users: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  purchases: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  suppliers: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
    </svg>
  ),
  finance: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warehouses: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  migration: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  settings: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

const roleBadge = {
  ADMIN: 'bg-rose-50 text-rose-700 border border-rose-200/80',
  MANAGER: 'bg-amber-50 text-amber-700 border border-amber-200/80',
  CASHIER: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
}

export function DashboardLayout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
    toast.success('Logged out successfully')
  }

  const isAdmin = user?.role === 'ADMIN'
  const isManager = user?.role === 'MANAGER' || isAdmin

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Floating Glass Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white/80 backdrop-blur-xl border-r border-slate-200/80 shadow-glass-sm flex flex-col transition-transform duration-200 lg:static lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100/90 bg-white/40">
          <img src="/logo.png" alt="NexTill Logo" className="h-9 w-auto max-w-[160px] object-contain" />
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1 scrollbar-hide">
          <NavItem to="/pos" icon={icons.pos} label="Point of Sale" end />

          {isManager && (
            <>
              <div className="pt-3 pb-1 px-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Management</p>
              </div>
              <ExpandableNavGroup
                icon={icons.products}
                label="Products"
                activePaths={['/app/products', '/products', '/app/product-categories', '/app/variations', '/app/brands']}
              >
                <SubNavItem to="/app/products" label="Products List" />
                <SubNavItem to="/app/product-categories" label="Product Categories" />
                <SubNavItem to="/app/variations" label="Variations" />
                <SubNavItem to="/app/brands" label="Brands" />
              </ExpandableNavGroup>
              <NavItem to="/inventory" icon={icons.inventory} label="Inventory" />
              <NavItem to="/warehouses" icon={icons.warehouses} label="Warehouses" />
              <NavItem to="/purchases" icon={icons.purchases} label="Purchases" />
              <NavItem to="/suppliers" icon={icons.suppliers} label="Suppliers" />
              <NavItem to="/customers" icon={icons.customers} label="Customers" />
              <ExpandableNavGroup
                icon={icons.sales}
                label="Sales"
                activePaths={['/app/sales', '/sales', '/app/sale-return']}
              >
                <SubNavItem to="/app/sales" label="Sales" />
                <SubNavItem to="/app/sale-return" label="Sales Return" />
              </ExpandableNavGroup>
              <NavItem to="/finance" icon={icons.finance} label="Finance" />
            </>
          )}

          {isManager && (
            <>
              <div className="pt-3 pb-1 px-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Analytics</p>
              </div>
              <NavItem to="/dashboard" icon={icons.dashboard} label="Dashboard" />
              <NavItem to="/reports" icon={icons.reports} label="Reports" />
            </>
          )}

          {isAdmin && (
            <>
              <div className="pt-3 pb-1 px-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Admin</p>
              </div>
              <NavItem to="/users" icon={icons.users} label="Users" />
              <NavItem to="/settings" icon={icons.settings} label="Settings" />
              <NavItem to="/migration" icon={icons.migration} label="Legacy Migration" />
            </>
          )}
        </nav>

        {/* User info card at bottom */}
        <div className="border-t border-slate-100/90 p-3 bg-white/40">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-white/80 border border-slate-200/80 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-2xs">
              {user?.full_name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{user?.full_name}</p>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${roleBadge[user?.role] || 'bg-slate-100 text-slate-700'}`}>
                {user?.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-600 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-md border-b border-slate-200/80 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 focus:outline-none"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <img src="/logo.png" alt="NexTill" className="h-7 w-auto object-contain" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
