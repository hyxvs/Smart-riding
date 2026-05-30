import request from './request';

export const challengeApi = {
  // 挑战分类与发现
  getCategories: () => request.get('/challenge/categories'),
  getPopular: (params) => request.get('/challenge/popular', { params }),
  getRecommendations: (params) => request.get('/challenge/recommendations', { params }),
  getFiltered: (params) => request.get('/challenge/filter', { params }),

  // 徽章系统
  getBadges: () => request.get('/challenge/badges'),
  getUserBadges: () => request.get('/challenge/badges/user'),

  // 积分系统
  getPoints: () => request.get('/challenge/points'),
  getPointsHistory: (params) => request.get('/challenge/points/history', { params }),

  // 成就排行榜
  getAchievementLeaderboard: () => request.get('/challenge/leaderboard/achievements'),

  // 好友PK
  requestDuel: (data) => request.post('/challenge/duel/request', data),
  respondDuel: (id, data) => request.post(`/challenge/duel/${id}/respond`, data),
  getDuels: () => request.get('/challenge/duels'),

  // 组队挑战
  createTeam: (data) => request.post('/challenge/teams', data),
  joinTeam: (id) => request.post(`/challenge/teams/${id}/join`),
  leaveTeam: (id) => request.post(`/challenge/teams/${id}/leave`),
  getTeamsByChallenge: (challengeId) => request.get(`/challenge/teams/challenge/${challengeId}`),
  getTeamDetail: (id) => request.get(`/challenge/teams/${id}`),

  // 用户创建挑战
  createChallenge: (data) => request.post('/challenge/create', data),
  getPendingChallenges: (params) => request.get('/challenge/pending', { params }),
  approveChallenge: (id, data) => request.post(`/challenge/${id}/approve`, data),
  updateChallenge: (id, data) => request.put(`/challenge/${id}`, data),

  // 挑战统计分析
  getChallengeStats: (id) => request.get(`/challenge/stats/${id}`),
  getUserStats: () => request.get('/challenge/user/stats'),
  getTrends: (params) => request.get('/challenge/trends', { params }),

  // 通知
  getNotifications: (params) => request.get('/challenge/notifications', { params }),
  getUnreadCount: () => request.get('/challenge/notifications/unread')
};
