import request from './request'

export function poiCluster(data) {
  return request({
    url: '/gis/cluster/poi',
    method: 'post',
    data
  })
}

export function roadIntersection(params) {
  return request({
    url: '/gis/intersection/roads',
    method: 'get',
    params
  })
}

export function trajectorySimilarity(params) {
  return request({
    url: '/gis/similarity/trajectory',
    method: 'get',
    params
  })
}

export function rideStatistics(params) {
  return request({
    url: '/gis/statistics/ride',
    method: 'get',
    params
  })
}

export function poiDirectionDistribution(params) {
  return request({
    url: '/gis/distribution/poi-direction',
    method: 'get',
    params
  })
}

export function roadConnectivity(params) {
  return request({
    url: '/gis/connectivity/road-network',
    method: 'get',
    params
  })
}

export function eventSpatialDistribution(params) {
  return request({
    url: '/gis/distribution/event-spatial',
    method: 'get',
    params
  })
}

export function heatmapTimeline(params) {
  return request({
    url: '/gis/analysis/heatmap-timeline',
    method: 'get',
    params
  })
}

export function roadDensity(params) {
  return request({
    url: '/gis/density/road',
    method: 'get',
    params
  })
}

export function simplifyTrajectory(data) {
  return request({
    url: '/gis/simplify/trajectory',
    method: 'post',
    data
  })
}

export function nearbyPoi(params) {
  return request({
    url: '/gis/nearby/poi',
    method: 'get',
    params
  })
}

export function checkAchievement() {
  return request({
    url: '/gis/achievement/check',
    method: 'post'
  })
}

export function achievementList(params) {
  return request({
    url: '/gis/achievement/list',
    method: 'get',
    params
  })
}

export function updateTeamLocation(data) {
  return request({
    url: '/gis/team/location/update',
    method: 'post',
    data
  })
}

export function getTeamLocations(teamId, params) {
  return request({
    url: `/gis/team/locations/${teamId}`,
    method: 'get',
    params
  })
}