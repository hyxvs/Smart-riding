import request from './request'
// 导出上报接口
export const reportApi = {
  create: (data) => request.post('/report/create', data),
  getList: (params) => request.get('/report/list', { params }),
  getDetail: (id) => request.get(`/report/${id}`),
  getNearby: (lng, lat, params) => request.get(`/report/nearby/${lng}/${lat}`, { params }),
  rate: (id, data) => request.post(`/report/${id}/rate`, data),
  getStats: () => request.get('/report/stats/summary')
}
