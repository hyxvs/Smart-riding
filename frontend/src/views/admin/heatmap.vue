<template>
  <div class="admin-heatmap" v-loading="loading">
    <div class="page-container heatmap-shell">
      <div class="page-header heatmap-header">
        <div>
          <h2>热点分析</h2>
          <p>基于数据库中的真实点位数据生成热点图层，支持网格热区、热点标记和点击联动。</p>
        </div>
        <div class="header-actions">
          <el-button @click="focusHeatmap">定位图层</el-button>
          <el-button type="primary" plain @click="loadHeatmap">刷新结果</el-button>
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="filters.source" style="width: 190px" @change="loadHeatmap">
          <el-option
            v-for="item in sourceOptions"
            :key="item.value"
            :label="`${item.label}（${item.count}）`"
            :value="item.value"
          />
        </el-select>

        <el-date-picker
          v-model="filters.date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="筛选日期"
          clearable
          style="width: 170px"
          @change="loadHeatmap"
        />

        <el-select v-model="filters.hour" clearable placeholder="小时" style="width: 110px" @change="loadHeatmap">
          <el-option v-for="item in hourOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>

        <el-select v-model="filters.gridSize" style="width: 130px" @change="loadHeatmap">
          <el-option v-for="item in gridOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>

      <div class="source-strip">
        <button
          v-for="item in sourceOptions"
          :key="item.value"
          class="source-chip"
          :class="{ active: item.value === activeSource, disabled: !item.available }"
          :disabled="!item.available"
          @click="switchSource(item.value)"
        >
          <div class="chip-title">{{ item.label }}</div>
          <div class="chip-count">{{ item.count }}</div>
          <div class="chip-desc">{{ item.description }}</div>
        </button>
      </div>

      <div class="content-wrapper">
        <div class="map-panel">
          <MapPicker
            ref="mapPickerRef"
            height="600px"
            :center="[114.935, 25.845]"
            :zoom="12"
            :show-controls="true"
            :show-address="false"
            :enable-geocode="false"
            readonly
          />

          <div class="map-toolbar">
            <div class="toolbar-title">图层控制</div>
            <div class="toolbar-options">
              <el-checkbox v-model="layerState.showCells" @change="renderAllLayers({ fitToLayer: false })">
                热点网格
              </el-checkbox>
              <el-checkbox v-model="layerState.showMarkers" @change="renderAllLayers({ fitToLayer: false })">
                热点标记
              </el-checkbox>
              <el-checkbox v-model="layerState.showLabels" @change="renderAllLayers({ fitToLayer: false })">
                数量标签
              </el-checkbox>
            </div>
            <div class="toolbar-actions">
              <el-button link @click="focusHeatmap">重新定位</el-button>
              <el-button link :disabled="!selectedArea" @click="clearSelection">清除选中</el-button>
            </div>
          </div>

          <div class="legend-card">
            <div class="legend-title">密度图例</div>
            <div class="legend-scale">
              <span class="legend-bar low"></span>
              <span class="legend-bar mid"></span>
              <span class="legend-bar high"></span>
              <span class="legend-bar peak"></span>
            </div>
            <div class="legend-labels">
              <span>低</span>
              <span>中</span>
              <span>高</span>
              <span>峰值</span>
            </div>
          </div>

          <div v-if="heatmapData.empty" class="map-empty-mask">
            <el-empty :description="heatmapData.emptyReason || '当前筛选条件下没有可视化结果'" />
          </div>
        </div>

        <div class="side-panel">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">当前来源</div>
              <div class="stat-value small">{{ activeSourceLabel || '--' }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">热点网格数</div>
              <div class="stat-value">{{ heatmapData.summary.hotspotCells || 0 }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">峰值密度</div>
              <div class="stat-value">{{ heatmapData.summary.peakCount || 0 }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">记录总数</div>
              <div class="stat-value">{{ heatmapData.summary.totalRecords || 0 }}</div>
            </div>
          </div>

          <el-card class="panel-card" shadow="never">
            <template #header>
              <span>分析摘要</span>
            </template>

            <div class="summary-item">
              <span>近 7 天记录数</span>
              <strong>{{ heatmapData.summary.recentRecords || 0 }}</strong>
            </div>
            <div class="summary-item">
              <span>{{ heatmapData.summary.metricLabel || '平均指标' }}</span>
              <strong>{{ formatMetric(heatmapData.summary.avgMetric) }}</strong>
            </div>
            <div class="summary-item">
              <span>栅格大小</span>
              <strong>{{ filters.gridSize }} 米</strong>
            </div>
            <div class="summary-item">
              <span>日期筛选</span>
              <strong>{{ filters.date || '全部' }}</strong>
            </div>
          </el-card>

          <el-card class="panel-card" shadow="never">
            <template #header>
              <span>当前选中</span>
            </template>

            <div v-if="selectedArea" class="selection-detail">
              <div class="selection-name">{{ selectedArea.label }}</div>
              <div class="selection-grid">
                <div class="selection-item">
                  <span>记录数</span>
                  <strong>{{ selectedArea.count }}</strong>
                </div>
                <div class="selection-item">
                  <span>平均指标</span>
                  <strong>{{ formatMetric(selectedArea.avgMetric) }}</strong>
                </div>
                <div class="selection-item full">
                  <span>中心点</span>
                  <strong>
                    {{ selectedArea.centroid.lng.toFixed(5) || '--' }},
                    {{ selectedArea.centroid.lat.toFixed(5) || '--' }}
                  </strong>
                </div>
              </div>
            </div>

            <el-empty v-else description="点击地图网格或右侧榜单即可选中热点区域" :image-size="72" />
          </el-card>

          <el-card class="panel-card" shadow="never">
            <template #header>
              <span>热点区域 TOP5</span>
            </template>

            <div v-if="heatmapData.topAreas.length" class="hot-list">
              <button
                v-for="(item, index) in heatmapData.topAreas"
                :key="`${item.name}-${index}`"
                class="hot-item"
                :class="{ active: item.areaKey === selectedAreaKey }"
                @click="focusArea(item)"
              >
                <span class="rank">{{ index + 1 }}</span>
                <span class="name">{{ item.name }}</span>
                <span class="count">{{ item.count }}</span>
              </button>
            </div>

            <el-empty v-else description="暂无热点区域" :image-size="72" />
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { adminApi } from '@/api'
import MapPicker from '@/components/MapPicker.vue'
import GeoJSON from 'ol/format/GeoJSON'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { unByKey } from 'ol/Observable'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { fromLonLat } from 'ol/proj'

const mapPickerRef = ref(null)
const loading = ref(false)
const activeSource = ref('auto')
const activeSourceLabel = ref('')
const selectedAreaKey = ref('')
const sourceOptions = ref([])
const heatmapData = ref({
  empty: false,
  emptyReason: '',
  summary: {
    hotspotCells: 0,
    peakCount: 0,
    totalRecords: 0,
    recentRecords: 0,
    avgMetric: null,
    metricLabel: '平均指标'
  },
  topAreas: [],
  cells: []
})

const filters = ref({
  source: 'auto',
  date: '',
  hour: null,
  gridSize: 500
})

const layerState = reactive({
  showCells: true,
  showMarkers: true,
  showLabels: true
})

const hourOptions = Array.from({ length: 24 }, (_, index) => ({
  value: index,
  label: `${String(index).padStart(2, '0')}:00`
}))

const gridOptions = [
  { label: '250 米', value: 250 },
  { label: '500 米', value: 500 },
  { label: '1000 米', value: 1000 },
  { label: '2000 米', value: 2000 }
]

const geoJson = new GeoJSON()
let heatLayer = null
let hotspotLayer = null
let mapClickListener = null

const selectedArea = computed(() =>
  heatmapData.value.cells.find(item => item.areaKey === selectedAreaKey.value) || null
)

onMounted(async () => {
  await bindMapEvents()
  await loadHeatmap()
})

onBeforeUnmount(() => {
  clearLayers()
  if (mapClickListener) {
    unByKey(mapClickListener)
    mapClickListener = null
  }
})

async function loadHeatmap() {
  loading.value = true
  try {
    const res = await adminApi.getHeatmap({
      source: filters.value.source,
      date: filters.value.date,
      hour: filters.value.hour,
      gridSize: filters.value.gridSize
    })

    if (res.code === 200) {
      sourceOptions.value = res.data.sourceOptions || []
      activeSource.value = res.data.activeSource
      activeSourceLabel.value = res.data.activeSourceLabel || ''
      filters.value.source = res.data.activeSource

      const cells = (res.data.cells || []).map((item, index) => ({
        ...item,
        areaKey: `${item.label}-${index}`
      }))

      heatmapData.value = {
        ...res.data,
        cells,
        topAreas: (res.data.topAreas || []).map((item, index) => ({
          ...item,
          areaKey: `${item.name}-${index}`
        })),
        summary: {
          ...res.data.summary,
          metricLabel: res.data.summary?.metricLabel || '平均指标'
        }
      }

      selectedAreaKey.value = heatmapData.value.topAreas[0]?.areaKey || cells[0]?.areaKey || ''

      await nextTick()
      await bindMapEvents()
      renderAllLayers()
    }
  } catch (error) {
    console.error('加载热点分析失败:', error)
  } finally {
    loading.value = false
  }
}

function switchSource(source) {
  const target = sourceOptions.value.find(item => item.value === source)
  if (!target?.available) return
  filters.value.source = source
  loadHeatmap()
}

async function bindMapEvents() {
  const map = await ensureMapReady()
  if (!map || mapClickListener) return

  mapClickListener = map.on('click', event => {
    let areaKey = ''
    map.forEachFeatureAtPixel(event.pixel, feature => {
      areaKey = feature.get('areaKey')
      return Boolean(areaKey)
    })

    if (!areaKey) return
    const target = heatmapData.value.cells.find(item => item.areaKey === areaKey)
    if (target) {
      focusArea(target)
    }
  })
}

function clearLayers() {
  if (heatLayer) {
    mapPickerRef.value?.removeLayer(heatLayer)
    heatLayer = null
  }

  if (hotspotLayer) {
    mapPickerRef.value?.removeLayer(hotspotLayer)
    hotspotLayer = null
  }
}

function renderAllLayers(options = {}) {
  const { fitToLayer = true } = options
  clearLayers()

  if (!mapPickerRef.value || !heatmapData.value.cells?.length) {
    return
  }

  const peakCount = Math.max(...heatmapData.value.cells.map(item => item.count), 1)
  const cellSource = new VectorSource()
  const markerSource = new VectorSource()

  heatmapData.value.cells.forEach(cell => {
    if (!cell.geom) return

    const geometry = geoJson.readGeometry(cell.geom, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    })

    const baseFeature = new Feature({ geometry })
    baseFeature.setProperties({
      ...cell
    })

    cellSource.addFeature(baseFeature)

    if (cell.centroid?.lng !== undefined && cell.centroid?.lat !== undefined) {
      const markerFeature = new Feature({
        geometry: new Point(fromLonLat([cell.centroid.lng, cell.centroid.lat]))
      })
      markerFeature.setProperties({
        ...cell
      })
      markerSource.addFeature(markerFeature)
    }
  })

  if (layerState.showCells) {
    heatLayer = new VectorLayer({
      source: cellSource,
      style: feature => createHeatStyle(feature, peakCount)
    })
    mapPickerRef.value.addLayer(heatLayer)
  }

  if (layerState.showMarkers) {
    hotspotLayer = new VectorLayer({
      source: markerSource,
      style: feature => createMarkerStyle(feature, peakCount)
    })
    mapPickerRef.value.addLayer(hotspotLayer)
  }

  if (fitToLayer) {
    if (selectedArea.value?.centroid) {
      locateToCentroid(selectedArea.value.centroid, 14)
      return
    }

    if (cellSource.getFeatures().length) {
      fitSource(cellSource)
    } else if (markerSource.getFeatures().length) {
      fitSource(markerSource, 15)
    }
  }
}

function focusArea(area) {
  selectedAreaKey.value = area.areaKey
  renderAllLayers({ fitToLayer: false })
  if (area.centroid) {
    locateToCentroid(area.centroid, 14)
  }
}

function clearSelection() {
  selectedAreaKey.value = ''
  renderAllLayers({ fitToLayer: false })
}

function focusHeatmap() {
  if (selectedArea.value?.centroid) {
    locateToCentroid(selectedArea.value.centroid, 14)
    return
  }

  const source = heatLayer?.getSource() || hotspotLayer?.getSource()
  if (source?.getFeatures().length) {
    fitSource(source, 15)
  }
}

function locateToCentroid(centroid, zoom = 14) {
  if (!centroid) return
  mapPickerRef.value?.locateTo(centroid.lng, centroid.lat, zoom)
}

function fitSource(source, maxZoom = 14) {
  const map = mapPickerRef.value?.getMap()
  if (!map || !source?.getFeatures().length) return

  map.getView().fit(source.getExtent(), {
    padding: [48, 48, 48, 48],
    duration: 320,
    maxZoom
  })
}

function createHeatStyle(feature, peakCount) {
  const count = Number(feature.get('count') || 0)
  const ratio = peakCount ? count / peakCount : 0
  const active = feature.get('areaKey') === selectedAreaKey.value

  return new Style({
    fill: new Fill({
      color: getHeatColor(ratio, active)
    }),
    stroke: new Stroke({
      color: active ? '#0f172a' : 'rgba(15, 23, 42, 0.24)',
      width: active ? 2.8 : 1.1
    }),
    text: layerState.showLabels
      ? new Text({
          text: count > 0 ? String(count) : '',
          font: active ? 'bold 13px sans-serif' : '12px sans-serif',
          fill: new Fill({ color: '#0f172a' })
        })
      : undefined
  })
}

function createMarkerStyle(feature, peakCount) {
  const count = Number(feature.get('count') || 0)
  const ratio = peakCount ? count / peakCount : 0
  const active = feature.get('areaKey') === selectedAreaKey.value
  const radius = active ? 11 : 7 + Math.round(ratio * 5)

  return new Style({
    image: new CircleStyle({
      radius,
      fill: new Fill({
        color: active ? '#0ea5e9' : getMarkerColor(ratio)
      }),
      stroke: new Stroke({
        color: '#ffffff',
        width: active ? 3 : 2
      })
    }),
    text: layerState.showLabels
      ? new Text({
          text: String(count),
          offsetY: -18,
          fill: new Fill({ color: '#0f172a' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
          font: 'bold 12px sans-serif'
        })
      : undefined
  })
}

function getHeatColor(ratio, active) {
  if (active) return 'rgba(14, 165, 233, 0.45)'
  if (ratio >= 0.8) return 'rgba(239, 68, 68, 0.42)'
  if (ratio >= 0.55) return 'rgba(249, 115, 22, 0.36)'
  if (ratio >= 0.3) return 'rgba(250, 204, 21, 0.3)'
  return 'rgba(34, 197, 94, 0.22)'
}

function getMarkerColor(ratio) {
  if (ratio >= 0.8) return '#ef4444'
  if (ratio >= 0.55) return '#f97316'
  if (ratio >= 0.3) return '#facc15'
  return '#22c55e'
}

function formatMetric(value) {
  if (value === null || value === undefined || value === '') return '--'
  return Number(value).toFixed(1)
}

async function ensureMapReady(retries = 12) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const map = mapPickerRef.value?.getMap()
    if (map) return map
    await new Promise(resolve => setTimeout(resolve, 80))
  }
  return null
}
</script>

<style lang="scss" scoped>
.heatmap-shell {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  min-height: auto;
  padding: 0;
}

.heatmap-header {
  align-items: flex-start;

  h2 {
    margin: 0;
    font-size: 28px;
    color: #0f172a;
  }

  p {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 14px;
    line-height: 1.6;
  }
}

.header-actions,
.filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-bar {
  margin-bottom: 18px;
}

.source-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.source-chip {
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 16px;
  padding: 16px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;

  &:disabled {
    cursor: not-allowed;
  }

  &.active {
    border-color: #0ea5e9;
    box-shadow: 0 10px 24px rgba(14, 165, 233, 0.12);
  }

  &.disabled {
    opacity: 0.56;
  }
}

.chip-title {
  font-size: 14px;
  color: #0f172a;
}

.chip-count {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.chip-desc {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.content-wrapper {
  display: flex;
  gap: 20px;
}

.map-panel {
  position: relative;
  flex: 1;
  min-width: 0;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.92);
}

.map-toolbar,
.legend-card {
  position: absolute;
  z-index: 4;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(10px);
}

.map-toolbar {
  left: 18px;
  top: 18px;
  width: 250px;
  padding: 14px 16px;
}

.toolbar-title,
.legend-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.toolbar-options {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #334155;
}

.toolbar-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}

.legend-card {
  right: 18px;
  bottom: 18px;
  width: 210px;
  padding: 14px 16px;
}

.legend-scale {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.legend-bar {
  height: 12px;
  border-radius: 999px;
}

.legend-bar.low {
  background: rgba(34, 197, 94, 0.55);
}

.legend-bar.mid {
  background: rgba(250, 204, 21, 0.7);
}

.legend-bar.high {
  background: rgba(249, 115, 22, 0.8);
}

.legend-bar.peak {
  background: rgba(239, 68, 68, 0.85);
}

.legend-labels {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
}

.map-empty-mask {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
}

.side-panel {
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.stat-card,
.panel-card {
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.04);
}

.stat-card {
  padding: 16px;
}

.stat-label {
  font-size: 13px;
  color: #64748b;
}

.stat-value {
  margin-top: 10px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;

  &.small {
    font-size: 18px;
  }
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #eef2f7;
  color: #334155;

  &:last-child {
    border-bottom: none;
  }

  strong {
    color: #0f172a;
  }
}

.selection-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.selection-name {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.selection-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.selection-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
  color: #475569;

  strong {
    color: #0f172a;
  }

  &.full {
    grid-column: 1 / -1;
  }
}

.hot-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hot-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;

  &.active {
    border-color: #0ea5e9;
    background: #eff6ff;
  }
}

.rank {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}

.name {
  flex: 1;
  color: #0f172a;
  font-size: 14px;
  text-align: left;
}

.count {
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 1360px) {
  .source-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .content-wrapper {
    flex-direction: column;
  }

  .side-panel {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .heatmap-header {
    flex-direction: column;
  }

  .header-actions,
  .filter-bar {
    width: 100%;
  }

  .source-strip,
  .stats-grid,
  .selection-grid {
    grid-template-columns: 1fr;
  }

  .map-toolbar {
    left: 12px;
    right: 12px;
    width: auto;
  }

  .legend-card {
    right: 12px;
    left: 12px;
    width: auto;
  }
}
</style>
