import request from './request';

export const socialApi = {
  getFeed: (params) => request.get('/social/feed', { params }),
  getPostDetail: (id) => request.get(`/social/post/${id}`),
  createPost: (data) => request.post('/social/post', data),
  deletePost: (id) => request.delete(`/social/post/${id}`),

  likePost: (postId) => request.post(`/social/like/${postId}`),

  getComments: (postId) => request.get(`/social/post/${postId}`),
  addComment: (data) => request.post('/social/comment', data),
  deleteComment: (id) => request.delete(`/social/comment/${id}`),

  followUser: (userId) => request.post(`/social/follow/${userId}`),
  getFollowing: () => request.get('/social/following'),
  getFollowers: () => request.get('/social/followers'),

  getNearby: (params) => request.get('/social/nearby', { params }),

  getTopics: () => request.get('/social/topics'),
  getTopicPosts: (topicId, params) => request.get(`/social/topics/${topicId}/posts`, { params }),

  getChallenges: (params) => request.get('/social/challenges', { params }),
  getChallengeDetail: (id) => request.get(`/social/challenges/${id}`),
  joinChallenge: (id) => request.post(`/social/challenges/${id}/join`),
  updateChallengeProgress: (id, data) => request.put(`/social/challenges/${id}/progress`, data),

  getLeaderboard: (params) => request.get('/social/leaderboard', { params }),

  getUserPosts: (userId, params) => request.get(`/social/user/${userId}/posts`, { params }),

  sharePost: (postId) => request.post(`/social/share/${postId}`),
  getShares: (params) => request.get('/social/shares', { params })
};
