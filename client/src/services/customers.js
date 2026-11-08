import api from './api'

export const customersService = {
  list: (params) => api.get('/customers', { params }),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  purchases: (id, params) => api.get(`/customers/${id}/purchases`, { params }),
  creditSales: (id, params) => api.get(`/customers/${id}/credit-sales`, { params }),
  payments: (id, params) => api.get(`/customers/${id}/payments`, { params }),
  recordPayment: (id, data) => api.post(`/customers/${id}/payments`, data),
  statement: (id) => api.get(`/customers/${id}/statement`),
}
