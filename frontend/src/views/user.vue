<template>
  <div class="user-page">
    <div class="user-header">
      <div class="user-info">
        <el-avatar :size="80" :src="userStore.avatar">
          {{ (userStore.nickname || 'U').charAt(0) }}
        </el-avatar>
        <div class="info-text">
          <h2>{{ userStore.nickname }}</h2>
          <div class="level-info">
            <el-tag type="warning">Lv.{{ userInfo.level || 1 }}</el-tag>
            <span class="points">积分: {{ userInfo.available_points || 0 }}</span>
          </div>
        </div>
      </div>
      <el-button @click="showEditDialog = true">编辑资料</el-button>
    </div>
    
    <div class="stats-row">
      <div class="stat-item" @click="activeTab = 'routes'">
        <div class="stat-value">{{ stats.route_count || 0 }}</div>
        <div class="stat-label">我的路线</div>
      </div>
      <div class="stat-item" @click="activeTab = 'reports'">
        <div class="stat-value">{{ stats.report_count || 0 }}</div>
        <div class="stat-label">民情上报</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ ((stats.total_distance || 0) / 1000).toFixed(1) }}</div>
        <div class="stat-label">累计里程(km)</div>
      </div>
    </div>
    
    <div class="content-section">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="我的路线" name="routes">
          <div class="route-list" v-loading="loadingRoutes">
            <div class="route-item" v-for="route in routes" :key="route.id">
              <div class="route-info">
                <h4>{{ route.route_name }}</h4>
                <p>{{ route.start_name }} → {{ route.end_name }}</p>
                <div class="route-meta">
                  <span>{{ (route.total_distance || 0).toFixed(1) }}km</span>
                  <span>{{ route.total_time }}分钟</span>
                </div>
              </div>
              <div class="route-actions">
                <el-button type="primary" link @click="viewRoute(route)">查看</el-button>
                <el-button type="danger" link @click="deleteRoute(route.id)">删除</el-button>
              </div>
            </div>
            <el-empty v-if="!loadingRoutes && routes.length === 0" description="暂无路线" />
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="民情上报" name="reports">
          <div class="report-list" v-loading="loadingReports">
            <div class="report-item" v-for="report in reports" :key="report.id">
              <div class="report-info">
                <div class="report-header">
                  <span class="report-type">{{ report.event_type }}</span>
                  <el-tag :type="getStatusType(report.status)" size="small">
                    {{ getStatusText(report.status) }}
                  </el-tag>
                </div>
                <h4>{{ report.title }}</h4>
                <p>{{ report.address }}</p>
              </div>
              <div class="report-time">
                {{ formatDate(report.created_at) }}
              </div>
            </div>
            <el-empty v-if="!loadingReports && reports.length === 0" description="暂无上报" />
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="积分记录" name="points">
          <div class="points-section">
            <div class="points-summary">
              <div class="point-item">
                <span class="label">总积分</span>
                <span class="value">{{ pointsInfo.total_points || 0 }}</span>
              </div>
              <div class="point-item">
                <span class="label">可用积分</span>
                <span class="value primary">{{ pointsInfo.available_points || 0 }}</span>
              </div>
              <div class="point-item">
                <span class="label">已用积分</span>
                <span class="value">{{ pointsInfo.used_points || 0 }}</span>
              </div>
            </div>
            
            <h4>积分明细</h4>
            <div class="point-logs">
              <div class="log-item" v-for="log in pointLogs" :key="log.id">
                <div class="log-info">
                  <span class="log-desc">{{ log.description }}</span>
                  <span class="log-time">{{ formatDate(log.created_at) }}</span>
                </div>
                <span class="log-points" :class="{ positive: log.points > 0 }">
                  {{ log.points > 0 ? '+' : '' }}{{ log.points }}
                </span>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
    
    <el-dialog v-model="showEditDialog" title="编辑资料" width="400px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="昵称">
          <el-input v-model="editForm.nickname" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="editForm.gender">
            <el-radio value="male">男</el-radio>
            <el-radio value="female">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="生日">
          <el-date-picker v-model="editForm.birthday" type="date" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveProfile">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { userApi, routeApi } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const activeTab = ref('routes')
const userInfo = ref({})
const stats = ref({})
const routes = ref([])
const reports = ref([])
const pointsInfo = ref({})
const pointLogs = ref([])

const loadingRoutes = ref(false)
const loadingReports = ref(false)

const showEditDialog = ref(false)
const editForm = ref({
  nickname: '',
  gender: '',
  birthday: ''
})

onMounted(() => {
  if (!userStore.isLoggedIn || !userStore.isTokenValid()) {
    ElMessage.warning('请先登录')
    userStore.logout()
    return
  }
  loadUserInfo()
  loadStats()
  loadRoutes()
})

watch(activeTab, (val) => {
  if (val === 'reports') loadReports()
  if (val === 'points') loadPoints()
})

async function loadUserInfo() {
  try {
    const res = await userApi.getProfile()
    if (res.code === 200) {
      userInfo.value = res.data
      editForm.value = {
        nickname: res.data.nickname,
        gender: res.data.gender,
        birthday: res.data.birthday
      }
    }
  } catch (e) {
    console.error('加载用户信息失败:', e)
    if (e.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      userStore.logout()
    }
  }
}

async function loadStats() {
  try {
    const res = await userApi.getStats()
    if (res.code === 200) {
      stats.value = res.data
    }
  } catch (e) {
    console.error('加载统计失败:', e)
    if (e.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      userStore.logout()
    }
  }
}

async function loadRoutes() {
  loadingRoutes.value = true
  try {
    const res = await userApi.getRoutes({ limit: 20 })
    if (res.code === 200) {
      routes.value = res.data.list
    }
  } catch (e) {
    console.error('加载路线失败:', e)
    if (e.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      userStore.logout()
    }
  } finally {
    loadingRoutes.value = false
  }
}



async function loadReports() {
  loadingReports.value = true
  try {
    const res = await userApi.getReports({ limit: 20 })
    if (res.code === 200) {
      reports.value = res.data.list
    }
  } catch (e) {
    console.error('加载上报失败:', e)
  } finally {
    loadingReports.value = false
  }
}

async function loadPoints() {
  try {
    const res = await userApi.getPoints()
    if (res.code === 200) {
      pointsInfo.value = res.data.points
      pointLogs.value = res.data.logs
    }
  } catch (e) {
    console.error('加载积分失败:', e)
  }
}

async function saveProfile() {
  try {
    const res = await userApi.updateProfile(editForm.value)
    if (res.code === 200) {
      ElMessage.success('保存成功')
      showEditDialog.value = false
      loadUserInfo()
      userStore.fetchUserInfo()
    }
  } catch {
    ElMessage.error('保存失败')
  }
}

async function deleteRoute(id) {
  try {
    await ElMessageBox.confirm('确定删除该路线？', '提示', { type: 'warning' })
    const res = await routeApi.delete(id)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      loadRoutes()
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

function viewRoute() {
  ElMessage.info('路线详情功能开发中')
}

function getStatusType(status) {
  const types = { pending: 'warning', processing: 'primary', completed: 'success', rejected: 'danger' }
  return types[status] || 'info'
}

function getStatusText(status) {
  const texts = { pending: '待受理', processing: '处理中', completed: '已完成', rejected: '已驳回' }
  return texts[status] || status
}

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}
</script>

<style lang="scss" scoped>
.user-page {
  padding: 20px;
}

.user-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
  padding: 30px;
  border-radius: 12px;
  color: #fff;
  margin-bottom: 20px;
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 20px;
    
    h2 {
      margin-bottom: 8px;
    }
    
    .level-info {
      display: flex;
      align-items: center;
      gap: 10px;
      
      .points {
        font-size: 14px;
      }
    }
  }
}

.stats-row {
  display: flex;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  
  .stat-item {
    flex: 1;
    text-align: center;
    cursor: pointer;
    
    &:hover {
      background: #f5f7fa;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #409eff;
    }
    
    .stat-label {
      font-size: 13px;
      color: #999;
      margin-top: 5px;
    }
  }
}

.content-section {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
}

.route-list, .report-list {
  .route-item, .report-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 0;
    border-bottom: 1px solid #f0f0f0;
    
    &:last-child {
      border-bottom: none;
    }
  }
}



.report-item {
  .report-info {
    flex: 1;
    
    .report-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 5px;
      
      .report-type {
        font-size: 12px;
        color: #999;
      }
    }
    
    h4 {
      margin-bottom: 5px;
    }
    
    p {
      font-size: 13px;
      color: #999;
    }
  }
}

.points-section {
  .points-summary {
    display: flex;
    gap: 30px;
    margin-bottom: 20px;
    
    .point-item {
      text-align: center;
      
      .label {
        display: block;
        font-size: 13px;
        color: #999;
        margin-bottom: 5px;
      }
      
      .value {
        font-size: 24px;
        font-weight: 600;
        
        &.primary {
          color: #409eff;
        }
      }
    }
  }
  
  .point-logs {
    .log-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #f0f0f0;
      
      .log-info {
        .log-desc {
          display: block;
        }
        
        .log-time {
          font-size: 12px;
          color: #999;
        }
      }
      
      .log-points {
        font-weight: 600;
        
        &.positive {
          color: #67c23a;
        }
      }
    }
  }
}
</style>
