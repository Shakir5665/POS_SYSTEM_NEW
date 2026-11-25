import api from './api'

export const systemAdminService = {
  getStatus: () => api.get('/system-admin/status'),
  setAccessEnabled: (access_enabled) => api.put('/system-admin/access', { access_enabled }),
  updateAccount: (data) => api.patch('/system-admin/account', data),
}
