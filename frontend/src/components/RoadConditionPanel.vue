<template>
  <div class="road-condition-panel">
    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="card-header">
          <span>智能路况预测</span>
          <el-tag type="info" size="small">AI驱动</el-tag>
        </div>
      </template>

      <el-form label-position="top" size="small">
        <el-form-item v-if="roadSegmentOptions.length" label="分析路段">
          <el-select v-model="selectedRoadId" placeholder="选择路线中的重点路段" style="width: 100%">
            <el-option
              v-for="item in roadSegmentOptions"
              :key="item.id ?? item.key"
              :label="item.label"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <div v-if="selectedRoadInfo" class="selected-road-tip">
          当前分析：{{ selectedRoadInfo.name || '未命名路段' }}
          <span v-if="selectedRoadInfo.maxSlope !== undefined"> · 最大坡度 {{ Number(selectedRoadInfo.maxSlope || 0).toFixed(1) }}%</span>
        </div>
        <div v-else class="selected-road-tip muted">
          当前路线还没有可单独分析的道路，将优先提供整条路线的智能分析。
        </div>

        <el-form-item label="预测时段">
          <el-date-picker
            v-model="predictDate"
            type="date"
            placeholder="选择日期"
            style="width: 100%"
            :disabled-date="disabledDate"
          />
        </el-form-item>

        <el-form-item label="预测小时">
          <el-select v-model="predictHour" placeholder="选择小时" style="width: 100%">
            <el-option v-for="h in 24" :key="h-1" :label="`${h-1}:00`" :value="h-1" />
          </el-select>
        </el-form-item>

        <el-form-item label="天气条件">
          <el-select v-model="weatherCondition" placeholder="选择天气" style="width: 100%">
            <el-option label="晴天" value="晴" />
            <el-option label="多云" value="多云" />
            <el-option label="阴天" value="阴" />
            <el-option label="小雨" value="小雨" />
            <el-option label="中雨" value="中雨" />
            <el-option label="大雨" value="大雨" />
            <el-option label="雷阵雨" value="雷阵雨" />
            <el-option label="雪天" value="雪" />
            <el-option label="雾天" value="雾" />
            <el-option label="大风" value="大风" />
          </el-select>
        </el-form-item>

        <el-button type="primary" :loading="predicting" @click="predictTraffic" style="width: 100%">
          预测路况
        </el-button>
      </el-form>
    </el-card>

    <el-card v-if="predictionResult" shadow="never" class="panel-card result-card">
      <template #header>
        <div class="card-header">
          <span>预测结果</span>
          <el-tag :type="getCongestionTagType(predictionResult.prediction.congestionLevel)">
            {{ predictionResult.prediction.congestionLevel }}
          </el-tag>
        </div>
      </template>

      <div class="prediction-info">
        <div class="info-row">
          <span class="label">拥堵评分</span>
          <div class="value-bar">
            <el-progress
              :percentage="Math.round(predictionResult.prediction.congestionScore * 100)"
              :color="getCongestionColor(predictionResult.prediction.congestionScore)"
              :show-text="true"
              :stroke-width="10"
            />
          </div>
        </div>

        <div class="info-row">
          <span class="label">预测速度</span>
          <span class="value highlight">{{ predictionResult.prediction.predictedAvgSpeed }} km/h</span>
        </div>

        <div class="info-row">
          <span class="label">安全评分</span>
          <el-rate v-model="predictionResult.prediction.predictedSafety" disabled size="small" />
        </div>

        <div class="info-row">
          <span class="label">舒适评分</span>
          <el-rate v-model="predictionResult.prediction.predictedComfort" disabled size="small" />
        </div>

        <div class="info-row">
          <span class="label">时段分析</span>
          <el-tag size="small">{{ predictionResult.trafficAnalysis.peakType }}</el-tag>
        </div>

        <el-divider />

        <div class="weather-impact" v-if="predictionResult.trafficAnalysis.weatherImpact">
          <h4>天气影响</h4>
          <div class="impact-grid">
            <div class="impact-item">
              <span class="impact-label">拥堵影响</span>
              <span class="impact-value">{{ predictionResult.trafficAnalysis.weatherImpact.congestionFactor }}x</span>
            </div>
            <div class="impact-item">
              <span class="impact-label">安全影响</span>
              <span class="impact-value">{{ predictionResult.trafficAnalysis.weatherImpact.safetyFactor }}x</span>
            </div>
          </div>
          <p class="impact-desc">{{ predictionResult.trafficAnalysis.weatherImpact.description }}</p>
        </div>

        <el-divider />

        <div class="recommendations" v-if="predictionResult.recommendations?.length">
          <h4>骑行建议</h4>
          <div
            v-for="(rec, idx) in predictionResult.recommendations"
            :key="idx"
            class="recommendation-item"
            :class="rec.type"
          >
            <el-icon v-if="rec.type === 'warning'"><Warning /></el-icon>
            <el-icon v-else-if="rec.type === 'danger'"><CircleClose /></el-icon>
            <el-icon v-else><InfoFilled /></el-icon>
            <span>{{ rec.text }}</span>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="card-header">
          <span>路线AI分析</span>
        </div>
      </template>

      <el-form label-position="top" size="small">
        <el-form-item label="骑行天气">
          <el-select v-model="routeWeather" placeholder="选择天气" style="width: 100%">
            <el-option label="晴天" value="晴" />
            <el-option label="多云" value="多云" />
            <el-option label="阴天" value="阴" />
            <el-option label="雨天" value="雨" />
            <el-option label="雪天" value="雪" />
            <el-option label="大风" value="风" />
          </el-select>
        </el-form-item>

        <el-form-item label="骑行者级别">
          <el-select v-model="userLevel" placeholder="选择级别" style="width: 100%">
            <el-option label="新手" :value="1" />
            <el-option label="一般" :value="2" />
            <el-option label="有经验" :value="3" />
            <el-option label="资深" :value="4" />
            <el-option label="专业" :value="5" />
          </el-select>
        </el-form-item>

        <el-button type="success" :loading="analyzing" @click="analyzeRoute" style="width: 100%">
          AI分析路线
        </el-button>
      </el-form>
    </el-card>

    <el-card v-if="routeAnalysisResult" shadow="never" class="panel-card result-card">
      <template #header>
        <div class="card-header">
          <span>AI分析结果</span>
          <el-tag :type="getDifficultyTagType(routeAnalysisResult.difficulty.level)">
            {{ routeAnalysisResult.difficulty.level }}
          </el-tag>
        </div>
      </template>

      <div class="route-analysis">
        <div class="overview-grid">
          <div class="overview-item">
            <span class="item-value">{{ routeAnalysisResult.routeOverview.totalDistance }}</span>
            <span class="item-label">公里</span>
          </div>
          <div class="overview-item">
            <span class="item-value">{{ routeAnalysisResult.routeOverview.estimatedTime }}</span>
            <span class="item-label">分钟</span>
          </div>
          <div class="overview-item">
            <span class="item-value">{{ routeAnalysisResult.routeOverview.energyConsumption }}</span>
            <span class="item-label">千卡</span>
          </div>
        </div>

        <el-divider />

        <div class="slope-distribution">
          <h4>坡度分布</h4>
          <div class="slope-bar">
            <div
              class="slope-segment flat"
              :style="{ width: getSlopePercent(routeAnalysisResult.slopeDistribution, 'flat') + '%' }"
              v-if="getSlopePercent(routeAnalysisResult.slopeDistribution, 'flat') > 0"
            ></div>
            <div
              class="slope-segment moderate"
              :style="{ width: getSlopePercent(routeAnalysisResult.slopeDistribution, 'moderate') + '%' }"
              v-if="getSlopePercent(routeAnalysisResult.slopeDistribution, 'moderate') > 0"
            ></div>
            <div
              class="slope-segment steep"
              :style="{ width: getSlopePercent(routeAnalysisResult.slopeDistribution, 'steep') + '%' }"
              v-if="getSlopePercent(routeAnalysisResult.slopeDistribution, 'steep') > 0"
            ></div>
            <div
              class="slope-segment very-steep"
              :style="{ width: getSlopePercent(routeAnalysisResult.slopeDistribution, 'verySteep') + '%' }"
              v-if="getSlopePercent(routeAnalysisResult.slopeDistribution, 'verySteep') > 0"
            ></div>
          </div>
          <div class="slope-legend">
            <span><i class="dot flat"></i>平缓 {{ routeAnalysisResult.slopeDistribution.flat }}段</span>
            <span><i class="dot moderate"></i>中等 {{ routeAnalysisResult.slopeDistribution.moderate }}段</span>
            <span><i class="dot steep"></i>较陡 {{ routeAnalysisResult.slopeDistribution.steep }}段</span>
            <span><i class="dot very-steep"></i>陡峭 {{ routeAnalysisResult.slopeDistribution.verySteep }}段</span>
          </div>
        </div>

        <el-divider />

        <div class="difficulty-info">
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="平均坡度">
              {{ routeAnalysisResult.routeOverview.avgSlope }}%
            </el-descriptions-item>
            <el-descriptions-item label="最大坡度">
              {{ routeAnalysisResult.routeOverview.maxSlope }}%
            </el-descriptions-item>
            <el-descriptions-item label="累计爬升">
              {{ routeAnalysisResult.routeOverview.totalElevationGain }} 米
            </el-descriptions-item>
            <el-descriptions-item label="适合人群">
              {{ routeAnalysisResult.difficulty.suitableFor }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <el-divider />

        <div class="warnings" v-if="routeAnalysisResult.difficulty.warnings?.length">
          <h4>安全警告</h4>
          <div v-for="(warning, idx) in routeAnalysisResult.difficulty.warnings" :key="idx" class="warning-item">
            <el-icon><Warning /></el-icon>
            <span>{{ warning }}</span>
          </div>
        </div>

        <el-divider />

        <div class="ai-advice" v-if="routeAnalysisResult.aiAdvice">
          <h4>AI骑行建议</h4>
          <p class="advice-text">{{ routeAnalysisResult.aiAdvice }}</p>
        </div>

        <el-divider />

        <div class="recommendations" v-if="routeAnalysisResult.recommendations?.length">
          <h4>综合建议</h4>
          <div
            v-for="(rec, idx) in routeAnalysisResult.recommendations"
            :key="idx"
            class="recommendation-item"
            :class="rec.type"
          >
            <el-icon v-if="rec.type === 'warning'"><Warning /></el-icon>
            <el-icon v-else-if="rec.type === 'danger'"><CircleClose /></el-icon>
            <el-icon v-else><InfoFilled /></el-icon>
            <span>{{ rec.text }}</span>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="card-header">
          <span>天气路况影响</span>
        </div>
      </template>

      <el-form label-position="top" size="small">
        <el-form-item label="天气类型">
          <el-select v-model="impactWeather" placeholder="选择天气" style="width: 100%">
            <el-option label="晴天" value="晴" />
            <el-option label="小雨" value="雨天" />
            <el-option label="中雨" value="中雨" />
            <el-option label="大雨" value="大雨" />
            <el-option label="雪天" value="雪天" />
            <el-option label="大风" value="大风" />
            <el-option label="雾霾" value="雾霾" />
          </el-select>
        </el-form-item>

        <el-form-item label="道路类型">
          <el-select v-model="impactRoadType" placeholder="选择道路类型" style="width: 100%">
            <el-option label="城市道路" value="城市道路" />
            <el-option label="山地道路" value="山地道路" />
            <el-option label="乡村道路" value="乡村道路" />
          </el-select>
        </el-form-item>

        <el-button @click="checkWeatherImpact" :loading="checkingImpact" style="width: 100%">
          查询影响
        </el-button>
      </el-form>
    </el-card>

    <el-card v-if="weatherImpactResult" shadow="never" class="panel-card result-card">
      <template #header>
        <div class="card-header">
          <span>天气影响分析</span>
        </div>
      </template>

      <div class="weather-impact-detail">
        <el-descriptions :column="1" size="small" border>
          <el-descriptions-item label="天气条件">
            {{ weatherImpactResult.weather }}
          </el-descriptions-item>
          <el-descriptions-item label="道路类型">
            {{ weatherImpactResult.roadType }}
          </el-descriptions-item>
          <el-descriptions-item label="拥堵因素">
            <el-tag :type="weatherImpactResult.impact.congestionFactor > 1.3 ? 'warning' : 'success'" size="small">
              {{ weatherImpactResult.impact.congestionFactor }}x
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="安全因素">
            <el-tag :type="weatherImpactResult.impact.safetyFactor < 0.5 ? 'danger' : 'success'" size="small">
              {{ weatherImpactResult.impact.safetyFactor }}x
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="舒适因素">
            <el-tag size="small">
              {{ weatherImpactResult.impact.comfortFactor }}x
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <div class="impact-advice">
          <p>{{ weatherImpactResult.advice }}</p>
        </div>

        <div class="impact-recommendations" v-if="weatherImpactResult.recommendations?.length">
          <div
            v-for="(rec, idx) in weatherImpactResult.recommendations"
            :key="idx"
            class="recommendation-item"
          >
            <span>{{ rec }}</span>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Warning, CircleClose, InfoFilled } from '@element-plus/icons-vue'
import { roadConditionApi } from '@/api'

const props = defineProps({
  routeGeom: {
    type: Object,
    default: null
  },
  roadInfo: {
    type: Object,
    default: null
  },
  roadSegments: {
    type: Array,
    default: () => []
  }
})

const predictDate = ref(new Date())
const predictHour = ref(new Date().getHours())
const weatherCondition = ref('晴')
const predicting = ref(false)
const predictionResult = ref(null)

const routeWeather = ref('晴')
const userLevel = ref(2)
const analyzing = ref(false)
const routeAnalysisResult = ref(null)

const impactWeather = ref('晴')
const impactRoadType = ref('城市道路')
const checkingImpact = ref(false)
const weatherImpactResult = ref(null)
const selectedRoadId = ref(null)

const roadSegmentOptions = computed(() => {
  return (props.roadSegments || []).map((segment, index) => {
    const roadName = segment.name || `路段 ${index + 1}`
    const maxSlope = Number(segment.maxSlope || 0)

    return {
      key: `${segment.id ?? 'segment'}-${index}`,
      id: segment.id,
      label: `${roadName}${maxSlope > 0 ? ` · 最大坡度 ${maxSlope.toFixed(1)}%` : ''}`,
      segment
    }
  })
})

const selectedRoadInfo = computed(() => {
  const fromSegments = (props.roadSegments || []).find(segment => segment.id === selectedRoadId.value)
  return fromSegments || props.roadInfo || null
})

watch(
  () => [props.roadInfo?.id, props.roadSegments],
  () => {
    const availableSegments = props.roadSegments || []
    const hasSelected = availableSegments.some(segment => segment.id === selectedRoadId.value)

    if (hasSelected) {
      return
    }

    selectedRoadId.value = props.roadInfo?.id ?? availableSegments[0]?.id ?? null
  },
  { immediate: true, deep: true }
)

watch(
  selectedRoadInfo,
  (road) => {
    const roadType = road?.roadType || ''
    if (roadType.includes('山')) {
      impactRoadType.value = '山地道路'
    } else if (roadType.includes('乡')) {
      impactRoadType.value = '乡村道路'
    } else if (roadType) {
      impactRoadType.value = '城市道路'
    }
  },
  { immediate: true }
)

watch(
  () => [props.routeGeom, props.roadSegments],
  () => {
    predictionResult.value = null
    routeAnalysisResult.value = null
    weatherImpactResult.value = null
  },
  { deep: true }
)

const disabledDate = (date) => {
  return date < new Date(new Date().setHours(0, 0, 0, 0))
}

const getCongestionColor = (score) => {
  if (score >= 0.8) return '#67c23a'
  if (score >= 0.6) return '#85ce61'
  if (score >= 0.4) return '#e6a23c'
  if (score >= 0.2) return '#f56c6c'
  return '#c45656'
}

const getCongestionTagType = (level) => {
  if (level === '畅通') return 'success'
  if (level === '良好') return 'success'
  if (level === '一般') return 'warning'
  if (level === '较堵') return 'warning'
  return 'danger'
}

const getDifficultyTagType = (level) => {
  if (level === '轻松' || level === '简单') return 'success'
  if (level === '中等') return 'warning'
  if (level === '困难') return 'danger'
  return 'danger'
}

const getSlopePercent = (distribution, type) => {
  if (!distribution) return 0
  const total = distribution.flat + distribution.moderate + distribution.steep + distribution.verySteep
  if (total === 0) return 0
  return Math.round((distribution[type] / total) * 100)
}

const predictTraffic = async () => {
  if (!selectedRoadInfo.value?.id) {
    ElMessage.warning('当前路线缺少可预测的具体道路，请先完成路线规划或选择重点路段')
    return
  }

  predicting.value = true
  try {
    const dateStr = predictDate.value.toISOString().split('T')[0]
    const dayOfWeek = new Date(predictDate.value).getDay()

    const response = await roadConditionApi.predictTraffic({
      roadId: selectedRoadInfo.value.id,
      targetDate: dateStr,
      targetHour: predictHour.value,
      weather: weatherCondition.value,
      dayOfWeek: dayOfWeek
    })

    if (response.code === 200) {
      predictionResult.value = response.data
      ElMessage.success('路况预测完成')
    } else {
      ElMessage.error(response.message || '预测失败')
    }
  } catch (error) {
    console.error('预测失败:', error)
    ElMessage.error('预测失败，请稍后重试')
  } finally {
    predicting.value = false
  }
}

const analyzeRoute = async () => {
  if (!props.routeGeom) {
    ElMessage.warning('请先规划路线')
    return
  }

  analyzing.value = true
  try {
    const response = await roadConditionApi.analyzeRoute({
      routeGeom: props.routeGeom,
      weather: routeWeather.value,
      userLevel: userLevel.value
    })

    if (response.code === 200) {
      routeAnalysisResult.value = response.data
      ElMessage.success('路线分析完成')
    } else {
      ElMessage.error(response.message || '分析失败')
    }
  } catch (error) {
    console.error('路线分析失败:', error)
    ElMessage.error('分析失败，请稍后重试')
  } finally {
    analyzing.value = false
  }
}

const checkWeatherImpact = async () => {
  checkingImpact.value = true
  try {
    const response = await roadConditionApi.getWeatherRoadImpact({
      weather: impactWeather.value,
      roadType: impactRoadType.value,
      avgSlope: selectedRoadInfo.value?.avgSlope || 0
    })

    if (response.code === 200) {
      weatherImpactResult.value = response.data
      ElMessage.success('影响分析完成')
    } else {
      ElMessage.error(response.message || '查询失败')
    }
  } catch (error) {
    console.error('查询失败:', error)
    ElMessage.error('查询失败，请稍后重试')
  } finally {
    checkingImpact.value = false
  }
}
</script>

<style scoped>
.road-condition-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selected-road-tip {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f5f7fa;
  color: #303133;
  font-size: 12px;
  line-height: 1.5;
}

.selected-road-tip.muted {
  color: #909399;
}

.result-card {
  background-color: #fafafa;
}

.prediction-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-row .label {
  color: #606266;
  font-size: 13px;
}

.info-row .value {
  font-weight: 600;
}

.info-row .value.highlight {
  color: #409eff;
  font-size: 16px;
}

.value-bar {
  flex: 1;
  margin-left: 12px;
  max-width: 150px;
}

.impact-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.impact-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

.impact-label {
  font-size: 12px;
  color: #909399;
}

.impact-value {
  font-size: 16px;
  font-weight: 600;
  color: #409eff;
}

.impact-desc {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}

.recommendation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 6px;
  font-size: 13px;
}

.recommendation-item.warning {
  background-color: #fdf6ec;
  color: #e6a23c;
}

.recommendation-item.danger {
  background-color: #fef0f0;
  color: #f56c6c;
}

.recommendation-item.info {
  background-color: #f4f4f5;
  color: #909399;
}

.route-analysis {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.overview-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.overview-item .item-value {
  font-size: 24px;
  font-weight: 600;
  color: #409eff;
}

.overview-item .item-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.slope-distribution h4,
.warnings h4,
.ai-advice h4,
.recommendations h4 {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #303133;
}

.slope-bar {
  display: flex;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: #e4e7ed;
}

.slope-segment {
  height: 100%;
  transition: width 0.3s ease;
}

.slope-segment.flat {
  background: #67c23a;
}

.slope-segment.moderate {
  background: #e6a23c;
}

.slope-segment.steep {
  background: #f56c6c;
}

.slope-segment.very-steep {
  background: #c45656;
}

.slope-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  font-size: 11px;
  color: #606266;
}

.slope-legend .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.slope-legend .dot.flat {
  background: #67c23a;
}

.slope-legend .dot.moderate {
  background: #e6a23c;
}

.slope-legend .dot.steep {
  background: #f56c6c;
}

.slope-legend .dot.very-steep {
  background: #c45656;
}

.warning-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #fef0f0;
  color: #f56c6c;
  border-radius: 4px;
  margin-bottom: 6px;
  font-size: 13px;
}

.advice-text {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  margin: 0;
}

.weather-impact-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.impact-advice p {
  font-size: 13px;
  color: #303133;
  line-height: 1.6;
  margin: 0;
}

.impact-recommendations {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.impact-recommendations .recommendation-item {
  background: #f4f4f5;
  color: #606266;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
