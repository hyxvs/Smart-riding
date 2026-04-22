<template>
  <div class="home-page">
    <!-- 地图选择器组件，用于显示地图 -->
    <MapPicker
      ref="mapPickerRef"
      height="100%"
      :center="[114.935, 25.845]" 
      :zoom="13" 
      :show-controls="false" 
      :enable-geocode="false" 
      :readonly="true" 
      @select="handleMapClick" 
    />
    <!-- 地图覆盖层 -->
    <div class="map-overlay"></div>
    
    <!-- 顶部覆盖面板 -->
    <div class="overlay-panel">
      <!-- 快速操作按钮 -->
      <div class="quick-actions">
        <div class="action-item" @click="goToRoute">
          <el-icon :size="24"><MapLocation /></el-icon>
          <span>路线规划</span>
        </div>
        <div class="action-item" @click="goToReport">
          <el-icon :size="24"><Warning /></el-icon>
          <span>民情上报</span>
        </div>
        <div class="action-item" @click="goToTeam">
          <el-icon :size="24"><UserFilled /></el-icon>
          <span>组队骑行</span>
        </div>
      </div>
    </div>
    
    <!-- 底部面板 -->
    <div class="bottom-panel">
      <!-- 统计卡片 -->
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-value">{{ stats.totalDistance || 0 }}</div>
          <div class="stat-label">累计骑行(km)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.reportCount || 0 }}</div>
          <div class="stat-label">民情上报</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ (userStore.userInfo && userStore.userInfo.level) || 1 }}</div>
          <div class="stat-label">当前等级</div>
        </div>
      </div>
    </div>
    
    <!-- 浮动按钮 -->
    <div class="float-buttons">
      <el-tooltip content="定位" placement="left">
        <div class="float-btn" @click="locateMe">
          <el-icon :size="20"><Location /></el-icon>
        </div>
      </el-tooltip>
      <el-tooltip content="上报" placement="left">
        <div class="float-btn primary" @click="goToReport">
          <el-icon :size="20"><Plus /></el-icon>
        </div>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup>
// 导入Vue核心功能
import { ref, onMounted } from 'vue'
// 导入路由
import { useRouter } from 'vue-router'
// 导入Element Plus消息组件
import { ElMessage } from 'element-plus'
// 导入用户状态管理
import { useUserStore } from '@/stores/user'
// 导入地图选择器组件
import MapPicker from '@/components/MapPicker.vue'

// 初始化路由实例
const router = useRouter()
// 初始化用户store
const userStore = useUserStore()
// 地图选择器引用
const mapPickerRef = ref(null)
// 统计数据
const stats = ref({})

// 组件挂载时执行
onMounted(() => {
  // MapPicker 会自动初始化
})

// 处理地图点击事件
function handleMapClick(location) {
  console.log('点击坐标:', [location.lng, location.lat])
}

// 跳转到路线规划页面
function goToRoute() {
  router.push('/analysis/route')
}

// 跳转到民情上报页面
function goToReport() {
  router.push('/report')
}

// 跳转到组队骑行页面
function goToTeam() {
  router.push('/team')
}

// 定位当前位置
function locateMe() {
  // 检查浏览器是否支持地理定位
  if (!navigator.geolocation) {
    ElMessage.warning('您的浏览器不支持定位功能')
    return
  }
  
  // 显示加载消息
  const loadingMessage = ElMessage.info({
    message: '正在定位中...',
    duration: 0
  })
  
  // 获取当前位置
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      loadingMessage.close()
      const { longitude, latitude } = pos.coords
      // 定位到当前位置
      if (mapPickerRef.value) {
        mapPickerRef.value.locateTo(longitude, latitude, 15)
      }
      ElMessage.success('定位成功')
    },
    (err) => {
      loadingMessage.close()
      let errorMsg = '定位失败'
      // 处理定位错误（1: 权限被拒绝, 2: 位置不可用, 3: 超时）
      if (err.code === 1) {
        errorMsg = '定位被拒绝，请检查浏览器定位权限设置'
      } else if (err.code === 2) {
        errorMsg = '位置信息不可用，请检查网络连接'
      } else if (err.code === 3) {
        errorMsg = '定位超时，请稍后重试'
      } else {
        errorMsg = '定位失败，请手动选择位置'
      }
      ElMessage.error(errorMsg)
    },
    {
      enableHighAccuracy: true, // 启用高精度定位
      timeout: 10000, // 超时时间10秒
      maximumAge: 60000 // 位置信息最大缓存时间60秒
    }
  )
}
</script>

<style lang="scss" scoped>
/* 首页容器样式 */
.home-page {
  position: relative;
  height: calc(100vh - 60px);
}

/* 地图覆盖层样式 */
.map-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

/* 顶部覆盖面板样式 */
.overlay-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  right: 20px;
  pointer-events: none;
  z-index: 2;
  
  > * {
    pointer-events: auto;
  }
}

/* 搜索框样式 */
.search-box {
  max-width: 500px;
  margin: 0 auto;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  overflow: hidden;
}

/* 快速操作按钮样式 */
.quick-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 15px;
  
  .action-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 12px 20px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: all 0.3s;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    span {
      font-size: 12px;
      color: #666;
    }
  }
}

/* 底部面板样式 */
.bottom-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 20px;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
}

/* 统计卡片样式 */
.stat-cards {
  display: flex;
  justify-content: space-around;
  margin-bottom: 20px;
  
  .stat-card {
    text-align: center;
    
    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #409eff;
    }
    
    .stat-label {
      font-size: 12px;
      color: #999;
      margin-top: 5px;
    }
  }
}

/* 区块标题样式 */
.section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}

/* 路线列表样式 */
.route-list {
  .route-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    
    &:last-child {
      border-bottom: none;
    }
    
    .route-name {
      font-size: 14px;
    }
    
    .route-meta {
      font-size: 12px;
      color: #999;
      margin-top: 3px;
      
      span {
        margin-right: 10px;
      }
    }
  }
}

/* 浮动按钮样式 */
.float-buttons {
  position: absolute;
  right: 20px;
  bottom: 200px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 3;
  
  .float-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    transition: all 0.3s;
    
    &:hover {
      transform: scale(1.1);
    }
    
    &.primary {
      background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
      color: #fff;
      width: 50px;
      height: 50px;
    }
  }
}
</style>
