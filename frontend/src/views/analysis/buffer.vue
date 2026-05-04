<template>
  <div class="analysis-page">
    <div class="page-header">
      <div>
        <h2>周边缓冲分析</h2>
      </div>
      <el-button type="primary" :loading="loading" @click="analyzeBuffer">
        执行分析
      </el-button>
    </div>

    <div class="page-layout">
      <div class="map-panel">
        <MapPicker
          ref="mapPickerRef"
          height="620px"
          :center="mapCenter"
          :zoom="13"
          :show-controls="true"
          :enable-geocode="false"
          :readonly="false"
          :initial-coord="form.targetType === 'custom' ? form.targetCoords : null"
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
            <el-form-item label="目标类型">
              <el-radio-group v-model="form.targetType" @change="handleTargetTypeChange">
                <el-radio-button label="poi">POI</el-radio-button>
                <el-radio-button label="road">道路</el-radio-button>
                <el-radio-button label="custom">自定义点</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item v-if="form.targetType === 'poi'" label="选择 POI">
              <el-select
                v-model="form.targetId"
                placeholder="请选择目标 POI"
                filterable
                clearable
                @change="handleTargetSelection"
              >
                <el-option
                  v-for="poi in pois"
                  :key="poi.id"
                  :label="poi.name"
                  :value="poi.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item v-if="form.targetType === 'road'" label="选择道路">
              <el-select
                v-model="form.targetId"
                placeholder="请选择目标道路"
                filterable
                clearable
                @change="handleTargetSelection"
              >
                <el-option
                  v-for="road in roads"
                  :key="road.id"
                  :label="road.name || `道路 ${road.id}`"
                  :value="road.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item v-if="form.targetType === 'custom'" label="自定义坐标">
              <div class="coord-row">
                <el-input v-model.number="form.targetCoords[0]" placeholder="经度" />
                <el-input v-model.number="form.targetCoords[1]" placeholder="纬度" />
              </div>
              <div class="field-tip">可直接输入坐标，也可在地图上单击选择位置。</div>
            </el-form-item>

            <el-form-item label="缓冲距离（米）">
              <el-select v-model="form.distances" multiple placeholder="请选择缓冲距离">
                <el-option v-for="distance in distanceOptions" :key="distance" :label="`${distance} 米`" :value="distance" />
              </el-select>
            </el-form-item>
          </el-form>

          <el-descriptions :column="1" border size="small" class="summary-box">
            <el-descriptions-item label="当前目标">
              {{ currentTargetLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="地图取点">
              {{ form.targetType === 'custom' ? '已启用' : '切换到自定义点后可用' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card v-if="results.length" shadow="never" class="panel-card">
          <template #header>
            <div class="card-header">
              <span>分析结果</span>
              <el-tag size="small" type="success">{{ results.length }} 组</el-tag>
            </div>
          </template>

          <div class="result-list">
            <button
              v-for="(item, index) in results"
              :key="item.distance"
              type="button"
              class="result-item"
              :class="{ active: index === activeResultIndex }"
              @click="selectResult(index)"
            >
              <div class="result-title">
                <span>{{ item.distance }} 米</span>
                <el-tag size="small" :type="index === activeResultIndex ? 'primary' : 'info'">
                  {{ index === activeResultIndex ? '当前' : '查看' }}
                </el-tag>
              </div>
              <div class="result-metrics">
                <span>POI {{ item.poiCount }}</span>
                <span>道路 {{ item.roadCount }}</span>
              </div>
            </button>
          </div>
        </el-card>

        <el-card v-if="activeResult" shadow="never" class="panel-card">
          <template #header>
            <div class="card-header">
              <span>{{ activeResult.distance }} 米范围内 POI</span>
              <el-tag size="small" type="warning">{{ activePois.length }} 个</el-tag>
            </div>
          </template>

          <el-table :data="activePois" size="small" max-height="280" empty-text="当前范围内暂无 POI">
            <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
            <el-table-column prop="category" label="类别" width="110" show-overflow-tooltip />
            <el-table-column label="距离" width="100">
              <template #default="{ row }">
                {{ formatMeters(row.distance_m) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="88">
              <template #default="{ row }">
                <el-button link type="primary" @click="focusPoi(row)">定位</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-empty
          v-if="!results.length"
          description="选择目标并执行分析后，结果会在这里展示。"
          class="empty-state"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import Feature from 'ol/Feature'
import GeoJSON from 'ol/format/GeoJSON'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
import { createEmpty, extend, isEmpty } from 'ol/extent'
import { fromLonLat } from 'ol/proj'
import MapPicker from '@/components/MapPicker.vue'
import bufferApi from '@/api/buffer'
import { poiApi } from '@/api/poi'
import { roadApi } from '@/api/road'

const mapPickerRef = ref(null)
const loading = ref(false)
const pois = ref([])
const roads = ref([])
const results = ref([])
const activeResultIndex = ref(0)
const geoJson = new GeoJSON()
const defaultCenter = [114.935, 25.845]

const distanceOptions = [100, 200, 500, 1000, 2000]
const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

const form = reactive({
  targetType: 'poi',
  targetId: '',
  targetCoords: [...defaultCenter],
  distances: [100, 200, 500]
})
// 当前选中的分析结果
const activeResult = computed(() => results.value[activeResultIndex.value] || null)
const activePois = computed(() => activeResult.value?.pois || [])
const selectedPoi = computed(() => pois.value.find(item => item.id === form.targetId) || null)
const selectedRoad = computed(() => roads.value.find(item => item.id === form.targetId) || null)
const mapCenter = computed(() => normalizeCoords(form.targetCoords) || defaultCenter)
const currentTargetLabel = computed(() => {
  if (form.targetType === 'custom') {
    const coords = normalizeCoords(form.targetCoords)
    return coords ? `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}` : '未设置'
  }
  if (form.targetType === 'poi') {
    return selectedPoi.value?.name || '未选择 POI'
  }
  return selectedRoad.value?.name || (form.targetId ? `道路 ${form.targetId}` : '未选择道路')
})

onMounted(async () => {
  await loadBaseData()
  syncTargetGeometry()
})

async function loadBaseData() {
  try {
    const [poiResponse, roadResponse] = await Promise.all([
      poiApi.getList({ page: 1, limit: 200 }),
      roadApi.getRoads({ limit: 300 })
    ])

    if (poiResponse.code === 200) {
      pois.value = poiResponse.data.list || []
    }
    if (roadResponse.code === 200) {
      roads.value = roadResponse.data.roads || []
    }
  } catch (error) {
    console.error('加载缓冲分析基础数据失败:', error)
    ElMessage.error('基础数据加载失败，请稍后重试')
  }
}

function handleTargetTypeChange() {
  form.targetId = ''
  results.value = []
  activeResultIndex.value = 0
  if (form.targetType === 'custom' && !normalizeCoords(form.targetCoords)) {
    form.targetCoords = [...defaultCenter]
  }
  refreshMap()
}

function handleTargetSelection() {
  results.value = []
  activeResultIndex.value = 0
  syncTargetGeometry()
  refreshMap()
}

function handleMapSelect(location) {
  if (form.targetType !== 'custom') {
    return
  }

  form.targetCoords = [Number(location.lng), Number(location.lat)]
  refreshMap()
}

function syncTargetGeometry() {
  if (form.targetType === 'poi' && selectedPoi.value?.location?.coordinates) {
    form.targetCoords = [...selectedPoi.value.location.coordinates]
    mapPickerRef.value?.locateTo(form.targetCoords[0], form.targetCoords[1], 15)
    return
  }

  if (form.targetType === 'road') {
    const roadCoordinates = selectedRoad.value?.geometry?.coordinates
    if (Array.isArray(roadCoordinates) && roadCoordinates.length) {
      const firstPoint = roadCoordinates[0]
      if (Array.isArray(firstPoint) && firstPoint.length >= 2) {
        form.targetCoords = [Number(firstPoint[0]), Number(firstPoint[1])]
        mapPickerRef.value?.locateTo(form.targetCoords[0], form.targetCoords[1], 14)
      }
    }
  }
}

async function analyzeBuffer() {
  if (!form.distances.length) {
    ElMessage.warning('请至少选择一个缓冲距离')
    return
  }

  const coords = normalizeCoords(form.targetCoords)
  if (form.targetType === 'custom' && !coords) {
    ElMessage.warning('请先设置有效的自定义坐标')
    return
  }

  if (form.targetType !== 'custom' && !form.targetId) {
    ElMessage.warning('请先选择分析目标')
    return
  }

  loading.value = true
  try {
    const payload = {
      targetType: form.targetType,
      targetId: form.targetType === 'custom' ? undefined : form.targetId,
      targetCoords: form.targetType === 'custom' ? coords : undefined,
      distances: [...form.distances].map(Number).sort((a, b) => a - b)
    }

    const response = await bufferApi.analyzeBuffer(payload)
    if (response.code !== 200) {
      ElMessage.error(response.message || '缓冲分析失败')
      return
    }

    results.value = response.data || []
    activeResultIndex.value = 0
    refreshMap()
    ElMessage.success('缓冲分析完成')
  } catch (error) {
    console.error('缓冲分析失败:', error)
    ElMessage.error('缓冲分析失败，请稍后重试')
  } finally {
    loading.value = false
  }
}
// 选择分析结果
function selectResult(index) {
  activeResultIndex.value = index
  refreshMap()
}
// 点击POI时，将地图中心聚焦到该POI
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
  const targetLayer = buildTargetLayer()
  const bufferLayer = buildBufferLayer()
  const poiLayer = buildPoiLayer()

  ;[targetLayer, bufferLayer, poiLayer].filter(Boolean).forEach(layer => {
    mapInstance.addLayer(layer)
    const extent = layer.getSource()?.getExtent?.()
    if (extent && !isEmpty(extent)) {
      extents.push(extent)
    }
  })

  fitExtents(extents)
}

function buildTargetLayer() {
  const source = new VectorSource()

  if (form.targetType === 'custom') {
    const coords = normalizeCoords(form.targetCoords)
    if (!coords) {
      return null
    }
    source.addFeature(
      new Feature({
        geometry: new Point(fromLonLat(coords))
      })
    )
  } else if (form.targetType === 'poi' && selectedPoi.value?.location) {
    const geometry = geoJson.readGeometry(selectedPoi.value.location, projectionOptions())
    source.addFeature(new Feature({ geometry }))
  } else if (form.targetType === 'road' && selectedRoad.value?.geometry) {
    const geometry = geoJson.readGeometry(selectedRoad.value.geometry, projectionOptions())
    source.addFeature(new Feature({ geometry }))
  }

  if (!source.getFeatures().length) {
    return null
  }

  return new VectorLayer({
    source,
    style: form.targetType === 'road'
      ? new Style({
          stroke: new Stroke({
            color: '#111827',
            width: 4
          })
        })
      : new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: '#111827' }),
            stroke: new Stroke({ color: '#ffffff', width: 2 })
          })
        })
  })
}

function buildBufferLayer() {
  if (!results.value.length) {
    return null
  }

  const source = new VectorSource()
  results.value.forEach((item, index) => {
    if (!item.buffer) {
      return
    }
    const geometry = geoJson.readGeometry(item.buffer, projectionOptions())
    const feature = new Feature({
      geometry,
      distance: item.distance
    })
    const color = palette[index % palette.length]
    const isActive = index === activeResultIndex.value

    feature.setStyle(
      new Style({
        fill: new Fill({ color: `${hexToRgba(color, isActive ? 0.28 : 0.16)}` }),
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

function buildPoiLayer() {
  if (!activePois.value.length) {
    return null
  }

  const source = new VectorSource()
  activePois.value.forEach(item => {
    if (!item.location) {
      return
    }
    const geometry = geoJson.readGeometry(item.location, projectionOptions())
    source.addFeature(
      new Feature({
        geometry,
        name: item.name
      })
    )
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
    const coords = normalizeCoords(form.targetCoords)
    if (coords) {
      mapPickerRef.value?.locateTo(coords[0], coords[1], 14)
    }
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

function normalizeCoords(value) {
  if (!Array.isArray(value) || value.length < 2) {
    return null
  }
  const lng = Number(value[0])
  const lat = Number(value[1])
  if (Number.isNaN(lng) || Number.isNaN(lat)) {
    return null
  }
  return [lng, lat]
}

function formatMeters(value) {
  const distance = Number(value)
  if (Number.isNaN(distance)) {
    return '-'
  }
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(2)} km`
  }
  return `${distance.toFixed(0)} m`
}

function projectionOptions() {
  return {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '')
  const bigint = parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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

.page-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 420px);
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

.coord-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.field-tip {
  margin-top: 8px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
}

.summary-box {
  margin-top: 8px;
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

.result-title,
.result-metrics {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.result-title {
  margin-bottom: 8px;
  font-weight: 600;
  color: #1f2937;
}

.result-metrics {
  color: #6b7280;
  font-size: 13px;
}

.empty-state {
  padding: 32px 0 8px;
  background: #ffffff;
  border-radius: 16px;
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

  .coord-row {
    grid-template-columns: 1fr;
  }
}
</style>
