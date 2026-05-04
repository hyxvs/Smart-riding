import request from './request'

export const roadApi = {
  getRoads: (params) => request.get('/route/roads', { params }),
  getRoadDetail: (id) => request.get(`/road/${id}`),
  analyzeRoad: (data) => request.post('/road-condition/analyze-road', data),
  predictTraffic: (data) => request.post('/road-condition/predict-traffic', data),
  getWeatherRoadImpact: (data) => request.post('/road-condition/weather-road-impact', data),
  analyzeRoute: (data) => request.post('/road-condition/route-analysis', data),
  getRoadCondition: (roadId, params) => request.get(`/road-condition/${roadId}`, { params })
}

export const roadConditionApi = {
  analyzeRoad: (data) => request.post('/road-condition/analyze-road', data),
  predictTraffic: (data) => request.post('/road-condition/predict-traffic', data),
  getWeatherRoadImpact: (data) => request.post('/road-condition/weather-road-impact', data),
  analyzeRoute: (data) => request.post('/road-condition/route-analysis', data),
  getRoadCondition: (roadId, params) => request.get(`/road-condition/${roadId}`, { params })
}
