import request from './request'

export const weatherApi = {
  getCurrentWeather: (params) => request.get('/weather/current', { params }),
  getForecast: (params) => request.get('/weather/forecast', { params }),
  getSuggestions: (params) => request.get('/weather/suggestions', { params })
}