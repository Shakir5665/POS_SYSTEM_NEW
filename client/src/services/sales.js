import api from './api'

export const salesService = {
  create: (data) => api.post('/sales', data),
  list: (params) => api.get('/sales', { params }),
  get: (id) => api.get(`/sales/${id}`),
  update: (id, data) => api.put(`/sales/${id}`, data),
  delete: (id, data) => api.delete(`/sales/${id}`, { data }),
  receipt: (id) => api.get(`/sales/${id}/receipt`),
  refund: (id) => api.post(`/sales/${id}/refund`),
  payments: (id) => api.get(`/sales/${id}/payments`),
  voidPayment: (saleId, paymentId, data) => api.post(`/sales/${saleId}/payments/${paymentId}/void`, data),
  downloadPdf: (id, format = 'a4') =>
    api.get(`/sale-pdf-download/${id}`, {
      params: { format },
      responseType: 'blob',
    }),
}
