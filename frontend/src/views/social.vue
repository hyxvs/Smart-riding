<template>
  <div class="social-page">
    <div class="social-header">
      <h2>骑行社交广场</h2>
      <el-button type="primary" @click="showPostDialog = true">
        <el-icon><Plus /></el-icon>
        发布动态
      </el-button>
    </div>

    <div class="social-content">
      <div class="sidebar">
        <el-card class="nav-card">
          <el-menu v-model="activeMenu" @select="handleMenuSelect">
            <el-menu-item index="feed">
              <el-icon><HomeFilled /></el-icon>
              <span>推荐</span>
            </el-menu-item>
            <el-menu-item index="following">
              <el-icon><User /></el-icon>
              <span>关注</span>
            </el-menu-item>
            <el-menu-item index="challenge">
              <el-icon><Trophy /></el-icon>
              <span>挑战</span>
            </el-menu-item>
            <el-menu-item index="leaderboard">
              <el-icon><TrendCharts /></el-icon>
              <span>排行榜</span>
            </el-menu-item>
          </el-menu>
        </el-card>

        <el-card class="topics-card" v-if="activeMenu === 'feed'">
          <template #header>
            <div class="card-header">
              <span>热门话题</span>
            </div>
          </template>
          <div class="topic-list">
            <div class="topic-item" v-for="topic in hotTopics" :key="topic.id" @click="viewTopic(topic)">
              <span class="topic-name"># {{ topic.name }}</span>
              <span class="topic-count">{{ topic.post_count }} 动态</span>
            </div>
          </div>
        </el-card>

        <el-card class="challenges-card" v-if="activeMenu === 'challenge'">
          <template #header>
            <div class="card-header">
              <span>进行中的挑战</span>
            </div>
          </template>
          <div class="challenge-list">
            <div class="challenge-item" v-for="ch in activeChallenges" :key="ch.id" @click="viewChallenge(ch)">
              <div class="challenge-title">{{ ch.title }}</div>
              <div class="challenge-progress">
                <el-progress :percentage="ch.my_progress || 0" :stroke-width="6" />
              </div>
              <div class="challenge-meta">{{ ch.participant_count }}人参与</div>
            </div>
          </div>
        </el-card>
      </div>

      <div class="main-content">
        <div class="feed-section" v-if="activeMenu === 'feed' || activeMenu === 'following'">
          <div class="feed-tabs">
            <el-radio-group v-model="feedType" @change="loadFeed">
              <el-radio-button value="all">推荐</el-radio-button>
              <el-radio-button value="following">关注</el-radio-button>
              <el-radio-button value="challenge">挑战</el-radio-button>
            </el-radio-group>
          </div>

          <div class="post-list" v-loading="loading">
            <div class="post-card" v-for="post in postList" :key="post.id">
              <div class="post-header">
                <div class="author-info" @click="goToUser(post.user_id)">
                  <el-avatar :src="post.author_avatar" :size="40">
                    {{ post.author_nickname?.charAt(0) }}
                  </el-avatar>
                  <div class="author-detail">
                    <span class="author-name">{{ post.author_nickname }}</span>
                    <span class="author-meta">
                      {{ post.author_distance }} km |
                      {{ post.author_followers }} 粉丝
                    </span>
                  </div>
                </div>
                <el-button
                  :type="post.is_following ? 'info' : 'primary'"
                  size="small"
                  link
                  @click="toggleFollow(post)"
                >
                  {{ post.is_following ? '已关注' : '关注' }}
                </el-button>
              </div>

              <div class="post-content" @click="viewPostDetail(post)">
                <p>{{ post.content }}</p>
                <div class="ride-info" v-if="post.ride_distance">
                  <el-icon><Bicycle /></el-icon>
                  <span>{{ post.ride_distance }} km</span>
                  <el-icon><Timer /></el-icon>
                  <span>{{ formatDuration(post.ride_duration) }}</span>
                  <el-icon><Odometer /></el-icon>
                  <span>{{ post.ride_avg_speed }} km/h</span>
                </div>
              </div>

              <div class="post-images" v-if="post.images && post.images.length > 0">
                <el-image
                  v-for="(img, idx) in post.images.slice(0, 4)"
                  :key="idx"
                  :src="img"
                  :preview-src-list="post.images"
                  fit="cover"
                  class="post-image"
                />
              </div>

              <div class="post-location" v-if="post.location">
                <el-icon><Location /></el-icon>
                <span>{{ post.location }}</span>
              </div>

              <div class="post-actions">
                <div class="action-item" :class="{ active: post.is_liked }" @click="toggleLike(post)">
                  <el-icon><Star /></el-icon>
                  <span>{{ post.like_count }}</span>
                </div>
                <div class="action-item" @click="viewPostDetail(post)">
                  <el-icon><ChatLineSquare /></el-icon>
                  <span>{{ post.comment_count }}</span>
                </div>
                <div class="action-item" @click="sharePost(post)">
                  <el-icon><Share /></el-icon>
                  <span>{{ post.share_count }}</span>
                </div>
              </div>
            </div>

            <el-empty v-if="!loading && postList.length === 0" description="暂无动态" />
          </div>

          <div class="load-more" v-if="postList.length > 0">
            <el-button @click="loadMore" :loading="loadingMore">加载更多</el-button>
          </div>
        </div>

        <div class="challenge-section" v-if="activeMenu === 'challenge'">
          <div class="challenge-grid">
            <div class="challenge-card" v-for="ch in challenges" :key="ch.id" @click="viewChallenge(ch)">
              <div class="challenge-cover">
                <img v-if="ch.cover_image" :src="ch.cover_image" />
                <div v-else class="challenge-cover-placeholder">
                  <el-icon :size="40"><Trophy /></el-icon>
                </div>
                <div class="challenge-status" :class="ch.status">{{ getStatusText(ch.status) }}</div>
              </div>
              <div class="challenge-info">
                <h4>{{ ch.title }}</h4>
                <p class="challenge-desc">{{ ch.description }}</p>
                <div class="challenge-target">
                  <span>目标: {{ ch.target_value }} {{ ch.target_unit }}</span>
                </div>
                <div class="challenge-meta">
                  <span>{{ ch.participant_count }}人参与</span>
                  <span>{{ formatDateRange(ch.start_date, ch.end_date) }}</span>
                </div>
                <div class="challenge-progress" v-if="ch.my_progress !== null">
                  <el-progress :percentage="ch.my_progress || 0" :stroke-width="8" />
                </div>
              </div>
            </div>
          </div>
          <el-empty v-if="!loading && challenges.length === 0" description="暂无挑战活动" />
        </div>

        <div class="leaderboard-section" v-if="activeMenu === 'leaderboard'">
          <div class="leaderboard-tabs">
            <el-radio-group v-model="leaderboardType" @change="loadLeaderboard">
              <el-radio-button value="distance">里程榜</el-radio-button>
              <el-radio-button value="rides">次数榜</el-radio-button>
              <el-radio-button value="elevation">爬升榜</el-radio-button>
            </el-radio-group>
            <el-select v-model="leaderboardPeriod" @change="loadLeaderboard" style="width: 120px; margin-left: 12px;">
              <el-option value="week" label="本周" />
              <el-option value="month" label="本月" />
              <el-option value="year" label="本年" />
            </el-select>
          </div>

          <el-card class="leaderboard-card">
            <div class="rank-list">
              <div
                class="rank-item"
                v-for="(item, index) in leaderboard"
                :key="item.user_id"
                @click="goToUser(item.user_id)"
              >
                <div class="rank-position" :class="{ top: index < 3 }">
                  {{ index + 1 }}
                </div>
                <el-avatar :src="item.avatar_url" :size="44">
                  {{ item.nickname?.charAt(0) }}
                </el-avatar>
                <div class="rank-user-info">
                  <span class="rank-user-name">{{ item.nickname }}</span>
                  <span class="rank-user-level">Lv.{{ item.level || 1 }}</span>
                </div>
                <div class="rank-value">
                  <span v-if="leaderboardType === 'distance'">{{ item.total_distance }} km</span>
                  <span v-else-if="leaderboardType === 'rides'">{{ item.total_rides }} 次</span>
                  <span v-else>{{ item.total_elevation }} m</span>
                </div>
              </div>
            </div>
            <el-empty v-if="leaderboard.length === 0" description="暂无排行数据" />
          </el-card>
        </div>
      </div>
    </div>

    <el-dialog v-model="showPostDialog" title="发布动态" width="600px">
      <el-form :model="postForm" label-width="80px">
        <el-form-item label="内容" required>
          <el-input
            v-model="postForm.content"
            type="textarea"
            :rows="4"
            placeholder="分享你的骑行体验..."
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="添加图片">
          <el-upload
            action="/api/upload"
            list-type="picture-card"
            :limit="9"
            :headers="uploadHeaders"
            :on-success="handleImageUpload"
            :on-remove="handleImageRemove"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <el-form-item label="骑行数据">
          <div class="ride-data-inputs">
            <el-input-number v-model="postForm.ride_distance" :min="0" :precision="1" placeholder="里程(km)" />
            <el-input-number v-model="postForm.ride_duration" :min="0" placeholder="时长(分钟)" />
            <el-input-number v-model="postForm.ride_avg_speed" :min="0" :precision="1" placeholder="均速(km/h)" />
          </div>
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="postForm.location" placeholder="添加位置" />
        </el-form-item>
        <el-form-item label="选择话题">
          <el-select v-model="postForm.topic_ids" multiple placeholder="选择话题" style="width: 100%">
            <el-option v-for="topic in allTopics" :key="topic.id" :label="topic.name" :value="topic.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPostDialog = false">取消</el-button>
        <el-button type="primary" @click="submitPost" :loading="submitting">发布</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPostDetailDialog" title="动态详情" width="700px">
      <div class="post-detail" v-if="currentPost">
        <div class="detail-header">
          <el-avatar :src="currentPost.author_avatar" :size="50">
            {{ currentPost.author_nickname?.charAt(0) }}
          </el-avatar>
          <div class="detail-author">
            <span class="detail-name">{{ currentPost.author_nickname }}</span>
            <span class="detail-time">{{ formatDate(currentPost.created_at) }}</span>
          </div>
          <el-button
            :type="currentPost.is_following ? 'info' : 'primary'"
            size="small"
            @click="toggleFollow(currentPost)"
          >
            {{ currentPost.is_following ? '已关注' : '关注' }}
          </el-button>
        </div>

        <div class="detail-content">
          <p>{{ currentPost.content }}</p>
          <div class="ride-info" v-if="currentPost.ride_distance">
            <el-icon><Bicycle /></el-icon>
            <span>{{ currentPost.ride_distance }} km</span>
            <el-icon><Timer /></el-icon>
            <span>{{ formatDuration(currentPost.ride_duration) }}</span>
          </div>
        </div>

        <div class="detail-images" v-if="currentPost.images && currentPost.images.length > 0">
          <el-image
            v-for="(img, idx) in currentPost.images"
            :key="idx"
            :src="img"
            :preview-src-list="currentPost.images"
            fit="cover"
            class="detail-image"
          />
        </div>

        <div class="detail-actions">
          <div class="action-item" :class="{ active: currentPost.is_liked }" @click="toggleLike(currentPost)">
            <el-icon><Star /></el-icon>
            <span>{{ currentPost.like_count }} 点赞</span>
          </div>
          <div class="action-item">
            <el-icon><ChatLineSquare /></el-icon>
            <span>{{ currentPost.comment_count }} 评论</span>
          </div>
        </div>

        <div class="comment-section">
          <h4>评论</h4>
          <div class="comment-input">
            <el-input v-model="commentContent" placeholder="写评论..." />
            <el-button type="primary" @click="submitComment" :disabled="!commentContent">发送</el-button>
          </div>
          <div class="comment-list">
            <div class="comment-item" v-for="comment in currentPost.comments" :key="comment.id">
              <el-avatar :src="comment.author_avatar" :size="36">
                {{ comment.author_nickname?.charAt(0) }}
              </el-avatar>
              <div class="comment-body">
                <div class="comment-header">
                  <span class="comment-name">{{ comment.author_nickname }}</span>
                  <span class="comment-time">{{ formatDate(comment.created_at) }}</span>
                </div>
                <p class="comment-content">{{ comment.content }}</p>
              </div>
            </div>
          </div>
          <el-empty v-if="!currentPost.comments || currentPost.comments.length === 0" description="暂无评论" />
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="showChallengeDialog" title="挑战详情" width="600px">
      <div class="challenge-detail" v-if="currentChallenge">
        <div class="challenge-detail-header">
          <h3>{{ currentChallenge.title }}</h3>
          <el-tag :type="getStatusType(currentChallenge.status)">
            {{ getStatusText(currentChallenge.status) }}
          </el-tag>
        </div>
        <p class="challenge-detail-desc">{{ currentChallenge.description }}</p>
        <div class="challenge-detail-stats">
          <div class="stat-item">
            <span class="label">目标</span>
            <span class="value">{{ currentChallenge.target_value }} {{ currentChallenge.target_unit }}</span>
          </div>
          <div class="stat-item">
            <span class="label">参与人数</span>
            <span class="value">{{ currentChallenge.participant_count }}</span>
          </div>
          <div class="stat-item">
            <span class="label">完成人数</span>
            <span class="value">{{ currentChallenge.completion_count }}</span>
          </div>
          <div class="stat-item">
            <span class="label">时间</span>
            <span class="value">{{ formatDateRange(currentChallenge.start_date, currentChallenge.end_date) }}</span>
          </div>
        </div>

        <div class="challenge-my-progress" v-if="currentChallenge.my_progress !== null">
          <h4>我的进度</h4>
          <el-progress :percentage="currentChallenge.my_progress || 0" :stroke-width="12" />
        </div>

        <div class="challenge-participants">
          <h4>参与排行</h4>
          <div class="participant-list">
            <div class="participant-item" v-for="(p, index) in currentChallenge.participants" :key="p.id">
              <span class="p-rank">{{ index + 1 }}</span>
              <el-avatar :src="p.avatar_url" :size="32">
                {{ p.nickname?.charAt(0) }}
              </el-avatar>
              <span class="p-name">{{ p.nickname }}</span>
              <el-progress :percentage="p.progress || 0" :stroke-width="4" style="flex: 1;" />
              <span class="p-progress">{{ p.progress?.toFixed(1) }}%</span>
            </div>
          </div>
        </div>

        <div class="challenge-actions" v-if="currentChallenge.status === 'active'">
          <el-button v-if="!currentChallenge.is_participated" type="primary" @click="joinChallenge">
            参加挑战
          </el-button>
          <el-button v-else type="success" disabled>已参加</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { socialApi } from '@/api/social'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

// 上传请求头配置
const uploadHeaders = {
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`
}

const activeMenu = ref('feed')
const feedType = ref('all')
const loading = ref(false)
const loadingMore = ref(false)
const postList = ref([])
const page = ref(1)
const total = ref(0)

const showPostDialog = ref(false)
const showPostDetailDialog = ref(false)
const showChallengeDialog = ref(false)
const submitting = ref(false)
const postForm = ref({
  content: '',
  images: [],
  ride_distance: null,
  ride_duration: null,
  ride_avg_speed: null,
  location: '',
  topic_ids: []
})

const currentPost = ref(null)
const commentContent = ref('')

const challenges = ref([])
const activeChallenges = ref([])
const currentChallenge = ref(null)

const leaderboardType = ref('distance')
const leaderboardPeriod = ref('month')
const leaderboard = ref([])

const hotTopics = ref([])
const allTopics = ref([])

onMounted(() => {
  loadFeed()
  loadTopics()
  loadChallenges()
})

async function loadFeed() {
  loading.value = true
  try {
    const res = await socialApi.getFeed({
      type: feedType.value,
      page: 1,
      limit: 10
    })
    if (res.code === 200) {
      postList.value = res.data.list
      total.value = res.data.total
      page.value = 1
    }
  } catch (e) {
    console.error('加载动态失败:', e)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (postList.value.length >= total.value) return
  loadingMore.value = true
  try {
    const res = await socialApi.getFeed({
      type: feedType.value,
      page: page.value + 1,
      limit: 10
    })
    if (res.code === 200) {
      postList.value = [...postList.value, ...res.data.list]
      page.value++
    }
  } catch (e) {
    console.error('加载更多失败:', e)
  } finally {
    loadingMore.value = false
  }
}

async function loadTopics() {
  try {
    const res = await socialApi.getTopics()
    if (res.code === 200) {
      hotTopics.value = res.data.filter(t => t.is_hot).slice(0, 6)
      allTopics.value = res.data
    }
  } catch (e) {
    console.error('加载话题失败:', e)
  }
}

async function loadChallenges() {
  try {
    const res = await socialApi.getChallenges({ status: 'active' })
    if (res.code === 200) {
      challenges.value = res.data
      activeChallenges.value = res.data.filter(c => c.my_progress !== null && c.my_progress < 100).slice(0, 3)
    }
  } catch (e) {
    console.error('加载挑战失败:', e)
  }
}

async function loadLeaderboard() {
  try {
    const res = await socialApi.getLeaderboard({
      type: leaderboardType.value,
      period: leaderboardPeriod.value
    })
    if (res.code === 200) {
      leaderboard.value = res.data
    }
  } catch (e) {
    console.error('加载排行榜失败:', e)
  }
}

async function submitPost() {
  if (!postForm.value.content) {
    ElMessage.warning('请输入内容')
    return
  }
  submitting.value = true
  try {
    const res = await socialApi.createPost(postForm.value)
    if (res.code === 200) {
      ElMessage.success('发布成功')
      showPostDialog.value = false
      postForm.value = {
        content: '',
        images: [],
        ride_distance: null,
        ride_duration: null,
        ride_avg_speed: null,
        location: '',
        topic_ids: []
      }
      loadFeed()
    }
  } catch {
    ElMessage.error('发布失败')
  } finally {
    submitting.value = false
  }
}

async function viewPostDetail(post) {
  try {
    const res = await socialApi.getPostDetail(post.id)
    if (res.code === 200) {
      currentPost.value = res.data
      showPostDetailDialog.value = true
    }
  } catch {
    ElMessage.error('获取详情失败')
  }
}

async function toggleLike(post) {
  try {
    const res = await socialApi.likePost(post.id)
    if (res.code === 200) {
      post.is_liked = !post.is_liked
      post.like_count += post.is_liked ? 1 : -1
      if (currentPost.value && currentPost.value.id === post.id) {
        currentPost.value.is_liked = post.is_liked
        currentPost.value.like_count = post.like_count
      }
    }
  } catch {
    ElMessage.error('操作失败')
  }
}

async function toggleFollow(post) {
  try {
    const res = await socialApi.followUser(post.user_id)
    if (res.code === 200) {
      post.is_following = !post.is_following
      if (currentPost.value && currentPost.value.id === post.id) {
        currentPost.value.is_following = post.is_following
      }
    }
  } catch {
    ElMessage.error('操作失败')
  }
}

async function submitComment() {
  if (!commentContent.value) return
  try {
    const res = await socialApi.addComment({
      post_id: currentPost.value.id,
      content: commentContent.value
    })
    if (res.code === 200) {
      ElMessage.success('评论成功')
      currentPost.value.comments = [res.data, ...(currentPost.value.comments || [])]
      currentPost.value.comment_count++
      commentContent.value = ''
    }
  } catch {
    ElMessage.error('评论失败')
  }
}

async function sharePost(post) {
  try {
    const response = await socialApi.sharePost(post.id)
    if (response.code === 200) {
      post.share_count++
      ElMessage.success('分享成功')
    } else {
      ElMessage.warning(response.message)
    }
  } catch (error) {
    console.error('分享失败:', error)
    ElMessage.error('分享失败')
  }
}

function viewTopic(topic) {
  ElMessage.info(`话题: ${topic.name}`)
}

function viewChallenge(ch) {
  currentChallenge.value = ch
  showChallengeDialog.value = true
}

async function joinChallenge() {
  try {
    const res = await socialApi.joinChallenge(currentChallenge.value.id)
    if (res.code === 200) {
      ElMessage.success('参加成功')
      currentChallenge.value.is_participated = true
      currentChallenge.value.participant_count++
      loadChallenges()
    }
  } catch {
    ElMessage.error('参加失败')
  }
}

function handleMenuSelect(key) {
  activeMenu.value = key
  if (key === 'challenge') {
    loadChallenges()
  } else if (key === 'leaderboard') {
    loadLeaderboard()
  }
}

function goToUser(userId) {
  router.push(`/user/${userId}`)
}

function handleImageUpload(res) {
  if (res.url) {
    postForm.value.images.push(res.url)
  }
}

function handleImageRemove(file) {
  const url = file.url || file.response?.url
  const index = postForm.value.images.indexOf(url)
  if (index > -1) {
    postForm.value.images.splice(index, 1)
  }
}

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

function formatDuration(minutes) {
  if (!minutes) return '0分钟'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}小时${m}分钟` : `${m}分钟`
}

function formatDateRange(start, end) {
  return `${dayjs(start).format('MM/DD')}-${dayjs(end).format('MM/DD')}`
}

function getStatusType(status) {
  const types = { active: 'success', upcoming: 'warning', ended: 'info' }
  return types[status] || 'info'
}

function getStatusText(status) {
  const texts = { active: '进行中', upcoming: '即将开始', ended: '已结束' }
  return texts[status] || status
}
</script>

<style lang="scss" scoped>
.social-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.social-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h2 {
    margin: 0;
  }
}

.social-content {
  display: flex;
  gap: 20px;

  .sidebar {
    width: 280px;
    flex-shrink: 0;

    .nav-card {
      margin-bottom: 16px;
    }

    .topics-card, .challenges-card {
      .card-header {
        font-weight: 600;
      }

      .topic-list {
        .topic-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          cursor: pointer;

          &:hover {
            color: #409eff;
          }

          .topic-name {
            font-size: 14px;
          }

          .topic-count {
            font-size: 12px;
            color: #999;
          }
        }
      }

      .challenge-list {
        .challenge-item {
          padding: 10px 0;
          cursor: pointer;
          border-bottom: 1px solid #f0f0f0;

          &:last-child {
            border-bottom: none;
          }

          .challenge-title {
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 6px;
          }

          .challenge-meta {
            font-size: 12px;
            color: #999;
            margin-top: 4px;
          }
        }
      }
    }
  }

  .main-content {
    flex: 1;
    min-width: 0;
  }
}

.feed-section {
  .feed-tabs {
    margin-bottom: 16px;
  }

  .post-list {
    .post-card {
      background: #fff;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

      .post-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;

        .author-info {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;

          .author-detail {
            display: flex;
            flex-direction: column;

            .author-name {
              font-weight: 600;
              font-size: 15px;
            }

            .author-meta {
              font-size: 12px;
              color: #999;
            }
          }
        }
      }

      .post-content {
        cursor: pointer;
        margin-bottom: 12px;

        p {
          margin: 0 0 8px;
          line-height: 1.6;
        }

        .ride-info {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #666;
          font-size: 13px;
          background: #f5f7fa;
          padding: 8px 12px;
          border-radius: 6px;
        }
      }

      .post-images {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 12px;

        .post-image {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 8px;
        }
      }

      .post-location {
        font-size: 13px;
        color: #999;
        margin-bottom: 12px;

        .el-icon {
          margin-right: 4px;
        }
      }

      .post-actions {
        display: flex;
        gap: 24px;
        padding-top: 12px;
        border-top: 1px solid #f0f0f0;

        .action-item {
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          color: #666;
          font-size: 14px;

          &:hover {
            color: #409eff;
          }

          &.active {
            color: #f56c6c;
          }
        }
      }
    }
  }

  .load-more {
    text-align: center;
    padding: 20px;
  }
}

.challenge-section {
  .challenge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;

    .challenge-card {
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      cursor: pointer;
      transition: all 0.3s;

      &:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        transform: translateY(-2px);
      }

      .challenge-cover {
        position: relative;
        height: 160px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .challenge-cover-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #fff;
        }

        .challenge-status {
          position: absolute;
          top: 12px;
          right: 12px;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          color: #fff;

          &.active {
            background: #67c23a;
          }

          &.upcoming {
            background: #e6a23c;
          }

          &.ended {
            background: #909399;
          }
        }
      }

      .challenge-info {
        padding: 16px;

        h4 {
          margin: 0 0 8px;
        }

        .challenge-desc {
          font-size: 13px;
          color: #666;
          margin: 0 0 12px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .challenge-target {
          font-size: 13px;
          color: #409eff;
          margin-bottom: 8px;
        }

        .challenge-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #999;
          margin-bottom: 12px;
        }
      }
    }
  }
}

.leaderboard-section {
  .leaderboard-tabs {
    display: flex;
    margin-bottom: 16px;
  }

  .leaderboard-card {
    .rank-list {
      .rank-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid #f0f0f0;
        cursor: pointer;

        &:last-child {
          border-bottom: none;
        }

        .rank-position {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 14px;
          color: #666;
          background: #f5f7fa;
          border-radius: 50%;

          &.top {
            background: linear-gradient(135deg, #ffd700, #ffb347);
            color: #fff;
          }

          &:nth-child(1).top {
            background: linear-gradient(135deg, #ffd700, #ffb347);
          }

          &:nth-child(2).top {
            background: linear-gradient(135deg, #c0c0c0, #a0a0a0);
          }

          &:nth-child(3).top {
            background: linear-gradient(135deg, #cd7f32, #b87333);
          }
        }

        .rank-user-info {
          flex: 1;
          display: flex;
          flex-direction: column;

          .rank-user-name {
            font-weight: 500;
          }

          .rank-user-level {
            font-size: 12px;
            color: #999;
          }
        }

        .rank-value {
          font-weight: 600;
          color: #409eff;
        }
      }
    }
  }
}

.post-detail {
  .detail-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    .detail-author {
      flex: 1;
      display: flex;
      flex-direction: column;

      .detail-name {
        font-weight: 600;
      }

      .detail-time {
        font-size: 12px;
        color: #999;
      }
    }
  }

  .detail-content {
    margin-bottom: 16px;

    p {
      line-height: 1.7;
      margin: 0 0 12px;
    }
  }

  .detail-images {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 16px;

    .detail-image {
      width: 100%;
      border-radius: 8px;
    }
  }

  .detail-actions {
    display: flex;
    gap: 24px;
    padding: 12px 0;
    border-bottom: 1px solid #f0f0f0;
    margin-bottom: 16px;

    .action-item {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      color: #666;

      &.active {
        color: #f56c6c;
      }
    }
  }

  .comment-section {
    h4 {
      margin: 0 0 16px;
    }

    .comment-input {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .comment-list {
      .comment-item {
        display: flex;
        gap: 10px;
        padding: 12px 0;
        border-bottom: 1px solid #f5f7fa;

        .comment-body {
          flex: 1;

          .comment-header {
            margin-bottom: 4px;

            .comment-name {
              font-weight: 500;
              margin-right: 8px;
            }

            .comment-time {
              font-size: 12px;
              color: #999;
            }
          }

          .comment-content {
            margin: 0;
            font-size: 14px;
            color: #333;
          }
        }
      }
    }
  }
}

.challenge-detail {
  .challenge-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    h3 {
      margin: 0;
    }
  }

  .challenge-detail-desc {
    color: #666;
    margin-bottom: 20px;
  }

  .challenge-detail-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 20px;

    .stat-item {
      display: flex;
      flex-direction: column;
      padding: 12px;
      background: #f8fafc;
      border-radius: 8px;

      .label {
        font-size: 12px;
        color: #999;
        margin-bottom: 4px;
      }

      .value {
        font-size: 18px;
        font-weight: 600;
        color: #409eff;
      }
    }
  }

  .challenge-my-progress {
    margin-bottom: 20px;

    h4 {
      margin: 0 0 12px;
    }
  }

  .challenge-participants {
    margin-bottom: 20px;

    h4 {
      margin: 0 0 12px;
    }

    .participant-list {
      max-height: 300px;
      overflow-y: auto;

      .participant-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 0;
        border-bottom: 1px solid #f5f7fa;

        .p-rank {
          width: 20px;
          font-weight: 600;
          color: #666;
        }

        .p-name {
          width: 80px;
          font-size: 14px;
        }

        .p-progress {
          width: 50px;
          text-align: right;
          font-size: 12px;
          color: #409eff;
        }
      }
    }
  }

  .challenge-actions {
    text-align: center;
  }
}

.ride-data-inputs {
  display: flex;
  gap: 10px;

  .el-input-number {
    flex: 1;
  }
}
</style>
