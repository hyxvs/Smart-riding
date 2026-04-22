<template>
  <div class="admin-dashboard" v-loading="loading">
    <div class="page-container dashboard-shell">
      <div class="page-header dashboard-header">
        <div>
          <h2>数据概览</h2>
          <p>管理员首页直接展示数据库实时统计、事件趋势和待办信息。</p>
        </div>
        <el-button type="primary" plain @click="loadDashboard">
          <el-icon><Refresh /></el-icon>
          刷新数据
        </el-button>
      </div>

      <div class="metrics-grid">
        <div class="metric-card users">
          <div class="metric-icon">
            <el-icon :size="24"><User /></el-icon>
          </div>
          <div class="metric-content">
            <div class="metric-value">{{ stats.users?.total || 0 }}</div>
            <div class="metric-label">平台注册用户</div>
            <div class="metric-meta">近 7 天新增 {{ stats.users?.new_week || 0 }} 人</div>
          </div>
        </div>

        <div class="metric-card reports">
          <div class="metric-icon">
            <el-icon :size="24"><Warning /></el-icon>
          </div>
          <div class="metric-content">
            <div class="metric-value">{{ stats.reports?.pending || 0 }}</div>
            <div class="metric-label">待处理事件</div>
            <div class="metric-meta">事件总量 {{ stats.reports?.total || 0 }}</div>
          </div>
        </div>

        <div class="metric-card poi">
          <div class="metric-icon">
            <el-icon :size="24"><Place /></el-icon>
          </div>
          <div class="metric-content">
            <div class="metric-value">{{ stats.poi?.total || 0 }}</div>
            <div class="metric-label">POI 资源总量</div>
            <div class="metric-meta">红色资源 {{ stats.poi?.red_spots || 0 }} 处</div>
          </div>
        </div>

        <div class="metric-card roads">
          <div class="metric-icon">
            <el-icon :size="24"><MapLocation /></el-icon>
          </div>
          <div class="metric-content">
            <div class="metric-value">{{ formatDistance(stats.roads?.total_length_km) }}</div>
            <div class="metric-label">道路总里程（km）</div>
            <div class="metric-meta">骑行道 {{ stats.roads?.bike_lane_count || 0 }} 条</div>
          </div>
        </div>
      </div>

      <div class="summary-strip">
        <div class="summary-item">
          <span class="summary-label">活跃用户占比</span>
          <strong>{{ activeUserRate }}%</strong>
        </div>
        <div class="summary-item">
          <span class="summary-label">处理中事件</span>
          <strong>{{ stats.reports?.processing || 0 }}</strong>
        </div>
        <div class="summary-item">
          <span class="summary-label">平均处置时长</span>
          <strong>{{ avgHandleHours }} 小时</strong>
        </div>
        <div class="summary-item">
          <span class="summary-label">公开骑行日记</span>
          <strong>{{ stats.diaries?.total || 0 }}</strong>
        </div>
      </div>

      <el-row :gutter="20" class="chart-row">
        <el-col :xs="24" :lg="16">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>近 14 天事件趋势</h3>
                <p>基于 `report_event` 表实时聚合。</p>
              </div>
            </div>
            <div ref="trendChartRef" class="chart-container"></div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="8">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>事件类型分布</h3>
                <p>当前数据库内的全部上报类型统计。</p>
              </div>
            </div>
            <div ref="typeChartRef" class="chart-container"></div>
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="20" class="list-row">
        <el-col :xs="24" :lg="12">
          <div class="list-card">
            <div class="card-header">
              <div>
                <h3>待办事件</h3>
                <p>优先关注待处理和处理中事件。</p>
              </div>
              <el-button type="primary" link @click="$router.push('/admin/reports')">查看全部</el-button>
            </div>

            <el-table :data="pendingReports" size="small" style="width: 100%">
              <el-table-column prop="report_no" label="编号" width="160" />
              <el-table-column prop="event_type" label="类型" width="110" />
              <el-table-column prop="title" label="标题" min-width="150" show-overflow-tooltip />
              <el-table-column prop="status" label="状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="getReportStatusType(row.status)" size="small">
                    {{ getReportStatusText(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="created_at" label="时间" width="160">
                <template #default="{ row }">
                  {{ formatDate(row.created_at) }}
                </template>
              </el-table-column>
            </el-table>

            <el-empty v-if="!pendingReports.length" description="当前没有待办事件" :image-size="80" />
          </div>
        </el-col>

        <el-col :xs="24" :lg="12">
          <div class="list-card">
            <div class="card-header">
              <div>
                <h3>最新注册用户</h3>
                <p>用于观察后台的真实新增情况。</p>
              </div>
              <el-button type="primary" link @click="$router.push('/admin/users')">查看全部</el-button>
            </div>

            <el-table :data="newUsers" size="small" style="width: 100%">
              <el-table-column prop="nickname" label="昵称" min-width="120" />
              <el-table-column prop="phone" label="手机号" width="140" />
              <el-table-column prop="role" label="角色" width="90">
                <template #default="{ row }">
                  <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">
                    {{ row.role === 'admin' ? '管理员' : '用户' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="90">
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
            </el-table>

            <el-empty v-if="!newUsers.length" description="暂无新增用户" :image-size="80" />
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { adminApi } from '@/api'

const loading = ref(false)
const stats = ref({
  users: { total: 0, active: 0, new_week: 0 },
  reports: { total: 0, pending: 0, processing: 0, completed: 0, avg_handle_hours: 0 },
  diaries: { total: 0, week_count: 0 },
  routes: { total: 0, total_distance: 0 },
  poi: { total: 0, red_spots: 0, new_month: 0 },
  roads: { total: 0, bike_lane_count: 0, total_length_km: 0 }
})
const trendData = ref([])
const typeData = ref([])
const pendingReports = ref([])
const newUsers = ref([])

const trendChartRef = ref(null)
const typeChartRef = ref(null)

let trendChart = null
let typeChart = null

const activeUserRate = computed(() => {
  const total = Number(stats.value.users?.total || 0)
  const active = Number(stats.value.users?.active || 0)
  return total ? ((active / total) * 100).toFixed(1) : '0.0'
})

const avgHandleHours = computed(() => {
  const value = Number(stats.value.reports?.avg_handle_hours || 0)
  return value ? value.toFixed(1) : '0.0'
})

onMounted(async () => {
  await loadDashboard()
  await nextTick()
  initCharts()
  renderCharts()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  typeChart?.dispose()
})

async function loadDashboard() {
  loading.value = true
  try {
    const res = await adminApi.getDashboard()
    if (res.code === 200) {
      stats.value = res.data
      trendData.value = res.data.reportTrend || []
      typeData.value = res.data.reportTypes || []
      pendingReports.value = res.data.pendingReports || []
      newUsers.value = res.data.newUsers || []
      nextTick(() => renderCharts())
    }
  } catch (error) {
    console.error('加载管理员仪表盘失败:', error)
  } finally {
    loading.value = false
  }
}

function initCharts() {
  if (trendChartRef.value && !trendChart) {
    trendChart = echarts.init(trendChartRef.value)
  }
  if (typeChartRef.value && !typeChart) {
    typeChart = echarts.init(typeChartRef.value)
  }
}

function renderCharts() {
  if (trendChart) {
    trendChart.setOption({
      color: ['#1f9d55'],
      tooltip: { trigger: 'axis' },
      grid: { left: 42, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: trendData.value.map(item => item.label),
        axisLine: { lineStyle: { color: '#d9e2ec' } }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#eef2f7' } }
      },
      series: [{
        name: '事件数',
        type: 'line',
        smooth: true,
        data: trendData.value.map(item => item.count),
        areaStyle: {
          color: 'rgba(31, 157, 85, 0.12)'
        },
        lineStyle: {
          width: 3
        },
        itemStyle: {
          color: '#1f9d55'
        }
      }]
    })
  }

  if (typeChart) {
    const pieData = typeData.value.length
      ? typeData.value.map(item => ({ name: item.name, value: item.value }))
      : [{ name: '暂无数据', value: 1, itemStyle: { color: '#d6dee6' } }]

    typeChart.setOption({
      tooltip: { trigger: 'item' },
      color: ['#f97316', '#2563eb', '#14b8a6', '#ef4444', '#0f766e', '#84cc16'],
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '54%'],
        label: {
          formatter: '{b}\n{d}%'
        },
        data: pieData
      }]
    })
  }
}

function handleResize() {
  trendChart?.resize()
  typeChart?.resize()
}

function formatDate(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '--'
}

function formatDistance(value) {
  return Number(value || 0).toFixed(1)
}

function getReportStatusType(status) {
  return {
    pending: 'warning',
    processing: 'primary',
    completed: 'success',
    rejected: 'danger'
  }[status] || 'info'
}

function getReportStatusText(status) {
  return {
    pending: '待处理',
    processing: '处理中',
    completed: '已完成',
    rejected: '已驳回'
  }[status] || status
}
</script>

<style lang="scss" scoped>
.dashboard-shell {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  min-height: auto;
  padding: 0;
}

.dashboard-header {
  margin-bottom: 22px;

  h2 {
    margin: 0;
    font-size: 28px;
    color: #0f172a;
  }

  p {
    margin: 8px 0 0;
    font-size: 14px;
    color: #64748b;
  }
}

.admin-dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 18px;
}

.metric-card,
.chart-card,
.list-card,
.summary-strip {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 20px;
  box-shadow: 0 14px 35px rgba(15, 23, 42, 0.06);
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px;

  &.users .metric-icon {
    background: linear-gradient(135deg, #0ea5e9, #2563eb);
  }

  &.reports .metric-icon {
    background: linear-gradient(135deg, #f97316, #ef4444);
  }

  &.poi .metric-icon {
    background: linear-gradient(135deg, #14b8a6, #0f766e);
  }

  &.roads .metric-icon {
    background: linear-gradient(135deg, #84cc16, #16a34a);
  }
}

.metric-icon {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.metric-content {
  min-width: 0;
}

.metric-value {
  font-size: 30px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
}

.metric-label {
  margin-top: 4px;
  font-size: 14px;
  color: #334155;
}

.metric-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  padding: 18px 22px;
  margin-bottom: 18px;
}

.summary-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;

  strong {
    font-size: 20px;
    color: #0f172a;
  }
}

.summary-label {
  color: #64748b;
  font-size: 13px;
}

.chart-row,
.list-row {
  margin: 0;
}

.chart-card,
.list-card {
  padding: 22px;
  min-height: 100%;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;

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
  height: 320px;
}

@media (max-width: 1200px) {
  .metrics-grid,
  .summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .dashboard-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .metrics-grid,
  .summary-strip {
    grid-template-columns: 1fr;
  }

  .metric-card,
  .chart-card,
  .list-card {
    padding: 18px;
  }
}
</style>
