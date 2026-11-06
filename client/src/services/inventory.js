import api from './api'

export const inventoryService = {
  list: (params) => api.get('/inventory', { params }),
  lowStock: () => api.get('/inventory/low-stock'),
  adjust: (data) => api.post('/inventory/adjust', data),
  restock: (data) => api.post('/inventory/restock', data),
  log: (productId, params) => api.get(`/inventory/log/${productId}`, { params }),
}
