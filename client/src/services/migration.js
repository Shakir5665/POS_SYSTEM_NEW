import api from './api'

export const migrationService = {
  getStatus: () => api.get('/migration/status'),
  listBatches: () => api.get('/migration/batches'),
  getBatch: (id) => api.get(`/migration/batches/${id}`),
  listIssues: (params) => api.get('/migration/issues', { params }),
  inspectExcel: (params) => api.get('/migration/excel/inspect', { params }),
  uploadExcel: (formData) =>
    api.post('/migration/excel/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  validateExcel: (data) => api.post('/migration/excel/validate', data),
  dryRunExcel: (data) => api.post('/migration/excel/dry-run', data),
  executeExcel: (data) => api.post('/migration/excel/execute', data),
  previewRollback: (id) => api.get(`/migration/excel/rollback-preview/${id}`),
  executeRollback: (id) => api.post(`/migration/excel/rollback/${id}`),
}

export default migrationService
