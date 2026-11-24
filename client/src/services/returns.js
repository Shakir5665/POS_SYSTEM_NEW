import api from './api'

export const returnsService = {
  // Sales Returns
  getSaleEligibility: (saleId) => api.get(`/sales/${saleId}/eligibility`),
  createSalesReturn: (data) => api.post('/sales/returns', data),
  listSalesReturns: (params) => api.get('/sales/returns', { params }),
  getSalesReturn: (id) => api.get(`/sales/returns/${id}`),
  deleteSalesReturn: (id, data) => api.delete(`/sales/returns/${id}`, { data }),
  downloadPdf: (id, format = 'a4') =>
    api.get(`/sale-return-pdf-download/${id}`, {
      params: { format },
      responseType: 'blob',
    }),

  // Purchase Returns
  getPurchaseEligibility: (purchaseId) => api.get(`/purchases/${purchaseId}/eligibility`),
  createPurchaseReturn: (data) => api.post('/purchases/returns', data),
  listPurchaseReturns: (params) => api.get('/purchases/returns', { params }),
  getPurchaseReturn: (id) => api.get(`/purchases/returns/${id}`),
  settlePurchaseReturn: (id, data) => api.patch(`/purchases/returns/${id}/settle`, data),
}

export default returnsService
