import api from './api'

export const variationsService = {
  list: (params) => api.get('/variations', { params }),
  get: (id) => api.get(`/variations/${id}`),
  create: (data) => api.post('/variations', data),
  update: (id, data) => api.put(`/variations/${id}`, data),
  delete: (id) => api.delete(`/variations/${id}`),
}

export default variationsService
