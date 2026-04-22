<template>
  <div class="admin-opinion" v-loading="loading">
    <div class="page-container opinion-shell">
      <div class="page-header opinion-header">
        <div>
          <h2>舆情监测</h2>
          <p>展示 `opinion_monitor` 表中的真实数据；如果数据库为空，也保持规范的空状态界面。</p>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card positive">
          <div class="stat-value">{{ stats.positive || 0 }}</div>
          <div class="stat-label">正向舆情</div>
        </div>
        <div class="stat-card neutral">
          <div class="stat-value">{{ stats.neutral || 0 }}</div>
          <div class="stat-label">中性舆情</div>
        </div>
        <div class="stat-card negative">
          <div class="stat-value">{{ stats.negative || 0 }}</div>
          <div class="stat-label">负向舆情</div>
        </div>
        <div class="stat-card alert">
          <div class="stat-value">{{ stats.alerts || 0 }}</div>
          <div class="stat-label">预警数量</div>
        </div>
      </div>

      <div class="chart-card">
        <div class="card-header">
          <div>
            <h3>近 7 天舆情趋势</h3>
            <p>空表时保留真实 0 值趋势，不展示假数据。</p>
          </div>
        </div>
        <div ref="trendChartRef" class="chart-container"></div>
      </div>

      <div class="filter-bar">
        <el-select v-model="sentiment" placeholder="情感倾向" clearable style="width: 140px">
          <el-option label="全部" value="" />
          <el-option label="正向" value="positive" />
          <el-option label="中性" value="neutral" />
          <el-option label="负向" value="negative" />
        </el-select>
        <el-checkbox v-model="showAlertOnly">仅显示预警</el-checkbox>
        <el-button type="primary" @click="loadOpinions(1)">筛选</el-button>
      </div>

      <el-table :data="opinions" style="width: 100%">
        <el-table-column prop="source" label="来源" width="120" />
        <el-table-column prop="content" label="内容" min-width="280">
          <template #default="{ row }">
            <div class="content-cell">
              {{ row.content || '暂无内容' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="sentiment" label="情感" width="100">
          <template #default="{ row }">
            <el-tag :type="getSentimentType(row.sentiment)" size="small">
              {{ getSentimentText(row.sentiment) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="keywords" label="关键词" min-width="220">
          <template #default="{ row }">
            <el-tag
              v-for="kw in (row.keywords || []).slice(0, 4)"
              :key="kw"
              size="small"
              class="keyword-tag"
            >
              {{ kw }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_alert" label="预警" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.is_alert" type="danger" size="small">预警</el-tag>
            <span v-else class="muted-text">无</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="170">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!opinions.length" description="当前数据库中暂无舆情监测数据" :image-size="88" />

      <div class="pagination">
        <el-pagination
          :current-page="page"
          :page-size="limit"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadOpinions"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { adminApi } from '@/api'

const loading = ref(false)
const opinions = ref([])
const sentiment = ref('')
const showAlertOnly = ref(false)
const stats = ref({ positive: 0, neutral: 0, negative: 0, alerts: 0 })
const trend = ref([])
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const trendChartRef = ref(null)

let trendChart = null

onMounted(async () => {
  await loadOpinions()
  await nextTick()
  initChart()
  renderChart()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
})

async function loadOpinions(nextPage = page.value) {
  page.value = nextPage
  loading.value = true
  try {
    const res = await adminApi.getOpinion({
      page: page.value,
      limit: limit.value,
      sentiment: sentiment.value,
      isAlert: showAlertOnly.value
    })

    if (res.code === 200) {
      opinions.value = res.data.list || []
      total.value = res.data.total || 0
      stats.value = res.data.stats || { positive: 0, neutral: 0, negative: 0, alerts: 0 }
      trend.value = res.data.trend || []
      renderChart()
    }
  } catch (error) {
    console.error('加载舆情数据失败:', error)
  } finally {
    loading.value = false
  }
}

function initChart() {
  if (trendChartRef.value && !trendChart) {
    trendChart = echarts.init(trendChartRef.value)
  }
}

function renderChart() {
  if (!trendChart) return

  trendChart.setOption({
    color: ['#2563eb'],
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 30, bottom: 25 },
    xAxis: {
      type: 'category',
      data: trend.value.map(item => item.label),
      axisLine: { lineStyle: { color: '#dbe3ec' } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#eef2f7' } }
    },
    series: [{
      type: 'bar',
      barWidth: 26,
      data: trend.value.map(item => item.count),
      itemStyle: {
        borderRadius: [8, 8, 0, 0]
      }
    }]
  })
}

function handleResize() {
  trendChart?.resize()
}

function getSentimentType(value) {
  return {
    positive: 'success',
    neutral: 'info',
    negative: 'danger'
  }[value] || 'info'
}

function getSentimentText(value) {
  return {
    positive: '正向',
    neutral: '中性',
    negative: '负向'
  }[value] || (value || '未知')
}

function formatDate(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '--'
}
</script>

<style lang="scss" scoped>
.opinion-shell {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  min-height: auto;
  padding: 0;
}

.opinion-header {
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

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 20px;
}

.stat-card,
.chart-card {
  background: rgba(255, 255, 255, 0.94);
  border-radius: 18px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
}

.stat-card {
  padding: 20px;
  text-align: center;

  .stat-value {
    font-size: 32px;
    font-weight: 700;
  }

  .stat-label {
    margin-top: 6px;
    color: #64748b;
    font-size: 14px;
  }

  &.positive .stat-value {
    color: #16a34a;
  }

  &.neutral .stat-value {
    color: #64748b;
  }

  &.negative .stat-value {
    color: #dc2626;
  }

  &.alert .stat-value {
    color: #ea580c;
  }
}

.chart-card {
  padding: 20px;
  margin-bottom: 20px;
}

.card-header {
  margin-bottom: 16px;

  h3 {
    margin: 0;
    color: #0f172a;
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

.filter-bar {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.content-cell {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.6;
}

.keyword-tag {
  margin-right: 6px;
  margin-bottom: 6px;
}

.muted-text {
  color: #94a3b8;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
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
