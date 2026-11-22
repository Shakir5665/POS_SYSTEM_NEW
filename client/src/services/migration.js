import api from './api'

export const migrationService = {
  // Existing Phase 4B & System Diagnostics Endpoints
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
