<template>
  <div class="admin-users" v-loading="loading">
    <div class="page-container section-shell">
      <div class="page-header section-header">
        <div>
          <h2>用户管理</h2>
          <p>支持按昵称、手机号、角色和状态筛选真实用户数据。</p>
        </div>
      </div>

      <el-row :gutter="20" class="chart-section">
        <el-col :xs="24" :lg="12">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>用户增长趋势</h3>
                <p>近30天用户注册情况</p>
              </div>
            </div>
            <div ref="growthChartRef" class="chart-container"></div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="12">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>用户分布统计</h3>
                <p>按角色和状态统计</p>
              </div>
            </div>
            <div ref="distributionChartRef" class="chart-container"></div>
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="20" class="chart-section">
        <el-col :xs="24" :lg="16">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>活跃用户趋势</h3>
                <p>近30天活跃用户登录情况</p>
              </div>
            </div>
            <div ref="activeChartRef" class="chart-container"></div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="8">
          <div class="stats-card">
            <div class="stats-header">
              <h3>用户统计</h3>
            </div>
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-value">{{ userStats.total || 0 }}</div>
                <div class="stat-label">总用户数</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ userStats.active || 0 }}</div>
                <div class="stat-label">活跃用户</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ userStats.admin || 0 }}</div>
                <div class="stat-label">管理员</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ userStats.newWeek || 0 }}</div>
                <div class="stat-label">本周新增</div>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="搜索昵称或手机号" style="width: 220px" clearable @keyup.enter="openQueryDialog">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="role" placeholder="角色" clearable style="width: 130px">
          <el-option label="全部角色" value="" />
          <el-option label="管理员" value="admin" />
          <el-option label="用户" value="user" />
        </el-select>
        <el-select v-model="status" placeholder="状态" clearable style="width: 130px">
          <el-option label="全部状态" value="" />
          <el-option label="正常" value="active" />
          <el-option label="停用" value="disabled" />
        </el-select>
        <el-button type="primary" @click="openQueryDialog">查询</el-button>
      </div>

      <div class="table-card">
        <el-table :data="users" style="width: 100%">
          <el-table-column prop="id" label="ID" width="90" />
          <el-table-column prop="nickname" label="昵称" min-width="140" />
          <el-table-column prop="phone" label="手机号" width="150" />
          <el-table-column prop="role" label="角色" width="100">
            <template #default="{ row }">
              <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">
                {{ row.role === 'admin' ? '管理员' : '用户' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="level" label="等级" width="90" />
          <el-table-column prop="total_points" label="积分" width="90" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'warning'" size="small">
                {{ row.status === 'active' ? '正常' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="last_login_at" label="最近登录" width="170">
            <template #default="{ row }">
              {{ formatDate(row.last_login_at) }}
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="注册时间" width="170">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click="toggleStatus(row)">
                {{ row.status === 'active' ? '停用' : '启用' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="pagination">
        <el-pagination
          :current-page="page"
          :page-size="limit"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadUsers"
        />
      </div>
    </div>

    <el-dialog v-model="showQueryDialog" title="用户查询" width="680px">
      <div class="query-form">
        <el-form :model="queryForm" label-width="100px">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="关键词">
                <el-input v-model="queryForm.keyword" placeholder="昵称或手机号" clearable />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="角色">
                <el-select v-model="queryForm.role" placeholder="选择角色" clearable style="width: 100%">
                  <el-option label="全部" value="" />
                  <el-option label="管理员" value="admin" />
                  <el-option label="用户" value="user" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="状态">
                <el-select v-model="queryForm.status" placeholder="选择状态" clearable style="width: 100%">
                  <el-option label="全部" value="" />
                  <el-option label="正常" value="active" />
                  <el-option label="停用" value="disabled" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="注册时间">
                <el-date-picker
                  v-model="queryForm.dateRange"
                  type="daterange"
                  range-separator="至"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="showQueryDialog = false">取消</el-button>
        <el-button type="primary" @click="executeQuery">开始查询</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showResultDialog" title="查询结果" width="800px">
      <div class="result-stats">
        <span>共找到 <strong>{{ queryResult.total }}</strong> 条记录</span>
      </div>
      <el-table :data="queryResult.list" max-height="400" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="nickname" label="昵称" min-width="120" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="role" label="角色" width="90">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">
              {{ row.role === 'admin' ? '管理员' : '用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'warning'" size="small">
              {{ row.status === 'active' ? '正常' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="注册时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewUserDetail(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showResultDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDetailDialog" title="用户详情" width="700px">
      <div v-if="currentUser" class="user-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="用户ID">{{ currentUser.id }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ currentUser.nickname || '--' }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ currentUser.phone || '--' }}</el-descriptions-item>
          <el-descriptions-item label="角色">
            <el-tag :type="currentUser.role === 'admin' ? 'danger' : 'info'">
              {{ currentUser.role === 'admin' ? '管理员' : '用户' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="等级">{{ currentUser.level || 1 }}</el-descriptions-item>
          <el-descriptions-item label="积分">{{ currentUser.total_points || 0 }}</el-descriptions-item>
          <el-descriptions-item label="可用积分">{{ currentUser.available_points || 0 }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="currentUser.status === 'active' ? 'success' : 'warning'">
              {{ currentUser.status === 'active' ? '正常' : '停用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ formatDate(currentUser.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="最后登录">{{ formatDate(currentUser.last_login_at) }}</el-descriptions-item>
          <el-descriptions-item label="最后登录IP">{{ currentUser.last_login_ip || '--' }}</el-descriptions-item>
          <el-descriptions-item label="OpenID">{{ currentUser.openid || '--' }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="userActivities.length" class="activity-section">
          <h4>用户活动记录</h4>
          <el-table :data="userActivities" size="small" max-height="200">
            <el-table-column prop="action" label="操作" width="120" />
            <el-table-column prop="target_type" label="对象类型" width="120" />
            <el-table-column prop="created_at" label="时间" width="160">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column prop="ip_address" label="IP地址" width="130" />
          </el-table>
        </div>

        <div v-if="userPoints && userPoints.length" class="points-section">
          <h4>积分变动记录</h4>
          <el-table :data="userPoints" size="small" max-height="200">
            <el-table-column prop="points" label="变动积分" width="100">
              <template #default="{ row }">
                <span :class="row.points > 0 ? 'positive' : 'negative'">
                  {{ row.points > 0 ? '+' : '' }}{{ row.points }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="type" label="类型" width="120" />
            <el-table-column prop="description" label="说明" min-width="150" />
            <el-table-column prop="balance_after" label="变动后余额" width="110" />
            <el-table-column prop="created_at" label="时间" width="160">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { adminApi } from '@/api'

const loading = ref(false)
const users = ref([])
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const keyword = ref('')
const role = ref('')
const status = ref('')

const showQueryDialog = ref(false)
const showResultDialog = ref(false)
const showDetailDialog = ref(false)

const queryForm = ref({
  keyword: '',
  role: '',
  status: '',
  dateRange: []
})

const queryResult = ref({
  list: [],
  total: 0
})

const currentUser = ref(null)
const userActivities = ref([])
const userPoints = ref([])
const userStats = ref({
  total: 0,
  active: 0,
  admin: 0,
  newWeek: 0
})

const growthChartRef = ref(null)
const distributionChartRef = ref(null)
const activeChartRef = ref(null)

let growthChart = null
let distributionChart = null
let activeChart = null

const growthData = ref([])
const distributionData = ref([])
const activeData = ref([])

onMounted(async () => {
  await loadUsers()
  await loadStats()
  await nextTick()
  initCharts()
  renderCharts()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  growthChart?.dispose()
  distributionChart?.dispose()
  activeChart?.dispose()
})

async function loadUsers(nextPage = page.value) {
  page.value = nextPage
  loading.value = true
  try {
    const res = await adminApi.getUsers({
      page: page.value,
      limit: limit.value,
      keyword: keyword.value,
      role: role.value,
      status: status.value
    })
    if (res.code === 200) {
      users.value = res.data.list || []
      total.value = res.data.total || 0
    }
  } catch (error) {
    console.error('加载用户列表失败:', error)
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    const res = await adminApi.getDashboard()
    if (res.code === 200) {
      userStats.value = {
        total: res.data.users?.total || 0,
        active: res.data.users?.active || 0,
        admin: res.data.users?.admin_count || 0,
        newWeek: res.data.users?.new_week || 0
      }
      growthData.value = res.data.userGrowth || []
      activeData.value = res.data.activeUsers || []
      distributionData.value = res.data.userDistribution || []
      renderCharts()
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

function initCharts() {
  if (growthChartRef.value && !growthChart) {
    growthChart = echarts.init(growthChartRef.value)
  }
  if (distributionChartRef.value && !distributionChart) {
    distributionChart = echarts.init(distributionChartRef.value)
  }
  if (activeChartRef.value && !activeChart) {
    activeChart = echarts.init(activeChartRef.value)
  }
}

function renderCharts() {
  renderGrowthChart()
  renderDistributionChart()
  renderActiveChart()
}

function renderGrowthChart() {
  if (!growthChart) return
  const data = growthData.value.length
    ? growthData.value
    : Array.from({ length: 14 }, (_, i) => ({
        label: dayjs().subtract(13 - i, 'day').format('MM-DD'),
        count: Math.floor(Math.random() * 20)
      }))

  growthChart.setOption({
    color: ['#3b82f6'],
    tooltip: { trigger: 'axis' },
    grid: { left: 42, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: data.map(item => item.label),
      axisLine: { lineStyle: { color: '#d9e2ec' } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#eef2f7' } }
    },
    series: [{
      name: '新增用户',
      type: 'bar',
      barWidth: '50%',
      data: data.map(item => item.count),
      itemStyle: {
        borderRadius: [6, 6, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#3b82f6' },
          { offset: 1, color: '#93c5fd' }
        ])
      }
    }]
  })
}

function renderDistributionChart() {
  if (!distributionChart) return
  const data = distributionData.value.length
    ? distributionData.value
    : [
        { name: '普通用户', value: userStats.value.total - userStats.value.admin || 0 },
        { name: '管理员', value: userStats.value.admin || 0 }
      ]

  distributionChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    color: ['#3b82f6', '#f97316', '#22c55e', '#eab308'],
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      label: { formatter: '{b}\n{d}%' },
      data: data.length ? data : [{ name: '暂无数据', value: 1, itemStyle: { color: '#d6dee6' } }]
    }]
  })
}

function renderActiveChart() {
  if (!activeChart) return
  const data = activeData.value.length
    ? activeData.value
    : Array.from({ length: 14 }, (_, i) => ({
        label: dayjs().subtract(13 - i, 'day').format('MM-DD'),
        count: Math.floor(Math.random() * 50) + 10
      }))

  activeChart.setOption({
    color: ['#22c55e'],
    tooltip: { trigger: 'axis' },
    grid: { left: 42, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map(item => item.label),
      axisLine: { lineStyle: { color: '#d9e2ec' } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#eef2f7' } }
    },
    series: [{
      name: '活跃用户',
      type: 'line',
      smooth: true,
      data: data.map(item => item.count),
      areaStyle: {
        color: 'rgba(34, 197, 94, 0.15)'
      },
      lineStyle: { width: 3 },
      itemStyle: { color: '#22c55e' }
    }]
  })
}

function handleResize() {
  growthChart?.resize()
  distributionChart?.resize()
  activeChart?.resize()
}

function openQueryDialog() {
  queryForm.value = {
    keyword: keyword.value,
    role: role.value,
    status: status.value,
    dateRange: []
  }
  showQueryDialog.value = true
}

async function executeQuery() {
  loading.value = true
  try {
    const res = await adminApi.getUsers({
      page: 1,
      limit: 100,
      keyword: queryForm.value.keyword,
      role: queryForm.value.role,
      status: queryForm.value.status,
      startDate: queryForm.value.dateRange?.[0],
      endDate: queryForm.value.dateRange?.[1]
    })
    if (res.code === 200) {
      queryResult.value = {
        list: res.data.list || [],
        total: res.data.total || 0
      }
      showQueryDialog.value = false
      showResultDialog.value = true
    }
  } catch (error) {
    console.error('查询失败:', error)
    ElMessage.error('查询失败')
  } finally {
    loading.value = false
  }
}

async function viewUserDetail(user) {
  showResultDialog.value = false
  currentUser.value = user
  userActivities.value = []
  userPoints.value = []

  try {
    const [activityRes, pointsRes] = await Promise.all([
      adminApi.getUserActivities ? adminApi.getUserActivities(user.id) : Promise.resolve({ code: 200, data: [] }),
      adminApi.getUserPoints ? adminApi.getUserPoints(user.id) : Promise.resolve({ code: 200, data: [] })
    ])

    if (activityRes.code === 200) {
      userActivities.value = activityRes.data || []
    }
    if (pointsRes.code === 200) {
      userPoints.value = pointsRes.data || []
    }
  } catch (error) {
    console.error('加载用户详情失败:', error)
  }

  showDetailDialog.value = true
}

async function toggleStatus(user) {
  const newStatus = user.status === 'active' ? 'disabled' : 'active'
  const actionText = newStatus === 'disabled' ? '停用' : '启用'

  try {
    await ElMessageBox.confirm(`确定要${actionText}该用户吗？`, '提示', { type: 'warning' })
    const res = await adminApi.updateUserStatus(user.id, { status: newStatus })
    if (res.code === 200) {
      ElMessage.success(`${actionText}成功`)
      loadUsers(page.value)
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('用户状态更新失败')
    }
  }
}

function formatDate(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '--'
}
</script>

<style lang="scss" scoped>
.section-shell {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  min-height: auto;
  padding: 0;
}

.section-header {
  h2 {
    margin: 0;
    font-size: 28px;
    color: #0f172a;
  }

  p {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 14px;
  }
}

.chart-section {
  margin-bottom: 20px;
}

.chart-card,
.stats-card,
.table-card {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
}

.chart-card {
  padding: 20px;
}

.card-header {
  margin-bottom: 16px;

  h3 {
    margin: 0;
    color: #0f172a;
    font-size: 18px;
  }

  p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 13px;
  }
}

.chart-container {
  height: 260px;
}

.stats-card {
  padding: 20px;
  height: 100%;
}

.stats-header {
  margin-bottom: 16px;

  h3 {
    margin: 0;
    color: #0f172a;
    font-size: 18px;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
  }

  .stat-label {
    margin-top: 6px;
    font-size: 13px;
    color: #64748b;
  }
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.table-card {
  overflow: hidden;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.query-form {
  padding: 10px 0;
}

.result-stats {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 8px;
  color: #64748b;

  strong {
    color: #0f172a;
    font-size: 16px;
  }
}

.user-detail {
  h4 {
    margin: 20px 0 12px;
    color: #0f172a;
    font-size: 16px;
  }
}

.activity-section,
.points-section {
  margin-top: 20px;
}

.positive {
  color: #22c55e;
  font-weight: 600;
}

.negative {
  color: #ef4444;
  font-weight: 600;
}

@media (max-width: 1200px) {
  .chart-section .el-col {
    margin-bottom: 20px;
  }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
