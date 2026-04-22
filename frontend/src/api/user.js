import request from './request'

export const userApi = {
  getProfile: () => request.get('/user/profile'),
  updateProfile: (data) => request.put('/user/profile', data),
  getPoints: () => request.get('/user/points'),
  getRoutes: (params) => request.get('/user/routes', { params }),
  createRoute: (data) => request.post('/user/routes', data),
  getReports: (params) => request.get('/user/reports', { params }),
  getStats: () => request.get('/user/stats')
}
