<template>
  <div class="admin-reports" v-loading="loading">
    <div class="page-container section-shell">
      <div class="page-header section-header">
        <div>
          <h2>民情处置</h2>
          <p>支持对真实上报事件进行筛选、查看详情和部门流转。</p>
        </div>
        <el-button type="primary" @click="openQueryDialog">
          <el-icon><Search /></el-icon>
          查询事件
        </el-button>
      </div>

      <el-row :gutter="20" class="chart-section">
        <el-col :xs="24" :lg="12">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>事件趋势统计</h3>
                <p>近30天事件上报趋势</p>
              </div>
            </div>
            <div ref="trendChartRef" class="chart-container"></div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="12">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>事件类型分布</h3>
                <p>按类型统计事件数量</p>
              </div>
            </div>
            <div ref="typeChartRef" class="chart-container"></div>
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="20" class="chart-section">
        <el-col :xs="24" :lg="16">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>紧急度分布统计</h3>
                <p>按紧急度等级统计事件分布</p>
              </div>
            </div>
            <div ref="urgencyChartRef" class="chart-container"></div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="8">
          <div class="stats-card">
            <div class="stats-header">
              <h3>事件统计</h3>
            </div>
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-value">{{ reportStats.total || 0 }}</div>
                <div class="stat-label">事件总量</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ reportStats.pending || 0 }}</div>
                <div class="stat-label">待处理</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ reportStats.processing || 0 }}</div>
                <div class="stat-label">处理中</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ reportStats.completed || 0 }}</div>
                <div class="stat-label">已完成</div>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ reportStats.total || 0 }}</div>
          <div class="stat-label">事件总量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ reportStats.pending || 0 }}</div>
          <div class="stat-label">待处理</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ reportStats.processing || 0 }}</div>
          <div class="stat-label">处理中</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ reportStats.completed || 0 }}</div>
          <div class="stat-label">已完成</div>
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="status" placeholder="状态" clearable style="width: 130px">
          <el-option label="全部状态" value="" />
          <el-option label="待处理" value="pending" />
          <el-option label="处理中" value="processing" />
          <el-option label="已完成" value="completed" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
        <el-select v-model="eventType" placeholder="类型" clearable style="width: 140px">
          <el-option label="全部类型" value="" />
          <el-option label="道路破损" value="道路破损" />
          <el-option label="井盖缺失" value="井盖缺失" />
        </el-select>
        <el-button type="primary" @click="loadReports(1)">筛选</el-button>
      </div>

      <div class="table-card">
        <el-table :data="reports" style="width: 100%" @row-click="openResultDetail">
          <el-table-column prop="report_no" label="编号" width="180" />
          <el-table-column prop="event_type" label="类型" width="120" />
          <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
          <el-table-column prop="address" label="地址" min-width="180" show-overflow-tooltip />
          <el-table-column prop="urgency_level" label="紧急度" width="110">
            <template #default="{ row }">
              <el-rate :model-value="row.urgency_level" disabled :max="3" />
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)" size="small">
                {{ getStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="上报时间" width="170">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click.stop="openHandleDialog(row)">处理</el-button>
              <el-button type="info" link @click.stop="viewDetail(row)">详情</el-button>
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
          @current-change="loadReports"
        />
      </div>
    </div>

    <el-dialog v-model="showQueryDialog" title="事件查询" width="700px">
      <div class="query-form">
        <el-form :model="queryForm" label-width="100px">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="关键词">
                <el-input v-model="queryForm.keyword" placeholder="编号、标题、地址" clearable />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="事件类型">
                <el-select v-model="queryForm.eventType" placeholder="选择类型" clearable style="width: 100%">
                  <el-option label="全部" value="" />
                  <el-option label="道路破损" value="道路破损" />
                  <el-option label="井盖缺失" value="井盖缺失" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="状态">
                <el-select v-model="queryForm.status" placeholder="选择状态" clearable style="width: 100%">
                  <el-option label="全部" value="" />
                  <el-option label="待处理" value="pending" />
                  <el-option label="处理中" value="processing" />
                  <el-option label="已完成" value="completed" />
                  <el-option label="已驳回" value="rejected" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="紧急度">
                <el-input-number v-model="queryForm.minUrgency" :min="1" :max="3" placeholder="最低紧急度" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="上报时间">
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
            <el-col :span="12">
              <el-form-item label="处理部门">
                <el-select v-model="queryForm.deptId" placeholder="选择部门" clearable style="width: 100%">
                  <el-option label="全部" value="" />
                  <el-option v-for="dept in depts" :key="dept.id" :label="dept.name" :value="dept.id" />
                </el-select>
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

    <el-dialog v-model="showResultDialog" title="查询结果" width="900px">
      <div class="result-stats">
        <span>共找到 <strong>{{ queryResult.total }}</strong> 条记录</span>
      </div>
      <el-table :data="queryResult.list" max-height="400" style="width: 100%" @row-click="openResultDetail">
        <el-table-column prop="report_no" label="编号" width="180" />
        <el-table-column prop="event_type" label="类型" width="120" />
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="urgency_level" label="紧急度" width="100">
          <template #default="{ row }">
            <el-rate :model-value="row.urgency_level" disabled :max="3" />
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="上报时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click.stop="viewDetail(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showResultDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDetailDialog" title="上报详情" width="640px">
      <el-descriptions v-if="currentReport" :column="1" border>
        <el-descriptions-item label="编号">{{ currentReport.report_no }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ currentReport.event_type }}</el-descriptions-item>
        <el-descriptions-item label="标题">{{ currentReport.title }}</el-descriptions-item>
        <el-descriptions-item label="描述">{{ currentReport.description || '--' }}</el-descriptions-item>
        <el-descriptions-item label="地址">{{ currentReport.address || '--' }}</el-descriptions-item>
        <el-descriptions-item label="紧急度">
          <el-rate :model-value="currentReport.urgency_level" disabled :max="3" />
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentReport.status)">
            {{ getStatusText(currentReport.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="上报人">
          {{ currentReport.user_name || '--' }}{{ currentReport.user_phone ? `（${currentReport.user_phone}）` : '' }}
        </el-descriptions-item>
        <el-descriptions-item label="部门">{{ currentReport.dept_name || '--' }}</el-descriptions-item>
        <el-descriptions-item label="处理备注">{{ currentReport.handle_note || '--' }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showHandleDialog" title="处理上报" width="520px">
      <el-form :model="handleForm" label-width="92px">
        <el-form-item label="状态">
          <el-select v-model="handleForm.status" style="width: 100%">
            <el-option label="处理中" value="processing" />
            <el-option label="已完成" value="completed" />
            <el-option label="已驳回" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item label="派发部门">
          <el-select v-model="handleForm.deptId" clearable style="width: 100%">
            <el-option v-for="dept in depts" :key="dept.id" :label="dept.name" :value="dept.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理备注">
          <el-input v-model="handleForm.handleNote" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showHandleDialog = false">取消</el-button>
        <el-button type="primary" @click="submitHandle">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { adminApi } from '@/api'

const loading = ref(false)
const reports = ref([])
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const status = ref('')
const eventType = ref('')
const depts = ref([])
const reportStats = ref({ total: 0, pending: 0, processing: 0, completed: 0 })

const showQueryDialog = ref(false)
const showResultDialog = ref(false)
const showDetailDialog = ref(false)
const showHandleDialog = ref(false)
const currentReport = ref(null)
const handleForm = ref({
  status: 'processing',
  deptId: null,
  handleNote: ''
})

const queryForm = ref({
  keyword: '',
  eventType: '',
  status: '',
  minUrgency: null,
  dateRange: [],
  deptId: ''
})

const queryResult = ref({
  list: [],
  total: 0
})

const trendChartRef = ref(null)
const typeChartRef = ref(null)
const urgencyChartRef = ref(null)

let trendChart = null
let typeChart = null
let urgencyChart = null

const trendData = ref([])
const typeData = ref([])
const urgencyData = ref([])

onMounted(async () => {
  await Promise.all([loadReports(), loadDepts(), loadStats()])
  await nextTick()
  initCharts()
  renderCharts()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  typeChart?.dispose()
  urgencyChart?.dispose()
})

async function loadReports(nextPage = page.value) {
  page.value = nextPage
  loading.value = true
  try {
    const res = await adminApi.getReports({
      page: page.value,
      limit: limit.value,
      status: status.value,
      eventType: eventType.value
    })

    if (res.code === 200) {
      reports.value = res.data.list || []
      total.value = res.data.total || 0
      trendData.value = res.data.trend || []
      typeData.value = res.data.types || []
      urgencyData.value = res.data.urgency || []
      renderCharts()
    }
  } catch (error) {
    console.error('加载上报列表失败:', error)
  } finally {
    loading.value = false
  }
}

async function loadDepts() {
  try {
    const res = await adminApi.getDepts()
    if (res.code === 200) {
      depts.value = res.data || []
    }
  } catch (error) {
    console.error('加载部门列表失败:', error)
  }
}

async function loadStats() {
  try {
    const res = await adminApi.getReports({ page: 1, limit: 1 })
    if (res.code === 200) {
      reportStats.value = res.data.stats || { total: 0, pending: 0, processing: 0, completed: 0 }
      trendData.value = res.data.trend || []
      typeData.value = res.data.types || []
      urgencyData.value = res.data.urgency || []
      renderCharts()
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

function initCharts() {
  if (trendChartRef.value && !trendChart) {
    trendChart = echarts.init(trendChartRef.value)
  }
  if (typeChartRef.value && !typeChart) {
    typeChart = echarts.init(typeChartRef.value)
  }
  if (urgencyChartRef.value && !urgencyChart) {
    urgencyChart = echarts.init(urgencyChartRef.value)
  }
}

function renderCharts() {
  renderTrendChart()
  renderTypeChart()
  renderUrgencyChart()
}

function renderTrendChart() {
  if (!trendChart) return
  const data = trendData.value.length
    ? trendData.value
    : Array.from({ length: 14 }, (_, i) => ({
        label: dayjs().subtract(13 - i, 'day').format('MM-DD'),
        count: Math.floor(Math.random() * 15)
      }))

  trendChart.setOption({
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
      name: '事件数',
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

function renderTypeChart() {
  if (!typeChart) return
  const data = typeData.value.length
    ? typeData.value.map(item => ({ name: item.name, value: item.value }))
    : [
        { name: '道路破损', value: 0 },
        { name: '井盖缺失', value: 0 }
      ]

  typeChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    color: ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#eab308'],
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      label: { formatter: '{b}\n{d}%' },
      data: data.length ? data : [{ name: '暂无数据', value: 1, itemStyle: { color: '#d6dee6' } }]
    }]
  })
}

function renderUrgencyChart() {
  if (!urgencyChart) return
  const data = urgencyData.value.length
    ? urgencyData.value
    : [
        { label: '一级', count: 0 },
        { label: '二级', count: 0 },
        { label: '三级', count: 0 }
      ]

  urgencyChart.setOption({
    color: ['#22c55e', '#f97316', '#ef4444'],
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
      name: '事件数',
      type: 'line',
      smooth: true,
      data: data.map(item => item.count),
      areaStyle: {
        color: 'rgba(249, 115, 22, 0.12)'
      },
      lineStyle: { width: 3 },
      itemStyle: { color: '#f97316' }
    }]
  })
}

function handleResize() {
  trendChart?.resize()
  typeChart?.resize()
  urgencyChart?.resize()
}

function openQueryDialog() {
  queryForm.value = {
    keyword: '',
    eventType: '',
    status: '',
    minUrgency: null,
    dateRange: [],
    deptId: ''
  }
  showQueryDialog.value = true
}

async function executeQuery() {
  loading.value = true
  try {
    const res = await adminApi.getReports({
      page: 1,
      limit: 100,
      keyword: queryForm.value.keyword,
      eventType: queryForm.value.eventType,
      status: queryForm.value.status,
      minUrgency: queryForm.value.minUrgency,
      startDate: queryForm.value.dateRange?.[0],
      endDate: queryForm.value.dateRange?.[1],
      deptId: queryForm.value.deptId
    })

    if (res.code === 200) {
      queryResult.value.list = res.data.list || []
      queryResult.value.total = res.data.total || 0
      showQueryDialog.value = false
      showResultDialog.value = true
    }
  } catch (error) {
    console.error('查询失败:', error)
  } finally {
    loading.value = false
  }
}

function openResultDetail(row) {
  currentReport.value = row
  showResultDialog.value = false
  showDetailDialog.value = true
}

function openHandleDialog(report) {
  currentReport.value = report
  handleForm.value = {
    status: report.status === 'pending' ? 'processing' : report.status,
    deptId: report.dept_id || null,
    handleNote: report.handle_note || ''
  }
  showHandleDialog.value = true
}

async function submitHandle() {
  if (!currentReport.value) return

  try {
    const res = await adminApi.handleReport(currentReport.value.id, handleForm.value)
    if (res.code === 200) {
      ElMessage.success('上报处理成功')
      showHandleDialog.value = false
      await loadReports(page.value)
    }
  } catch (error) {
    console.error('提交上报处理失败:', error)
  }
}

function viewDetail(report) {
  currentReport.value = report
  showDetailDialog.value = true
}

function getStatusType(value) {
  return {
    pending: 'warning',
    processing: 'primary',
    completed: 'success',
    rejected: 'danger'
  }[value] || 'info'
}

function getStatusText(value) {
  return {
    pending: '待处理',
    processing: '处理中',
    completed: '已完成',
    rejected: '已驳回'
  }[value] || value
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
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;

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
.stats-card {
  background: rgba(255, 255, 255, 0.94);
  border-radius: 18px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
  padding: 20px;
  height: 100%;
}

.stats-card {
  display: flex;
  flex-direction: column;
}

.stats-header {
  margin-bottom: 16px;

  h3 {
    margin: 0;
    color: #0f172a;
    font-size: 16px;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  flex: 1;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: #f8fafc;
  border-radius: 12px;

  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
  }

  .stat-label {
    margin-top: 4px;
    font-size: 12px;
    color: #64748b;
  }
}

.card-header {
  margin-bottom: 16px;

  h3 {
    margin: 0;
    color: #0f172a;
    font-size: 16px;
  }

  p {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 13px;
  }
}

.chart-container {
  height: 240px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 20px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.94);
  border-radius: 18px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
  padding: 20px;
  text-align: center;

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
  }

  .stat-label {
    margin-top: 6px;
    color: #64748b;
    font-size: 14px;
  }
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.table-card {
  border-radius: 18px;
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
  overflow: hidden;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.result-stats {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 8px;

  strong {
    color: #3b82f6;
    font-size: 16px;
  }
}

@media (max-width: 900px) {
  .stats-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .stats-row {
    grid-template-columns: 1fr;
  }
}
</style>
