<template>
  <div class="map-picker">
    <!-- 地图容器 -->
    <div class="map-container" ref="mapContainer"></div>
    <!-- 地址栏 -->
    <div v-if="showAddress && selectedAddress" class="address-bar">
      <el-icon><Location /></el-icon>
      <span class="address-text">{{ selectedAddress }}</span>
    </div>
    <!-- 地图控制按钮 -->
    <div class="map-controls" v-if="showControls">
      <el-button circle size="small" @click="zoomIn">
        <el-icon><Plus /></el-icon>
      </el-button>
      <el-button circle size="small" @click="zoomOut">
        <el-icon><Minus /></el-icon>
      </el-button>
      <el-button circle size="small" @click="resetView">
        <el-icon><Aim /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup>
// 导入Vue核心功能
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
// 导入Element Plus加载组件
import { ElLoading } from 'element-plus'
// 导入Element Plus图标
import { Location, Plus, Minus, Aim } from '@element-plus/icons-vue'
// 导入OpenLayers地图库
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import { Style, Circle, Fill, Stroke, Text } from 'ol/style'
import { Point } from 'ol/geom'
import { Feature } from 'ol'
import { fromLonLat, toLonLat } from 'ol/proj'
// 导入地理编码工具
import { reverseGeocode } from '@/utils/geocode'

// 定义组件属性
const props = defineProps({
  // 初始中心点坐标 [lng, lat]
  center: {
    type: Array,
    default: () => [114.935, 25.845]
  },
  // 初始缩放级别
  zoom: {
    type: Number,
    default: 13
  },
  // 是否显示地址栏
  showAddress: {
    type: Boolean,
    default: true
  },
  // 是否显示控制按钮
  showControls: {
    type: Boolean,
    default: true
  },
  // 是否启用地址反解析
  enableGeocode: {
    type: Boolean,
    default: true
  },
  // 地图高度
  height: {
    type: String,
    default: '400px'
  },
  // 是否只读模式（不能点击选点）
  readonly: {
    type: Boolean,
    default: false
  },
  // 初始选中的坐标
  initialCoord: {
    type: Array,
    default: null
  }
})

// 定义事件
const emit = defineEmits(['select', 'change'])

// 地图容器引用
const mapContainer = ref(null)
// 选中的地址
const selectedAddress = ref('')
// 选中的坐标
const selectedCoord = ref(null)

// 地图实例
let map = null
// 标记图层
let markerLayer = null
// 标记要素
let markerFeature = null

// 初始化地图
function initMap() {
  if (!mapContainer.value) return

  // 创建标记图层
  markerLayer = new VectorLayer({
    source: new VectorSource(),
    style: new Style({
      image: new Circle({
        radius: 12,
        fill: new Fill({ color: '#f56c6c' }),
        stroke: new Stroke({ color: '#fff', width: 3 })
      }),
      text: new Text({
        text: '●',
        fill: new Fill({ color: '#f56c6c' }),
        font: '20px sans-serif'
      })
    })
  })

  // 创建地图
  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({
        source: new OSM() // 使用OpenStreetMap底图
      }),
      markerLayer // 添加标记图层
    ],
    controls: [], // 禁用默认控件
    view: new View({
      center: fromLonLat(props.center), // 转换为地图坐标
      zoom: props.zoom
    })
  })

  // 点击事件
  if (!props.readonly) {
    map.on('click', handleMapClick)
  }

  // 如果有初始坐标，显示标记
  if (props.initialCoord) {
    setMarker(props.initialCoord[0], props.initialCoord[1])
  }

  // 强制更新尺寸
  nextTick(() => {
    setTimeout(() => {
      map.updateSize()
    }, 100)
  })
}

// 处理地图点击
async function handleMapClick(evt) {
  // 转换为经纬度坐标
  const coord = toLonLat(evt.coordinate)
  const lng = coord[0]
  const lat = coord[1]

  console.log('MapPicker 地图点击事件:', { lng, lat })

  // 设置标记
  setMarker(lng, lat)
  selectedCoord.value = [lng, lat]

  // 地址反解析
  if (props.enableGeocode) {
    const loadingInstance = ElLoading.service({
      target: mapContainer.value,
      text: '正在解析地址...',
      fullscreen: false
    })

    try {
      const addressInfo = await reverseGeocode(lng, lat)
      selectedAddress.value = addressInfo.address
      // 触发选择事件
      emit('select', {
        lng,
        lat,
        address: addressInfo.address,
        addressInfo
      })
      console.log('MapPicker 触发 select 事件:', { lng, lat, address: addressInfo.address })
    } catch (error) {
      console.error('地址解析失败:', error)
      selectedAddress.value = `${lng.toFixed(6)}, ${lat.toFixed(6)}`
      emit('select', { lng, lat, address: selectedAddress.value })
      console.log('MapPicker 触发 select 事件（无地址）:', { lng, lat })
    } finally {
      loadingInstance.close()
    }
  } else {
    emit('select', { lng, lat })
    console.log('MapPicker 触发 select 事件（禁用地址解析）:', { lng, lat })
  }

  // 触发变化事件
  emit('change', { lng, lat })
  console.log('MapPicker 触发 change 事件:', { lng, lat })
}

// 设置标记
function setMarker(lng, lat) {
  if (!markerLayer) return

  const coordinate = fromLonLat([lng, lat])
  markerFeature = new Feature({
    geometry: new Point(coordinate)
  })

  // 清除现有标记并添加新标记
  markerLayer.getSource().clear()
  markerLayer.getSource().addFeature(markerFeature)
}

// 缩放控制
function zoomIn() {
  if (map) {
    const view = map.getView()
    view.setZoom(view.getZoom() + 1)
  }
}

function zoomOut() {
  if (map) {
    const view = map.getView()
    view.setZoom(view.getZoom() - 1)
  }
}

// 重置视图
function resetView() {
  if (map) {
    map.getView().animate({
      center: fromLonLat(props.center),
      zoom: props.zoom,
      duration: 500
    })
  }
}

// 定位到指定坐标
function locateTo(lng, lat, zoom = 15) {
  if (map) {
    map.getView().animate({
      center: fromLonLat([lng, lat]),
      zoom,
      duration: 500
    })
    setMarker(lng, lat)
    selectedCoord.value = [lng, lat]
  }
}

// 获取当前选中的坐标
function getSelectedCoord() {
  return selectedCoord.value
}

// 监听初始坐标变化
watch(() => props.initialCoord, (newVal) => {
  if (newVal && map) {
    setMarker(newVal[0], newVal[1])
    map.getView().animate({
      center: fromLonLat(newVal),
      zoom: 15,
      duration: 500
    })
  }
})

// 监听 readonly 属性变化
watch(() => props.readonly, (newVal) => {
  if (map) {
    // 先移除可能存在的点击事件
    map.un('click', handleMapClick)
    // 根据 readonly 属性重新绑定点击事件
    if (!newVal) {
      map.on('click', handleMapClick)
      console.log('MapPicker 绑定点击事件（readonly: false）')
    } else {
      console.log('MapPicker 移除点击事件（readonly: true）')
    }
  }
})

// 组件挂载时初始化地图
onMounted(() => {
  initMap()
})

// 组件卸载时清理
onUnmounted(() => {
  if (map) {
    map.setTarget(null)
    map = null
  }
})

// 添加自定义图层
function addLayer(layer) {
  if (map) {
    map.addLayer(layer)
  }
}

// 移除图层
function removeLayer(layer) {
  if (map) {
    map.removeLayer(layer)
  }
}

// 清除所有图层（保留底图和标记图层）
function clearLayers() {
  if (map) {
    const layers = map.getLayers().getArray()
    layers.forEach(layer => {
      // 只保留底图和标记图层
      if (layer !== layers[0] && layer !== markerLayer) {
        map.removeLayer(layer)
      }
    })
  }
}

// 获取地图实例
function getMap() {
  return map
}

// 暴露方法
defineExpose({
  locateTo, // 定位到指定坐标
  getSelectedCoord, // 获取当前选中的坐标
  resetView, // 重置视图
  zoomIn, // 放大地图
  zoomOut, // 缩小地图
  addLayer, // 添加自定义图层
  removeLayer, // 移除图层
  clearLayers, // 清除所有图层
  getMap // 暴露地图实例，以便外部添加点击事件
})
</script>

<style lang="scss" scoped>
/* 地图选择器容器 */
.map-picker {
  position: relative;
  width: 100%;
  height: v-bind(height);
  border-radius: 8px;
  overflow: hidden;
}

/* 地图容器 */
.map-container {
  width: 100%;
  height: 100%;
  background: #f5f5f5;
}

/* 地址栏 */
.address-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #e4e7ed;
  backdrop-filter: blur(4px);

  .el-icon {
    color: #f56c6c;
    flex-shrink: 0;
  }

  .address-text {
    flex: 1;
    font-size: 14px;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 地图控制按钮 */
.map-controls {
  position: absolute;
  right: 12px;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .el-button {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(4px);

    &:hover {
      background: #fff;
    }
  }
}
</style>
