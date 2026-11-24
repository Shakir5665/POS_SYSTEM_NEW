import api from './api'

export const reportsService = {
  salesSummary: (params) => api.get('/reports/sales-summary', { params }),
  purchasesSummary: (params) => api.get('/reports/purchases-summary', { params }),
  salesReturns: (params) => api.get('/reports/sales-returns', { params }),
  purchaseReturns: (params) => api.get('/reports/purchase-returns', { params }),
  salesByDay: (params) => api.get('/reports/sales-by-day', { params }),
  topProducts: (params) => api.get('/reports/top-products', { params }),
  categoryPerformance: (params) => api.get('/reports/category-performance', { params }),
  cashierPerformance: (params) => api.get('/reports/cashier-performance', { params }),
  inventoryStatus: (params) => api.get('/reports/inventory-status', { params }),
  profit: (params) => api.get('/reports/profit', { params }),
  financialStatement: (params) => api.get('/reports/financial-statement', { params }),
  dashboard: (params) => api.get('/reports/dashboard', { params }),
}
