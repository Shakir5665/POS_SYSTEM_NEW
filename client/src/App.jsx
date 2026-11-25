import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AppSplashScreen from './components/loading/AppSplashScreen'
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
import TransfersPage from './pages/TransfersPage'
import MigrationPage from './pages/MigrationPage'

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, isLoading, initializationError, user } = useAuth()

  if (isLoading || initializationError) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/pos" replace />

  return children
}

function PublicRoute({ children }) {
  const { isAuthenticated, isLoading, initializationError, user } = useAuth()

  if (isLoading || initializationError) return null
  if (isAuthenticated) {
    return <Navigate to={['ADMIN', 'MANAGER'].includes(user.role) ? '/dashboard' : '/pos'} replace />
  }

  return children
}

export default function App() {
  const {
    isLoading,
    initializationError,
    initializationAttempt,
    retryInitialization,
  } = useAuth()
  const [slowAttempt, setSlowAttempt] = useState(null)
  const [fadeCompleteAttempt, setFadeCompleteAttempt] = useState(null)

  const isSlow = isLoading && !initializationError && slowAttempt === initializationAttempt
  const isSplashExiting = !isLoading && !initializationError && fadeCompleteAttempt !== initializationAttempt
  const splashVisible = isLoading || initializationError || isSplashExiting

  useEffect(() => {
    window.__nextillBootHandoff?.()
  }, [])

  useEffect(() => {
    if (!isLoading || initializationError) {
      return undefined
    }
    const timer = window.setTimeout(() => setSlowAttempt(initializationAttempt), 8000)
    return () => window.clearTimeout(timer)
  }, [isLoading, initializationError, initializationAttempt])

  useEffect(() => {
    if (isLoading || initializationError) return undefined
    const timer = window.setTimeout(() => setFadeCompleteAttempt(initializationAttempt), 260)
    return () => window.clearTimeout(timer)
  }, [isLoading, initializationError, initializationAttempt])

  return (
    <>
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
        path="/transfers"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <TransfersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/transfers"
        element={
          <ProtectedRoute roles={['MANAGER', 'ADMIN']}>
            <TransfersPage />
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
    {splashVisible && (
      <AppSplashScreen
        isSlow={isSlow}
        hasError={initializationError}
        isExiting={isSplashExiting}
        onRetry={retryInitialization}
      />
    )}
    </>
  )
}
