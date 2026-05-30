<template>
  <div class="gis-analysis-page">
    <div class="page-header">
      <h2>GIS空间分析</h2>
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="POI聚类" name="cluster" />
        <el-tab-pane label="道路交叉口" name="intersection" />
        <el-tab-pane label="轨迹相似度" name="similarity" />
        <el-tab-pane label="骑行统计" name="statistics" />
        <el-tab-pane label="POI方向" name="direction" />
        <el-tab-pane label="道路连通性" name="connectivity" />
        <el-tab-pane label="事件分布" name="event" />
        <el-tab-pane label="热力时序" name="heatmap" />
        <el-tab-pane label="道路密度" name="density" />
        <el-tab-pane label="轨迹简化" name="simplify" />
      </el-tabs>
    </div>

    <div class="page-content">
      <div v-show="activeTab === 'cluster'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>POI空间聚类分析</span></template>
          <el-form inline>
            <el-form-item label="聚类半径(m)">
              <el-input-number v-model="clusterForm.eps" :min="100" :max="5000" :step="100" />
            </el-form-item>
            <el-form-item label="最小点数">
              <el-input-number v-model="clusterForm.minPoints" :min="2" :max="20" />
            </el-form-item>
            <el-form-item label="类别">
              <el-select v-model="clusterForm.category" clearable placeholder="全部">
                <el-option v-for="cat in poiCategories" :key="cat" :label="cat" :value="cat" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="analyzeCluster">分析</el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <el-card v-if="clusterResult" shadow="never" class="result-card">
          <template #header><span>聚类结果</span></template>
          <div class="result-summary">
            <el-statistic title="聚类总数" :value="clusterResult.totalClusters" />
          </div>
          <div class="cluster-list">
            <div v-for="c in clusterResult.clusters" :key="c.clusterId" class="cluster-item">
              <el-tag>聚类 {{ c.clusterId }}</el-tag>
              <span>成员数量: {{ c.memberCount }}</span>
              <span>类别: {{ c.categories?.join(', ') }}</span>
            </div>
          </div>
        </el-card>
      </div>

      <div v-show="activeTab === 'intersection'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>道路交叉口识别</span></template>
          <el-form inline>
            <el-form-item label="最低安全指数">
              <el-input-number v-model="intersectionForm.minSafety" :min="0" :max="1" :step="0.1" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="analyzeIntersection">分析</el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <el-card v-if="intersectionResult" shadow="never" class="result-card">
          <template #header><span>交叉口列表</span></template>
          <el-table :data="intersectionResult.intersections">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="road1_name" label="道路1" />
            <el-table-column prop="road2_name" label="道路2" />
            <el-table-column prop="intersection_type" label="类型" />
            <el-table-column prop="safety_rating" label="安全指数" />
          </el-table>
        </el-card>
      </div>

      <div v-show="activeTab === 'similarity'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>骑行轨迹相似度分析</span></template>
          <el-form inline>
            <el-form-item label="轨迹ID">
              <el-input-number v-model="similarityForm.diaryId" :min="1" />
            </el-form-item>
            <el-form-item label="返回数量">
              <el-input-number v-model="similarityForm.limit" :min="1" :max="50" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="analyzeSimilarity">分析</el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <el-card v-if="similarityResult" shadow="never" class="result-card">
          <template #header><span>相似轨迹</span></template>
          <el-table :data="similarityResult.similarTrajectories">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="title" label="标题" />
            <el-table-column prop="total_distance" label="距离(km)" />
            <el-table-column prop="similarity_score" label="相似度" />
          </el-table>
        </el-card>
      </div>

      <div v-show="activeTab === 'statistics'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>骑行统计与排名</span></template>
          <el-form inline>
            <el-form-item label="时间范围(天)">
              <el-input-number v-model="statisticsForm.timeRange" :min="1" />
            </el-form-item>
            <el-form-item label="排序">
              <el-select v-model="statisticsForm.sortBy">
                <el-option label="总距离" value="total_distance" />
                <el-option label="总时间" value="total_time" />
                <el-option label="总卡路里" value="total_calories" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="analyzeStatistics">分析</el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <el-card v-if="statisticsResult" shadow="never" class="result-card">
          <template #header><span>统计数据</span></template>
          <el-row :gutter="20">
            <el-col :span="6">
              <el-statistic title="总骑行次数" :value="statisticsResult.total" />
            </el-col>
            <el-col :span="18">
              <h4>距离排名 Top 10</h4>
              <el-table :data="statisticsResult.diaries?.slice(0, 10)" size="small">
                <el-table-column prop="id" label="ID" width="60" />
                <el-table-column prop="nickname" label="用户" />
                <el-table-column prop="total_distance" label="距离(km)" />
                <el-table-column prop="total_time" label="时间(分钟)" />
              </el-table>
            </el-col>
          </el-row>
        </el-card>
      </div>

      <div v-show="activeTab === 'direction'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>POI方向分布分析</span></template>
          <el-form inline>
            <el-form-item label="中心经度">
              <el-input-number v-model="directionForm.centerLng" :precision="6" />
            </el-form-item>
            <el-form-item label="中心纬度">
              <el-input-number v-model="directionForm.centerLat" :precision="6" />
            </el-form-item>
            <el-form-item label="半径(m)">
              <el-input-number v-model="directionForm.radius" :min="100" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="analyzeDirection">分析</el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <el-card v-if="directionResult" shadow="never" class="result-card">
          <template #header><span>方向分布</span></template>
          <el-row :gutter="20">
            <el-col v-for="d in directionResult.distributions" :key="d.direction" :span="6">
              <el-card shadow="never">
                <el-statistic :title="d.direction" :value="d.poi_count" />
                <div class="direction-detail">类别: {{ d.categories?.slice(0, 3).join(', ') }}</div>
              </el-card>
            </el-col>
          </el-row>
        </el-card>
      </div>

      <div v-show="activeTab === 'connectivity'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>道路网连通性分析</span></template>
          <el-button type="primary" :loading="loading" @click="analyzeConnectivity">分析</el-button>
        </el-card>
        <el-card v-if="connectivityResult" shadow="never" class="result-card">
          <template #header><span>连通分量</span></template>
          <el-row :gutter="20">
            <el-col :span="8">
              <el-statistic title="连通分量数" :value="connectivityResult.totalComponents" />
            </el-col>
            <el-col :span="8">
              <el-statistic title="主分量道路数" :value="connectivityResult.mainComponent?.road_count || 0" />
            </el-col>
          </el-row>
        </el-card>
      </div>

      <div v-show="activeTab === 'event'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>民情事件空间分布</span></template>
          <el-form inline>
            <el-form-item label="事件类型">
              <el-input v-model="eventForm.eventType" clearable />
            </el-form-item>
            <el-form-item label="最小数量">
              <el-input-number v-model="eventForm.minCount" :min="1" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="analyzeEvent">分析</el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <el-card v-if="eventResult" shadow="never" class="result-card">
          <template #header><span>热点区域</span></template>
          <el-table :data="eventResult.hotSpots">
            <el-table-column prop="event_type" label="类型" />
            <el-table-column prop="event_count" label="数量" />
            <el-table-column prop="avg_severity" label="平均严重度" />
          </el-table>
        </el-card>
      </div>

      <div v-show="activeTab === 'heatmap'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>骑行热力时序分析</span></template>
          <el-form inline>
            <el-form-item label="统计类型">
              <el-select v-model="heatmapForm.statType">
                <el-option label="按小时" value="hour" />
                <el-option label="按天" value="day" />
                <el-option label="按月" value="month" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="analyzeHeatmap">分析</el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <el-card v-if="heatmapResult" shadow="never" class="result-card">
          <template #header><span>时序结果</span></template>
          <el-row :gutter="20">
            <el-col :span="8">
              <el-statistic title="高峰时段" :value="heatmapResult.peakTime?.time_unit || 'N/A'" />
            </el-col>
            <el-col :span="8">
              <el-statistic title="高峰骑行数" :value="heatmapResult.peakTime?.total_rides || 0" />
            </el-col>
          </el-row>
          <el-table :data="heatmapResult.timeline" size="small" class="mt-4">
            <el-table-column prop="time_unit" label="时间单位" />
            <el-table-column prop="total_rides" label="骑行数" />
            <el-table-column prop="avg_speed" label="平均速度" />
          </el-table>
        </el-card>
      </div>

      <div v-show="activeTab === 'density'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>道路密度分析</span></template>
          <el-form inline>
            <el-form-item label="网格大小(m)">
              <el-input-number v-model="densityForm.gridSize" :min="100" :max="5000" :step="100" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="analyzeDensity">分析</el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <el-card v-if="densityResult" shadow="never" class="result-card">
          <template #header><span>密度结果</span></template>
          <el-statistic title="网格总数" :value="densityResult.totalCells" />
          <el-table :data="densityResult.densityGrid?.slice(0, 20)" size="small" class="mt-4">
            <el-table-column prop="col" label="列" />
            <el-table-column prop="row" label="行" />
            <el-table-column prop="road_count" label="道路数" />
            <el-table-column prop="total_length" label="总长度(km)" />
          </el-table>
        </el-card>
      </div>

      <div v-show="activeTab === 'simplify'" class="analysis-panel">
        <el-card shadow="never">
          <template #header><span>骑行轨迹简化</span></template>
          <el-form inline>
            <el-form-item label="轨迹ID">
              <el-input-number v-model="simplifyForm.diaryId" :min="1" />
            </el-form-item>
            <el-form-item label="容差">
              <el-input-number v-model="simplifyForm.tolerance" :min="0.00001" :max="0.01" :step="0.0001" :precision="5" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="handleSimplifyTrajectory">简化</el-button>
            </el-form-item>
          </el-form>
        </el-card>
        <el-card v-if="simplifyResult" shadow="never" class="result-card">
          <template #header><span>简化结果</span></template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="原始点数">{{ simplifyResult.originalPoints }}</el-descriptions-item>
            <el-descriptions-item label="简化后点数">{{ simplifyResult.simplifiedPoints }}</el-descriptions-item>
            <el-descriptions-item label="简化比例">{{ simplifyResult.simplificationRatio }}</el-descriptions-item>
            <el-descriptions-item label="长度差异">{{ (simplifyResult.lengthDiffRatio * 100).toFixed(2) }}%</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import {
  poiCluster,
  roadIntersection,
  trajectorySimilarity,
  rideStatistics,
  poiDirectionDistribution,
  roadConnectivity,
  eventSpatialDistribution,
  heatmapTimeline,
  roadDensity,
  simplifyTrajectory
} from '@/api/gis'

const activeTab = ref('cluster')
const loading = ref(false)
const poiCategories = ref(['风景名胜', '餐饮服务', '购物服务', '交通设施', '住宿服务', '公共设施'])

const clusterForm = reactive({ eps: 500, minPoints: 3, category: '' })
const clusterResult = ref(null)

const intersectionForm = reactive({ minSafety: 0.3 })
const intersectionResult = ref(null)

const similarityForm = reactive({ diaryId: 1, limit: 10 })
const similarityResult = ref(null)

const statisticsForm = reactive({ timeRange: 30, sortBy: 'total_distance' })
const statisticsResult = ref(null)

const directionForm = reactive({ centerLng: 114.935, centerLat: 25.845, radius: 5000 })
const directionResult = ref(null)

const connectivityResult = ref(null)

const eventForm = reactive({ eventType: '', minCount: 1 })
const eventResult = ref(null)

const heatmapForm = reactive({ statType: 'hour' })
const heatmapResult = ref(null)

const densityForm = reactive({ gridSize: 1000 })
const densityResult = ref(null)

const simplifyForm = reactive({ diaryId: 1, tolerance: 0.0001 })
const simplifyResult = ref(null)

function handleTabChange() {
  simplifyResult.value = null
}

async function analyzeCluster() {
  loading.value = true
  try {
    const res = await poiCluster(clusterForm)
    if (res.code === 200) {
      clusterResult.value = res.data
      ElMessage.success('聚类分析完成')
    }
  } catch (error) {
    ElMessage.error('聚类分析失败')
  } finally {
    loading.value = false
  }
}

async function analyzeIntersection() {
  loading.value = true
  try {
    const res = await roadIntersection(intersectionForm)
    if (res.code === 200) {
      intersectionResult.value = res.data
      ElMessage.success('交叉口分析完成')
    }
  } catch (error) {
    ElMessage.error('交叉口分析失败')
  } finally {
    loading.value = false
  }
}

async function analyzeSimilarity() {
  loading.value = true
  try {
    const res = await trajectorySimilarity(similarityForm)
    if (res.code === 200) {
      similarityResult.value = res.data
      ElMessage.success('相似度分析完成')
    }
  } catch (error) {
    ElMessage.error('相似度分析失败')
  } finally {
    loading.value = false
  }
}

async function analyzeStatistics() {
  loading.value = true
  try {
    const res = await rideStatistics(statisticsForm)
    if (res.code === 200) {
      statisticsResult.value = res.data
      ElMessage.success('统计完成')
    }
  } catch (error) {
    ElMessage.error('统计失败')
  } finally {
    loading.value = false
  }
}

async function analyzeDirection() {
  loading.value = true
  try {
    const res = await poiDirectionDistribution(directionForm)
    if (res.code === 200) {
      directionResult.value = res.data
      ElMessage.success('方向分析完成')
    }
  } catch (error) {
    ElMessage.error('方向分析失败')
  } finally {
    loading.value = false
  }
}

async function analyzeConnectivity() {
  loading.value = true
  try {
    const res = await roadConnectivity({})
    if (res.code === 200) {
      connectivityResult.value = res.data
      ElMessage.success('连通性分析完成')
    }
  } catch (error) {
    ElMessage.error('连通性分析失败')
  } finally {
    loading.value = false
  }
}

async function analyzeEvent() {
  loading.value = true
  try {
    const res = await eventSpatialDistribution(eventForm)
    if (res.code === 200) {
      eventResult.value = res.data
      ElMessage.success('事件分布分析完成')
    }
  } catch (error) {
    ElMessage.error('事件分布分析失败')
  } finally {
    loading.value = false
  }
}

async function analyzeHeatmap() {
  loading.value = true
  try {
    const res = await heatmapTimeline(heatmapForm)
    if (res.code === 200) {
      heatmapResult.value = res.data
      ElMessage.success('热力时序分析完成')
    }
  } catch (error) {
    ElMessage.error('热力时序分析失败')
  } finally {
    loading.value = false
  }
}

async function analyzeDensity() {
  loading.value = true
  try {
    const res = await roadDensity(densityForm)
    if (res.code === 200) {
      densityResult.value = res.data
      ElMessage.success('密度分析完成')
    }
  } catch (error) {
    ElMessage.error('密度分析失败')
  } finally {
    loading.value = false
  }
}

async function handleSimplifyTrajectory() {
  loading.value = true
  try {
    const res = await simplifyTrajectory(simplifyForm)
    if (res.code === 200) {
      simplifyResult.value = res.data
      ElMessage.success('轨迹简化完成')
    }
  } catch (error) {
    ElMessage.error('轨迹简化失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.gis-analysis-page {
  padding: 20px;
}
.page-header {
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0 0 15px 0;
}
.analysis-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.result-card {
  margin-top: 10px;
}
.result-summary {
  margin-bottom: 20px;
}
.cluster-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.cluster-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
}
.direction-detail {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}
.mt-4 {
  margin-top: 16px;
}
</style>