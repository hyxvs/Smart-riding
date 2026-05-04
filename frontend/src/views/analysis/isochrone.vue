<template>
  <div class="analysis-page">
    <div class="page-header">
      <div>
        <h2>服务范围分析</h2>
      </div>
      <div class="header-actions">
        <el-button v-if="userStore.isLoggedIn" @click="loadHistory" :loading="historyLoading">
          刷新历史
        </el-button>
        <el-button type="primary" :loading="loading" @click="calculateIsochrone">
          计算等时圈
        </el-button>
      </div>
    </div>

    <div class="page-layout">
      <div class="map-panel">
        <MapPicker
          ref="mapPickerRef"
          height="620px"
          :center="[form.startLng, form.startLat]"
          :zoom="13"
          :show-controls="true"
          :enable-geocode="false"
          :readonly="false"
          :initial-coord="[form.startLng, form.startLat]"
          @select="handleMapSelect"
        />
      </div>

      <div class="side-panel">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="card-header">
              <span>分析参数</span>
            </div>
          </template>

          <el-form label-position="top">
            <el-form-item label="起点经度">
              <el-input-number v-model="form.startLng" :precision="6" :step="0.0001" controls-position="right" class="full-width" />
            </el-form-item>
            <el-form-item label="起点纬度">
              <el-input-number v-model="form.startLat" :precision="6" :step="0.0001" controls-position="right" class="full-width" />
            </el-form-item>
            <el-form-item label="时间阈值（分钟）">
              <el-select v-model="form.timeLimits" multiple placeholder="请选择时间阈值">
                <el-option v-for="limit in timeLimitOptions" :key="limit" :label="`${limit} 分钟`" :value="limit" />
              </el-select>
            </el-form-item>
          </el-form>

          <div class="field-tip">可在地图上单击设置起点，前端会直接渲染后端返回的真实等时圈 GeoJSON。</div>

          <el-descriptions :column="1" border size="small" class="summary-box">
            <el-descriptions-item label="当前视图">
              {{ previewHistoryItem ? '历史记录回显' : '本次分析结果' }}
            </el-descriptions-item>
            <el-descriptions-item label="登录状态">
              {{ userStore.isLoggedIn ? '已登录，可查看历史' : '未登录，仅可查看当前结果' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never" class="panel-card">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="本次分析" name="current">
              <template v-if="results.length">
                <div class="result-list">
                  <button
                    v-for="(item, index) in results"
                    :key="item.timeLimit"
                    type="button"
                    class="result-item"
                    :class="{ active: index === activeResultIndex && !previewHistoryItem }"
                    @click="selectResult(index)"
                  >
                    <div class="result-title">
                      <span>{{ item.timeLimit }} 分钟</span>
                      <el-tag size="small" :type="index === activeResultIndex && !previewHistoryItem ? 'primary' : 'info'">
                        POI {{ item.poiCount }}
                      </el-tag>
                    </div>
                    <div class="result-desc">点击后会在地图上高亮该时间圈，并同步刷新 POI 列表。</div>
                  </button>
                </div>

                <el-divider />

                <el-table :data="activePois" size="small" max-height="280" empty-text="当前时间圈内暂无 POI">
                  <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
                  <el-table-column prop="category" label="类别" width="110" show-overflow-tooltip />
                  <el-table-column label="距离" width="96">
                    <template #default="{ row }">
                      {{ formatKilometers(row.distance_km) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="88">
                    <template #default="{ row }">
                      <el-button link type="primary" @click="focusPoi(row)">定位</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </template>

              <el-empty v-else description="执行分析后，等时圈结果和可达 POI 会显示在这里。" />
            </el-tab-pane>

            <el-tab-pane label="历史记录" name="history">
              <template v-if="userStore.isLoggedIn">
                <el-table :data="historyList" size="small" max-height="420" empty-text="暂无历史记录">
                  <el-table-column prop="time_limit" label="时间阈值" width="96">
                    <template #default="{ row }">
                      {{ row.time_limit }} 分钟
                    </template>
                  </el-table-column>
                  <el-table-column label="耗时" width="90">
                    <template #default="{ row }">
                      {{ row.calculation_time }} ms
                    </template>
                  </el-table-column>
                  <el-table-column label="创建时间" min-width="150">
                    <template #default="{ row }">
                      {{ formatDateTime(row.created_at) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="88">
                    <template #default="{ row }">
                      <el-button link type="primary" @click="previewHistory(row)">回显</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </template>

              <el-empty v-else description="登录后可查看后端保存的等时圈历史记录。">
                <el-button type="primary" @click="goLogin">去登录</el-button>
              </el-empty>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import Feature from 'ol/Feature'
import GeoJSON from 'ol/format/GeoJSON'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
import { createEmpty, extend, isEmpty } from 'ol/extent'
import { fromLonLat } from 'ol/proj'
import { analysisApi } from '@/api'
import MapPicker from '@/components/MapPicker.vue'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const mapPickerRef = ref(null)
const loading = ref(false)
const historyLoading = ref(false)
const results = ref([])
const historyList = ref([])
const activeResultIndex = ref(0)
const activeTab = ref('current')
const previewHistoryItem = ref(null)
const geoJson = new GeoJSON()

const form = reactive({
  startLng: 114.935,
  startLat: 25.845,
  timeLimits: [5, 10, 15, 30]
})

const timeLimitOptions = [5, 10, 15, 30]
const palette = ['#22c55e', '#eab308', '#f97316', '#ef4444']

const activeResult = computed(() => results.value[activeResultIndex.value] || null)
const activePois = computed(() => activeResult.value?.pois || [])

onMounted(async () => {
  if (userStore.isLoggedIn) {
    await loadHistory()
  }
  await nextTick()
  refreshMap()
})

watch(
  () => userStore.isLoggedIn,
  async loggedIn => {
    if (loggedIn) {
      await loadHistory()
    } else {
      historyList.value = []
    }
  }
)

function handleMapSelect(location) {
  form.startLng = Number(location.lng)
  form.startLat = Number(location.lat)
  previewHistoryItem.value = null
  refreshMap()
}

async function calculateIsochrone() {
  if (!form.timeLimits.length) {
    ElMessage.warning('请至少选择一个时间阈值')
    return
  }

  loading.value = true
  try {
    const response = await analysisApi.calculateIsochrone({
      startLng: Number(form.startLng),
      startLat: Number(form.startLat),
      timeLimits: [...form.timeLimits].map(Number).sort((a, b) => a - b),
      mode: 'cycling'
    })

    if (response.code !== 200) {
      ElMessage.error(response.message || '等时圈分析失败')
      return
    }

    results.value = response.data.results || []
    activeResultIndex.value = 0
    previewHistoryItem.value = null
    activeTab.value = 'current'
    refreshMap()

    if (userStore.isLoggedIn) {
      await loadHistory()
    }

    ElMessage.success('等时圈分析完成')
  } catch (error) {
    console.error('等时圈分析失败:', error)
    ElMessage.error('等时圈分析失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

async function loadHistory() {
  if (!userStore.isLoggedIn) {
    return
  }

  historyLoading.value = true
  try {
    const response = await analysisApi.getIsochroneHistory({ page: 1, limit: 20 })
    if (response.code === 200) {
      historyList.value = response.data.list || []
    }
  } catch (error) {
    console.error('加载等时圈历史失败:', error)
    ElMessage.error('历史记录加载失败')
  } finally {
    historyLoading.value = false
  }
}

function selectResult(index) {
  activeResultIndex.value = index
  previewHistoryItem.value = null
  refreshMap()
}
// 回显历史记录
function previewHistory(item) {
  previewHistoryItem.value = item
  activeTab.value = 'history'

  const startCoords = item?.start_point?.coordinates
  if (Array.isArray(startCoords) && startCoords.length >= 2) {
    form.startLng = Number(startCoords[0])
    form.startLat = Number(startCoords[1])
  }

  refreshMap()
}

function focusPoi(poi) {
  const coords = poi?.location?.coordinates
  if (!coords || !mapPickerRef.value) {
    return
  }
  mapPickerRef.value.locateTo(coords[0], coords[1], 17)
}

function refreshMap() {
  const mapInstance = mapPickerRef.value
  if (!mapInstance) {
    return
  }

  mapInstance.clearLayers()

  const extents = []
  const startLayer = buildStartLayer()
  const polygonLayer = previewHistoryItem.value ? buildHistoryLayer() : buildResultLayer()
  const poiLayer = previewHistoryItem.value ? null : buildPoiLayer()

  ;[startLayer, polygonLayer, poiLayer].filter(Boolean).forEach(layer => {
    mapInstance.addLayer(layer)
    const extent = layer.getSource()?.getExtent?.()
    if (extent && !isEmpty(extent)) {
      extents.push(extent)
    }
  })

  fitExtents(extents)
}

function buildStartLayer() {
  const source = new VectorSource()
  source.addFeature(
    new Feature({
      geometry: new Point(fromLonLat([Number(form.startLng), Number(form.startLat)]))
    })
  )

  return new VectorLayer({
    source,
    style: new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: '#111827' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
      })
    })
  })
}

function buildResultLayer() {
  if (!results.value.length) {
    return null
  }

  const source = new VectorSource()
  results.value.forEach((item, index) => {
    if (!item.isochrone) {
      return
    }

    const geometry = geoJson.readGeometry(item.isochrone, projectionOptions())
    const feature = new Feature({ geometry, timeLimit: item.timeLimit })
    const color = palette[index % palette.length]
    const isActive = index === activeResultIndex.value

    feature.setStyle(
      new Style({
        fill: new Fill({ color: hexToRgba(color, isActive ? 0.28 : 0.16) }),
        stroke: new Stroke({
          color,
          width: isActive ? 3 : 2
        })
      })
    )

    source.addFeature(feature)
  })

  return new VectorLayer({ source })
}

function buildHistoryLayer() {
  if (!previewHistoryItem.value?.isochrone_geom) {
    return null
  }

  const source = new VectorSource()
  const geometry = geoJson.readGeometry(previewHistoryItem.value.isochrone_geom, projectionOptions())
  source.addFeature(new Feature({ geometry }))

  return new VectorLayer({
    source,
    style: new Style({
      fill: new Fill({ color: 'rgba(64, 158, 255, 0.20)' }),
      stroke: new Stroke({ color: '#409eff', width: 3 })
    })
  })
}

function buildPoiLayer() {
  // 只有在回显历史记录时才需要绘制POI，否则返回null
  // ！activePois.value.length的作用是判断是否有POI需要绘制
  if (!activePois.value.length) {
    return null
  }

  const source = new VectorSource()
  activePois.value.forEach(item => {
    if (!item.location) {
      return
    }

    const geometry = geoJson.readGeometry(item.location, projectionOptions())
    source.addFeature(new Feature({ geometry }))
  })

  return new VectorLayer({
    source,
    style: new Style({
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: '#2563eb' }),
        stroke: new Stroke({ color: '#ffffff', width: 1.5 })
      })
    })
  })
}

function fitExtents(extents) {
  const map = mapPickerRef.value?.getMap()
  if (!map || !extents.length) {
    mapPickerRef.value?.locateTo(form.startLng, form.startLat, 13)
    return
  }

  const merged = createEmpty()
  extents.forEach(extent => extend(merged, extent))
  if (!isEmpty(merged)) {
    map.getView().fit(merged, {
      padding: [40, 40, 40, 40],
      duration: 350,
      maxZoom: 16
    })
  }
}

function formatKilometers(value) {
  const distance = Number(value)
  if (Number.isNaN(distance)) {
    return '-'
  }
  // isNaN() 方法用于判断一个值是否为 Not a Number (NaN)
  return `${distance.toFixed(2)} km`
}

function formatDateTime(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function goLogin() {
  router.push({ name: 'Login', query: { redirect: '/analysis/isochrone' } })
}

function projectionOptions() {
  return {
    // 数据投影为 WGS84，特征投影为 Web Mercator
    // dataProjection: 'EPSG:4326' 表示 WGS84 投影
    // featureProjection: 'EPSG:3857' 表示投影为 Web Mercator
    // 为什么需要转换投影？因为 OpenLayers 默认使用 WGS84 投影，而 Web Mercator 投影在地图上显示更符合人类视觉习惯
    // dataProjection的作用，为什么是dataProjection
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '')
  const bigint = parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  // 从十六进制颜色值中提取红色分量
  // 16 位到 24 位为红色分量
  const g = (bigint >> 8) & 255
  // 从十六进制颜色值中提取绿色分量
  // 8 位到 16 位为绿色分量
  const b = bigint & 255
  // 从十六进制颜色值中提取蓝色分量
  // 0 位位为蓝色分量
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
  // rgba() 函数用于创建 RGBA 颜色值
  // rgba(红色分量, 绿色分量, 蓝色分量, 透明度)
}
</script>

<style scoped>
.analysis-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-header h2 {
  margin: 0 0 8px;
  font-size: 24px;
  color: #1f2937;
}

.page-header p {
  margin: 0;
  color: #6b7280;
  line-height: 1.6;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.page-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(340px, 430px);
  gap: 20px;
}

.map-panel,
.side-panel {
  min-width: 0;
}

.panel-card {
  margin-bottom: 16px;
  border-radius: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 600;
}

.full-width {
  width: 100%;
}

.field-tip {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.6;
}

.summary-box {
  margin-top: 12px;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-item {
  width: 100%;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.result-item:hover,
.result-item.active {
  border-color: #409eff;
  box-shadow: 0 8px 24px rgba(64, 158, 255, 0.12);
}

.result-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-weight: 600;
  color: #1f2937;
}

.result-desc {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
}

@media (max-width: 1100px) {
  .page-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
  }
}
</style>
