<template>
  <div class="challenge-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <h1 class="page-title">🚴 骑行挑战</h1>
      <p class="page-subtitle">挑战自我，超越极限</p>
    </div>

    <!-- 标签页导航 -->
    <el-tabs v-model="activeTab" type="card" class="challenge-tabs">
      <el-tab-pane label="骑行挑战" name="ride">
        <div class="ride-section">
          <RideTracker
            :active-challenges="myActiveChallenges"
            :default-challenge-id="rideSelectedChallengeId"
            @ride-complete="handleRideComplete"
            @progress-update="handleProgressUpdate"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="发现挑战" name="discover">
        <div class="discover-section">
          <!-- 筛选栏 -->
          <div class="filter-bar">
            <el-select v-model="filterType" placeholder="选择类型" style="width: 120px;">
              <el-option value="" label="全部类型" />
              <el-option v-for="cat in categories" :key="cat.id" :value="cat.id" :label="cat.name" />
            </el-select>
            <el-select v-model="filterDifficulty" placeholder="选择难度" style="width: 100px;">
              <el-option value="" label="全部难度" />
              <el-option v-for="level in difficultyLevels" :key="level.id" :value="level.id" :label="level.name" />
            </el-select>
            <el-button @click="refreshChallenges" icon="Refresh">刷新</el-button>
          <el-button @click="forceRefresh" type="warning" plain>强制刷新</el-button>
          </div>

          <!-- 快捷分类 -->
          <div class="quick-categories">
            <div
              class="quick-category"
              :class="{ active: activeCategory === 'popular' }"
              @click="loadPopularChallenges"
            >
              <span class="category-icon">🔥</span>
              <span>热门挑战</span>
            </div>
            <div
              class="quick-category"
              :class="{ active: activeCategory === 'recommend' }"
              @click="loadRecommendations"
            >
              <span class="category-icon">✨</span>
              <span>为你推荐</span>
            </div>
            <div
              class="quick-category"
              :class="{ active: activeCategory === 'featured' }"
              @click="loadFeaturedChallenges"
            >
              <span class="category-icon">⭐</span>
              <span>精选挑战</span>
            </div>
          </div>

          <!-- 挑战列表 -->
          <div class="challenge-grid">
            <el-card
              v-for="challenge in challenges"
              :key="challenge.id"
              class="challenge-card"
              @click="showChallengeDetail(challenge)"
            >
              <div class="challenge-header">
                <span class="challenge-type">{{ getChallengeTypeName(challenge.challenge_type) }}</span>
                <span class="challenge-difficulty" :style="{ color: getDifficultyColor(challenge.difficulty_level) }">
                  {{ getDifficultyName(challenge.difficulty_level) }}
                </span>
              </div>
              <h3 class="challenge-title">{{ challenge.title }}</h3>
              <p class="challenge-desc">{{ challenge.description }}</p>
              <div class="challenge-meta">
                <span class="meta-item">
                  <el-icon><User /></el-icon>
                  {{ challenge.participant_count || 0 }} 人参与
                </span>
                <span class="meta-item">
                  <el-icon><Calendar /></el-icon>
                  {{ formatDate(challenge.start_date) }} - {{ formatDate(challenge.end_date) }}
                </span>
              </div>
              <div class="challenge-target">
                <span class="target-label">目标：</span>
                <span class="target-value">{{ challenge.target_value }} {{ challenge.target_unit }}</span>
              </div>
              <div class="challenge-actions">
                <el-button
                  v-if="challenge.is_participated"
                  type="success"
                  size="small"
                  @click.stop="viewChallengeProgress(challenge)"
                >
                  <el-icon><Check /></el-icon>
                  进行中 ({{ Math.round(challenge.my_progress || 0) }}%)
                </el-button>
                <el-button
                  v-else
                  type="primary"
                  size="small"
                  @click.stop="joinChallenge(challenge)"
                >
                  <el-icon><Plus /></el-icon>
                  参加挑战
                </el-button>
              </div>
            </el-card>
          </div>
          <el-empty v-if="challenges.length === 0" description="暂无挑战" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="我的挑战" name="my">
        <div v-if="!isLoggedIn" class="login-prompt">
          <el-empty description="请先登录查看我的挑战">
            <el-button type="primary" @click="$router.push('/login')">去登录</el-button>
          </el-empty>
        </div>
        <div v-else class="my-challenges">
          <el-tabs v-model="myChallengeTab">
            <el-tab-pane label="进行中" name="active">
              <div class="challenge-list">
                <div
                  v-for="challenge in myActiveChallenges"
                  :key="challenge.id"
                  class="challenge-item"
                >
                  <div class="challenge-info">
                    <h4>{{ challenge.title }}</h4>
                    <p>目标：{{ challenge.target_value }} {{ challenge.target_unit }}</p>
                  </div>
                  <div class="challenge-progress">
                    <el-progress :percentage="challenge.my_progress || 0" :show-text="false" />
                    <span class="progress-text">{{ Math.round(challenge.my_progress || 0) }}%</span>
                  </div>
                  <el-button size="small" @click="viewChallengeProgress(challenge)">更新进度</el-button>
                </div>
                <el-empty v-if="myActiveChallenges.length === 0" description="暂无进行中的挑战" />
              </div>
            </el-tab-pane>
            <el-tab-pane label="已完成" name="completed">
              <div class="challenge-list">
                <div
                  v-for="challenge in myCompletedChallenges"
                  :key="challenge.id"
                  class="challenge-item completed"
                >
                  <div class="challenge-info">
                    <h4>{{ challenge.title }}</h4>
                    <p>{{ formatDate(challenge.completed_at) }} 完成</p>
                  </div>
                  <div class="challenge-badge">
                    <el-icon><Trophy /></el-icon>
                  </div>
                </div>
                <el-empty v-if="myCompletedChallenges.length === 0" description="暂无已完成的挑战" />
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-tab-pane>

      <el-tab-pane label="成就徽章" name="achievements">
        <div v-if="!isLoggedIn" class="login-prompt">
          <el-empty description="请先登录查看成就徽章">
            <el-button type="primary" @click="$router.push('/login')">去登录</el-button>
          </el-empty>
        </div>
        <div v-else class="achievements-section">
          <div class="stats-header">
            <div class="stat-item">
              <span class="stat-value">{{ userStats.points || 0 }}</span>
              <span class="stat-label">积分</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ userStats.badge_count || 0 }}</span>
              <span class="stat-label">徽章</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ userStats.completed_challenges || 0 }}</span>
              <span class="stat-label">完成挑战</span>
            </div>
          </div>

          <h3 class="section-title">我的徽章</h3>
          <div class="badges-grid">
            <div
              v-for="badge in userBadges"
              :key="badge.id"
              class="badge-item earned"
            >
              <span class="badge-icon">{{ badge.icon }}</span>
              <span class="badge-name">{{ badge.name }}</span>
              <span class="badge-date">{{ formatDate(badge.earned_at) }}</span>
            </div>
          </div>
          <el-empty v-if="userBadges.length === 0" description="尚未获得徽章" />

          <h3 class="section-title">徽章图鉴</h3>
          <div class="badges-grid">
            <div
              v-for="badge in allBadges"
              :key="badge.id"
              class="badge-item"
              :class="{ locked: !badge.is_earned }"
            >
              <span class="badge-icon">{{ badge.is_earned ? badge.icon : '🔒' }}</span>
              <span class="badge-name">{{ badge.name }}</span>
              <span class="badge-desc">{{ badge.description }}</span>
              <span class="badge-rarity" :style="{ color: getRarityColor(badge.rarity) }">
                {{ getRarityName(badge.rarity) }}
              </span>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="成就排行" name="leaderboard">
        <div v-if="!isLoggedIn" class="login-prompt">
          <el-empty description="请先登录查看成就排行">
            <el-button type="primary" @click="$router.push('/login')">去登录</el-button>
          </el-empty>
        </div>
        <div v-else class="leaderboard-section">
          <el-table :data="achievementLeaderboard" border>
            <el-table-column prop="rank" label="排名" width="60">
              <template #default="scope">
                <span v-if="scope.$index < 3" class="rank-badge top">
                  {{ scope.$index + 1 }}
                </span>
                <span v-else>{{ scope.$index + 1 }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="avatar" label="用户" width="80">
              <template #default="scope">
                <el-avatar :src="scope.row.avatar">{{ scope.row.nickname?.charAt(0) }}</el-avatar>
              </template>
            </el-table-column>
            <el-table-column prop="nickname" label="昵称" />
            <el-table-column prop="points" label="积分" width="100" />
            <el-table-column prop="completed_challenges" label="完成挑战" width="120" />
            <el-table-column prop="badge_count" label="徽章数" width="100" />
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="创建挑战" name="create">
        <div v-if="!isLoggedIn" class="login-prompt">
          <el-empty description="请先登录创建挑战">
            <el-button type="primary" @click="$router.push('/login')">去登录</el-button>
          </el-empty>
        </div>
        <div v-else class="create-section">
          <el-card>
            <el-form :model="createForm" label-width="120px">
              <el-form-item label="挑战标题" required>
                <el-input v-model="createForm.title" placeholder="请输入挑战标题" />
              </el-form-item>
              <el-form-item label="挑战描述" required>
                <el-input v-model="createForm.description" type="textarea" :rows="3" placeholder="请输入挑战描述" />
              </el-form-item>
              <el-form-item label="挑战类型" required>
                <el-select v-model="createForm.challenge_type">
                  <el-option v-for="cat in categories" :key="cat.id" :value="cat.id" :label="cat.name" />
                </el-select>
              </el-form-item>
              <el-form-item label="难度等级">
                <el-select v-model="createForm.difficulty_level">
                  <el-option v-for="level in difficultyLevels" :key="level.id" :value="level.id" :label="level.name" />
                </el-select>
              </el-form-item>
              <el-form-item label="目标值" required>
                <el-input-number v-model="createForm.target_value" :min="0.1" :step="0.1" />
                <el-select v-model="createForm.target_unit" style="margin-left: 10px;">
                  <el-option value="km" label="公里" />
                  <el-option value="min" label="分钟" />
                  <el-option value="次" label="次数" />
                  <el-option value="km/h" label="公里/小时" />
                </el-select>
              </el-form-item>
              <el-form-item label="开始日期" required>
                <el-date-picker v-model="createForm.start_date" type="date" />
              </el-form-item>
              <el-form-item label="结束日期" required>
                <el-date-picker v-model="createForm.end_date" type="date" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="submitChallenge">提交挑战</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 挑战详情弹窗 -->
    <el-dialog v-model="showDetailDialog" title="挑战详情" width="600px">
      <div v-if="selectedChallenge" class="challenge-detail">
        <div class="detail-header">
          <span class="detail-type">{{ getChallengeTypeName(selectedChallenge.challenge_type) }}</span>
          <span class="detail-difficulty" :style="{ color: getDifficultyColor(selectedChallenge.difficulty_level) }">
            {{ getDifficultyName(selectedChallenge.difficulty_level) }}
          </span>
        </div>
        <h2 class="detail-title">{{ selectedChallenge.title }}</h2>
        <p class="detail-desc">{{ selectedChallenge.description }}</p>
        
        <!-- 进度显示（已参加） -->
        <div v-if="selectedChallenge.is_participated" class="progress-section">
          <h4>我的进度</h4>
          <el-progress :percentage="selectedChallenge.my_progress || 0" :color="getProgressColor(selectedChallenge.my_progress)" />
          <p class="progress-text">{{ Math.round(selectedChallenge.my_progress || 0) }}% 完成</p>
        </div>
        
        <div class="detail-meta">
          <div class="meta-row">
            <span class="meta-label">开始时间</span>
            <span>{{ formatDate(selectedChallenge.start_date) }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">结束时间</span>
            <span>{{ formatDate(selectedChallenge.end_date) }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">参与人数</span>
            <span>{{ selectedChallenge.participant_count || 0 }} 人</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">目标</span>
            <span>{{ selectedChallenge.target_value }} {{ selectedChallenge.target_unit }}</span>
          </div>
        </div>

        <div class="detail-actions">
          <el-button
            v-if="selectedChallenge.is_participated"
            type="success"
            @click="startRideFromChallenge(selectedChallenge)"
          >
            🚴 开始骑行
          </el-button>
          <el-button
            v-else
            type="primary"
            @click="joinAndStartRide(selectedChallenge)"
          >
            参加挑战
          </el-button>
          <el-button @click="shareChallenge(selectedChallenge)">分享挑战</el-button>
        </div>
        
        <!-- 额外功能入口 -->
        <div class="extra-actions">
          <el-button v-if="selectedChallenge.is_participated" link @click="showDuelDialog(selectedChallenge)">
            <el-icon><Trophy /></el-icon>
            发起PK
          </el-button>
          <el-button link @click="loadChallengeTeams(selectedChallenge)">
            <el-icon><User /></el-icon>
            查看团队
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 更新进度弹窗 -->
    <el-dialog v-model="showProgressDialog" title="更新进度" width="400px">
      <el-form :model="progressForm" label-width="80px">
        <el-form-item label="进度值">
          <el-input-number v-model="progressForm.progress_value" :min="0" :step="0.1" />
          <span style="margin-left: 10px;">{{ currentChallenge?.target_unit }}</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="submitProgress">提交进度</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { User, Calendar, Check, Plus, Trophy } from '@element-plus/icons-vue';
import { socialApi } from '@/api/social';
import { challengeApi } from '@/api/challenge';
import RideTracker from '@/components/RideTracker.vue';

const handleRideComplete = (data) => {
  console.log('骑行完成:', data);
  ElMessage.success(`骑行完成！距离: ${(data.distance / 1000).toFixed(2)} 公里，时长: ${Math.floor(data.duration / 60)} 分钟`);
  loadMyChallenges();
};

const handleProgressUpdate = (data) => {
  console.log('进度更新:', data);
  if (data && data.progress !== undefined && data.challenge_id) {
    const challenge = myActiveChallenges.value.find(c => c.id === data.challenge_id);
    if (challenge) {
      challenge.my_progress = data.progress;
    }
  }
};

const startRideFromChallenge = (challenge) => {
  rideSelectedChallengeId.value = challenge.id;
  showDetailDialog.value = false;
  activeTab.value = 'ride';
};

const joinAndStartRide = async (challenge) => {
  try {
    const res = await challengeApi.joinChallenge(challenge.id);
    if (res.code === 200) {
      ElMessage.success('参加挑战成功！');
      challenge.is_participated = true;
      loadMyChallenges();
      rideSelectedChallengeId.value = challenge.id;
      showDetailDialog.value = false;
      activeTab.value = 'ride';
    }
  } catch (error) {
    console.error('参加挑战失败:', error);
  }
};

const activeTab = ref('discover');
const myChallengeTab = ref('active');
const activeCategory = ref('popular');
const filterType = ref('');
const filterDifficulty = ref('');
const isLoggedIn = ref(false);

const categories = ref([]);
const difficultyLevels = ref([]);
const challenges = ref([]);
const myActiveChallenges = ref([]);
const myCompletedChallenges = ref([]);
const userBadges = ref([]);
const allBadges = ref([]);
const userStats = ref({});
const achievementLeaderboard = ref([]);

const showDetailDialog = ref(false);
const showProgressDialog = ref(false);
const selectedChallenge = ref(null);
const currentChallenge = ref(null);
const rideSelectedChallengeId = ref(null);

const createForm = ref({
  title: '',
  description: '',
  challenge_type: 'distance',
  difficulty_level: 'beginner',
  target_value: 10,
  target_unit: 'km',
  start_date: new Date(),
  end_date: new Date()
});

const progressForm = ref({
  progress_value: 0
});

const getChallengeTypeName = (type) => {
  const map = {
    distance: '距离挑战',
    duration: '时长挑战',
    count: '次数挑战',
    speed: '速度挑战'
  };
  return map[type] || type;
};

const getDifficultyName = (level) => {
  const map = {
    beginner: '初级',
    intermediate: '中级',
    advanced: '高级'
  };
  return map[level] || level;
};

const getDifficultyColor = (level) => {
  const map = {
    beginner: '#10B981',
    intermediate: '#F59E0B',
    advanced: '#EF4444'
  };
  return map[level] || '#6B7280';
};

const getRarityName = (rarity) => {
  const map = {
    common: '普通',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说'
  };
  return map[rarity] || rarity;
};

const getRarityColor = (rarity) => {
  const map = {
    common: '#6B7280',
    rare: '#3B82F6',
    epic: '#F59E0B',
    legendary: '#8B5CF6'
  };
  return map[rarity] || '#6B7280';
};

const getProgressColor = (progress) => {
  if (!progress) return '#e0e0e0';
  if (progress < 30) return '#F59E0B';
  if (progress < 70) return '#3B82F6';
  if (progress < 100) return '#10B981';
  return '#8B5CF6';
};

const shareChallenge = (challenge) => {
  ElMessage.success('分享功能开发中');
};

const showDuelDialog = (challenge) => {
  ElMessage.info('PK挑战功能开发中');
};

const loadChallengeTeams = (challenge) => {
  ElMessage.info('团队列表功能开发中');
};

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('zh-CN');
};

const loadCategories = async () => {
  try {
    const res = await challengeApi.getCategories();
    if (res.code === 200) {
      categories.value = res.data.categories;
      difficultyLevels.value = res.data.difficultyLevels;
    }
  } catch (error) {
    console.error('获取分类失败:', error);
  }
};

const loadPopularChallenges = async () => {
  activeCategory.value = 'popular';
  try {
    const res = await challengeApi.getPopular({ limit: 20 });
    if (res.code === 200) {
      challenges.value = res.data;
    }
  } catch (error) {
    console.error('获取热门挑战失败:', error);
  }
};

const loadRecommendations = async () => {
  activeCategory.value = 'recommend';
  try {
    const res = await challengeApi.getRecommendations({ limit: 20 });
    if (res.code === 200) {
      challenges.value = res.data;
    }
  } catch (error) {
    console.error('获取推荐挑战失败:', error);
  }
};

const loadFeaturedChallenges = async () => {
  activeCategory.value = 'featured';
  try {
    const res = await challengeApi.getFiltered({ is_featured: true, limit: 20 });
    if (res.code === 200) {
      challenges.value = res.data.list;
    }
  } catch (error) {
    console.error('获取精选挑战失败:', error);
  }
};

const refreshChallenges = () => {
  if (filterType.value || filterDifficulty.value) {
    loadFilteredChallenges();
  } else {
    loadPopularChallenges();
  }
};

const forceRefresh = async () => {
  ElMessage.info('正在强制刷新...');
  await Promise.all([
    loadPopularChallenges(),
    loadMyChallenges()
  ]);
  ElMessage.success('刷新完成');
};

const loadFilteredChallenges = async () => {
  try {
    const res = await challengeApi.getFiltered({
      challenge_type: filterType.value || undefined,
      difficulty_level: filterDifficulty.value || undefined,
      limit: 20
    });
    if (res.code === 200) {
      challenges.value = res.data.list;
    }
  } catch (error) {
    console.error('筛选挑战失败:', error);
  }
};

const loadMyChallenges = async () => {
  try {
    const res = await socialApi.getChallenges({ status: 'active' });
    if (res.code === 200) {
      const participated = res.data.filter(c => c.is_participated);
      myActiveChallenges.value = participated.filter(c => c.my_progress < 100);
      myCompletedChallenges.value = participated.filter(c => c.my_progress >= 100);
    }
  } catch (error) {
    console.error('获取我的挑战失败:', error);
  }
};

const loadUserBadges = async () => {
  try {
    const res = await challengeApi.getUserBadges();
    if (res.code === 200) {
      userBadges.value = res.data;
    }
  } catch (error) {
    console.error('获取用户徽章失败:', error);
  }
};

const loadAllBadges = async () => {
  try {
    const res = await challengeApi.getBadges();
    if (res.code === 200) {
      allBadges.value = res.data;
    }
  } catch (error) {
    console.error('获取徽章列表失败:', error);
  }
};

const loadUserStats = async () => {
  try {
    const res = await challengeApi.getUserStats();
    if (res.code === 200) {
      userStats.value = res.data;
    }
  } catch (error) {
    console.error('获取用户统计失败:', error);
  }
};

const loadLeaderboard = async () => {
  try {
    const res = await challengeApi.getAchievementLeaderboard();
    if (res.code === 200) {
      achievementLeaderboard.value = res.data;
    }
  } catch (error) {
    console.error('获取排行榜失败:', error);
  }
};

const showChallengeDetail = (challenge) => {
  selectedChallenge.value = challenge;
  showDetailDialog.value = true;
};

const joinChallenge = async (challenge) => {
  try {
    const res = await socialApi.joinChallenge(challenge.id);
    if (res.code === 200) {
      ElMessage.success('参加成功');
      challenge.is_participated = true;
      challenge.my_progress = 0;
      challenge.participant_count = (challenge.participant_count || 0) + 1;
      loadMyChallenges();
      refreshChallenges();
    } else {
      ElMessage.warning(res.message);
    }
  } catch (error) {
    console.error('参加挑战失败:', error);
    ElMessage.error('参加失败');
  }
};

const viewChallengeProgress = (challenge) => {
  currentChallenge.value = challenge;
  showProgressDialog.value = true;
};

const submitProgress = async () => {
  if (!currentChallenge.value || progressForm.value.progress_value <= 0) {
    ElMessage.warning('请输入有效进度值');
    return;
  }

  try {
    const res = await socialApi.updateChallengeProgress(
      currentChallenge.value.id,
      { progress_value: progressForm.value.progress_value }
    );
    if (res.code === 200) {
      ElMessage.success('进度更新成功');
      currentChallenge.value.my_progress = res.data.progress;
      progressForm.value.progress_value = 0;
      showProgressDialog.value = false;
      loadMyChallenges();
      loadUserStats();
      loadUserBadges();
    }
  } catch (error) {
    console.error('更新进度失败:', error);
    ElMessage.error('更新失败');
  }
};

const createTeamForChallenge = () => {
  if (!selectedChallenge.value) return;
  ElMessage.info('团队创建功能开发中');
};

const submitChallenge = async () => {
  if (!createForm.value.title || !createForm.value.description) {
    ElMessage.warning('请填写完整信息');
    return;
  }

  try {
    console.log('[CREATE CHALLENGE] 开始创建挑战:', createForm.value);
    
    // 处理日期，确保是有效的日期字符串
    let startDate = createForm.value.start_date;
    let endDate = createForm.value.end_date;
    
    if (startDate instanceof Date) {
      startDate = startDate.toISOString().split('T')[0];
    } else if (typeof startDate === 'string') {
      // 如果已经是字符串，保持不变
    } else {
      console.error('[CREATE CHALLENGE] 开始日期格式错误:', startDate);
      ElMessage.error('开始日期格式错误');
      return;
    }
    
    if (endDate instanceof Date) {
      endDate = endDate.toISOString().split('T')[0];
    } else if (typeof endDate === 'string') {
      // 如果已经是字符串，保持不变
    } else {
      console.error('[CREATE CHALLENGE] 结束日期格式错误:', endDate);
      ElMessage.error('结束日期格式错误');
      return;
    }
    
    console.log('[CREATE CHALLENGE] 处理后的日期:', { startDate, endDate });
    
    const res = await challengeApi.createChallenge({
      title: createForm.value.title,
      description: createForm.value.description,
      challenge_type: createForm.value.challenge_type,
      target_value: createForm.value.target_value,
      target_unit: createForm.value.target_unit,
      start_date: startDate,
      end_date: endDate
    });
    console.log('[CREATE CHALLENGE] 创建结果:', res);
    
    if (res.code === 200) {
      ElMessage.success('挑战创建成功，等待审核（5秒后自动通过）');
      createForm.value = {
        title: '',
        description: '',
        challenge_type: 'distance',
        difficulty_level: 'beginner',
        target_value: 10,
        target_unit: 'km',
        start_date: new Date(),
        end_date: new Date()
      };
      // 刷新相关列表
      setTimeout(() => {
        refreshChallenges();
        loadMyChallenges();
      }, 5500);
    } else {
      console.error('[CREATE CHALLENGE] 服务器返回错误:', res.message);
      ElMessage.error(res.message || '创建失败');
    }
  } catch (error) {
    console.error('[CREATE CHALLENGE] 创建挑战失败:', error);
    console.error('[CREATE CHALLENGE] 错误详情:', error.response?.data || error.message);
    ElMessage.error('创建失败: ' + (error.message || '未知错误'));
  }
};

watch(activeTab, (newTab) => {
  if (newTab === 'discover') {
    refreshChallenges();
  } else if (newTab === 'my') {
    loadMyChallenges();
  } else if (newTab === 'achievements') {
    loadUserBadges();
    loadAllBadges();
    loadUserStats();
  } else if (newTab === 'leaderboard') {
    loadLeaderboard();
  }
});

onMounted(() => {
  loadCategories();
  loadPopularChallenges();

  const token = localStorage.getItem('token');
  isLoggedIn.value = !!token;
  if (token) {
    loadMyChallenges();
    loadUserBadges();
    loadAllBadges();
    loadUserStats();
    loadLeaderboard();
  }
});
</script>

<style scoped>
.challenge-page {
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
}

.page-title {
  font-size: 28px;
  font-weight: bold;
  margin: 0;
}

.page-subtitle {
  color: #666;
  margin-top: 8px;
}

.challenge-tabs {
  margin-bottom: 20px;
}

.discover-section {
  max-width: 1200px;
  margin: 0 auto;
}

.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.quick-categories {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
}

.quick-category {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #f5f5f5;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
}

.quick-category:hover,
.quick-category.active {
  background: #3B82F6;
  color: white;
}

.category-icon {
  font-size: 18px;
}

.challenge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.challenge-card {
  cursor: pointer;
  transition: transform 0.3s;
}

.challenge-card:hover {
  transform: translateY(-4px);
}

.challenge-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.challenge-type {
  background: #E0F2FE;
  color: #0284C7;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
}

.challenge-difficulty {
  font-size: 12px;
  font-weight: bold;
}

.challenge-title {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.challenge-desc {
  color: #666;
  font-size: 13px;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.challenge-meta {
  display: flex;
  gap: 20px;
  margin-bottom: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #999;
}

.challenge-target {
  margin-bottom: 15px;
}

.target-label {
  color: #999;
}

.target-value {
  font-weight: bold;
  color: #3B82F6;
}

.challenge-actions {
  display: flex;
  justify-content: flex-end;
}

.my-challenges {
  max-width: 800px;
  margin: 0 auto;
}

.challenge-list {
  padding: 10px;
}

.challenge-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px;
  border: 1px solid #eee;
  border-radius: 8px;
  margin-bottom: 10px;
}

.challenge-item.completed {
  background: #F0FDF4;
  border-color: #BBF7D0;
}

.challenge-info h4 {
  margin: 0 0 5px 0;
}

.challenge-info p {
  margin: 0;
  color: #666;
  font-size: 13px;
}

.challenge-progress {
  flex: 1;
  margin: 0 20px;
}

.progress-text {
  margin-left: 10px;
  font-size: 13px;
}

.challenge-badge {
  font-size: 24px;
  color: #F59E0B;
}

.achievements-section {
  max-width: 1000px;
  margin: 0 auto;
}

.stats-header {
  display: flex;
  justify-content: center;
  gap: 60px;
  margin-bottom: 30px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 32px;
  font-weight: bold;
  color: #3B82F6;
}

.stat-label {
  color: #666;
  font-size: 14px;
}

.section-title {
  margin: 20px 0 15px 0;
  font-size: 18px;
}

.badges-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 15px;
}

.badge-item {
  text-align: center;
  padding: 15px;
  background: #f9f9f9;
  border-radius: 8px;
}

.badge-item.locked {
  opacity: 0.5;
}

.badge-item.earned {
  background: #FEF3C7;
}

.badge-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 8px;
}

.badge-name {
  display: block;
  font-weight: bold;
  margin-bottom: 4px;
}

.badge-desc {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.badge-date {
  display: block;
  font-size: 11px;
  color: #999;
}

.badge-rarity {
  font-size: 11px;
}

.leaderboard-section {
  max-width: 800px;
  margin: 0 auto;
}

.rank-badge.top {
  background: #FCD34D;
  color: #92400E;
  padding: 2px 8px;
  border-radius: 4px;
}

.create-section {
  max-width: 600px;
  margin: 0 auto;
}

.challenge-detail {
  padding: 10px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
}

.detail-type {
  background: #E0F2FE;
  color: #0284C7;
  padding: 4px 12px;
  border-radius: 4px;
}

.detail-difficulty {
  font-weight: bold;
}

.detail-title {
  margin: 0 0 10px 0;
  font-size: 22px;
}

.detail-desc {
  color: #666;
  margin: 0 0 20px 0;
}

.detail-meta {
  margin-bottom: 20px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.meta-label {
  color: #666;
}

.progress-section {
  margin-bottom: 20px;
  padding: 15px;
  background: #f9f9f9;
  border-radius: 8px;
}

.progress-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #333;
}

.progress-section .progress-text {
  margin-top: 8px;
  text-align: center;
  color: #666;
}

.detail-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.extra-actions {
  display: flex;
  gap: 15px;
  justify-content: center;
  padding-top: 15px;
  border-top: 1px solid #eee;
}

.ride-section {
  height: 600px;
}

.login-prompt {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}
</style>
