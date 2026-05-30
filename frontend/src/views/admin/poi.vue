<template>
  <div class="admin-poi" v-loading="loading">
    <div class="page-container section-shell">
      <div class="page-header section-header">
        <div>
          <h2>POI 管理</h2>
          <p>支持查看、筛选、编辑和新增数据库中的真实 POI 数据。</p>
        </div>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新增 POI
        </el-button>
      </div>

      <el-row :gutter="20" class="chart-section">
        <el-col :xs="24" :lg="12">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>POI 分类统计</h3>
                <p>按分类统计POI数量分布</p>
              </div>
            </div>
            <div ref="categoryChartRef" class="chart-container"></div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="12">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>POI 状态分布</h3>
                <p>按状态和红色资源统计</p>
              </div>
            </div>
            <div ref="statusChartRef" class="chart-container"></div>
          </div>
        </el-col>
      </el-row>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ summary.total || 0 }}</div>
          <div class="stat-label">POI 总量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ summary.red_spots || 0 }}</div>
          <div class="stat-label">红色资源</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ summary.disabled || 0 }}</div>
          <div class="stat-label">停用记录</div>
        </div>
      </div>

      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="搜索名称或地址" clearable style="width: 220px" @keyup.enter="openQueryDialog" />
        <el-select v-model="category" clearable placeholder="分类" style="width: 180px">
          <el-option label="全部分类" value="" />
          <el-option v-for="item in categories" :key="item.category" :label="`${item.category}（${item.count}）`" :value="item.category" />
        </el-select>
        <el-select v-model="status" clearable placeholder="状态" style="width: 140px">
          <el-option label="全部状态" value="" />
          <el-option label="正常" value="normal" />
          <el-option label="停用" value="disabled" />
        </el-select>
        <el-checkbox v-model="redOnly">仅看红色资源</el-checkbox>
        <el-button type="primary" @click="openQueryDialog">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <div class="table-card">
        <el-table :data="pois" style="width: 100%">
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="name" label="名称" min-width="160" />
          <el-table-column prop="category" label="分类" width="140" />
          <el-table-column prop="address" label="地址" min-width="220" show-overflow-tooltip />
          <el-table-column prop="is_red_spot" label="红色资源" width="110">
            <template #default="{ row }">
              <el-tag :type="row.is_red_spot ? 'danger' : 'info'" size="small">
                {{ row.is_red_spot ? '是' : '否' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="safety_rating" label="安全评分" width="110">
            <template #default="{ row }">
              <span>{{ row.safety_rating ?? '--' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'normal' ? 'success' : 'warning'" size="small">
                {{ row.status === 'normal' ? '正常' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="updated_at" label="更新时间" width="170">
            <template #default="{ row }">
              {{ formatDate(row.updated_at || row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click="editPoi(row)">编辑</el-button>
              <el-button type="warning" link @click="toggleStatus(row)">
                {{ row.status === 'normal' ? '停用' : '启用' }}
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
          @current-change="loadPois"
        />
      </div>
    </div>

    <el-dialog v-model="showQueryDialog" title="POI 查询" width="680px">
      <div class="query-form">
        <el-form :model="queryForm" label-width="100px">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="关键词">
                <el-input v-model="queryForm.keyword" placeholder="名称或地址" clearable />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="分类">
                <el-select v-model="queryForm.category" placeholder="选择分类" clearable style="width: 100%">
                  <el-option label="全部" value="" />
                  <el-option v-for="item in categories" :key="item.category" :label="item.category" :value="item.category" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="状态">
                <el-select v-model="queryForm.status" placeholder="选择状态" clearable style="width: 100%">
                  <el-option label="全部" value="" />
                  <el-option label="正常" value="normal" />
                  <el-option label="停用" value="disabled" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="红色资源">
                <el-select v-model="queryForm.isRedSpot" placeholder="是否红色资源" clearable style="width: 100%">
                  <el-option label="全部" value="" />
                  <el-option label="是" :value="true" />
                  <el-option label="否" :value="false" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="安全评分">
                <el-input-number v-model="queryForm.minSafetyRating" :min="0" :max="5" :precision="1" placeholder="最低" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="景观评分">
                <el-input-number v-model="queryForm.minSceneryRating" :min="0" :max="5" :precision="1" placeholder="最低" style="width: 100%" />
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
      <el-table :data="queryResult.list" max-height="400" style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column prop="address" label="地址" min-width="180" show-overflow-tooltip />
        <el-table-column prop="is_red_spot" label="红色资源" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_red_spot ? 'danger' : 'info'" size="small">
              {{ row.is_red_spot ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="safety_rating" label="安全评分" width="100">
          <template #default="{ row }">
            {{ row.safety_rating ?? '--' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewPoiDetail(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showResultDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDetailDialog" title="POI 详情" width="700px">
      <div v-if="currentPoi" class="poi-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="POI ID">{{ currentPoi.id }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ currentPoi.name || '--' }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ currentPoi.category || '--' }}</el-descriptions-item>
          <el-descriptions-item label="子分类">{{ currentPoi.sub_category || '--' }}</el-descriptions-item>
          <el-descriptions-item label="地址" :span="2">{{ currentPoi.address || '--' }}</el-descriptions-item>
          <el-descriptions-item label="红色资源">
            <el-tag :type="currentPoi.is_red_spot ? 'danger' : 'info'">
              {{ currentPoi.is_red_spot ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="currentPoi.status === 'normal' ? 'success' : 'warning'">
              {{ currentPoi.status === 'normal' ? '正常' : '停用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="安全评分">{{ currentPoi.safety_rating ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="景观评分">{{ currentPoi.scenery_rating ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="营业时间">{{ currentPoi.opening_hours || '--' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ currentPoi.contact_phone || '--' }}</el-descriptions-item>
          <el-descriptions-item label="经度" :span="2">{{ currentPoi.location?.coordinates?.[0] ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="纬度" :span="2">{{ currentPoi.location?.coordinates?.[1] ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ currentPoi.description || '--' }}</el-descriptions-item>
          <el-descriptions-item v-if="currentPoi.is_red_spot" label="红色介绍" :span="2">{{ currentPoi.red_description || '--' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDate(currentPoi.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDate(currentPoi.updated_at) }}</el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDialog" :title="editingPoiId ? '编辑 POI' : '新增 POI'" width="680px">
      <el-form :model="poiForm" label-width="96px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="名称">
              <el-input v-model="poiForm.name" placeholder="请输入名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="分类">
              <el-input v-model="poiForm.category" placeholder="如：风景名胜 / 餐饮" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="子分类">
              <el-input v-model="poiForm.subCategory" placeholder="可选" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="poiForm.status" style="width: 100%">
                <el-option label="正常" value="normal" />
                <el-option label="停用" value="disabled" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="地址">
          <el-input v-model="poiForm.address" placeholder="请输入地址" />
        </el-form-item>

        <el-form-item label="描述">
          <el-input v-model="poiForm.description" type="textarea" :rows="3" placeholder="请输入描述" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="安全评分">
              <el-input-number v-model="poiForm.safetyRating" :min="0" :max="5" :step="0.1" :precision="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="景观评分">
              <el-input-number v-model="poiForm.sceneryRating" :min="0" :max="5" :step="0.1" :precision="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="红色资源">
          <el-switch v-model="poiForm.isRedSpot" />
        </el-form-item>

        <el-form-item v-if="poiForm.isRedSpot" label="红色介绍">
          <el-input v-model="poiForm.redDescription" type="textarea" :rows="3" placeholder="请输入红色资源介绍" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="经度">
              <el-input-number v-model="poiForm.lng" :precision="6" :step="0.0001" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="纬度">
              <el-input-number v-model="poiForm.lat" :precision="6" :step="0.0001" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="savePoi">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { poiApi } from '@/api'

const loading = ref(false)
const pois = ref([])
const categories = ref([])
const summary = ref({ total: 0, red_spots: 0, disabled: 0 })
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const keyword = ref('')
const category = ref('')
const status = ref('')
const redOnly = ref(false)

const showQueryDialog = ref(false)
const showResultDialog = ref(false)
const showDetailDialog = ref(false)
const showDialog = ref(false)
const editingPoiId = ref(null)
const currentPoi = ref(null)

const queryForm = ref({
  keyword: '',
  category: '',
  status: '',
  isRedSpot: '',
  minSafetyRating: null,
  minSceneryRating: null
})

const queryResult = ref({
  list: [],
  total: 0
})

const poiForm = ref(createEmptyForm())

const categoryChartRef = ref(null)
const statusChartRef = ref(null)

let categoryChart = null
let statusChart = null

const categoryData = ref([])
const statusData = ref([])

onMounted(async () => {
  await Promise.all([loadCategories(), loadPois()])
  await nextTick()
  initCharts()
  renderCharts()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  categoryChart?.dispose()
  statusChart?.dispose()
})

function createEmptyForm() {
  return {
    name: '',
    category: '',
    subCategory: '',
    address: '',
    description: '',
    isRedSpot: false,
    redDescription: '',
    safetyRating: null,
    sceneryRating: null,
    status: 'normal',
    lng: null,
    lat: null
  }
}

async function loadCategories() {
  try {
    const res = await poiApi.getCategories()
    if (res.code === 200) {
      categories.value = res.data || []
      categoryData.value = (res.data || []).map(item => ({
        name: item.category,
        value: item.count
      }))
      renderCharts()
    }
  } catch (error) {
    console.error('加载 POI 分类失败:', error)
  }
}

async function loadPois(nextPage = page.value) {
  page.value = nextPage
  loading.value = true
  try {
    const res = await poiApi.getList({
      page: page.value,
      limit: limit.value,
      keyword: keyword.value,
      category: category.value,
      status: status.value,
      isRedSpot: redOnly.value ? true : undefined
    })

    if (res.code === 200) {
      pois.value = res.data.list || []
      total.value = res.data.total || 0
      summary.value = res.data.stats || { total: 0, red_spots: 0, disabled: 0 }
      statusData.value = [
        { name: '正常', value: summary.value.total - summary.value.disabled },
        { name: '停用', value: summary.value.disabled },
        { name: '红色资源', value: summary.value.red_spots }
      ]
      renderCharts()
    }
  } catch (error) {
    console.error('加载 POI 失败:', error)
  } finally {
    loading.value = false
  }
}

function initCharts() {
  if (categoryChartRef.value && !categoryChart) {
    categoryChart = echarts.init(categoryChartRef.value)
  }
  if (statusChartRef.value && !statusChart) {
    statusChart = echarts.init(statusChartRef.value)
  }
}

function renderCharts() {
  renderCategoryChart()
  renderStatusChart()
}

function renderCategoryChart() {
  if (!categoryChart) return
  const data = categoryData.value.length
    ? categoryData.value
    : [{ name: '暂无数据', value: 1, itemStyle: { color: '#d6dee6' } }]

  categoryChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 42, right: 20, top: 30, bottom: 60 },
    xAxis: {
      type: 'category',
      data: data.map(item => item.name),
      axisLabel: { rotate: 30, interval: 0 },
      axisLine: { lineStyle: { color: '#d9e2ec' } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#eef2f7' } }
    },
    series: [{
      name: 'POI数量',
      type: 'bar',
      barWidth: '60%',
      data: data.map(item => item.value),
      itemStyle: {
        borderRadius: [6, 6, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#14b8a6' },
          { offset: 1, color: '#0f766e' }
        ])
      }
    }]
  })
}

function renderStatusChart() {
  if (!statusChart) return
  const data = statusData.value.length
    ? statusData.value
    : [{ name: '暂无数据', value: 1, itemStyle: { color: '#d6dee6' } }]

  statusChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    color: ['#22c55e', '#f97316', '#ef4444'],
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      label: { formatter: '{b}\n{d}%' },
      data
    }]
  })
}

function handleResize() {
  categoryChart?.resize()
  statusChart?.resize()
}

function resetFilters() {
  keyword.value = ''
  category.value = ''
  status.value = ''
  redOnly.value = false
  loadPois(1)
}

function openQueryDialog() {
  queryForm.value = {
    keyword: keyword.value,
    category: category.value,
    status: status.value,
    isRedSpot: redOnly.value ? true : '',
    minSafetyRating: null,
    minSceneryRating: null
  }
  showQueryDialog.value = true
}

async function executeQuery() {
  loading.value = true
  try {
    const res = await poiApi.getList({
      page: 1,
      limit: 100,
      keyword: queryForm.value.keyword,
      category: queryForm.value.category,
      status: queryForm.value.status,
      isRedSpot: queryForm.value.isRedSpot || undefined,
      minSafetyRating: queryForm.value.minSafetyRating,
      minSceneryRating: queryForm.value.minSceneryRating
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

function viewPoiDetail(poi) {
  currentPoi.value = poi
  showResultDialog.value = false
  showDetailDialog.value = true
}

function openCreateDialog() {
  editingPoiId.value = null
  poiForm.value = createEmptyForm()
  showDialog.value = true
}

function editPoi(poi) {
  editingPoiId.value = poi.id
  poiForm.value = {
    name: poi.name || '',
    category: poi.category || '',
    subCategory: poi.sub_category || '',
    address: poi.address || '',
    description: poi.description || '',
    isRedSpot: Boolean(poi.is_red_spot),
    redDescription: poi.red_description || '',
    safetyRating: poi.safety_rating ?? null,
    sceneryRating: poi.scenery_rating ?? null,
    status: poi.status || 'normal',
    lng: poi.location?.coordinates?.[0] ?? null,
    lat: poi.location?.coordinates?.[1] ?? null
  }
  showDialog.value = true
}

async function savePoi() {
  if (!poiForm.value.name?.trim()) {
    ElMessage.warning('请先填写 POI 名称')
    return
  }

  try {
    const payload = {
      ...poiForm.value,
      name: poiForm.value.name.trim()
    }

    const res = editingPoiId.value
      ? await poiApi.update(editingPoiId.value, payload)
      : await poiApi.create(payload)

    if (res.code === 200) {
      ElMessage.success(editingPoiId.value ? 'POI 更新成功' : 'POI 新增成功')
      showDialog.value = false
      await Promise.all([loadCategories(), loadPois(page.value)])
    }
  } catch (error) {
    console.error('保存 POI 失败:', error)
  }
}

async function toggleStatus(poi) {
  const nextStatus = poi.status === 'normal' ? 'disabled' : 'normal'
  try {
    const res = await poiApi.update(poi.id, { status: nextStatus })
    if (res.code === 200) {
      ElMessage.success(nextStatus === 'normal' ? 'POI 已启用' : 'POI 已停用')
      await loadPois(page.value)
    }
  } catch (error) {
    console.error('更新 POI 状态失败:', error)
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
  height: 280px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 18px 20px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
  }

  .stat-label {
    margin-top: 6px;
    color: #64748b;
    font-size: 13px;
  }
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 20px;
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

.poi-detail {
  :deep(.el-descriptions) {
    font-size: 14px;
  }
}

@media (max-width: 900px) {
  .stats-row {
    grid-template-columns: 1fr;
  }

  .chart-section .el-col {
    margin-bottom: 20px;
  }
}
</style>
