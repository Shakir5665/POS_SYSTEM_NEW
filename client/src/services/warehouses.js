import api from './api'

export const warehouseService = {
  list: (params) => api.get('/warehouses', { params }),
  get: (id) => api.get(`/warehouses/${id}`),
  getDefault: () => api.get('/warehouses/default'),
  create: (data) => api.post('/warehouses', data),
  update: (id, data) => api.put(`/warehouses/${id}`, data),
}

export default warehouseService
