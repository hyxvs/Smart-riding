<template>
  <div class="ride-tracker">
    <div class="ride-map-container" ref="mapContainer"></div>

    <div class="ride-info-panel">
      <div class="info-row">
        <div class="info-item">
          <span class="info-label">距离</span>
          <span class="info-value">{{ formatDistance(currentDistance) }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">时长</span>
          <span class="info-value">{{ formatDuration(elapsedTime) }}</span>
        </div>
      </div>
      <div class="info-row">
        <div class="info-item">
          <span class="info-label">速度</span>
          <span class="info-value">{{ currentSpeed.toFixed(1) }} km/h</span>
        </div>
        <div class="info-item">
          <span class="info-label">当前挑战</span>
          <span class="info-value" v-if="activeChallenge">{{ activeChallenge.title }}</span>
          <span class="info-value" v-else>无</span>
        </div>
      </div>
    </div>

    <div class="ride-controls">
      <el-button
        v-if="!isRiding"
        type="primary"
        size="large"
        @click="startRideHandler"
        :disabled="!geolocationAvailable"
      >
        {{ sessionId ? '继续骑行' : '开始骑行' }}
      </el-button>
      <el-button
        v-if="isRiding && !isPaused"
        type="warning"
        size="large"
        @click="pauseRide"
      >
        暂停
      </el-button>
      <el-button
        v-if="isRiding && isPaused"
        type="success"
        size="large"
        @click="resumeRide"
      >
        继续
      </el-button>
      <el-button
        v-if="isRiding || sessionId"
        type="danger"
        size="large"
        @click="endRideHandler"
      >
        结束骑行
      </el-button>
    </div>

    <div class="ride-challenge-select" v-if="!isRiding">
      <el-select v-model="selectedChallengeId" placeholder="选择关联挑战（可选）" clearable>
        <el-option
          v-for="challenge in activeChallenges"
          :key="challenge.id"
          :label="`${challenge.title} (${Math.round(challenge.my_progress || 0)}%)`"
          :value="challenge.id"
        />
      </el-select>
    </div>

    <div class="location-status">
      <el-tag :type="locationStatus === 'connected' ? 'success' : 'info'">
        {{ locationStatusText }}
      </el-tag>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import { Style, Circle, Fill, Stroke, Text } from 'ol/style'
import { LineString, Point } from 'ol/geom'
import { Feature } from 'ol'
import { fromLonLat, toLonLat } from 'ol/proj'
import request from '@/api/request'
import { startRide, updateProgress, endRide } from '@/api/ride'

const props = defineProps({
  activeChallenges: {
    type: Array,
    default: () => []
  },
  defaultChallengeId: {
    type: [Number, String],
    default: null
  }
})

const emit = defineEmits(['rideComplete', 'progressUpdate'])

const mapContainer = ref(null)
let map = null
let trackLayer = null
let currentPositionMarker = null
let watchId = null

const sessionId = ref(null)
const isRiding = ref(false)
const isPaused = ref(false)
const selectedChallengeId = ref(null)
const activeChallenge = computed(() => {
  if (!selectedChallengeId.value) return null
  return props.activeChallenges.find(c => c.id === selectedChallengeId.value)
})

const currentPosition = ref(null)
const trackPoints = ref([])
const currentDistance = ref(0)
const elapsedTime = ref(0)
const currentSpeed = ref(0)
const locationStatus = ref('disconnected')
const geolocationAvailable = ref(false)

let timer = null
let lastUpdateTime = null

const locationStatusText = computed(() => {
  switch (locationStatus.value) {
    case 'connected': return '定位已连接'
    case 'connecting': return '正在获取定位...'
    case 'disconnected': return '定位未连接'
    case 'error': return '定位出错'
    default: return '未知状态'
  }
})

function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} 米`
  }
  return `${(meters / 1000).toFixed(2)} 公里`
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function initMap() {
  const container = mapContainer.value
  if (!container) return

  const rasterLayer = new TileLayer({
    source: new OSM()
  })

  trackLayer = new VectorLayer({
    source: new VectorSource(),
    style: new Style({
      stroke: new Stroke({
        color: '#409EFF',
        width: 4
      }),
      image: new Circle({
        radius: 6,
        fill: new Fill({ color: '#409EFF' })
      })
    })
  })

  map = new Map({
    target: container,
    layers: [rasterLayer, trackLayer],
    view: new View({
      center: fromLonLat([114.935, 25.845]),
      zoom: 15
    })
  })
}

function updateMapPosition(lon, lat) {
  if (!map) return

  const coordinate = fromLonLat([lon, lat])

  if (!currentPositionMarker) {
    currentPositionMarker = new Feature({
      geometry: new Point(coordinate)
    })
    currentPositionMarker.setStyle(new Style({
      image: new Circle({
        radius: 8,
        fill: new Fill({ color: '#F56C6C' }),
        stroke: new Stroke({ color: '#fff', width: 2 })
      })
    }))
    trackLayer.getSource().addFeature(currentPositionMarker)
  } else {
    currentPositionMarker.getGeometry().setCoordinates(coordinate)
  }

  map.getView().setCenter(coordinate)
}

function drawTrack() {
  if (!trackLayer || trackPoints.value.length < 2) return

  const features = trackLayer.getSource().getFeatures()
  features.forEach(f => {
    if (f !== currentPositionMarker) {
      trackLayer.getSource().removeFeature(f)
    }
  })

  const coords = trackPoints.value.map(p => fromLonLat([p.lon, p.lat]))
  const trackLine = new Feature({
    geometry: new LineString(coords)
  })
  trackLine.setStyle(new Style({
    stroke: new Stroke({
      color: '#409EFF',
      width: 4
    })
  }))
  trackLayer.getSource().addFeature(trackLine)
}

function calculateDistance(p1, p2) {
  const R = 6371000
  const lat1 = p1.lat * Math.PI / 180
  const lat2 = p2.lat * Math.PI / 180
  const deltaLat = (p2.lat - p1.lat) * Math.PI / 180
  const deltaLon = (p2.lon - p1.lon) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

function handleGeolocation(position) {
  const { latitude, longitude, speed, accuracy } = position.coords
  const now = Date.now()

  locationStatus.value = 'connected'
  currentPosition.value = { lat: latitude, lon: longitude, speed, accuracy, time: now }

  updateMapPosition(longitude, latitude)

  if (isRiding.value && !isPaused.value) {
    if (trackPoints.value.length > 0) {
      const lastPoint = trackPoints.value[trackPoints.value.length - 1]
      const distance = calculateDistance(lastPoint, { lat: latitude, lon: longitude })

      if (distance > 5) {
        currentDistance.value += distance

        const timeDiff = (now - lastUpdateTime) / 1000
        if (timeDiff > 0) {
          const speedMs = distance / timeDiff
          currentSpeed.value = speedMs * 3.6
        }

        trackPoints.value.push({ lat: latitude, lon: longitude, time: now })
        drawTrack()
        lastUpdateTime = now

        if (selectedChallengeId.value && sessionId.value) {
          updateChallengeProgress()
        }
      }
    } else {
      trackPoints.value.push({ lat: latitude, lon: longitude, time: now })
      lastUpdateTime = now
    }
  }
}

function handleGeolocationError(error) {
  console.error('Geolocation error:', error)
  locationStatus.value = 'error'

  switch (error.code) {
    case error.PERMISSION_DENIED:
      ElMessage.error('定位权限被拒绝，请允许浏览器获取位置')
      break
    case error.POSITION_UNAVAILABLE:
      ElMessage.error('无法获取位置信息')
      break
    case error.TIMEOUT:
      ElMessage.error('获取位置超时')
      break
    default:
      ElMessage.error('未知定位错误')
  }
}

function startGeolocation() {
  if (!navigator.geolocation) {
    ElMessage.error('您的浏览器不支持定位功能')
    geolocationAvailable.value = false
    return
  }

  geolocationAvailable.value = true
  locationStatus.value = 'connecting'

  watchId = navigator.geolocation.watchPosition(
    handleGeolocation,
    handleGeolocationError,
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  )
}

function stopGeolocation() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  locationStatus.value = 'disconnected'
}

async function startRideHandler() {
  try {
    const response = await startRide({
      challenge_id: selectedChallengeId.value || null
    })

    if (response.code === 200) {
      sessionId.value = response.data.session_id
      isRiding.value = true
      isPaused.value = false
      trackPoints.value = []
      currentDistance.value = 0
      elapsedTime.value = 0
      currentSpeed.value = 0
      lastUpdateTime = Date.now()

      startGeolocation()
      startTimer()

      ElMessage.success('骑行已开始！')
    }
  } catch (error) {
    console.error('Start ride error:', error)
    ElMessage.error('开始骑行失败')
  }
}

function pauseRide() {
  isPaused.value = true
  ElMessage.warning('骑行已暂停')
}

function resumeRide() {
  isPaused.value = false
  lastUpdateTime = Date.now()
  ElMessage.success('骑行继续')
}

async function endRideHandler() {
  try {
    stopGeolocation()
    stopTimer()

    const trackGeom = trackPoints.value.length >= 2
      ? `LINESTRING(${trackPoints.value.map(p => `${p.lon} ${p.lat}`).join(', ')})`
      : null

    const response = await endRide({
      session_id: sessionId.value,
      track_geom: trackGeom,
      total_distance: currentDistance.value,
      duration: elapsedTime.value,
      challenge_id: selectedChallengeId.value || null
    })

    if (response.code === 200) {
      emit('rideComplete', {
        distance: currentDistance.value,
        duration: elapsedTime.value,
        challengeProgress: response.data.challenge_progress
      })

      ElMessage.success('骑行已保存！')

      if (response.data.challenge_completed) {
        ElMessage.success('🎉 恭喜完成挑战！')
      }
    }

    sessionId.value = null
    isRiding.value = false
    isPaused.value = false
  } catch (error) {
    console.error('End ride error:', error)
    ElMessage.error('保存骑行记录失败')
  }
}

async function updateChallengeProgress() {
  if (!selectedChallengeId.value || !sessionId.value) return

  try {
    const response = await updateProgress({
      session_id: sessionId.value,
      distance: currentDistance.value,
      challenge_id: selectedChallengeId.value
    })

    if (response.code === 200) {
      emit('progressUpdate', {
        ...response.data,
        challenge_id: selectedChallengeId.value
      })
    }
  } catch (error) {
    console.error('Update progress error:', error)
  }
}

function startTimer() {
  timer = setInterval(() => {
    if (!isPaused.value) {
      elapsedTime.value++
    }
  }, 1000)
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onMounted(() => {
  initMap()

  if (navigator.geolocation) {
    geolocationAvailable.value = true
  }

  if (props.defaultChallengeId) {
    selectedChallengeId.value = props.defaultChallengeId
  }
})

watch(() => props.defaultChallengeId, (newVal) => {
  if (newVal) {
    selectedChallengeId.value = newVal
  }
})

onUnmounted(() => {
  stopGeolocation()
  stopTimer()
})
</script>

<style scoped>
.ride-tracker {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.ride-map-container {
  flex: 1;
  min-height: 400px;
  border-radius: 8px;
  overflow: hidden;
}

.ride-info-panel {
  background: #fff;
  padding: 16px;
  border-top: 1px solid #eee;
}

.info-row {
  display: flex;
  justify-content: space-around;
  margin-bottom: 12px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-item {
  text-align: center;
}

.info-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.info-value {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.ride-controls {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border-top: 1px solid #eee;
}

.ride-challenge-select {
  padding: 0 16px 16px;
  background: #fff;
}

.location-status {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 100;
}
</style>
