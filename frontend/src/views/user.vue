<template>
  <div class="user-page">
    <div class="user-header">
      <div class="user-info">
        <el-avatar :size="80" :src="userStore.avatar">
          {{ (userStore.nickname || 'U').charAt(0) }}
        </el-avatar>
        <div class="info-text">
          <h2>{{ userStore.nickname }}</h2>
          <div class="level-info">
            <el-tag type="warning">Lv.{{ userInfo.level || 1 }}</el-tag>
            <span class="points">积分: {{ userInfo.available_points || 0 }}</span>
          </div>
        </div>
      </div>
      <el-button @click="showEditDialog = true">编辑资料</el-button>
    </div>
    
    <div class="stats-row">
      <div class="stat-item" @click="activeTab = 'routes'">
        <div class="stat-value">{{ stats.route_count || 0 }}</div>
        <div class="stat-label">我的路线</div>
      </div>
      <div class="stat-item" @click="activeTab = 'reports'">
        <div class="stat-value">{{ stats.report_count || 0 }}</div>
        <div class="stat-label">民情上报</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ (parseFloat(stats.total_distance || 0) / 1000).toFixed(1) }}</div>
        <div class="stat-label">累计里程(km)</div>
      </div>
      <div class="stat-item" @click="activeTab = 'equipment'">
        <div class="stat-value">{{ equipmentStats.active_count || 0 }}</div>
        <div class="stat-label">我的装备</div>
      </div>
    </div>
    
    <div class="content-section">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="我的路线" name="routes">
          <div class="route-list" v-loading="loadingRoutes">
            <div class="route-item" v-for="route in routes" :key="route.id">
              <div class="route-info">
                <h4>{{ route.route_name }}</h4>
                <p>{{ route.start_name }} → {{ route.end_name }}</p>
                <div class="route-meta">
                  <span>{{ (parseFloat(route.total_distance) || 0).toFixed(1) }}km</span>
                  <span>{{ route.total_time }}分钟</span>
                </div>
              </div>
              <div class="route-actions">
                <el-button type="primary" link @click="viewRoute(route)">查看</el-button>
                <el-button type="danger" link @click="deleteRoute(route.id)">删除</el-button>
              </div>
            </div>
            <el-empty v-if="!loadingRoutes && routes.length === 0" description="暂无路线" />
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="民情上报" name="reports">
          <div class="report-list" v-loading="loadingReports">
            <div class="report-item" v-for="report in reports" :key="report.id">
              <div class="report-info">
                <div class="report-header">
                  <span class="report-type">{{ report.event_type }}</span>
                  <el-tag :type="getStatusType(report.status)" size="small">
                    {{ getStatusText(report.status) }}
                  </el-tag>
                </div>
                <h4>{{ report.title }}</h4>
                <p>{{ report.address }}</p>
              </div>
              <div class="report-time">
                {{ formatDate(report.created_at) }}
              </div>
            </div>
            <el-empty v-if="!loadingReports && reports.length === 0" description="暂无上报" />
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="积分记录" name="points">
          <div class="points-section">
            <div class="points-summary">
              <div class="point-item">
                <span class="label">总积分</span>
                <span class="value">{{ pointsInfo.total_points || 0 }}</span>
              </div>
              <div class="point-item">
                <span class="label">可用积分</span>
                <span class="value primary">{{ pointsInfo.available_points || 0 }}</span>
              </div>
              <div class="point-item">
                <span class="label">已用积分</span>
                <span class="value">{{ pointsInfo.used_points || 0 }}</span>
              </div>
            </div>

            <h4>积分明细</h4>
            <div class="point-logs">
              <div class="log-item" v-for="log in pointLogs" :key="log.id">
                <div class="log-info">
                  <span class="log-desc">{{ log.description }}</span>
                  <span v-if="log.challenge_title" class="log-challenge">
                    🎯 {{ log.challenge_title }}
                  </span>
                  <span class="log-time">{{ formatDate(log.created_at) }}</span>
                </div>
                <span class="log-points" :class="{ positive: log.points > 0 }">
                  {{ log.points > 0 ? '+' : '' }}{{ log.points }}
                </span>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="我的装备" name="equipment">
          <div class="equipment-section">
            <div class="equipment-header">
              <h4>装备管理</h4>
              <el-button type="primary" @click="showAddEquipmentDialog = true">
                <el-icon><Plus /></el-icon>
                添加装备
              </el-button>
            </div>

            <div class="equipment-stats">
              <div class="eq-stat-item">
                <span class="label">在用装备</span>
                <span class="value">{{ equipmentStats.active_count || 0 }}</span>
              </div>
              <div class="eq-stat-item">
                <span class="label">总里程</span>
                <span class="value">{{ (parseFloat(equipmentStats.total_distance) || 0).toFixed(0) }} km</span>
              </div>
              <div class="eq-stat-item warning" v-if="reminders.length > 0">
                <span class="label">待保养</span>
                <span class="value">{{ reminders.length }}</span>
              </div>
            </div>

            <div class="equipment-list" v-loading="loadingEquipment">
              <div class="equipment-card" v-for="item in equipmentList" :key="item.id">
                <div class="equipment-info">
                  <div class="equipment-header-row">
                    <h4>{{ item.name }}</h4>
                    <el-tag size="small" :type="item.is_default ? 'success' : 'info'">
                      {{ item.is_default ? '默认' : item.category }}
                    </el-tag>
                  </div>
                  <div class="equipment-meta" v-if="item.brand || item.model">
                    {{ item.brand }} {{ item.model }}
                  </div>
                  <div class="equipment-stats-row">
                    <span>里程: {{ (parseFloat(item.current_mileage) || 0).toFixed(1) }} km</span>
                    <span v-if="item.last_maintenance_date">上次保养: {{ formatDate(item.last_maintenance_date) }}</span>
                  </div>
                </div>
                <div class="equipment-actions">
                  <el-button type="primary" link @click="viewEquipmentDetail(item)">详情</el-button>
                  <el-button type="success" link @click="showMaintenanceDialog(item)">保养</el-button>
                  <el-button type="danger" link @click="deleteEquipment(item.id)">删除</el-button>
                </div>
              </div>
              <el-empty v-if="!loadingEquipment && equipmentList.length === 0" description="暂无装备，点击上方按钮添加" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
    
    <el-dialog v-model="showEditDialog" title="编辑资料" width="400px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="昵称">
          <el-input v-model="editForm.nickname" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="editForm.gender">
            <el-radio value="male">男</el-radio>
            <el-radio value="female">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="生日">
          <el-date-picker v-model="editForm.birthday" type="date" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveProfile">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAddEquipmentDialog" title="添加装备" width="500px">
      <el-form :model="equipmentForm" label-width="90px">
        <el-form-item label="装备名称" required>
          <el-input v-model="equipmentForm.name" placeholder="如：我的山地车" />
        </el-form-item>
        <el-form-item label="装备分类" required>
          <el-select v-model="equipmentForm.category" placeholder="请选择分类" style="width: 100%">
            <el-option v-for="cat in categories" :key="cat.name" :label="cat.name" :value="cat.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="品牌">
          <el-input v-model="equipmentForm.brand" placeholder="如：捷安特" />
        </el-form-item>
        <el-form-item label="型号">
          <el-input v-model="equipmentForm.model" placeholder="如：XTC800" />
        </el-form-item>
        <el-form-item label="购买日期">
          <el-date-picker v-model="equipmentForm.purchase_date" type="date" style="width: 100%" />
        </el-form-item>
        <el-form-item label="购买价格">
          <el-input-number v-model="equipmentForm.purchase_price" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="当前里程(km)">
          <el-input-number v-model="equipmentForm.current_mileage" :min="0" :precision="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="设为默认">
          <el-switch v-model="equipmentForm.is_default" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="equipmentForm.description" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddEquipmentDialog = false">取消</el-button>
        <el-button type="primary" @click="addEquipment">添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showMaintenanceRecordDialog" title="添加保养记录" width="500px">
      <el-form :model="maintenanceForm" label-width="100px">
        <el-form-item label="装备">
          <span>{{ currentEquipment?.name }}</span>
        </el-form-item>
        <el-form-item label="保养类型" required>
          <el-select v-model="maintenanceForm.maintenance_type" placeholder="请选择" style="width: 100%">
            <el-option label="常规保养" value="常规保养" />
            <el-option label="更换轮胎" value="更换轮胎" />
            <el-option label="更换刹车片" value="更换刹车片" />
            <el-option label="链条保养" value="链条保养" />
            <el-option label="变速调试" value="变速调试" />
            <el-option label="全面检修" value="全面检修" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="保养日期" required>
          <el-date-picker v-model="maintenanceForm.maintenance_date" type="date" style="width: 100%" />
        </el-form-item>
        <el-form-item label="保养费用">
          <el-input-number v-model="maintenanceForm.cost" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="保养时里程">
          <el-input-number v-model="maintenanceForm.mileage_at_maintenance" :min="0" :precision="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="维修商家">
          <el-input v-model="maintenanceForm.service_provider" placeholder="维修店名称" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="maintenanceForm.contact_phone" placeholder="商家电话" />
        </el-form-item>
        <el-form-item label="保养描述">
          <el-input v-model="maintenanceForm.description" type="textarea" :rows="2" placeholder="保养详情" />
        </el-form-item>
        <el-form-item label="设置下次提醒">
          <el-switch v-model="maintenanceForm.has_reminder" />
        </el-form-item>
        <template v-if="maintenanceForm.has_reminder">
          <el-form-item label="下次保养日期">
            <el-date-picker v-model="maintenanceForm.next_maintenance_date" type="date" style="width: 100%" />
          </el-form-item>
          <el-form-item label="下次保养里程">
            <el-input-number v-model="maintenanceForm.next_mileage" :min="0" :precision="1" style="width: 100%" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="showMaintenanceRecordDialog = false">取消</el-button>
        <el-button type="primary" @click="addMaintenanceRecord">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEquipmentDetailDialog" title="装备详情" width="600px">
      <el-descriptions :column="2" border v-if="currentEquipment">
        <el-descriptions-item label="装备名称">{{ currentEquipment.name }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ currentEquipment.category }}</el-descriptions-item>
        <el-descriptions-item label="品牌">{{ currentEquipment.brand || '-' }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ currentEquipment.model || '-' }}</el-descriptions-item>
        <el-descriptions-item label="购买日期">{{ currentEquipment.purchase_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="购买价格">{{ currentEquipment.purchase_price ? '¥' + currentEquipment.purchase_price : '-' }}</el-descriptions-item>
        <el-descriptions-item label="累计里程">{{ (parseFloat(currentEquipment.total_distance) || 0).toFixed(1) }} km</el-descriptions-item>
        <el-descriptions-item label="当前里程">{{ (parseFloat(currentEquipment.current_mileage) || 0).toFixed(1) }} km</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="currentEquipment.status === 'active' ? 'success' : 'info'" size="small">
            {{ currentEquipment.status === 'active' ? '在用' : '闲置' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="默认装备">
          <el-tag :type="currentEquipment.is_default ? 'warning' : 'info'" size="small">
            {{ currentEquipment.is_default ? '是' : '否' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ currentEquipment.description || '-' }}</el-descriptions-item>
      </el-descriptions>

      <div class="maintenance-history" v-if="maintenanceHistory.length > 0">
        <h4>保养记录</h4>
        <el-timeline>
          <el-timeline-item v-for="record in maintenanceHistory" :key="record.id" :timestamp="formatDate(record.maintenance_date)" placement="top">
            <el-card size="small">
              <div class="maintenance-item">
                <strong>{{ record.maintenance_type }}</strong>
                <span v-if="record.cost">费用: ¥{{ record.cost }}</span>
                <span v-if="record.service_provider">商家: {{ record.service_provider }}</span>
              </div>
              <p v-if="record.description">{{ record.description }}</p>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>
      <el-empty v-else description="暂无保养记录" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { userApi, routeApi } from '@/api'
import { equipmentApi } from '@/api/equipment'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const activeTab = ref('routes')
const userInfo = ref({})
const stats = ref({})
const routes = ref([])
const reports = ref([])
const pointsInfo = ref({})
const pointLogs = ref([])

const loadingRoutes = ref(false)
const loadingReports = ref(false)

const showEditDialog = ref(false)
const editForm = ref({
  nickname: '',
  gender: '',
  birthday: ''
})

const loadingEquipment = ref(false)
const showAddEquipmentDialog = ref(false)
const showMaintenanceRecordDialog = ref(false)
const showEquipmentDetailDialog = ref(false)

const equipmentList = ref([])
const equipmentStats = ref({})
const categories = ref([])
const reminders = ref([])
const currentEquipment = ref(null)
const maintenanceHistory = ref([])

const equipmentForm = ref({
  name: '',
  category: '',
  brand: '',
  model: '',
  purchase_date: null,
  purchase_price: null,
  current_mileage: 0,
  is_default: false,
  description: ''
})

const maintenanceForm = ref({
  maintenance_type: '',
  maintenance_date: null,
  cost: 0,
  mileage_at_maintenance: 0,
  service_provider: '',
  contact_phone: '',
  description: '',
  has_reminder: false,
  next_maintenance_date: null,
  next_mileage: null
})

onMounted(() => {
  if (!userStore.isLoggedIn || !userStore.isTokenValid()) {
    ElMessage.warning('请先登录')
    userStore.logout()
    return
  }
  loadUserInfo()
  loadStats()
  loadRoutes()
})

watch(activeTab, (val) => {
  if (val === 'reports') loadReports()
  if (val === 'points') loadPoints()
  if (val === 'equipment') loadEquipment()
})

async function loadUserInfo() {
  try {
    const res = await userApi.getProfile()
    if (res.code === 200) {
      userInfo.value = res.data
      editForm.value = {
        nickname: res.data.nickname,
        gender: res.data.gender,
        birthday: res.data.birthday
      }
    }
  } catch (e) {
    console.error('加载用户信息失败:', e)
    if (e.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      userStore.logout()
    }
  }
}

async function loadStats() {
  try {
    const res = await userApi.getStats()
    if (res.code === 200) {
      stats.value = res.data
    }
  } catch (e) {
    console.error('加载统计失败:', e)
    if (e.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      userStore.logout()
    }
  }
}

async function loadRoutes() {
  loadingRoutes.value = true
  try {
    const res = await userApi.getRoutes({ limit: 20 })
    if (res.code === 200) {
      routes.value = res.data.list
    }
  } catch (e) {
    console.error('加载路线失败:', e)
    if (e.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      userStore.logout()
    }
  } finally {
    loadingRoutes.value = false
  }
}



async function loadReports() {
  loadingReports.value = true
  try {
    const res = await userApi.getReports({ limit: 20 })
    if (res.code === 200) {
      reports.value = res.data.list
    }
  } catch (e) {
    console.error('加载上报失败:', e)
  } finally {
    loadingReports.value = false
  }
}

async function loadPoints() {
  try {
    const res = await userApi.getPoints()
    if (res.code === 200) {
      pointsInfo.value = res.data.points
      pointLogs.value = res.data.logs
    }
  } catch (e) {
    console.error('加载积分失败:', e)
  }
}

async function saveProfile() {
  try {
    const res = await userApi.updateProfile(editForm.value)
    if (res.code === 200) {
      ElMessage.success('保存成功')
      showEditDialog.value = false
      loadUserInfo()
      userStore.fetchUserInfo()
    }
  } catch {
    ElMessage.error('保存失败')
  }
}

async function deleteRoute(id) {
  try {
    await ElMessageBox.confirm('确定删除该路线？', '提示', { type: 'warning' })
    const res = await routeApi.delete(id)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      loadRoutes()
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

function viewRoute() {
  ElMessage.info('路线详情功能开发中')
}

function getStatusType(status) {
  const types = { pending: 'warning', processing: 'primary', completed: 'success', rejected: 'danger' }
  return types[status] || 'info'
}

function getStatusText(status) {
  const texts = { pending: '待受理', processing: '处理中', completed: '已完成', rejected: '已驳回' }
  return texts[status] || status
}

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

async function loadEquipment() {
  loadingEquipment.value = true
  try {
    const [listRes, statsRes, categoriesRes, remindersRes] = await Promise.all([
      equipmentApi.getList({ limit: 50 }),
      equipmentApi.getStats(),
      equipmentApi.getCategories(),
      equipmentApi.getReminders()
    ])
    if (listRes.code === 200) {
      equipmentList.value = listRes.data.list
    }
    if (statsRes.code === 200) {
      equipmentStats.value = statsRes.data
    }
    if (categoriesRes.code === 200) {
      categories.value = categoriesRes.data
    }
    if (remindersRes.code === 200) {
      reminders.value = remindersRes.data
    }
  } catch (e) {
    console.error('加载装备失败:', e)
  } finally {
    loadingEquipment.value = false
  }
}

async function addEquipment() {
  if (!equipmentForm.value.name || !equipmentForm.value.category) {
    ElMessage.warning('请填写装备名称和分类')
    return
  }
  try {
    const res = await equipmentApi.create({
      ...equipmentForm.value,
      purchase_date: equipmentForm.value.purchase_date ? dayjs(equipmentForm.value.purchase_date).format('YYYY-MM-DD') : null
    })
    if (res.code === 200) {
      ElMessage.success('添加成功')
      showAddEquipmentDialog.value = false
      equipmentForm.value = {
        name: '',
        category: '',
        brand: '',
        model: '',
        purchase_date: null,
        purchase_price: null,
        current_mileage: 0,
        is_default: false,
        description: ''
      }
      loadEquipment()
    }
  } catch {
    ElMessage.error('添加失败')
  }
}

async function viewEquipmentDetail(item) {
  try {
    const res = await equipmentApi.getDetail(item.id)
    if (res.code === 200) {
      currentEquipment.value = res.data
      maintenanceHistory.value = res.data.maintenance_history || []
      showEquipmentDetailDialog.value = true
    }
  } catch {
    ElMessage.error('获取详情失败')
  }
}

function showMaintenanceDialog(item) {
  currentEquipment.value = item
  maintenanceForm.value = {
    maintenance_type: '',
    maintenance_date: new Date(),
    cost: 0,
    mileage_at_maintenance: item.current_mileage || 0,
    service_provider: '',
    contact_phone: '',
    description: '',
    has_reminder: false,
    next_maintenance_date: null,
    next_mileage: null
  }
  showMaintenanceRecordDialog.value = true
}

async function addMaintenanceRecord() {
  if (!maintenanceForm.value.maintenance_type || !maintenanceForm.value.maintenance_date) {
    ElMessage.warning('请填写保养类型和日期')
    return
  }
  try {
    const res = await equipmentApi.addMaintenance({
      equipment_id: currentEquipment.value.id,
      ...maintenanceForm.value,
      maintenance_date: dayjs(maintenanceForm.value.maintenance_date).format('YYYY-MM-DD'),
      next_maintenance_date: maintenanceForm.value.next_maintenance_date ? dayjs(maintenanceForm.value.next_maintenance_date).format('YYYY-MM-DD') : null
    })
    if (res.code === 200) {
      ElMessage.success('添加成功')
      showMaintenanceRecordDialog.value = false
      loadEquipment()
    }
  } catch {
    ElMessage.error('添加失败')
  }
}

async function deleteEquipment(id) {
  try {
    await ElMessageBox.confirm('确定删除该装备？', '提示', { type: 'warning' })
    const res = await equipmentApi.delete(id)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      loadEquipment()
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}
</script>

<style lang="scss" scoped>
.user-page {
  padding: 20px;
}

.user-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
  padding: 30px;
  border-radius: 12px;
  color: #fff;
  margin-bottom: 20px;
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 20px;
    
    h2 {
      margin-bottom: 8px;
    }
    
    .level-info {
      display: flex;
      align-items: center;
      gap: 10px;
      
      .points {
        font-size: 14px;
      }
    }
  }
}

.stats-row {
  display: flex;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  
  .stat-item {
    flex: 1;
    text-align: center;
    cursor: pointer;
    
    &:hover {
      background: #f5f7fa;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #409eff;
    }
    
    .stat-label {
      font-size: 13px;
      color: #999;
      margin-top: 5px;
    }
  }
}

.content-section {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
}

.route-list, .report-list {
  .route-item, .report-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 0;
    border-bottom: 1px solid #f0f0f0;
    
    &:last-child {
      border-bottom: none;
    }
  }
}



.report-item {
  .report-info {
    flex: 1;
    
    .report-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 5px;
      
      .report-type {
        font-size: 12px;
        color: #999;
      }
    }
    
    h4 {
      margin-bottom: 5px;
    }
    
    p {
      font-size: 13px;
      color: #999;
    }
  }
}

.points-section {
  .points-summary {
    display: flex;
    gap: 30px;
    margin-bottom: 20px;
    
    .point-item {
      text-align: center;
      
      .label {
        display: block;
        font-size: 13px;
        color: #999;
        margin-bottom: 5px;
      }
      
      .value {
        font-size: 24px;
        font-weight: 600;
        
        &.primary {
          color: #409eff;
        }
      }
    }
  }
  
  .point-logs {
    .log-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;

      .log-info {
        flex: 1;

        .log-desc {
          display: block;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .log-challenge {
          display: inline-block;
          font-size: 12px;
          color: #409eff;
          background: #ecf5ff;
          padding: 2px 8px;
          border-radius: 4px;
          margin-right: 8px;
          margin-bottom: 4px;
        }

        .log-time {
          font-size: 12px;
          color: #999;
        }
      }

      .log-points {
        font-weight: 600;
        font-size: 16px;
        min-width: 60px;
        text-align: right;

        &.positive {
          color: #67c23a;
        }

        &:not(.positive) {
          color: #f56c6c;
        }
      }
    }
  }
}

.equipment-section {
  .equipment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h4 {
      margin: 0;
    }
  }

  .equipment-stats {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    padding: 15px;
    background: #f8fafc;
    border-radius: 8px;

    .eq-stat-item {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .label {
        font-size: 12px;
        color: #999;
      }

      .value {
        font-size: 20px;
        font-weight: 600;
        color: #409eff;
      }

      &.warning .value {
        color: #e6a23c;
      }
    }
  }

  .equipment-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;

    .equipment-card {
      padding: 16px;
      border: 1px solid #ebeef5;
      border-radius: 12px;
      transition: all 0.3s;

      &:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .equipment-info {
        margin-bottom: 12px;

        .equipment-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;

          h4 {
            margin: 0;
            font-size: 16px;
          }
        }

        .equipment-meta {
          font-size: 13px;
          color: #666;
          margin-bottom: 8px;
        }

        .equipment-stats-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 12px;
          color: #999;
        }
      }

      .equipment-actions {
        display: flex;
        gap: 8px;
        padding-top: 12px;
        border-top: 1px solid #f0f0f0;
      }
    }
  }
}

.maintenance-history {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;

  h4 {
    margin-bottom: 16px;
  }

  .maintenance-item {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 8px;

    strong {
      color: #409eff;
    }

    span {
      font-size: 12px;
      color: #666;
    }
  }

  p {
    margin: 8px 0 0;
    font-size: 13px;
    color: #999;
  }
}
</style>
