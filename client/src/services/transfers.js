import api from './api'

export const transferService = {
  list: (params) => api.get('/transfers', { params }),
  getById: (id) => api.get(`/transfers/${id}`),
  create: (data) => api.post('/transfers', data),
  receive: (id, data = {}) => api.post(`/transfers/${id}/receive`, data),
}

export default transferService
