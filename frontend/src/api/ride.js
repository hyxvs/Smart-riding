import request from './request'

export function startRide(data) {
  return request({
    url: '/ride/start',
    method: 'post',
    data
  })
}

export function updateProgress(data) {
  return request({
    url: '/ride/update-progress',
    method: 'post',
    data
  })
}

export function endRide(data) {
  return request({
    url: '/ride/end',
    method: 'post',
    data
  })
}

export function getRideHistory(params) {
  return request({
    url: '/ride/history',
    method: 'get',
    params
  })
}

export function getRideStats() {
  return request({
    url: '/ride/stats',
    method: 'get'
  })
}
