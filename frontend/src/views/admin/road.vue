<template>
  <div class="admin-road" v-loading="loading">
    <div class="page-container road-shell">
      <div class="page-header road-header">
        <div>
          <h2>道路分析</h2>
        </div>
        <div class="header-actions">
          <el-button @click="focusAllRoads">定位全图层</el-button>
          <el-button type="primary" plain :disabled="!selectedRoad" @click="focusSelectedRoad">定位选中</el-button>
        </div>
      </div>

      <el-row :gutter="20" class="chart-section">
        <el-col :xs="24" :lg="12">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>道路类型分布</h3>
                <p>按道路类型统计数量</p>
              </div>
            </div>
            <div ref="typeChartRef" class="chart-container"></div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="12">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>道路长度统计</h3>
                <p>各类型道路总长度分布</p>
              </div>
            </div>
            <div ref="lengthChartRef" class="chart-container"></div>
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="20" class="chart-section">
        <el-col :xs="24" :lg="16">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <h3>坡度分布统计</h3>
                <p>道路坡度区间分布</p>
              </div>
            </div>
            <div ref="slopeChartRef" class="chart-container"></div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="8">
          <div class="stats-card">
            <div class="stats-header">
              <h3>道路分析统计</h3>
            </div>
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-value">{{ roadStats.total || 0 }}</div>
                <div class="stat-label">道路总数</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ roadStats.bike_lane_count || 0 }}</div>
                <div class="stat-label">骑行道数量</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ formatLength(roadStats.total_length_km) }}</div>
                <div class="stat-label">总里程(km)</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ mapSummary.rendered }}</div>
                <div class="stat-label">已加载道路</div>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ roadStats.total || 0 }}</div>
          <div class="stat-label">当前筛选道路数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ roadStats.bike_lane_count || 0 }}</div>
          <div class="stat-label">骑行道数量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatLength(roadStats.total_length_km) }}</div>
          <div class="stat-label">总里程（km）</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ mapSummary.rendered }}</div>
          <div class="stat-label">地图已加载道路数</div>
        </div>
      </div>

      <div class="content-wrapper">
        <div class="map-card">
          <MapPicker
            ref="mapPickerRef"
            height="620px"
            :center="[114.935, 25.845]"
            :zoom="12"
            :show-controls="true"
            :show-address="false"
            :enable-geocode="false"
            readonly
          />

          <div class="map-overlay">
            <div class="overlay-section">
              <div class="overlay-title">图层控制</div>
              <div class="overlay-options">
                <el-checkbox v-model="layerState.showRoads" @change="renderRoadLayers({ fitToExtent: false })">
                  全部道路
                </el-checkbox>
                <el-checkbox v-model="layerState.showBikeLanes" @change="renderRoadLayers({ fitToExtent: false })">
                  骑行道
                </el-checkbox>
                <el-checkbox v-model="layerState.showSelected" @change="renderRoadLayers({ fitToExtent: false })">
                  选中高亮
                </el-checkbox>
              </div>
            </div>

            <div class="overlay-section compact">
              <div class="overlay-title">图层摘要</div>
              <div class="overlay-summary">
                <span>道路 {{ mapSummary.rendered }}</span>
                <span>骑行道 {{ mapSummary.bikeLane }}</span>
                <span>施工 {{ mapSummary.construction }}</span>
              </div>
            </div>

            <div class="overlay-section compact">
              <div class="overlay-title">图例</div>
              <div class="legend-list">
                <span><i class="legend-line road"></i>全部道路</span>
                <span><i class="legend-line bike"></i>骑行道</span>
                <span><i class="legend-line selected"></i>选中道路</span>
              </div>
            </div>
          </div>
        </div>

        <div class="list-card">
          <div class="filter-bar">
            <el-input
              v-model="keyword"
              placeholder="搜索道路名称"
              clearable
              style="width: 180px"
              @keyup.enter="loadRoads(1)"
            />
            <el-select v-model="roadType" clearable placeholder="道路类型" style="width: 150px">
              <el-option label="全部类型" value="" />
              <el-option v-for="item in roadTypeOptions" :key="item" :label="item" :value="item" />
            </el-select>
            <el-select v-model="status" clearable placeholder="状态" style="width: 120px">
              <el-option label="全部状态" value="" />
              <el-option label="正常" value="normal" />
              <el-option label="施工" value="construction" />
            </el-select>
            <el-checkbox v-model="bikeOnly">仅看骑行道</el-checkbox>
            <el-button type="primary" @click="loadRoads(1)">筛选</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </div>

          <el-table
            :data="roads"
            height="390"
            :row-class-name="getRowClassName"
            @row-click="selectRoad"
          >
            <el-table-column prop="name" label="道路名称" min-width="170" show-overflow-tooltip />
            <el-table-column prop="road_type" label="类型" width="110" show-overflow-tooltip />
            <el-table-column prop="length_km" label="长度(km)" width="100">
              <template #default="{ row }">
                {{ formatLength(row.length_km) }}
              </template>
            </el-table-column>
            <el-table-column prop="is_bike_lane" label="骑行道" width="90">
              <template #default="{ row }">
                <el-tag :type="row.is_bike_lane ? 'success' : 'info'" size="small">
                  {{ row.is_bike_lane ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 'normal' ? 'success' : 'warning'" size="small">
                  {{ row.status === 'normal' ? '正常' : '施工' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="88" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click.stop="focusRoad(row)">定位</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="selectedRoad" class="detail-card">
            <div class="detail-header">
              <h3>{{ selectedRoad.name || '--' }}</h3>
              <el-tag :type="selectedRoad.is_bike_lane ? 'success' : 'info'" size="small">
                {{ selectedRoad.is_bike_lane ? '骑行道' : '普通道路' }}
              </el-tag>
            </div>
            <div class="detail-grid">
              <div class="detail-item">
                <span>道路类型</span>
                <strong>{{ selectedRoad.road_type || '--' }}</strong>
              </div>
              <div class="detail-item">
                <span>状态</span>
                <strong>{{ selectedRoad.status === 'normal' ? '正常' : '施工' }}</strong>
              </div>
              <div class="detail-item">
                <span>长度</span>
                <strong>{{ formatLength(selectedRoad.length_km) }} km</strong>
              </div>
              <div class="detail-item">
                <span>速度限制</span>
                <strong>{{ selectedRoad.speed_limit || '--' }}</strong>
              </div>
              <div class="detail-item">
                <span>平均坡度</span>
                <strong>{{ formatSlope(selectedRoad.avg_slope) }}</strong>
              </div>
              <div class="detail-item">
                <span>最大坡度</span>
                <strong>{{ formatSlope(selectedRoad.max_slope) }}</strong>
              </div>
            </div>
          </div>

          <div class="pagination">
            <el-pagination
              :current-page="page"
              :page-size="limit"
              :total="total"
              layout="total, prev, pager, next"
              @current-change="loadRoads"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import MapPicker from '@/components/MapPicker.vue'
import { routeApi } from '@/api'
import GeoJSON from 'ol/format/GeoJSON'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import { Stroke, Style } from 'ol/style'
import * as echarts from 'echarts'
import dayjs from 'dayjs'

const MAP_BATCH_LIMIT = 2000
const MAP_MAX_PAGES = 3

const mapPickerRef = ref(null)
const loading = ref(false)
const roads = ref([])
const mapRoads = ref([])
const roadStats = ref({ total: 0, bike_lane_count: 0, total_length_km: 0 })
const selectedRoad = ref(null)
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const keyword = ref('')
const roadType = ref('')
const status = ref('')
const bikeOnly = ref(false)
const roadTypeOptions = ref([])

const layerState = reactive({
  showRoads: true,
  showBikeLanes: true,
  showSelected: true
})

const mapSummary = computed(() => ({
  rendered: mapRoads.value.length,
  bikeLane: mapRoads.value.filter(item => item.is_bike_lane).length,
  construction: mapRoads.value.filter(item => item.status === 'construction').length
}))

const geoJson = new GeoJSON()
let roadLayer = null
let bikeLaneLayer = null
let selectedRoadLayer = null

const typeChartRef = ref(null)
const lengthChartRef = ref(null)
const slopeChartRef = ref(null)

let typeChart = null
let lengthChart = null
let slopeChart = null

const typeData = ref([])
const lengthData = ref([])
const slopeData = ref([])

onMounted(() => {
  loadRoads()
  nextTick(() => initCharts())
})

onBeforeUnmount(() => {
  clearRoadLayers()
  typeChart?.dispose()
  lengthChart?.dispose()
  slopeChart?.dispose()
})

async function loadRoads(nextPage = page.value) {
  page.value = nextPage
  loading.value = true

  try {
    const baseParams = {
      keyword: keyword.value,
      roadType: roadType.value,
      status: status.value,
      bikeOnly: bikeOnly.value
    }

    const [listRes, mapData] = await Promise.all([
      routeApi.getRoads({
        ...baseParams,
        page: page.value,
        limit: limit.value
      }),
      loadMapRoads(baseParams)
    ])

    if (listRes.code === 200) {
      roads.value = listRes.data.roads || []
      total.value = listRes.data.total || 0
      roadStats.value = listRes.data.stats || { total: 0, bike_lane_count: 0, total_length_km: 0 }
      processChartData(listRes.data.roads || [])
    }

    mapRoads.value = mapData.roads
    roadTypeOptions.value = collectRoadTypes(mapRoads.value, roads.value)
    selectedRoad.value = resolveSelectedRoad(selectedRoad.value?.id)

    await nextTick()
    renderRoadLayers({ fitToExtent: true })
    renderCharts()
  } catch (error) {
    console.error('加载道路数据失败:', error)
  } finally {
    loading.value = false
  }
}

async function loadMapRoads(baseParams) {
  const firstRes = await routeApi.getRoads({
    ...baseParams,
    page: 1,
    limit: MAP_BATCH_LIMIT
  })

  if (firstRes.code !== 200) {
    return { roads: [] }
  }

  const totalCount = Number(firstRes.data.total || 0)
  const pageCount = Math.min(Math.ceil(totalCount / MAP_BATCH_LIMIT), MAP_MAX_PAGES)
  const allRoads = [...(firstRes.data.roads || [])]

  if (pageCount > 1) {
    const extraPages = Array.from({ length: pageCount - 1 }, (_, index) => {
      const targetPage = index + 2
      return routeApi.getRoads({
        ...baseParams,
        page: targetPage,
        limit: MAP_BATCH_LIMIT
      })
    })

    const extraResults = await Promise.all(extraPages)
    extraResults.forEach(item => {
      if (item.code === 200) {
        allRoads.push(...(item.data.roads || []))
      }
    })
  }

  return {
    roads: dedupeRoads(allRoads)
  }
}

function resolveSelectedRoad(preferredId) {
  const currentPageTarget = roads.value.find(item => item.id === preferredId)
  if (currentPageTarget) return currentPageTarget

  if (!roads.value.length) {
    const mapTarget = mapRoads.value.find(item => item.id === preferredId)
    if (mapTarget) return mapTarget
  }

  return roads.value[0] || mapRoads.value[0] || null
}

function clearRoadLayers() {
  if (roadLayer) {
    mapPickerRef.value?.removeLayer(roadLayer)
    roadLayer = null
  }
  if (bikeLaneLayer) {
    mapPickerRef.value?.removeLayer(bikeLaneLayer)
    bikeLaneLayer = null
  }
  if (selectedRoadLayer) {
    mapPickerRef.value?.removeLayer(selectedRoadLayer)
    selectedRoadLayer = null
  }
}

function renderRoadLayers(options = {}) {
  const { fitToExtent = false } = options
  clearRoadLayers()

  if (!mapPickerRef.value || !mapRoads.value.length) return

  const roadSource = new VectorSource()
  const bikeLaneSource = new VectorSource()
  const selectedSource = new VectorSource()

  mapRoads.value.forEach(road => {
    const geometry = readGeometry(road.geometry)
    if (!geometry) return

    roadSource.addFeature(createRoadFeature(road, geometry.clone()))

    if (road.is_bike_lane) {
      bikeLaneSource.addFeature(createRoadFeature(road, geometry.clone()))
    }

    if (selectedRoad.value?.id === road.id) {
      selectedSource.addFeature(createRoadFeature(road, geometry.clone()))
    }
  })

  if (layerState.showRoads) {
    roadLayer = new VectorLayer({
      source: roadSource,
      style: () =>
        new Style({
          stroke: new Stroke({
            color: 'rgba(37, 99, 235, 0.45)',
            width: 2.2
          })
        })
    })
    mapPickerRef.value.addLayer(roadLayer)
  }

  if (layerState.showBikeLanes) {
    bikeLaneLayer = new VectorLayer({
      source: bikeLaneSource,
      style: () =>
        new Style({
          stroke: new Stroke({
            color: '#16a34a',
            width: 3
          })
        })
    })
    mapPickerRef.value.addLayer(bikeLaneLayer)
  }

  if (layerState.showSelected && selectedSource.getFeatures().length) {
    selectedRoadLayer = new VectorLayer({
      source: selectedSource,
      style: () =>
        new Style({
          stroke: new Stroke({
            color: '#ef4444',
            width: 5
          })
        })
    })
    mapPickerRef.value.addLayer(selectedRoadLayer)
  }

  if (fitToExtent) {
    if (selectedRoad.value) {
      focusRoad(selectedRoad.value)
      return
    }
    fitRoadCollection(mapRoads.value, 14)
  }
}

function selectRoad(row) {
  selectedRoad.value = row
  renderRoadLayers({ fitToExtent: false })
  focusRoad(row)
}

function focusRoad(row) {
  selectedRoad.value = row
  renderRoadLayers({ fitToExtent: false })
  fitGeometry(row?.geometry, 15)
}

function focusSelectedRoad() {
  if (!selectedRoad.value) return
  focusRoad(selectedRoad.value)
}

function focusAllRoads() {
  fitRoadCollection(mapRoads.value, 14)
}

function fitRoadCollection(collection, maxZoom = 14) {
  const source = new VectorSource()
  collection.forEach(item => {
    const geometry = readGeometry(item.geometry)
    if (!geometry) return
    source.addFeature(new Feature({ geometry }))
  })
  fitSource(source, maxZoom)
}

function fitGeometry(geometryJson, maxZoom = 15) {
  const geometry = readGeometry(geometryJson)
  if (!geometry) return
  const source = new VectorSource({
    features: [new Feature({ geometry })]
  })
  fitSource(source, maxZoom)
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

function readGeometry(geometryJson) {
  if (!geometryJson) return null
  try {
    return geoJson.readGeometry(geometryJson, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    })
  } catch (error) {
    console.error('解析道路几何失败:', error)
    return null
  }
}

function createRoadFeature(road, geometry) {
  const feature = new Feature({ geometry })
  feature.setProperties({
    roadId: road.id,
    isBikeLane: Boolean(road.is_bike_lane),
    status: road.status
  })
  return feature
}

function collectRoadTypes(...groups) {
  const set = new Set()
  groups.flat().forEach(item => {
    if (item?.road_type) {
      set.add(item.road_type)
    }
  })
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

function dedupeRoads(items) {
  const seen = new Map()
  items.forEach(item => {
    if (item?.id !== undefined && item?.id !== null) {
      seen.set(item.id, item)
    }
  })
  return Array.from(seen.values())
}

function resetFilters() {
  keyword.value = ''
  roadType.value = ''
  status.value = ''
  bikeOnly.value = false
  loadRoads(1)
}

function getRowClassName({ row }) {
  return row.id === selectedRoad.value?.id ? 'selected-row' : ''
}

function formatLength(value) {
  return Number(value || 0).toFixed(2)
}

function formatSlope(value) {
  if (value === null || value === undefined || value === '') return '--'
  return `${Number(value).toFixed(2)}%`
}

function initCharts() {
  if (typeChartRef.value && !typeChart) {
    typeChart = echarts.init(typeChartRef.value)
  }
  if (lengthChartRef.value && !lengthChart) {
    lengthChart = echarts.init(lengthChartRef.value)
  }
  if (slopeChartRef.value && !slopeChart) {
    slopeChart = echarts.init(slopeChartRef.value)
  }
  window.addEventListener('resize', handleChartsResize)
}

function renderCharts() {
  renderTypeChart()
  renderLengthChart()
  renderSlopeChart()
}

function renderTypeChart() {
  if (!typeChart) return
  const data = typeData.value.length
    ? typeData.value.map(item => ({ name: item.name, value: item.value }))
    : [
        { name: '主干道', value: 0 },
        { name: '次干道', value: 0 },
        { name: '支路', value: 0 }
      ]

  typeChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    color: ['#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ec4899'],
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      label: { formatter: '{b}\n{d}%' },
      data: data.length ? data : [{ name: '暂无数据', value: 1, itemStyle: { color: '#d6dee6' } }]
    }]
  })
}

function renderLengthChart() {
  if (!lengthChart) return
  const data = lengthData.value.length
    ? lengthData.value
    : Array.from({ length: 6 }, (_, i) => ({
        label: `类型${i + 1}`,
        count: 0
      }))

  lengthChart.setOption({
    color: ['#3b82f6'],
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: data.map(item => item.label),
      axisLine: { lineStyle: { color: '#d9e2ec' } },
      axisLabel: { rotate: 30 }
    },
    yAxis: {
      type: 'value',
      minInterval: 0.1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#eef2f7' } }
    },
    series: [{
      name: '长度(km)',
      type: 'bar',
      barWidth: '50%',
      data: data.map(item => item.count),
      itemStyle: {
        borderRadius: [6, 6, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#22c55e' },
          { offset: 1, color: '#86efac' }
        ])
      }
    }]
  })
}

function renderSlopeChart() {
  if (!slopeChart) return
  const data = slopeData.value.length
    ? slopeData.value
    : [
        { label: '0-2%', count: 0 },
        { label: '2-5%', count: 0 },
        { label: '5-8%', count: 0 },
        { label: '8-10%', count: 0 },
        { label: '>10%', count: 0 }
      ]

  slopeChart.setOption({
    color: ['#8b5cf6'],
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
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
      name: '道路数',
      type: 'line',
      smooth: true,
      data: data.map(item => item.count),
      areaStyle: {
        color: 'rgba(139, 92, 246, 0.12)'
      },
      lineStyle: { width: 3 },
      itemStyle: { color: '#8b5cf6' }
    }]
  })
}

function handleChartsResize() {
  typeChart?.resize()
  lengthChart?.resize()
  slopeChart?.resize()
}

function processChartData(roads) {
  const typeMap = new Map()
  const lengthMap = new Map()
  const slopeMap = { '0-2%': 0, '2-5%': 0, '5-8%': 0, '8-10%': 0, '>10%': 0 }

  roads.forEach(road => {
    if (road.road_type) {
      typeMap.set(road.road_type, (typeMap.get(road.road_type) || 0) + 1)
      lengthMap.set(road.road_type, (lengthMap.get(road.road_type) || 0) + Number(road.length_km || 0))
    }

    if (road.avg_slope !== null && road.avg_slope !== undefined) {
      const slope = Number(road.avg_slope)
      if (slope <= 2) slopeMap['0-2%']++
      else if (slope <= 5) slopeMap['2-5%']++
      else if (slope <= 8) slopeMap['5-8%']++
      else if (slope <= 10) slopeMap['8-10%']++
      else slopeMap['>10%']++
    }
  })

  typeData.value = Array.from(typeMap.entries()).map(([name, value]) => ({ name, value }))
  lengthData.value = Array.from(lengthMap.entries()).map(([label, count]) => ({ label, count: Number(count.toFixed(2)) }))
  slopeData.value = Object.entries(slopeMap).map(([label, count]) => ({ label, count }))
}
</script>

<style lang="scss" scoped>
.road-shell {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  min-height: auto;
  padding: 0;
}

.road-header {
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

.header-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.content-wrapper {
  display: flex;
  gap: 20px;
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

.map-card,
.list-card {
  border-radius: 18px;
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
  overflow: hidden;
}

.map-card {
  position: relative;
  flex: 1;
  min-width: 0;
}

.map-overlay {
  position: absolute;
  left: 18px;
  top: 18px;
  z-index: 4;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.overlay-section {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(10px);

  &.compact {
    padding-top: 12px;
    padding-bottom: 12px;
  }
}

.overlay-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.overlay-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  color: #334155;
}

.overlay-summary,
.legend-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-top: 10px;
  font-size: 12px;
  color: #475569;
}

.legend-list span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.legend-line {
  width: 20px;
  height: 0;
  border-top-width: 4px;
  border-top-style: solid;
  border-radius: 999px;
}

.legend-line.road {
  border-top-color: rgba(37, 99, 235, 0.7);
}

.legend-line.bike {
  border-top-color: #16a34a;
}

.legend-line.selected {
  border-top-color: #ef4444;
}

.list-card {
  width: 560px;
  padding: 16px;
}

.filter-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.detail-card {
  margin-top: 16px;
  padding: 16px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h3 {
    margin: 0;
    color: #0f172a;
    font-size: 18px;
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: #ffffff;
  color: #475569;

  strong {
    color: #0f172a;
  }
}

.pagination {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
}

:deep(.selected-row) {
  --el-table-tr-bg-color: #eff6ff;
}

@media (max-width: 1360px) {
  .stats-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .content-wrapper {
    flex-direction: column;
  }

  .list-card {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .road-header {
    flex-direction: column;
  }

  .stats-row,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .map-overlay {
    left: 12px;
    right: 12px;
    width: auto;
  }
}
</style>
