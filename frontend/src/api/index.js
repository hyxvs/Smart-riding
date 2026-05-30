// 导入Axios请求实例
import request from './request'
import { weatherApi } from './weather'

// 认证相关API
export const authApi = {
  register: (data) => request.post('/auth/register', data), // 用户注册
  login: (data) => request.post('/auth/login', data), // 用户登录
  logout: () => request.post('/auth/logout'), // 用户登出
  getMe: () => request.get('/auth/me'), // 获取当前用户信息
  updateProfile: (data) => request.put('/auth/profile', data), // 更新用户资料
  changePassword: (data) => request.put('/auth/password', data) // 修改密码
}

// 用户相关API
export const userApi = {
  getProfile: () => request.get('/user/profile'), // 获取用户资料
  updateProfile: (data) => request.put('/user/profile', data), // 更新用户资料
  getPoints: () => request.get('/user/points'), // 获取用户积分
  getPointLog: (params) => request.get('/user/point-log', { params }), // 获取积分记录
  getBehaviorLog: (params) => request.get('/user/behavior-log', { params }), // 获取行为记录
  uploadAvatar: (data) => request.post('/user/avatar', data), // 上传头像
  getRoutes: (params) => request.get('/user/routes', { params }), // 获取用户路线
  createRoute: (data) => request.post('/user/routes', data), // 创建用户路线
  getReports: (params) => request.get('/user/reports', { params }), // 获取用户上报
  getStats: () => request.get('/user/stats') // 获取用户统计数据
}

// 路线相关API
export const routeApi = {
  plan: (data) => request.post('/route/plan', data), // 规划路线
  save: (data) => request.post('/route/save', data), // 保存路线
  getList: (params) => request.get('/route/list', { params }), // 获取路线列表
  getDetail: (id) => request.get(`/route/${id}`), // 获取路线详情
  delete: (id) => request.delete(`/route/${id}`), // 删除路线
  toggleFavorite: (id) => request.post(`/route/${id}/favorite`), // 收藏/取消收藏路线
  getByShareCode: (code) => request.get(`/route/share/${code}`), // 通过分享码获取路线
  getRoads: (params) => request.get('/route/roads', { params }) // 获取道路信息
}

// 民情上报相关API
export const reportApi = {
  getList: (params) => request.get('/report/list', { params }), // 获取上报列表
  getDetail: (id) => request.get(`/report/${id}`), // 获取上报详情
  create: (data) => request.post('/report/create', data), // 创建上报
  cancel: (id) => request.post(`/report/${id}/cancel`), // 取消上报
  rate: (id, data) => request.post(`/report/${id}/rate`, data) // 评价上报处理
}

// POI相关API
export const poiApi = {
  getList: (params) => request.get('/poi/list', { params }), // 获取POI列表
  create: (data) => request.post('/poi', data), // 创建POI
  getDetail: (id) => request.get(`/poi/${id}`), // 获取POI详情
  update: (id, data) => request.put(`/poi/${id}`, data), // 更新POI
  getNearby: (data) => request.post('/poi/nearby', data), // 获取附近POI
  search: (params) => request.get('/poi/search', { params }), // 搜索POI
  getRedSpots: (params) => request.get('/poi/red-spots/list', { params }), // 获取热点POI
  getCategories: () => request.get('/poi/categories/list') // 获取POI分类
}

// 交通相关API
export const trafficApi = {
  getRealtime: (params) => request.get('/traffic/realtime', { params }), // 获取实时交通信息
  getEvents: (params) => request.get('/traffic/events', { params }), // 获取交通事件
  subscribe: (data) => request.post('/traffic/subscribe', data), // 订阅交通信息
  unsubscribe: (id) => request.delete(`/traffic/subscribe/${id}`) // 取消订阅交通信息
}

// AI相关API
export const aiApi = {
  chat: (data) => request.post('/ai/chat', data), // AI聊天
  getHistory: (sessionId, params) => request.get(`/ai/history/${sessionId}`, { params }), // 获取聊天历史
  voice: (data) => request.post('/ai/voice', data), // 语音识别
  getKnowledge: (params) => request.get('/ai/knowledge/list', { params }) // 获取知识库
}

// 团队相关API
export const teamApi = {
  getList: (params) => request.get('/team/list', { params }), // 获取团队列表
  create: (data) => request.post('/team/create', data), // 创建团队
  getDetail: (id) => request.get(`/team/${id}`), // 获取团队详情
  join: (id) => request.post(`/team/${id}/join`), // 加入团队
  leave: (id) => request.post(`/team/${id}/leave`), // 离开团队
  disband: (id) => request.post(`/team/${id}/disband`), // 解散团队
  joinByCode: (data) => request.post('/team/join-by-code', data) // 通过邀请码加入团队
}

// 通知相关API
export const notificationApi = {
  getList: (params) => request.get('/notification/list', { params }), // 获取通知列表
  markRead: (id) => request.post(`/notification/${id}/read`), // 标记通知为已读
  markAllRead: () => request.post('/notification/read-all'), // 标记所有通知为已读
  delete: (id) => request.delete(`/notification/${id}`), // 删除通知
  getUnreadCount: () => request.get('/notification/unread-count') // 获取未读通知数量
}

// 管理员相关API
export const adminApi = {
  getUsers: (params) => request.get('/admin/users', { params }), // 获取用户列表
  updateUserStatus: (id, data) => request.put(`/admin/users/${id}/status`, data), // 更新用户状态
  getReports: (params) => request.get('/admin/reports', { params }), // 获取上报列表
  handleReport: (id, data) => request.put(`/admin/reports/${id}`, data), // 处理上报
  getHeatmap: (params) => request.get('/admin/heatmap', { params }), // 获取热点图数据
  getDashboard: () => request.get('/admin/stats/dashboard'), // 获取仪表盘数据
  getDepts: () => request.get('/admin/depts') // 获取部门列表
}

// 分析相关API
export const analysisApi = {
  calculateIsochrone: (data) => request.post('/analysis/isochrone', data), // 计算等时圈
  getIsochroneHistory: (params) => request.get('/analysis/isochrone/history', { params }) // 获取等时圈历史
}

// 天气相关API
export { weatherApi }

// 行程规划API
export const tripApi = {
  create: (data) => request.post('/trip/create', data), // 创建行程规划
  getList: (params) => request.get('/trip/list', { params }), // 获取行程规划列表
  getDetail: (id) => request.get(`/trip/${id}`), // 获取行程规划详情
  update: (id, data) => request.put(`/trip/${id}`, data), // 更新行程规划
  delete: (id) => request.delete(`/trip/${id}`) // 删除行程规划
}

// 智能路况分析API
export const roadConditionApi = {
  analyzeRoad: (data) => request.post('/road-condition/analyze-road', data), // 分析道路
  predictTraffic: (data) => request.post('/road-condition/predict-traffic', data), // 预测交通
  getWeatherRoadImpact: (data) => request.post('/road-condition/weather-road-impact', data), // 天气路况影响
  analyzeRoute: (data) => request.post('/road-condition/route-analysis', data), // 路线分析
  getRoadCondition: (roadId, params) => request.get(`/road-condition/${roadId}`, { params }) // 获取路况
}
