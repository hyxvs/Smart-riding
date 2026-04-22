import request from './request';

// 服务范围分析（等时圈计算）
export const calculateIsochrone = (params) => {
  return request({
    url: '/api/analysis/isochrone',
    method: 'post',
    data: params
  });
};

// 获取服务范围分析历史
export const getIsochroneHistory = (params) => {
  return request({
    url: '/api/analysis/isochrone/history',
    method: 'get',
    params
  });
};
