import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import POSPage from './pages/POSPage'
import ProductsPage from './pages/ProductsPage'
import ProductFormPage from './pages/ProductFormPage'
import ProductCategoriesPage from './pages/ProductCategoriesPage'
import VariationsPage from './pages/VariationsPage'
import BrandsPage from './pages/BrandsPage'
import InventoryPage from './pages/InventoryPage'
import CustomersPage from './pages/CustomersPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import SuppliersPage from './pages/SuppliersPage'
import PurchasesPage from './pages/PurchasesPage'
import SalesPage from './pages/SalesPage'
import SalesReturnsPage from './pages/SalesReturnsPage'
import CreateSaleReturnPage from './pages/CreateSaleReturnPage'
import FinancePage from './pages/FinancePage'
import DashboardPage from './pages/DashboardPage'
import ReportsPage from './pages/ReportsPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import WarehousesPage from './pages/WarehousesPage'
import MigrationPage from './pages/MigrationPage'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white/80 backdrop-blur-xl border border-white/90 shadow-glass rounded-2xl p-6 flex flex-col items-center gap-3">
        <svg className="animate-spin h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loading...</span>
      </div>
    </div>
  )
}

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/pos" replace />

  return children
}

function PublicRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (isAuthenticated) {
    return <Navigate to={['ADMIN', 'MANAGER'].includes(user.role) ? '/dashboard' : '/pos'} replace />
  }

  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />

      {/* Cashier + above */}
      <Route
        path="/pos"
        element={
          <ProtectedRoute roles={['CASHIER', 'MANAGER', 'ADMIN']}>
            <POSPage />
          </ProtectedRoute>
        }
      />

      {/* Products Module Routes (both /app/... and legacy paths) */}
      <Route
        path="/app/products"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <ProductsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <ProductsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/products/new"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <ProductFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products/new"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <ProductFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/products/:id/edit"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <ProductFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products/:id/edit"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <ProductFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/product-categories"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <ProductCategoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/product-categories"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <ProductCategoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/variations"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <VariationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/variations"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <VariationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/brands"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <BrandsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/brands"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <BrandsPage />
          </ProtectedRoute>
        }
      />

      {/* Sales Module Routes (both /app/... and legacy paths) */}
      <Route
        path="/app/sales"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <SalesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <SalesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/sale-return"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <SalesReturnsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sale-return"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <SalesReturnsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/sale-return/create"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <CreateSaleReturnPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sale-return/create"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <CreateSaleReturnPage />
          </ProtectedRoute>
        }
      />

      {/* Other Manager + above routes */}
      <Route
        path="/inventory"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouses"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <WarehousesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <CustomersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers/:id"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <CustomerDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <SuppliersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <PurchasesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN', 'CASHIER']}>
            <FinancePage />
          </ProtectedRoute>
        }
      />

      {/* Manager + Admin */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/migration"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <MigrationPage />
          </ProtectedRoute>
        }
      />

      {/* Redirects */}
      <Route path="/" element={<Navigate to="/pos" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
