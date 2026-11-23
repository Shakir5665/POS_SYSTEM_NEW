import api from './api'

export const brandsService = {
  list: (params) => api.get('/brands', { params }),
  get: (id) => api.get(`/brands/${id}`),
  create: (data) => api.post('/brands', data),
  update: (id, data) => api.put(`/brands/${id}`, data),
  delete: (id) => api.delete(`/brands/${id}`),
}

export default brandsService
