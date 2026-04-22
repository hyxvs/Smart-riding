import request from './request'

export const poiApi = {
  getList: (params) => request.get('/poi/list', { params }),
  getDetail: (id) => request.get(`/poi/${id}`),
  search: (keyword, params) => request.get(`/poi/search/${keyword}`, { params }),
  getCategories: () => request.get('/poi/categories/list')
}

export const trafficApi = {
  getRealtime: (params) => request.get('/traffic/realtime', { params }),
  getRoadTraffic: (roadId, params) => request.get(`/traffic/road/${roadId}`, { params }),
  getEvents: (params) => request.get('/traffic/events', { params }),
  getEventDetail: (id) => request.get(`/traffic/events/${id}`),
  getSummary: () => request.get('/traffic/summary')
}
