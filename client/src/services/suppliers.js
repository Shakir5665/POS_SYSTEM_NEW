import api from './api'

export const suppliersService = {
  list: (params) => api.get('/suppliers', { params }),
  get: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  purchases: (id, params) => api.get(`/suppliers/${id}/purchases`, { params }),
  payments: (id, params) => api.get(`/suppliers/${id}/payments`, { params }),
  recordPayment: (id, data) => api.post(`/suppliers/${id}/payments`, data),
  statement: (id) => api.get(`/suppliers/${id}/statement`),
}
