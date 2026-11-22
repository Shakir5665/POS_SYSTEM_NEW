import api from './api'

export const migrationService = {
  getStatus: () => api.get('/migration/status'),
  listBatches: () => api.get('/migration/batches'),
  getBatch: (id) => api.get(`/migration/batches/${id}`),
  listIssues: (params) => api.get('/migration/issues', { params }),
}

export default migrationService
