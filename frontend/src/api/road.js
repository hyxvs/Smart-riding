import request from './request'

export const roadApi = {
  getRoads: (params) => request.get('/route/roads', { params }),
  getRoadDetail: (id) => request.get(`/road/${id}`)
}
