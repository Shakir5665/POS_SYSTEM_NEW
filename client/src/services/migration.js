import api from './api'

export const migrationService = {
  // Migration System Diagnostics & Batches Endpoints
  getStatus: () => api.get('/migration/status'),
  listBatches: () => api.get('/migration/batches'),
  getBatch: (id) => api.get(`/migration/batches/${id}`),
  deleteBatch: (id) => api.delete(`/migration/batches/${id}`),
  clearAllBatches: () => api.delete('/migration/batches'),
  listIssues: (params) => api.get('/migration/issues', { params }),
  deleteIssue: (id) => api.delete(`/migration/issues/${id}`),
  clearAllIssues: () => api.delete('/migration/issues'),
  clearDatabase: (confirmation) => api.post('/migration/clear-database', { confirmation }),

  // Universal Single-Table Excel Migration System Endpoints
  listApprovedTables: () => api.get('/migration/excel/tables'),
  downloadTemplate: (table, variant = 'full') =>
    api.get(`/migration/excel/templates/${table}?variant=${variant}`, {
      responseType: 'blob',
    }),
  getTableSchema: (table) => api.get(`/migration/excel/schema/${table}`),
  inspectUniversalFile: (formData) =>
    api.post('/migration/excel/inspect', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  validateUniversalPlan: (data) => api.post('/migration/excel/validate', data),
  createJob: (data) => api.post('/migration/excel/jobs', data),
  confirmJob: (id) => api.post(`/migration/excel/jobs/${id}/confirm`),
  getJobStatus: (id) => api.get(`/migration/excel/jobs/${id}`),
  listUniversalJobs: () => api.get('/migration/excel/jobs'),
  getJobErrors: (id, format = 'json') =>
    api.get(`/migration/excel/jobs/${id}/errors?format=${format}`, {
      responseType: format === 'csv' ? 'blob' : 'json',
    }),
  cancelJob: (id) => api.post(`/migration/excel/jobs/${id}/cancel`),
}

export default migrationService
