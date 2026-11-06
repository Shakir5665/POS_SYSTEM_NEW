import api from './api'

export const reportsService = {
  salesSummary: (params) => api.get('/reports/sales-summary', { params }),
  salesByDay: (params) => api.get('/reports/sales-by-day', { params }),
  topProducts: (params) => api.get('/reports/top-products', { params }),
  categoryPerformance: (params) => api.get('/reports/category-performance', { params }),
  cashierPerformance: (params) => api.get('/reports/cashier-performance', { params }),
  inventoryStatus: () => api.get('/reports/inventory-status'),
  profit: (params) => api.get('/reports/profit', { params }),
}
