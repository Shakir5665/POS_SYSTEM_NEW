import api from './api'

export const financeService = {
  summary: () => api.get('/finance/summary'),
  categories: () => api.get('/finance/categories'),
  createCategory: (data) => api.post('/finance/categories', data),
  expenses: (params) => api.get('/finance/expenses', { params }),
  createExpense: (data) => api.post('/finance/expenses', data),
  deleteExpense: (id) => api.delete(`/finance/expenses/${id}`),
  assets: (params) => api.get('/finance/assets', { params }),
  getAsset: (id) => api.get(`/finance/assets/${id}`),
  createAsset: (data) => api.post('/finance/assets', data),
  updateAsset: (id, data) => api.put(`/finance/assets/${id}`, data),
  deleteAsset: (id) => api.delete(`/finance/assets/${id}`),
  ownerTransactions: (params) => api.get('/finance/owner-transactions', { params }),
  createOwnerTransaction: (data) => api.post('/finance/owner-transactions', data),
}
