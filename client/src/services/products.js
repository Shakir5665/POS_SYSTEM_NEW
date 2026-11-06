import api from './api'

export const productsService = {
  list: (params) => api.get('/products', { params }),
  get: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  byBarcode: (code) => api.get(`/products/barcode/${code}`),
  categories: () => api.get('/products/categories'),
  createCategory: (data) => api.post('/products/categories', data),
}
