import api from './api'

export const stockAdjustmentService = {
  list: (params) => api.get('/inventory/adjustments', { params }),
  get: (id) => api.get(`/inventory/adjustments/${id}`),
  create: (data) => api.post('/inventory/adjustments', data),
}

export default stockAdjustmentService
