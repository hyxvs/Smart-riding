<template>
  <div class="analysis-page">
    <div class="page-header">
      <div>
        <h2>路线分析</h2>
      </div>
      <div class="header-actions">
        <el-button @click="resetPlanning">重置</el-button>
        <el-button type="primary" :loading="planning" @click="planRoute">
          开始规划
        </el-button>
      </div>
    </div>

    <el-alert v-if="!userStore.isLoggedIn" type="warning" :closable="false" show-icon class="login-alert">
      <template #title>
        路线规划接口需要登录后调用，当前可以先在地图上选点，点击规划时会自动引导登录。
      </template>
      <el-button type="primary" size="small" @click="goLogin">去登录</el-button>
    </el-alert>

    <div class="page-layout">
      <div class="map-panel">
        <div ref="mapContainer" class="route-map"></div>
        <div v-if="selectingPoint" class="map-tip">
          请在地图上单击选择{{ selectingLabel }}
        </div>
      </div>

      <div ref="sidePanelRef" class="side-panel">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="card-header">
              <span>规划参数</span>
            </div>
          </template>

          <div class="point-group">
            <div class="point-item">
              <div class="point-header">
                <span>起点</span>
                <div class="point-actions">
                  <el-button link type="primary" @click="startPicking('start')">地图选点</el-button>
                  <el-button link :disabled="!isPointValid(startPoint)" @click="focusPoint(startPoint)">定位</el-button>
                  <el-button link type="danger" :disabled="!isPointValid(startPoint)" @click="clearPoint('start')">清除</el-button>
                </div>
              </div>
              <el-input :model-value="pointDisplay(startPoint)" readonly placeholder="请先选择起点" />
            </div>

            <div class="point-item">
              <div class="point-header">
                <span>终点</span>
                <div class="point-actions">
                  <el-button link type="primary" @click="startPicking('end')">地图选点</el-button>
                  <el-button link :disabled="!isPointValid(endPoint)" @click="focusPoint(endPoint)">定位</el-button>
                  <el-button link type="danger" :disabled="!isPointValid(endPoint)" @click="clearPoint('end')">清除</el-button>
                </div>
              </div>
              <el-input :model-value="pointDisplay(endPoint)" readonly placeholder="请先选择终点" />
            </div>

            <div v-for="(point, index) in waypoints" :key="index" class="point-item">
              <div class="point-header">
                <span>途经点 {{ index + 1 }}</span>
                <div class="point-actions">
                  <el-button link type="primary" @click="startPicking('waypoint', index)">地图选点</el-button>
                  <el-button link :disabled="!isPointValid(point)" @click="focusPoint(point)">定位</el-button>
                  <el-button link type="danger" @click="removeWaypoint(index)">删除</el-button>
                </div>
              </div>
              <el-input :model-value="pointDisplay(point)" readonly placeholder="可选的途经点" />
            </div>

            <el-button text type="primary" :disabled="waypoints.length >= 3" @click="addWaypoint">
              添加途经点
            </el-button>
            <div class="field-tip">最多支持 3 个途经点，当前规划结果会在修改点位后自动清空。</div>
          </div>

          <el-form label-position="top">
            <el-form-item label="规划模式">
              <el-radio-group v-model="planForm.mode">
                <el-radio-button label="fastest">最短路线</el-radio-button>
                <el-radio-button label="red">红色景点路线</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="规划选项">
              <div class="option-row">
                <el-checkbox v-model="planForm.avoidSlope">避开大坡度</el-checkbox>
                <el-checkbox v-model="planForm.avoidCongestion">避开拥堵</el-checkbox>
              </div>
              <div class="field-tip">“避开大坡度”会直接使用后端道路表里的坡度字段做路网过滤。</div>
            </el-form-item>
          </el-form>

          <div v-if="hasRouteResult && roadConditionSummaries.length" class="condition-quick-panel">
            <div class="condition-quick-header">
              <span>智能路况标签</span>
              <span class="field-tip">已同步显示到地图，点击卡片可快速定位。</span>
            </div>
            <div class="condition-quick-list">
              <button
                v-for="item in roadConditionSummaries"
                :key="item.key"
                type="button"
                class="condition-quick-item"
                :class="item.level"
                @click="focusRoadConditionLabel(item)"
              >
                <span class="condition-quick-title">{{ item.shortLabel }}</span>
                <span class="condition-quick-detail">{{ item.detail }}</span>
              </button>
            </div>
          </div>
        </el-card>

        <div v-if="hasRouteResult" ref="routeResultSectionRef" class="result-section">
          <el-card shadow="never" class="panel-card result-panel-card">
          <template #header>
            <div class="card-header">
              <span>规划结果</span>
              <div class="result-tags">
                <el-tag size="small" :type="planForm.mode === 'red' ? 'danger' : 'primary'">
                  {{ planForm.mode === 'red' ? '红色景点路线' : '最短路线' }}
                </el-tag>
                <el-tag size="small" :type="routeResult.slopeSource === 'dem' ? 'success' : routeResult.slopeSource === 'road' ? 'warning' : 'info'">
                  {{ slopeSourceLabel }}
                </el-tag>
              </div>
            </div>
          </template>

          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{{ formatDistance(routeResult.totalDistance) }}</span>
              <span class="stat-label">总里程</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ routeResult.totalTime }} 分钟</span>
              <span class="stat-label">预计耗时</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ routeResult.calories }} kcal</span>
              <span class="stat-label">预估消耗</span>
            </div>
          </div>

          <div class="result-actions">
            <el-button @click="fitRouteToView">定位路线</el-button>
            <el-button type="primary" :loading="saving" @click="saveRoute">保存路线</el-button>
          </div>

          <el-alert v-if="savedRouteInfo?.share_code" type="success" :closable="false" class="save-alert">
            <template #title>
              路线已保存，分享码：{{ savedRouteInfo.share_code }}
            </template>
          </el-alert>

          <el-tabs>
            <el-tab-pane label="坡度分析">
              <el-alert v-if="routeResult.slopeAvailable === false" type="warning" :closable="false">
                <template #title>
                  当前路线没有拿到有效的 DEM 覆盖采样，因此无法给出真实坡度统计。
                </template>
              </el-alert>

              <el-alert v-else type="success" :closable="false">
                <template #title>
                  当前坡度分析来自 {{ slopeSourceLabel }}，并结合 DEM 沿线采样生成统计结果。
                </template>
              </el-alert>

              <div class="slope-bar">
                <span class="slope-segment flat" :style="{ width: `${getSlopePercent('flat')}%` }"></span>
                <span class="slope-segment moderate" :style="{ width: `${getSlopePercent('moderate')}%` }"></span>
                <span class="slope-segment steep" :style="{ width: `${getSlopePercent('steep')}%` }"></span>
                <span class="slope-segment very-steep" :style="{ width: `${getSlopePercent('verySteep')}%` }"></span>
              </div>

              <div class="slope-grid">
                <div class="slope-item">
                  <span class="label">平缓</span>
                  <span class="value">{{ slopeStats.flat }}</span>
                </div>
                <div class="slope-item">
                  <span class="label">中等</span>
                  <span class="value">{{ slopeStats.moderate }}</span>
                </div>
                <div class="slope-item">
                  <span class="label">较陡</span>
                  <span class="value">{{ slopeStats.steep }}</span>
                </div>
                <div class="slope-item">
                  <span class="label">陡峭</span>
                  <span class="value">{{ slopeStats.verySteep }}</span>
                </div>
                <div class="slope-item">
                  <span class="label">平均坡度</span>
                  <span class="value">{{ formatPercent(slopeStats.avgSlope) }}</span>
                </div>
                <div class="slope-item">
                  <span class="label">最大坡度</span>
                  <span class="value">{{ formatPercent(slopeStats.maxSlope) }}</span>
                </div>
                <div class="slope-item full">
                  <span class="label">累计爬升</span>
                  <span class="value">{{ formatMeters(slopeStats.totalElevationGain) }}</span>
                </div>
              </div>

              <div class="dem-factor-grid">
                <div class="factor-item">
                  <span class="label">DEM 采样点</span>
                  <span class="value">{{ slopeFactors.sampleCount }}</span>
                </div>
                <div class="factor-item">
                  <span class="label">有效采样点</span>
                  <span class="value">{{ slopeFactors.coveredSampleCount }}</span>
                </div>
                <div class="factor-item">
                  <span class="label">路线长度</span>
                  <span class="value">{{ formatMeters(slopeFactors.routeLengthMeters) }}</span>
                </div>
                <div class="factor-item">
                  <span class="label">起点高程</span>
                  <span class="value">{{ formatElevation(slopeFactors.startElevation) }}</span>
                </div>
                <div class="factor-item">
                  <span class="label">终点高程</span>
                  <span class="value">{{ formatElevation(slopeFactors.endElevation) }}</span>
                </div>
                <div class="factor-item">
                  <span class="label">最低高程</span>
                  <span class="value">{{ formatElevation(slopeFactors.minElevation) }}</span>
                </div>
                <div class="factor-item">
                  <span class="label">最高高程</span>
                  <span class="value">{{ formatElevation(slopeFactors.maxElevation) }}</span>
                </div>
                <div class="factor-item">
                  <span class="label">上坡距离</span>
                  <span class="value">{{ formatMeters(slopeFactors.uphillDistanceMeters) }}</span>
                </div>
                <div class="factor-item">
                  <span class="label">下坡距离</span>
                  <span class="value">{{ formatMeters(slopeFactors.downhillDistanceMeters) }}</span>
                </div>
              </div>

              <el-alert type="info" :closable="false" class="advice-alert">
                <template #title>
                  {{ cyclingAdvice }}
                </template>
              </el-alert>
            </el-tab-pane>

            <el-tab-pane label="沿线 POI">
              <el-table :data="routeResult.nearbyPois || []" size="small" max-height="280" empty-text="暂无沿线 POI">
                <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
                <el-table-column prop="category" label="类别" width="110" show-overflow-tooltip />
                <el-table-column label="距路线" width="100">
                  <template #default="{ row }">
                    {{ formatMeters(row.distance) }}
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="88">
                  <template #default="{ row }">
                    <el-button link type="primary" @click="focusLocation(row.location)">定位</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="红色景点" v-if="routeResult.redSpots.length">
              <el-table :data="routeResult.redSpots" size="small" max-height="280">
                <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
                <el-table-column prop="description" label="简介" min-width="150" show-overflow-tooltip />
                <el-table-column label="操作" width="88">
                  <template #default="{ row }">
                    <el-button link type="primary" @click="focusLocation(row.location)">定位</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="智能路况">
              <RoadConditionPanel
                :route-geom="routeResult.routeGeom"
                :road-info="currentRoadInfo"
                :road-segments="roadSegments"
              />
            </el-tab-pane>
          </el-tabs>
          </el-card>
        </div>

        <el-empty v-else description="完成起终点选取后即可开始路线规划。" class="empty-state" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { fromLonLat, toLonLat } from 'ol/proj'
import { getCenter } from 'ol/extent'
import { ElMessage } from 'element-plus'
import { routeApi } from '@/api'
import { useUserStore } from '@/stores/user'
import RoadConditionPanel from '@/components/RoadConditionPanel.vue'

const router = useRouter()
const userStore = useUserStore()
const mapContainer = ref(null)
const sidePanelRef = ref(null)
const routeResultSectionRef = ref(null)
const planning = ref(false)
const saving = ref(false)
const selectingPoint = ref(null)
const routeResult = ref(null)
const savedRouteInfo = ref(null)

const startPoint = reactive(createEmptyPoint())
const endPoint = reactive(createEmptyPoint())
const waypoints = ref([])
const planForm = reactive({
  mode: 'fastest',
  avoidCongestion: false,
  avoidSlope: false
})

const emptySlopeStats = Object.freeze({
  flat: 0,
  moderate: 0,
  steep: 0,
  verySteep: 0,
  maxSlope: 0,
  avgSlope: 0,
  totalElevationGain: 0
})

const emptySlopeFactors = Object.freeze({
  routeLengthMeters: 0,
  sampleCount: 0,
  coveredSampleCount: 0,
  coveredSegmentCount: 0,
  startElevation: null,
  endElevation: null,
  minElevation: null,
  maxElevation: null,
  uphillDistanceMeters: 0,
  downhillDistanceMeters: 0
})

const geoJson = new GeoJSON()

let map = null
let roadSource = null
let routeSource = null
let markerSource = null
let poiSource = null
let conditionSource = null

const selectingLabel = computed(() => {
  if (!selectingPoint.value) return ''
  if (selectingPoint.value.type === 'start') return '起点'
  if (selectingPoint.value.type === 'end') return '终点'
  return `途经点 ${selectingPoint.value.index + 1}`
})

const slopeStats = computed(() => routeResult.value?.slopeStats || emptySlopeStats)
const slopeFactors = computed(() => routeResult.value?.slopeFactors || emptySlopeFactors)
const roadSegments = computed(() => routeResult.value?.roadSegments || [])
const hasRouteResult = computed(() => Boolean(routeResult.value?.routeGeom))
const slopeSourceLabel = computed(() => {
  const source = routeResult.value?.slopeSource
  if (source === 'dem') return 'DEM 坡度'
  if (source === 'road') return '道路坡度字段'
  return '无可用坡度'
})

const roadConditionSummaries = computed(() => createRoadConditionSummaries(routeResult.value))
const primaryRoadCondition = computed(() => roadConditionSummaries.value[0] || null)

const currentRoadInfo = computed(() => {
  const primarySegment = primaryRoadCondition.value?.segment || roadSegments.value[0]
  if (!primarySegment) return null

  return {
    id: primarySegment.id,
    name: primarySegment.name || primaryRoadCondition.value?.name || '路线重点路段',
    avgSlope: Number(primarySegment.avgSlope || slopeStats.value.avgSlope || 0),
    maxSlope: Number(primarySegment.maxSlope || slopeStats.value.maxSlope || 0),
    roadType: primarySegment.roadType || '城市道路'
  }
})

const cyclingAdvice = computed(() => {
  if (!routeResult.value) {
    return ''
  }
  if (routeResult.value.slopeAvailable === false) {
    return '当前路线没有取得有效 DEM 采样，建议先检查 DEM 覆盖范围与路线区域是否一致。'
  }

  const stats = slopeStats.value
  const avgSlope = Number(stats.avgSlope || 0)
  const maxSlope = Number(stats.maxSlope || 0)

  if (stats.verySteep > 0 || maxSlope >= 15) {
    return '路线包含陡峭坡段，建议优先检查体能与刹车状态，必要时选择避坡路线。'
  }
  if (stats.steep > 0 || avgSlope >= 6) {
    return '路线起伏较明显，适合有一定骑行经验的用户。'
  }
  return '整体路线相对平缓，适合通勤或休闲骑行。'
})

onMounted(() => {
  initMap()
  loadRoads()
  nextTick(() => {
    map?.updateSize()
  })
})

onUnmounted(() => {
  if (map) {
    map.setTarget(null)
    map = null
  }
})

function initMap() {
  roadSource = new VectorSource()
  routeSource = new VectorSource()
  markerSource = new VectorSource()
  poiSource = new VectorSource()
  conditionSource = new VectorSource()

  const roadLayer = new VectorLayer({
    source: roadSource,
    style: new Style({
      stroke: new Stroke({
        color: 'rgba(107, 114, 128, 0.45)',
        width: 2
      })
    })
  })

  const routeLayer = new VectorLayer({
    source: routeSource
  })

  const conditionLayer = new VectorLayer({
    source: conditionSource,
    declutter: true,
    style: feature => createRoadConditionLabelStyle(feature)
  })

  const poiLayer = new VectorLayer({
    source: poiSource,
    style: feature => createPoiStyle(feature.get('kind'))
  })

  const markerLayer = new VectorLayer({
    source: markerSource,
    style: feature => createMarkerStyle(feature.get('kind'), feature.get('label'))
  })

  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({ source: new OSM() }),
      roadLayer,
      routeLayer,
      conditionLayer,
      poiLayer,
      markerLayer
    ],
    controls: [],
    view: new View({
      center: fromLonLat([114.935, 25.845]),
      zoom: 13
    })
  })

  map.on('click', handleMapClick)
  ensureMapClickEvent()
  setTimeout(() => map?.updateSize(), 80)
}

async function loadRoads() {
  try {
    const response = await routeApi.getRoads({ limit: 400 })
    if (response.code !== 200) return

    ;(response.data.roads || []).forEach(road => {
      if (!road.geometry) return
      const geometry = geoJson.readGeometry(road.geometry, projectionOptions())
      roadSource.addFeature(new Feature({ geometry }))
    })
  } catch (error) {
    console.error('加载道路图层失败:', error)
  }
}

function handleMapClick(event) {
  if (!selectingPoint.value) return

  const [lng, lat] = toLonLat(event.coordinate)
  applySelectedPoint(Number(lng), Number(lat))
}

// 确保地图点击事件正确绑定
function ensureMapClickEvent() {
  if (map) {
    // 先移除可能存在的旧事件监听
    map.un('click', handleMapClick)
    // 重新绑定点击事件
    map.on('click', handleMapClick)
    console.log('地图点击事件已重新绑定')
  }
}

function startPicking(type, index = null) {
  selectingPoint.value = { type, index }
  ElMessage.info(`请在地图上单击选择${type === 'waypoint' ? `途经点 ${index + 1}` : type === 'start' ? '起点' : '终点'}`)
  console.log('开始选择点:', selectingPoint.value)
  // 确保地图点击事件已绑定
  ensureMapClickEvent()
}

function applySelectedPoint(lng, lat) {
  const label = `${lng.toFixed(6)}, ${lat.toFixed(6)}`
  clearRouteArtifacts()

  if (selectingPoint.value.type === 'start') {
    Object.assign(startPoint, { lng, lat, name: label })
  } else if (selectingPoint.value.type === 'end') {
    Object.assign(endPoint, { lng, lat, name: label })
  } else {
    const index = selectingPoint.value.index
    if (waypoints.value[index]) {
      waypoints.value[index] = { ...waypoints.value[index], lng, lat, name: label }
    }
  }

  redrawMarkers()
  focusCoords(lng, lat, 15)
  selectingPoint.value = null
  ElMessage.success('坐标已设置')
}

function redrawMarkers() {
  markerSource.clear()

  if (isPointValid(startPoint)) {
    markerSource.addFeature(createPointFeature(startPoint, 'start', '起'))
  }
  if (isPointValid(endPoint)) {
    markerSource.addFeature(createPointFeature(endPoint, 'end', '终'))
  }
  waypoints.value.forEach((point, index) => {
    if (isPointValid(point)) {
      markerSource.addFeature(createPointFeature(point, 'waypoint', String(index + 1)))
    }
  })
}

function createPointFeature(point, kind, label) {
  return new Feature({
    geometry: new Point(fromLonLat([point.lng, point.lat])),
    kind,
    label
  })
}

async function planRoute() {
  // 临时移除登录限制以便测试智能路况功能
  // if (!userStore.isLoggedIn) {
  //   ElMessage.warning('请先登录后再进行路线规划')
  //   goLogin()
  //   return
  // }

  if (!isPointValid(startPoint) || !isPointValid(endPoint)) {
    ElMessage.warning('请先选择起点和终点')
    return
  }

  planning.value = true
  try {
    const response = await routeApi.plan({
      startLng: startPoint.lng,
      startLat: startPoint.lat,
      startName: startPoint.name || '起点',
      endLng: endPoint.lng,
      endLat: endPoint.lat,
      endName: endPoint.name || '终点',
      mode: planForm.mode,
      waypoints: waypoints.value.filter(isPointValid),
      avoidCongestion: planForm.avoidCongestion,
      avoidSlope: planForm.avoidSlope
    })

    if (response.code !== 200) {
      ElMessage.error(response.message || '路线规划失败')
      return
    }

    routeResult.value = normalizeRouteResult(response.data)
    savedRouteInfo.value = null
    drawRoute()
    drawRoadConditionLabels()
    drawRoutePois()
    fitRouteToView()
    await revealRouteResult()
    ElMessage.success(response.message || '路线规划完成')
  } catch (error) {
    console.error('路线规划失败:', error)
    ElMessage.error('路线规划失败，请稍后重试')
  } finally {
    planning.value = false
  }
}

function drawRoute() {
  routeSource.clear()
  if (!routeResult.value?.routeGeom) return

  const geometry = geoJson.readGeometry(routeResult.value.routeGeom, projectionOptions())
  const feature = new Feature({ geometry })
  feature.setStyle(
    new Style({
      stroke: new Stroke({
        color: planForm.mode === 'red' ? '#dc2626' : '#2563eb',
        width: 5
      })
    })
  )
  routeSource.addFeature(feature)
}

function drawRoadConditionLabels() {
  conditionSource?.clear()

  roadConditionSummaries.value.forEach((item, index) => {
    const feature = createRoadConditionFeature(item, index)
    if (feature) {
      conditionSource?.addFeature(feature)
    }
  })
}

function drawRoutePois() {
  poiSource.clear()

  ;(routeResult.value?.nearbyPois || []).forEach(item => {
    const coordinates = item?.location?.coordinates
    if (!coordinates) return
    poiSource.addFeature(
      new Feature({
        geometry: new Point(fromLonLat(coordinates)),
        kind: 'nearby'
      })
    )
  })

  ;(routeResult.value?.redSpots || []).forEach(item => {
    const coordinates = item?.location?.coordinates
    if (!coordinates) return
    poiSource.addFeature(
      new Feature({
        geometry: new Point(fromLonLat(coordinates)),
        kind: 'red'
      })
    )
  })
}

function focusRoadConditionLabel(item) {
  const coordinate = resolveRoadConditionCoordinate(item)
  if (!coordinate) {
    fitRouteToView()
    return
  }

  const [lng, lat] = toLonLat(coordinate)
  focusCoords(lng, lat, 16)
}

function fitRouteToView() {
  if (!map || !routeSource || !routeSource.getFeatures().length) return
  map.getView().fit(routeSource.getExtent(), {
    padding: [50, 50, 50, 50],
    duration: 350,
    maxZoom: 15
  })
}

async function saveRoute() {
  if (!routeResult.value?.routeGeom) {
    ElMessage.warning('请先完成路线规划')
    return
  }

  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录后再保存路线')
    goLogin()
    return
  }

  saving.value = true
  try {
    const response = await routeApi.save({
      routeName: `${startPoint.name || '起点'} - ${endPoint.name || '终点'}`,
      routeGeom: routeResult.value.routeGeom,
      startLng: startPoint.lng,
      startLat: startPoint.lat,
      startName: startPoint.name || '起点',
      endLng: endPoint.lng,
      endLat: endPoint.lat,
      endName: endPoint.name || '终点',
      totalDistance: routeResult.value.totalDistance,
      totalTime: routeResult.value.totalTime
    })

    if (response.code !== 200) {
      ElMessage.error(response.message || '保存路线失败')
      return
    }

    savedRouteInfo.value = response.data
    ElMessage.success('路线保存成功')
  } catch (error) {
    console.error('保存路线失败:', error)
    ElMessage.error('保存路线失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function addWaypoint() {
  if (waypoints.value.length >= 3) {
    ElMessage.warning('最多添加 3 个途经点')
    return
  }
  waypoints.value.push(createEmptyPoint())
  clearRouteArtifacts()
}

function removeWaypoint(index) {
  waypoints.value.splice(index, 1)
  clearRouteArtifacts()
  redrawMarkers()
}

function clearPoint(type) {
  clearRouteArtifacts()
  if (type === 'start') {
    Object.assign(startPoint, createEmptyPoint())
  } else {
    Object.assign(endPoint, createEmptyPoint())
  }
  redrawMarkers()
}

function focusPoint(point) {
  if (!isPointValid(point)) return
  focusCoords(point.lng, point.lat, 16)
}

function focusLocation(location) {
  const coordinates = location?.coordinates
  if (!coordinates) return
  focusCoords(coordinates[0], coordinates[1], 16)
}

function focusCoords(lng, lat, zoom = 15) {
  if (!map) return
  map.getView().animate({
    center: fromLonLat([lng, lat]),
    zoom,
    duration: 300
  })
}

function clearRouteArtifacts() {
  routeResult.value = null
  savedRouteInfo.value = null
  routeSource?.clear()
  conditionSource?.clear()
  poiSource?.clear()
}

function resetPlanning() {
  Object.assign(startPoint, createEmptyPoint())
  Object.assign(endPoint, createEmptyPoint())
  waypoints.value = []
  selectingPoint.value = null
  planForm.mode = 'fastest'
  planForm.avoidCongestion = false
  planForm.avoidSlope = false
  clearRouteArtifacts()
  markerSource?.clear()

  if (map) {
    map.getView().animate({
      center: fromLonLat([114.935, 25.845]),
      zoom: 13,
      duration: 300
    })
  }
}

async function revealRouteResult() {
  await nextTick()

  const panelEl = sidePanelRef.value
  const resultEl = routeResultSectionRef.value
  if (!panelEl || !resultEl || typeof panelEl.scrollTo !== 'function') return

  panelEl.scrollTo({
    top: Math.max(resultEl.offsetTop - 8, 0),
    behavior: 'smooth'
  })
}

function goLogin() {
  router.push({ name: 'Login', query: { redirect: '/analysis/route' } })
}

function pointDisplay(point) {
  return isPointValid(point) ? point.name : ''
}

function isPointValid(point) {
  return point && Number.isFinite(Number(point.lng)) && Number.isFinite(Number(point.lat))
}

function getSlopePercent(type) {
  const stats = slopeStats.value
  const total = Number(stats.flat || 0) + Number(stats.moderate || 0) + Number(stats.steep || 0) + Number(stats.verySteep || 0)
  if (!total) return 0
  return (Number(stats[type] || 0) / total) * 100
}

function formatDistance(value) {
  const distance = Number(value)
  if (Number.isNaN(distance)) return '-'
  return `${distance.toFixed(2)} km`
}

function formatMeters(value) {
  const distance = Number(value)
  if (value === null || value === undefined || Number.isNaN(distance)) return '-'
  if (distance >= 1000) return `${(distance / 1000).toFixed(2)} km`
  return `${distance.toFixed(0)} m`
}

function formatPercent(value) {
  const percent = Number(value)
  if (Number.isNaN(percent)) return '-'
  return `${percent.toFixed(2)}%`
}

function formatElevation(value) {
  const elevation = Number(value)
  if (value === null || value === undefined || Number.isNaN(elevation)) return '-'
  return `${elevation.toFixed(2)} m`
}

function createEmptyPoint() {
  return {
    name: '',
    lng: null,
    lat: null
  }
}

function normalizeRouteResult(routeData) {
  if (!routeData) return null

  return {
    ...routeData,
    nearbyPois: Array.isArray(routeData.nearbyPois) ? routeData.nearbyPois : [],
    redSpots: Array.isArray(routeData.redSpots) ? routeData.redSpots : [],
    roadSegments: Array.isArray(routeData.roadSegments) ? routeData.roadSegments : [],
    slopeStats: {
      ...emptySlopeStats,
      ...(routeData.slopeStats || {})
    },
    slopeFactors: {
      ...emptySlopeFactors,
      ...(routeData.slopeFactors || {})
    }
  }
}

function createRoadConditionSummaries(routeData) {
  if (!routeData) return []

  const segmentSummaries = (routeData.roadSegments || [])
    .map((segment, index) => buildRoadConditionSummary(segment, index))
    .filter(Boolean)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      if (b.maxSlope !== a.maxSlope) return b.maxSlope - a.maxSlope
      return b.length - a.length
    })

  const highlighted = segmentSummaries.filter(item => item.priority > 1)
  const selected = (highlighted.length ? highlighted : segmentSummaries).slice(0, 4)

  if (selected.length) {
    return selected
  }

  if (routeData.routeGeom) {
    return [createFallbackRoadConditionSummary(routeData)]
  }

  return []
}

function buildRoadConditionSummary(segment, index) {
  if (!segment) return null

  const avgSlope = Number(segment.avgSlope || 0)
  const maxSlope = Number(segment.maxSlope || 0)
  const length = Number(segment.length || 0)
  const meta = getRoadConditionMeta(maxSlope, avgSlope, segment.slopeCategory)
  const roadName = segment.name || `路段 ${index + 1}`
  const metricText = maxSlope > 0
    ? `最大坡度 ${maxSlope.toFixed(1)}%`
    : formatSegmentDistance(length)

  return {
    key: `${segment.id ?? 'segment'}-${index}`,
    name: roadName,
    shortLabel: meta.shortLabel,
    detail: `${roadName} · ${metricText}`,
    mapDetail: metricText,
    level: meta.level,
    priority: meta.priority,
    segment,
    avgSlope,
    maxSlope,
    length
  }
}

function createFallbackRoadConditionSummary(routeData) {
  const avgSlope = Number(routeData.slopeStats?.avgSlope || 0)
  const maxSlope = Number(routeData.slopeStats?.maxSlope || 0)
  const length = Number(routeData.totalDistance || 0)
  const meta = getRoadConditionMeta(maxSlope, avgSlope)

  return {
    key: 'route-summary',
    name: '整条路线',
    shortLabel: meta.shortLabel,
    detail: `整条路线 · 最大坡度 ${maxSlope.toFixed(1)}%`,
    mapDetail: `${formatDistance(length)} / 最大 ${maxSlope.toFixed(1)}%`,
    level: meta.level,
    priority: meta.priority,
    segment: {
      id: null,
      name: '整条路线',
      roadType: '路线概览',
      avgSlope,
      maxSlope,
      geometry: routeData.routeGeom
    },
    avgSlope,
    maxSlope,
    length
  }
}

function getRoadConditionMeta(maxSlope, avgSlope, slopeCategory = '') {
  if (slopeCategory === '陡峭' || maxSlope >= 15) {
    return { level: 'danger', priority: 4, shortLabel: '陡坡预警' }
  }
  if (slopeCategory === '较陡' || maxSlope >= 8) {
    return { level: 'warning', priority: 3, shortLabel: '较陡路段' }
  }
  if (slopeCategory === '中等' || avgSlope >= 3) {
    return { level: 'notice', priority: 2, shortLabel: '起伏路段' }
  }

  return { level: 'stable', priority: 1, shortLabel: '平稳路段' }
}

function formatSegmentDistance(lengthKm) {
  const distance = Number(lengthKm)
  if (Number.isNaN(distance) || distance <= 0) return '短距离'
  if (distance >= 1) return `${distance.toFixed(1)} km`
  return `${Math.round(distance * 1000)} m`
}

function createRoadConditionFeature(item, index) {
  const coordinate = resolveRoadConditionCoordinate(item)
  if (!coordinate) return null

  return new Feature({
    geometry: new Point(coordinate),
    label: item.shortLabel,
    detail: item.mapDetail,
    level: item.level,
    sortOrder: index
  })
}

function resolveRoadConditionCoordinate(item) {
  const geometryData = item?.segment?.geometry || routeResult.value?.routeGeom
  if (!geometryData) return null

  const geometry = geoJson.readGeometry(geometryData, projectionOptions())
  if (typeof geometry.getCoordinateAt === 'function') {
    return geometry.getCoordinateAt(0.5)
  }

  return getCenter(geometry.getExtent())
}

function createRoadConditionLabelStyle(feature) {
  const theme = getRoadConditionTheme(feature.get('level'))

  return new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: theme.dot }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    }),
    text: new Text({
      text: `${feature.get('label')}\n${feature.get('detail')}`,
      font: '600 12px sans-serif',
      textAlign: 'left',
      textBaseline: 'middle',
      offsetX: 16,
      offsetY: -10,
      fill: new Fill({ color: theme.text }),
      stroke: new Stroke({ color: '#ffffff', width: 3 }),
      backgroundFill: new Fill({ color: 'rgba(255,255,255,0.94)' }),
      backgroundStroke: new Stroke({ color: theme.border, width: 1.5 }),
      padding: [6, 8, 6, 8]
    })
  })
}

function getRoadConditionTheme(level) {
  if (level === 'danger') {
    return { dot: '#dc2626', border: '#dc2626', text: '#7f1d1d' }
  }
  if (level === 'warning') {
    return { dot: '#ea580c', border: '#ea580c', text: '#9a3412' }
  }
  if (level === 'notice') {
    return { dot: '#2563eb', border: '#2563eb', text: '#1d4ed8' }
  }

  return { dot: '#16a34a', border: '#16a34a', text: '#166534' }
}

function createMarkerStyle(kind, label) {
  const colors = {
    start: '#16a34a',
    end: '#dc2626',
    waypoint: '#2563eb'
  }

  return new Style({
    image: new CircleStyle({
      radius: 9,
      fill: new Fill({ color: colors[kind] || '#2563eb' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    }),
    text: new Text({
      text: label,
      offsetY: -18,
      fill: new Fill({ color: '#111827' }),
      stroke: new Stroke({ color: '#ffffff', width: 3 }),
      font: 'bold 12px sans-serif'
    })
  })
}

function createPoiStyle(kind) {
  const color = kind === 'red' ? '#ef4444' : '#0ea5e9'
  return new Style({
    image: new CircleStyle({
      radius: kind === 'red' ? 7 : 5,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    })
  })
}

function projectionOptions() {
  return {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }
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

.login-alert {
  align-items: center;
}

.page-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(340px, 430px);
  gap: 20px;
}

.side-panel {
  min-width: 0;
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  padding-right: 8px;
  scroll-behavior: smooth;
}

.map-panel {
  position: relative;
  min-width: 0;
}

.route-map {
  width: 100%;
  height: 620px;
  border-radius: 20px;
  background: #e5e7eb;
  overflow: hidden;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.map-tip {
  position: absolute;
  left: 20px;
  top: 20px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(17, 24, 39, 0.86);
  color: #ffffff;
  font-size: 13px;
  backdrop-filter: blur(6px);
}

.panel-card {
  margin-bottom: 16px;
  border-radius: 16px;
}

.result-section {
  scroll-margin-top: 12px;
}

.result-panel-card {
  border-color: #dbeafe;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 600;
}

.result-tags {
  display: flex;
  gap: 8px;
}

.point-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 18px;
}

.point-item {
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #f8fafc;
}

.point-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  font-weight: 600;
  color: #1f2937;
}

.point-actions {
  display: flex;
  gap: 6px;
}

.option-row {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}

.field-tip {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.6;
}

.condition-quick-panel {
  margin-top: 8px;
  padding: 14px;
  border: 1px solid #dbeafe;
  border-radius: 14px;
  background: linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
}

.condition-quick-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-weight: 600;
  color: #1f2937;
}

.condition-quick-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.condition-quick-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: #ffffff;
  cursor: pointer;
  text-align: left;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.condition-quick-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
}

.condition-quick-item.danger {
  border-color: #fecaca;
}

.condition-quick-item.warning {
  border-color: #fed7aa;
}

.condition-quick-item.notice {
  border-color: #bfdbfe;
}

.condition-quick-item.stable {
  border-color: #bbf7d0;
}

.condition-quick-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.condition-quick-detail {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 14px;
  background: #f8fafc;
  text-align: center;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
}

.result-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.save-alert {
  margin-bottom: 16px;
}

.slope-bar {
  display: flex;
  height: 18px;
  border-radius: 999px;
  overflow: hidden;
  margin: 16px 0 14px;
  background: #e5e7eb;
}

.slope-segment.flat {
  background: #22c55e;
}

.slope-segment.moderate {
  background: #facc15;
}

.slope-segment.steep {
  background: #f97316;
}

.slope-segment.very-steep {
  background: #ef4444;
}

.slope-grid,
.dem-factor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dem-factor-grid {
  margin-top: 14px;
}

.slope-item,
.factor-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
  color: #374151;
}

.slope-item.full {
  grid-column: 1 / -1;
}

.slope-item .label,
.factor-item .label {
  color: #6b7280;
}

.slope-item .value,
.factor-item .value {
  font-weight: 700;
}

.advice-alert {
  margin-top: 14px;
}

.empty-state {
  padding: 36px 0 12px;
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

  .header-actions,
  .result-actions {
    flex-direction: column;
  }

  .point-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .condition-quick-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .stats-grid,
  .slope-grid,
  .dem-factor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
