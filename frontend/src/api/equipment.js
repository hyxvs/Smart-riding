import request from './request'

export const equipmentApi = {
  getList: (params) => request.get('/equipment/list', { params }),
  getCategories: () => request.get('/equipment/categories'),
  getDetail: (id) => request.get(`/equipment/${id}`),
  create: (data) => request.post('/equipment', data),
  update: (id, data) => request.put(`/equipment/${id}`, data),
  delete: (id) => request.delete(`/equipment/${id}`),
  addMaintenance: (data) => request.post('/equipment/maintenance', data),
  getMaintenance: (equipmentId, params) => request.get(`/equipment/maintenance/${equipmentId}`, { params }),
  getReminders: () => request.get('/equipment/reminders'),
  dismissReminder: (id) => request.put(`/equipment/reminders/${id}/dismiss`),
  getStats: () => request.get('/equipment/stats')
}
