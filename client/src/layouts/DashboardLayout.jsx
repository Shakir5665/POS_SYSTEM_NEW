import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { LogoutModal } from '../components/LogoutModal'
import toast from 'react-hot-toast'

function NavItem({ to, icon, label, end = false, badge = null, onClick = null, iconColor = 'text-blue-600 bg-blue-50 border-blue-200/60' }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 ${
          isActive
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-primary-glow font-bold'
            : 'text-slate-700 hover:text-slate-950 hover:bg-white/90 hover:shadow-2xs active:scale-[0.99]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-105 ${
                isActive
                  ? 'bg-white/20 text-white shadow-2xs'
                  : `${iconColor} border shadow-2xs group-hover:brightness-105`
              }`}
            >
              <span className="w-4 h-4">{icon}</span>
            </span>
            <span className="truncate">{label}</span>
          </div>
          {badge && (
            <span
              className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-colors ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-blue-50 text-blue-700 border border-blue-200/80 group-hover:bg-blue-100'
              }`}
            >
              {badge}
            </span>
          )}
          {isActive && (
            <span className="absolute right-2 w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
          )}
        </>
      )}
    </NavLink>
  )
}

function SubNavItem({ to, label, onClick = null }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
          isActive
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-2xs shadow-blue-500/25'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/90 hover:shadow-2xs'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`w-1.5 h-1.5 rounded-full transition-all duration-200 flex-shrink-0 ${
              isActive
                ? 'bg-white scale-125'
                : 'bg-slate-300 group-hover:bg-blue-600 group-hover:scale-125'
            }`}
          />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

function ExpandableNavGroup({ icon, label, children, activePaths = [], iconColor = 'text-blue-600 bg-blue-50 border-blue-200/60' }) {
  const location = useLocation()
  const isAnyChildActive = activePaths.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
  )
  const [userToggled, setUserToggled] = useState(null)
  const [prevActive, setPrevActive] = useState(isAnyChildActive)

  // Adjust state during render when active status changes from route navigation
  if (prevActive !== isAnyChildActive) {
    setPrevActive(isAnyChildActive)
    setUserToggled(null)
  }

  const isOpen = userToggled !== null ? userToggled : isAnyChildActive

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setUserToggled(!isOpen)}
        className={`w-full group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 select-none ${
          isAnyChildActive
            ? 'text-blue-700 bg-blue-50/90 font-bold border border-blue-200/70 shadow-2xs'
            : 'text-slate-700 hover:text-slate-950 hover:bg-white/90 hover:shadow-2xs'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-105 ${
              isAnyChildActive
                ? 'bg-blue-600 text-white shadow-2xs'
                : `${iconColor} border shadow-2xs group-hover:brightness-105`
            }`}
          >
            <span className="w-4 h-4">{icon}</span>
          </span>
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isAnyChildActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
          )}
          <svg
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-250 ease-out group-hover:text-slate-700 ${
              isOpen ? 'rotate-90 text-blue-600' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="pl-4 pr-1 py-1 space-y-1 border-l-2 border-indigo-100 ml-4.5 animate-in fade-in slide-in-from-top-1 duration-150">
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
  transfers: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
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
  const { logo_url: logoUrl } = useSettings()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleConfirmLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
      setShowLogoutModal(false)
      navigate('/login')
      toast.success('Logged out successfully')
    } catch {
      toast.error('Failed to log out cleanly')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const isAdmin = user?.role === 'ADMIN'
  const isManager = user?.role === 'MANAGER' || isAdmin

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Floating Glass Sidebar */}
      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-50 w-64 bg-white/85 backdrop-blur-2xl border-r border-slate-200/80 shadow-glass-md flex flex-col transition-transform duration-200 lg:static lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100/90 bg-white/50 backdrop-blur-sm">
          <img
            src={logoUrl || '/logo.png'}
            alt="Store Logo"
            className="h-9 w-auto max-w-[160px] object-contain drop-shadow-xs"
          />
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-hide">
          {/* 1. OPERATIONS (POS & Daily Workflow) */}
          <div className="pb-1 px-3">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Operations</p>
          </div>
          <NavItem
            to="/pos"
            icon={icons.pos}
            label="Point of Sale"
            iconColor="text-blue-600 bg-blue-50/90 border-blue-200/80"
            end
            onClick={() => setSidebarOpen(false)}
          />

          {isManager && (
            <>
              <NavItem
                to="/dashboard"
                icon={icons.dashboard}
                label="Dashboard"
                iconColor="text-indigo-600 bg-indigo-50/90 border-indigo-200/80"
                onClick={() => setSidebarOpen(false)}
              />

              <ExpandableNavGroup
                icon={icons.sales}
                label="Sales"
                iconColor="text-emerald-600 bg-emerald-50/90 border-emerald-200/80"
                activePaths={['/app/sales', '/sales', '/app/sale-return']}
              >
                <SubNavItem to="/app/sales" label="Sales" onClick={() => setSidebarOpen(false)} />
                <SubNavItem to="/app/sale-return" label="Sales Return" onClick={() => setSidebarOpen(false)} />
              </ExpandableNavGroup>

              <NavItem
                to="/customers"
                icon={icons.customers}
                label="Customers"
                iconColor="text-cyan-600 bg-cyan-50/90 border-cyan-200/80"
                onClick={() => setSidebarOpen(false)}
              />

              {/* 2. CATALOG & INVENTORY */}
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Inventory & Catalog</p>
              </div>

              <ExpandableNavGroup
                icon={icons.products}
                label="Products"
                iconColor="text-amber-600 bg-amber-50/90 border-amber-200/80"
                activePaths={['/app/products', '/products', '/app/product-categories', '/app/variations', '/app/brands']}
              >
                <SubNavItem to="/app/products" label="Products List" onClick={() => setSidebarOpen(false)} />
                <SubNavItem to="/app/product-categories" label="Product Categories" onClick={() => setSidebarOpen(false)} />
                <SubNavItem to="/app/variations" label="Variations" onClick={() => setSidebarOpen(false)} />
                <SubNavItem to="/app/brands" label="Brands" onClick={() => setSidebarOpen(false)} />
              </ExpandableNavGroup>

              <NavItem
                to="/inventory"
                icon={icons.inventory}
                label="Inventory"
                iconColor="text-violet-600 bg-violet-50/90 border-violet-200/80"
                onClick={() => setSidebarOpen(false)}
              />
              <NavItem
                to="/transfers"
                icon={icons.transfers}
                label="Stock Transfers"
                iconColor="text-purple-600 bg-purple-50/90 border-purple-200/80"
                onClick={() => setSidebarOpen(false)}
              />
              <NavItem
                to="/warehouses"
                icon={icons.warehouses}
                label="Branches & Warehouses"
                iconColor="text-sky-600 bg-sky-50/90 border-sky-200/80"
                onClick={() => setSidebarOpen(false)}
              />

              {/* 3. PURCHASES & PROCUREMENT */}
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Procurement</p>
              </div>
              <NavItem
                to="/purchases"
                icon={icons.purchases}
                label="Purchases"
                iconColor="text-teal-600 bg-teal-50/90 border-teal-200/80"
                onClick={() => setSidebarOpen(false)}
              />
              <NavItem
                to="/suppliers"
                icon={icons.suppliers}
                label="Suppliers"
                iconColor="text-orange-600 bg-orange-50/90 border-orange-200/80"
                onClick={() => setSidebarOpen(false)}
              />

              {/* 4. FINANCE & ANALYTICS */}
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Finance & Analytics</p>
              </div>
              <NavItem
                to="/finance"
                icon={icons.finance}
                label="Finance"
                iconColor="text-emerald-600 bg-emerald-50/90 border-emerald-200/80"
                onClick={() => setSidebarOpen(false)}
              />
              <NavItem
                to="/reports"
                icon={icons.reports}
                label="Reports"
                iconColor="text-purple-600 bg-purple-50/90 border-purple-200/80"
                onClick={() => setSidebarOpen(false)}
              />
            </>
          )}

          {/* 5. SYSTEM & ADMINISTRATION */}
          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Administration</p>
              </div>
              <NavItem
                to="/users"
                icon={icons.users}
                label="Users & Access"
                iconColor="text-rose-600 bg-rose-50/90 border-rose-200/80"
                onClick={() => setSidebarOpen(false)}
              />
              <NavItem
                to="/settings"
                icon={icons.settings}
                label="Settings"
                iconColor="text-slate-600 bg-slate-100/90 border-slate-200/80"
                onClick={() => setSidebarOpen(false)}
              />
              <NavItem
                to="/migration"
                icon={icons.migration}
                label="Legacy Migration"
                iconColor="text-fuchsia-600 bg-fuchsia-50/90 border-fuchsia-200/80"
                onClick={() => setSidebarOpen(false)}
              />
            </>
          )}
        </nav>

        {/* User profile card at bottom */}
        <div className="border-t border-slate-100/90 p-3 bg-white/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/90 border border-slate-200/80 shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-extrabold flex-shrink-0 shadow-2xs">
              {user?.full_name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate leading-tight">{user?.full_name}</p>
              <div className="mt-0.5">
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider ${roleBadge[user?.role] || 'bg-slate-100 text-slate-700'}`}>
                  {user?.role}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowLogoutModal(true)}
              title="Sign out"
              className="p-1.5 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
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
        <header className="app-topbar lg:hidden flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-md border-b border-slate-200/80 z-20">
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
            <img src={logoUrl || '/logo.png'} alt="Store Logo" className="h-7 w-auto object-contain" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Glassmorphic Logout Confirmation Modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
        isLoading={isLoggingOut}
      />
    </div>
  )
}
