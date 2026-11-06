import api from './api'

export const salesService = {
  create: (data) => api.post('/sales', data),
  list: (params) => api.get('/sales', { params }),
  get: (id) => api.get(`/sales/${id}`),
  receipt: (id) => api.get(`/sales/${id}/receipt`),
  refund: (id) => api.post(`/sales/${id}/refund`),
}
