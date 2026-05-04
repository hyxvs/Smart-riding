<template>
  <div class="weather-card" v-if="displayWeather">
    <div class="weather-header">
      <div class="weather-main">
        <div class="weather-icon">
          <el-icon :size="48"><component :is="getIconComponent(displayWeather.icon)" /></el-icon>
        </div>
        <div class="weather-temp">
          <span class="temperature">{{ displayWeather.temperature }}°</span>
          <span class="city">{{ displayWeather.city }}</span>
        </div>
      </div>
      <div class="weather-info">
        <div class="weather-desc">{{ displayWeather.weather }}</div>
        <div class="weather-detail">
          <span>风向: {{ displayWeather.windDirection || '--' }}</span>
          <span>风力: {{ displayWeather.windPower || '--' }}</span>
          <span>湿度: {{ displayWeather.humidity ?? '--' }}%</span>
        </div>
      </div>
    </div>
    <div class="weather-suggestions" v-if="displayWeather.suggestions">
      <div class="suggestion-item">
        <el-icon><ColdDrink /></el-icon>
        <span>{{ displayWeather.suggestions.clothing }}</span>
      </div>
      <div class="suggestion-item">
        <el-icon><Bicycle /></el-icon>
        <span>{{ displayWeather.suggestions.activity }}</span>
      </div>
      <div class="suggestion-item safety">
        <el-icon><Warning /></el-icon>
        <span>{{ displayWeather.suggestions.safety }}</span>
      </div>
    </div>
  </div>
  <div class="weather-card loading" v-else-if="loading">
    <el-icon class="is-loading" :size="32"><Loading /></el-icon>
    <span>加载天气中...</span>
  </div>
  <div class="weather-card error" v-else-if="error">
    <el-icon :size="32"><WarningFilled /></el-icon>
    <span>{{ error }}</span>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { weatherApi } from '@/api'
import { ColdDrink, Bicycle, Warning, WarningFilled, Loading, Sunny, Cloudy, Pouring, MostlyCloudy, PartlyCloudy, WindPower } from '@element-plus/icons-vue'

const props = defineProps({
  data: {
    type: Object,
    default: null
  },
  city: {
    type: String,
    default: '赣州市'
  },
  lng: {
    type: Number,
    default: null
  },
  lat: {
    type: Number,
    default: null
  }
})

const weatherData = ref(props.data)
const loading = ref(false)
const error = ref(null)

const iconMap = {
  Sunny: shallowRef(Sunny),
  Cloudy: shallowRef(Cloudy),
  Rainy: shallowRef(Pouring),
  Snowy: shallowRef(MostlyCloudy),
  Foggy: shallowRef(PartlyCloudy),
  Wind: shallowRef(WindPower)
}

function getIconComponent(iconName) {
  return iconMap[iconName] || Cloudy
}

const displayWeather = computed(() => props.data || weatherData.value)

watch(
  () => props.data,
  (value) => {
    weatherData.value = value
    if (value) {
      error.value = null
      loading.value = false
    }
  }
)

async function fetchWeather(force = false) {
  if (props.data && !force) {
    weatherData.value = props.data
    return
  }

  if (!props.city && (!props.lng || !props.lat)) {
    error.value = '请提供城市名称或位置信息'
    return
  }

  loading.value = true
  error.value = null

  try {
    const params = props.lng && props.lat
      ? { lng: props.lng, lat: props.lat }
      : { city: props.city }

    const res = await weatherApi.getCurrentWeather(params)
    if (res.code === 200) {
      weatherData.value = res.data
    } else {
      error.value = res.message || '获取天气信息失败'
    }
  } catch (err) {
    console.error('获取天气失败:', err)
    error.value = err.message || '天气服务暂不可用'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!props.data) {
    fetchWeather()
  }
})

defineExpose({ fetchWeather })
</script>

<style scoped>
.weather-card {
  background: linear-gradient(135deg, #1f8a70 0%, #2f6b2f 100%);
  border-radius: 12px;
  padding: 16px;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.weather-card.loading,
.weather-card.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  background: #f5f5f5;
  color: #666;
}

.weather-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.weather-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.weather-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.temperature {
  font-size: 42px;
  font-weight: 600;
  line-height: 1;
}

.city {
  display: block;
  font-size: 14px;
  opacity: 0.9;
}

.weather-info {
  text-align: right;
}

.weather-desc {
  font-size: 16px;
  margin-bottom: 4px;
}

.weather-detail {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  opacity: 0.85;
  gap: 2px;
}

.weather-suggestions {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  opacity: 0.95;
}

.suggestion-item.safety {
  color: #ffd700;
}
</style>
