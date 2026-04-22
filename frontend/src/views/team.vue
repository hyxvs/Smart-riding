<template>
  <div class="team-page">
    <div class="page-container">
      <div class="page-header">
        <h2 class="page-title">组队骑行</h2>
        <div class="header-actions">
          <el-button @click="showJoinByCode = true">
            <el-icon><Key /></el-icon>
            邀请码加入
          </el-button>
          <el-button type="primary" @click="createTeam">
            <el-icon><Plus /></el-icon>
            发起组队
          </el-button>
        </div>
      </div>
      
      <div class="team-list" v-loading="loading">
        <div class="team-item" v-for="team in teams" :key="team.id" @click="viewTeam(team.id)">
          <div class="team-header">
            <h3 class="team-title">{{ team.title }}</h3>
            <el-tag :type="team.status === 'recruiting' ? 'success' : 'info'">
              {{ team.status === 'recruiting' ? '招募中' : '进行中' }}
            </el-tag>
          </div>
          
          <p class="team-desc">{{ team.description || '暂无描述' }}</p>
          
          <div class="team-info">
            <div class="info-item">
              <el-icon><MapLocation /></el-icon>
              <span>{{ (parseFloat(team.total_distance) || 0).toFixed(1) }}km</span>
            </div>
            <div class="info-item">
              <el-icon><User /></el-icon>
              <span>{{ team.current_members }}/{{ team.max_members }}人</span>
            </div>
            <div class="info-item">
              <el-icon><Calendar /></el-icon>
              <span>{{ formatDate(team.plan_start_time) }}</span>
            </div>
          </div>
          
          <div class="team-footer">
            <div class="creator">
              <el-avatar :size="24" :src="team.creator_avatar">
                {{ (team.creator_name || 'U').charAt(0) }}
              </el-avatar>
              <span>{{ team.creator_name }}</span>
            </div>
            <div class="invite-code" v-if="team.invite_code">
              邀请码: {{ team.invite_code }}
            </div>
          </div>
        </div>
        
        <el-empty v-if="!loading && teams.length === 0" description="暂无组队活动" />
      </div>
    </div>
    
    <el-dialog v-model="showCreateDialog" title="发起组队骑行" width="600px">
      <el-form :model="teamForm" :rules="teamRules" ref="teamFormRef" label-width="100px">
        <el-form-item label="活动标题" prop="title">
          <el-input v-model="teamForm.title" placeholder="给活动起个名字" maxlength="50" />
        </el-form-item>
        
        <el-form-item label="活动描述">
          <el-input v-model="teamForm.description" type="textarea" :rows="3" placeholder="描述活动详情..." />
        </el-form-item>
        
        <el-form-item label="计划时间">
          <el-date-picker
            v-model="teamForm.planTime"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 100%"
          />
        </el-form-item>
        
        <el-form-item label="人数上限">
          <el-input-number v-model="teamForm.maxMembers" :min="2" :max="50" />
        </el-form-item>
        
        <el-form-item label="骑行路线">
          <el-button @click="selectRoute">选择路线</el-button>
          <span v-if="teamForm.routeGeom" style="margin-left: 10px; color: #67c23a;">已选择路线</span>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitCreate" :loading="creating">创建</el-button>
      </template>
    </el-dialog>
    
    <!-- 路线选择对话框 -->
    <el-dialog v-model="showRouteSelect" title="选择骑行路线" width="800px">
      <div class="route-select-container">
        <MapPicker
          ref="mapPickerRef"
          height="400px"
          :center="[114.935, 25.845]"
          :zoom="13"
          :show-controls="true"
          :enable-geocode="false"
          :readonly="!drawingRoute"
          @select="handleMapClick"
        />
        <div class="route-controls">
          <el-button @click="startDrawing">{{ drawingRoute ? '停止绘制' : '开始绘制' }}</el-button>
          <el-button @click="clearRoute">清除路线</el-button>
          <el-button @click="setStartPoint" :disabled="!routeCoordinates.length">设置起点</el-button>
          <el-button @click="setEndPoint" :disabled="!routeCoordinates.length">设置终点</el-button>
        </div>
        <div class="route-info" v-if="routeCoordinates.length">
          <p>已绘制 {{ routeCoordinates.length }} 个点</p>
          <p v-if="routeStartPoint">起点: {{ routeStartPoint.lng.toFixed(4) }}, {{ routeStartPoint.lat.toFixed(4) }}</p>
          <p v-if="routeEndPoint">终点: {{ routeEndPoint.lng.toFixed(4) }}, {{ routeEndPoint.lat.toFixed(4) }}</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="cancelRouteSelect">取消</el-button>
        <el-button type="primary" @click="confirmRouteSelect" :disabled="!routeCoordinates.length || !routeStartPoint || !routeEndPoint">确认选择</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="showJoinByCode" title="邀请码加入" width="400px">
      <el-input v-model="inviteCode" placeholder="请输入邀请码" size="large" />
      <template #footer>
        <el-button @click="showJoinByCode = false">取消</el-button>
        <el-button type="primary" @click="joinByCode" :loading="joining">加入</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="showTeamDetail" title="组队详情" width="700px">
      <div class="team-detail" v-if="currentTeam">
        <div class="detail-header">
          <h2>{{ currentTeam.title }}</h2>
          <el-tag :type="currentTeam.status === 'recruiting' ? 'success' : 'info'">
            {{ currentTeam.status === 'recruiting' ? '招募中' : '进行中' }}
          </el-tag>
        </div>
        
        <p class="detail-desc">{{ currentTeam.description }}</p>
        
        <div class="detail-stats">
          <div class="stat">
            <span class="value">{{ (parseFloat(currentTeam.total_distance) || 0).toFixed(1) }}</span>
            <span class="label">公里</span>
          </div>
          <div class="stat">
            <span class="value">{{ currentTeam.current_members }}/{{ currentTeam.max_members }}</span>
            <span class="label">人数</span>
          </div>
        </div>
        
        <div class="members-section">
          <h4>参与成员</h4>
          <div class="member-list">
            <div class="member-item" v-for="member in currentTeam.members" :key="member.id">
              <el-avatar :size="36" :src="member.user_avatar">
                {{ (member.user_name || 'U').charAt(0) }}
              </el-avatar>
              <div class="member-info">
                <span class="name">{{ member.user_name }}</span>
                <el-tag size="small" v-if="member.role === 'creator'">创建者</el-tag>
              </div>
            </div>
          </div>
        </div>
        
        <div class="invite-section">
          <span>邀请码: </span>
          <strong>{{ currentTeam.invite_code }}</strong>
          <el-button type="primary" link @click="copyInviteCode">复制</el-button>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="showTeamDetail = false">关闭</el-button>
        <el-button 
          v-if="currentTeam && currentTeam.isJoined && currentTeam.myRole !== 'creator'" 
          type="danger" 
          @click="leaveTeam"
        >
          退出组队
        </el-button>
        <el-button 
          v-if="currentTeam && !currentTeam.isJoined && currentTeam.status === 'recruiting'" 
          type="primary" 
          @click="joinTeam"
        >
          加入组队
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { teamApi, userApi } from '@/api'
import { useUserStore } from '@/stores/user'
import MapPicker from '@/components/MapPicker.vue'

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const teams = ref([])
const showCreateDialog = ref(false)
const showJoinByCode = ref(false)
const showTeamDetail = ref(false)
const creating = ref(false)
const joining = ref(false)
const inviteCode = ref('')
const currentTeam = ref(null)

const teamFormRef = ref(null)
const teamForm = ref({
  title: '',
  description: '',
  planTime: [],
  maxMembers: 10,
  routeGeom: null,
  startLng: 0,
  startLat: 0,
  endLng: 0,
  endLat: 0,
  startName: '',
  endName: '',
  totalDistance: 0
})

const teamRules = {
  title: [{ required: true, message: '请输入活动标题', trigger: 'blur' }]
}

// 路线选择相关
const showRouteSelect = ref(false)
const mapPickerRef = ref(null)
const routeCoordinates = ref([])
const drawingRoute = ref(false)
const routeStartPoint = ref(null)
const routeEndPoint = ref(null)

// 监听路线选择对话框的显示
watch(showRouteSelect, (newValue) => {
  if (!newValue) {
    // 清理路线数据
    routeCoordinates.value = []
    drawingRoute.value = false
    routeStartPoint.value = null
    routeEndPoint.value = null
  }
})

// 处理地图点击
function handleMapClick(location) {
  if (drawingRoute.value) {
    routeCoordinates.value.push([location.lng, location.lat])
    ElMessage.success(`已添加点: ${location.lng.toFixed(4)}, ${location.lat.toFixed(4)}`)
    console.log('已添加点:', location.lng, location.lat)
    console.log('当前路线坐标数组:', routeCoordinates.value)
  } else {
    console.log('未开始绘制，忽略地图点击')
  }
}

onMounted(() => {
  loadTeams()
})

async function loadTeams() {
  loading.value = true
  try {
    const res = await teamApi.getList()
    if (res.code === 200) {
      teams.value = res.data.list
    }
  } catch (e) {
    console.error('加载组队列表失败:', e)
  } finally {
    loading.value = false
  }
}

function createTeam() {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    router.push('/login')
    return
  }
  showCreateDialog.value = true
}

function selectRoute() {
  showRouteSelect.value = true
}

function startDrawing() {
  drawingRoute.value = !drawingRoute.value
  ElMessage.info(drawingRoute.value ? '开始绘制路线，请在地图上点击添加点' : '停止绘制')
  console.log('绘制状态已切换:', drawingRoute.value ? '开始绘制' : '停止绘制')
}

function clearRoute() {
  routeCoordinates.value = []
  routeStartPoint.value = null
  routeEndPoint.value = null
  ElMessage.info('路线已清除')
}

function setStartPoint() {
  if (routeCoordinates.value.length > 0) {
    const firstPoint = routeCoordinates.value[0]
    routeStartPoint.value = { lng: parseFloat(firstPoint[0]), lat: parseFloat(firstPoint[1]) }
    ElMessage.success('起点已设置')
    console.log('起点已设置:', routeStartPoint.value)
  } else {
    ElMessage.warning('请先在地图上添加点')
    console.log('路线坐标数组为空，无法设置起点')
  }
}

function setEndPoint() {
  if (routeCoordinates.value.length > 0) {
    const lastPoint = routeCoordinates.value[routeCoordinates.value.length - 1]
    routeEndPoint.value = { lng: parseFloat(lastPoint[0]), lat: parseFloat(lastPoint[1]) }
    ElMessage.success('终点已设置')
    console.log('终点已设置:', routeEndPoint.value)
  } else {
    ElMessage.warning('请先在地图上添加点')
    console.log('路线坐标数组为空，无法设置终点')
  }
}

function cancelRouteSelect() {
  showRouteSelect.value = false
}

function confirmRouteSelect() {
  if (routeCoordinates.value.length < 2) {
    ElMessage.warning('请至少添加2个点')
    return
  }
  
  if (!routeStartPoint.value || !routeEndPoint.value) {
    ElMessage.warning('请设置起点和终点')
    return
  }
  
  // 计算距离（简单直线距离）
  let totalDistance = 0
  for (let i = 0; i < routeCoordinates.value.length - 1; i++) {
    const p1 = routeCoordinates.value[i]
    const p2 = routeCoordinates.value[i + 1]
    const distance = Math.sqrt(
      Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2)
    ) * 111 // 粗略转换为公里
    totalDistance += distance
  }
  
  // 更新表单数据
  teamForm.value.routeGeom = {
    type: 'LineString',
    coordinates: routeCoordinates.value
  }
  teamForm.value.startLng = routeStartPoint.value.lng
  teamForm.value.startLat = routeStartPoint.value.lat
  teamForm.value.endLng = routeEndPoint.value.lng
  teamForm.value.endLat = routeEndPoint.value.lat
  teamForm.value.startName = `起点 (${parseFloat(routeStartPoint.value.lng).toFixed(4)}, ${parseFloat(routeStartPoint.value.lat).toFixed(4)})`
  teamForm.value.endName = `终点 (${parseFloat(routeEndPoint.value.lng).toFixed(4)}, ${parseFloat(routeEndPoint.value.lat).toFixed(4)})`
  teamForm.value.totalDistance = totalDistance
  
  showRouteSelect.value = false
  ElMessage.success('路线选择成功')
}

async function submitCreate() {
  const valid = await teamFormRef.value.validate().catch(() => false)
  if (!valid) return
  
  creating.value = true
  try {
    const planTime = teamForm.value.planTime || []
    
    // 验证路线数据
    if (!teamForm.value.routeGeom || !teamForm.value.routeGeom.coordinates || teamForm.value.routeGeom.coordinates.length < 2) {
      ElMessage.warning('请先选择骑行路线（至少2个点）')
      creating.value = false
      return
    }
    
    // 确保 routeGeom 格式正确
    const routeGeom = {
      type: 'LineString',
      coordinates: teamForm.value.routeGeom.coordinates.map(coord => [
        parseFloat(coord[0]),
        parseFloat(coord[1])
      ])
    }
    
    // 准备提交数据
    const submitData = {
      title: teamForm.value.title,
      description: teamForm.value.description || '',
      routeGeom: routeGeom,
      startLng: parseFloat(teamForm.value.startLng) || 0,
      startLat: parseFloat(teamForm.value.startLat) || 0,
      startName: teamForm.value.startName || '起点',
      endLng: parseFloat(teamForm.value.endLng) || 0,
      endLat: parseFloat(teamForm.value.endLat) || 0,
      endName: teamForm.value.endName || '终点',
      totalDistance: parseFloat(teamForm.value.totalDistance) || 0,
      planStartTime: planTime[0] || null,
      planEndTime: planTime[1] || null,
      maxMembers: parseInt(teamForm.value.maxMembers) || 10
    }
    
    console.log('提交数据:', submitData)
    
    // 先创建组队活动
    const res = await teamApi.create(submitData)
    
    if (res.code === 200) {
      // 同时保存路线到用户的"我的路线"
      try {
        console.log('准备保存路线:', {
          route_name: teamForm.value.title,
          start_name: teamForm.value.startName || '起点',
          end_name: teamForm.value.endName || '终点',
          total_distance: parseFloat(teamForm.value.totalDistance) || 0,
          total_time: 0,
          start_point: {
            lng: parseFloat(teamForm.value.startLng) || 0,
            lat: parseFloat(teamForm.value.startLat) || 0
          },
          end_point: {
            lng: parseFloat(teamForm.value.endLng) || 0,
            lat: parseFloat(teamForm.value.endLat) || 0
          },
          route_geom: routeGeom
        })
        const routeRes = await userApi.createRoute({
          route_name: teamForm.value.title,
          start_name: teamForm.value.startName || '起点',
          end_name: teamForm.value.endName || '终点',
          total_distance: parseFloat(teamForm.value.totalDistance) || 0,
          total_time: 0, // 组队活动的时间由实际骑行决定
          start_point: {
            lng: parseFloat(teamForm.value.startLng) || 0,
            lat: parseFloat(teamForm.value.startLat) || 0
          },
          end_point: {
            lng: parseFloat(teamForm.value.endLng) || 0,
            lat: parseFloat(teamForm.value.endLat) || 0
          },
          route_geom: routeGeom
        })
        console.log('保存路线成功:', routeRes)
      } catch (e) {
        console.error('保存路线失败:', e)
        console.error('错误响应:', e.response?.data)
        // 保存路线失败不影响组队活动的创建
      }
      
      ElMessage.success('创建成功')
      showCreateDialog.value = false
      loadTeams()
    }
  } catch (e) {
    console.error('创建失败:', e)
    console.error('错误响应:', e.response?.data)
    if (e.response?.status === 500) {
      ElMessage.error(e.response?.data?.message || '服务器内部错误，请稍后重试')
    } else if (e.response?.status === 400) {
      ElMessage.error(e.response?.data?.message || '提交失败，请检查必填项')
    } else {
      ElMessage.error('创建失败，请稍后重试')
    }
  } finally {
    creating.value = false
  }
}

async function viewTeam(id) {
  try {
    const res = await teamApi.getDetail(id)
    if (res.code === 200) {
      currentTeam.value = res.data
      showTeamDetail.value = true
    }
  } catch {
    ElMessage.error('获取详情失败')
  }
}

async function joinTeam() {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    return
  }
  
  joining.value = true
  try {
    const res = await teamApi.join(currentTeam.value.id)
    if (res.code === 200) {
      ElMessage.success('加入成功')
      showTeamDetail.value = false
      loadTeams()
    }
  } catch {
    ElMessage.error('加入失败')
  } finally {
    joining.value = false
  }
}

async function leaveTeam() {
  try {
    const res = await teamApi.leave(currentTeam.value.id)
    if (res.code === 200) {
      ElMessage.success('退出成功')
      showTeamDetail.value = false
      loadTeams()
    }
  } catch {
    ElMessage.error('退出失败')
  }
}

async function joinByCode() {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    return
  }
  
  if (!inviteCode.value) {
    ElMessage.warning('请输入邀请码')
    return
  }
  
  joining.value = true
  try {
    const res = await teamApi.joinByCode({ inviteCode: inviteCode.value })
    if (res.code === 200) {
      ElMessage.success('加入成功')
      showJoinByCode.value = false
      inviteCode.value = ''
      loadTeams()
    }
  } catch {
    ElMessage.error('加入失败')
  } finally {
    joining.value = false
  }
}

function copyInviteCode() {
  navigator.clipboard.writeText(currentTeam.value.invite_code)
  ElMessage.success('已复制邀请码')
}

function formatDate(date) {
  return date ? dayjs(date).format('MM-DD HH:mm') : '待定'
}
</script>

<style lang="scss" scoped>
.team-page {
  padding: 20px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.team-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.team-item {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  
  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }
  
  .team-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    
    .team-title {
      font-size: 16px;
      font-weight: 600;
    }
  }
  
  .team-desc {
    color: #666;
    font-size: 14px;
    margin-bottom: 15px;
    line-height: 1.5;
  }
  
  .team-info {
    display: flex;
    gap: 20px;
    margin-bottom: 15px;
    
    .info-item {
      display: flex;
      align-items: center;
      gap: 5px;
      color: #999;
      font-size: 13px;
    }
  }
  
  .team-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 15px;
    border-top: 1px solid #f0f0f0;
    
    .creator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    
    .invite-code {
      font-size: 12px;
      color: #999;
    }
  }
}

.team-detail {
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  }
  
  .detail-desc {
    color: #666;
    margin-bottom: 20px;
  }
  
  .detail-stats {
    display: flex;
    justify-content: center;
    gap: 60px;
    margin-bottom: 20px;
    
    .stat {
      text-align: center;
      
      .value {
        font-size: 28px;
        font-weight: 600;
        color: #409eff;
      }
      
      .label {
        display: block;
        font-size: 12px;
        color: #999;
      }
    }
  }
  
  .members-section {
    margin-bottom: 20px;
    
    h4 {
      margin-bottom: 10px;
    }
    
    .member-list {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
    }
    
    .member-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }
  
  .invite-section {
    text-align: center;
    padding: 15px;
    background: #f5f7fa;
    border-radius: 8px;
  }
}

/* 路线选择相关样式 */
.route-select-container {
  position: relative;
  height: 400px;
  
  .map-box {
    height: 100%;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .route-controls {
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    z-index: 10;
    display: flex;
    gap: 10px;
    
    .el-button {
      background-color: white;
      opacity: 0.9;
    }
  }
  
  .route-info {
    position: absolute;
    bottom: 10px;
    left: 10px;
    right: 10px;
    z-index: 10;
    background-color: white;
    padding: 10px;
    border-radius: 4px;
    opacity: 0.9;
    font-size: 12px;
    
    p {
      margin: 5px 0;
    }
  }
}
</style>
