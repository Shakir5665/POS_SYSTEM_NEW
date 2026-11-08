import api from './api'

export const purchasesService = {
  list: (params) => api.get('/purchases', { params }),
  get: (id) => api.get(`/purchases/${id}`),
  create: (data) => api.post('/purchases', data),
  receive: (id) => api.post(`/purchases/${id}/receive`),
  cancel: (id) => api.post(`/purchases/${id}/cancel`),
}
