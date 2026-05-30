<template>
  <div class="report-page">
    <div class="page-container">
      <div class="page-header">
        <h2 class="page-title">民情上报</h2>
      </div>
      
      <!-- 上报表单 -->
      <div class="report-form">
        <el-form :model="reportForm" :rules="rules" ref="formRef" label-width="100px">
          <!-- 问题类型 -->
          <el-form-item label="问题类型" prop="eventType">
            <el-select v-model="reportForm.eventType" placeholder="请选择问题类型" style="width: 100%">
              <el-option label="道路破损" value="道路破损" />
              <el-option label="井盖缺失" value="井盖缺失" />
              <el-option label="路灯故障" value="路灯故障" />
              <el-option label="交通信号" value="交通信号" />
              <el-option label="违章停车" value="违章停车" />
              <el-option label="垃圾堆积" value="垃圾堆积" />
              <el-option label="绿化问题" value="绿化问题" />
              <el-option label="其他问题" value="其他" />
            </el-select>
          </el-form-item>
          
          <!-- 问题标题 -->
          <el-form-item label="问题标题" prop="title">
            <el-input v-model="reportForm.title" placeholder="简要描述问题" maxlength="50" show-word-limit />
          </el-form-item>
          
          <!-- 问题描述 -->
          <el-form-item label="问题描述" prop="description">
            <el-input 
              v-model="reportForm.description" 
              type="textarea" 
              :rows="4" 
              placeholder="详细描述问题情况..."
              maxlength="500"
              show-word-limit
            />
          </el-form-item>
          
          <!-- 问题位置 -->
          <el-form-item label="问题位置" prop="address">
            <div class="location-input">
              <el-input v-model="reportForm.address" placeholder="请点击地图选择位置（必选）" readonly />
              <el-button type="primary" @click="showMapSelect = true">
                <el-icon><MapLocation /></el-icon>
                地图选点
              </el-button>
            </div>
            <div v-if="!reportForm.lng || !reportForm.lat" class="location-warning">
              <el-icon><Warning /></el-icon>
              请点击"地图选点"按钮选择位置
            </div>
          </el-form-item>
          
          <!-- 紧急程度 -->
          <el-form-item label="紧急程度">
            <el-rate v-model="reportForm.urgencyLevel" :max="3" show-text :texts="['一般', '较急', '紧急']" />
          </el-form-item>
          
          <!-- 现场照片 -->
          <el-form-item label="现场照片">
            <el-upload
              action="/api/upload"
              list-type="picture-card"
              :file-list="fileList"
              :headers="uploadHeaders"
              :on-success="handleUploadSuccess"
              :on-remove="handleRemove"
              :limit="5"
            >
              <el-icon><Plus /></el-icon>
              <template #tip>
                <div class="el-upload__tip">最多上传5张照片</div>
              </template>
            </el-upload>
          </el-form-item>
          
          <!-- 提交按钮 -->
          <el-form-item>
            <el-button type="primary" size="large" @click="submitReport" :loading="submitting">
              提交上报
            </el-button>
          </el-form-item>
        </el-form>
      </div>
      
      <!-- 我的上报记录 -->
      <div class="my-reports" v-if="userStore.isLoggedIn">
        <h3>我的上报记录</h3>
        <el-table :data="myReports" style="width: 100%">
          <el-table-column prop="report_no" label="编号" width="150" />
          <el-table-column prop="event_type" label="类型" width="100" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="上报时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" link @click="viewReport(row.id)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    
    <!-- 地图选择对话框 -->
    <el-dialog v-model="showMapSelect" title="选择位置" width="800px">
      <div class="map-select-container">
        <MapPicker
          ref="mapPickerRef"
          height="400px"
          @select="handleMapSelect"
        />
      </div>
      <template #footer>
        <el-button @click="showMapSelect = false">取消</el-button>
        <el-button type="primary" @click="confirmLocation">确定</el-button>
      </template>
    </el-dialog>
    
    <!-- 上报详情对话框 -->
    <el-dialog v-model="showReportDetail" title="上报详情" width="600px">
      <el-descriptions :column="1" border v-if="currentReport">
        <el-descriptions-item label="编号">{{ currentReport.report_no }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ currentReport.event_type }}</el-descriptions-item>
        <el-descriptions-item label="标题">{{ currentReport.title }}</el-descriptions-item>
        <el-descriptions-item label="描述">{{ currentReport.description }}</el-descriptions-item>
        <el-descriptions-item label="地址">{{ currentReport.address }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentReport.status)">{{ getStatusText(currentReport.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="处理备注" v-if="currentReport.handle_note">
          {{ currentReport.handle_note }}
        </el-descriptions-item>
      </el-descriptions>
      
      <!-- 评价部分 -->
      <div class="rate-section" v-if="currentReport && currentReport.status === 'completed' && !currentReport.user_rating">
        <h4>请对处理结果进行评价</h4>
        <el-rate v-model="rating" />
        <el-input v-model="feedback" type="textarea" placeholder="请输入您的反馈意见" style="margin-top: 10px" />
        <el-button type="primary" @click="submitRating" style="margin-top: 10px">提交评价</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
// 导入Vue核心功能
import { ref, onMounted } from 'vue'
// 导入Element Plus消息组件
import { ElMessage } from 'element-plus'
// 导入日期处理库
import dayjs from 'dayjs'
// 导入上报相关API
import { reportApi } from '@/api'
// 导入用户状态管理
import { useUserStore } from '@/stores/user'
// 导入地图选择器组件
import MapPicker from '@/components/MapPicker.vue'

// 初始化用户store
const userStore = useUserStore()

// 上传请求头配置
const uploadHeaders = {
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`
}

// 表单引用
const formRef = ref(null)
// 提交状态
const submitting = ref(false)
// 显示地图选择对话框
const showMapSelect = ref(false)
// 显示上报详情对话框
const showReportDetail = ref(false)
// 地图选择器引用
const mapPickerRef = ref(null)
// 我的上报记录
const myReports = ref([])
// 当前查看的上报详情
const currentReport = ref(null)
// 评价分数
const rating = ref(5)
// 评价反馈
const feedback = ref('')
// 上传文件列表
const fileList = ref([])

// 上报表单数据
const reportForm = ref({
  eventType: '', // 问题类型
  title: '', // 问题标题
  description: '', // 问题描述
  address: '', // 问题地址
  lng: null, // 经度
  lat: null, // 纬度
  urgencyLevel: 1, // 紧急程度
  images: [] // 图片列表
})

// 表单验证规则
const rules = {
  eventType: [{ required: true, message: '请选择问题类型', trigger: 'change' }],
  title: [{ required: true, message: '请输入问题标题', trigger: 'blur' }],
  address: [{ required: true, message: '请选择问题位置', trigger: 'blur' }],
  lng: [{ required: true, message: '请选择问题位置', trigger: 'change' }],
  lat: [{ required: true, message: '请选择问题位置', trigger: 'change' }]
}

// 选中的地图位置
let selectedMapLocation = null

// 组件挂载时执行
onMounted(() => {
  // 如果用户已登录，加载上报记录
  if (userStore.isLoggedIn) {
    loadMyReports()
  }
})

// 加载我的上报记录
async function loadMyReports() {
  try {
    const res = await reportApi.getList({ userId: userStore.userInfo.id, limit: 10 })
    if (res.code === 200) {
      myReports.value = res.data.list
    }
  } catch (err) {
    console.error('加载上报记录失败:', err)
  }
}

// 处理地图选点
function handleMapSelect(location) {
  selectedMapLocation = location
  ElMessage.success(`已选择: ${location.address.substring(0, 20)}...`)
}

// 确认位置选择
function confirmLocation() {
  if (selectedMapLocation) {
    reportForm.value.lng = selectedMapLocation.lng
    reportForm.value.lat = selectedMapLocation.lat
    reportForm.value.address = selectedMapLocation.address
    showMapSelect.value = false
    ElMessage.success('位置选择成功')
  } else {
    ElMessage.warning('请在地图上选择位置')
  }
}

// 处理文件上传成功
function handleUploadSuccess(response) {
  if (response.code === 200) {
    reportForm.value.images.push(response.data.url)
  }
}

// 处理文件删除
function handleRemove(file) {
  const fileUrl = file.url || (file.response && file.response.data && file.response.data.url)
  const index = reportForm.value.images.indexOf(fileUrl)
  if (index > -1) {
    reportForm.value.images.splice(index, 1)
  }
}

// 提交上报
async function submitReport() {
  // 检查是否登录
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    return
  }
  
  // 表单验证
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  
  // 检查是否选择了位置
  if (!reportForm.value.lng || !reportForm.value.lat) {
    ElMessage.error('请选择问题位置')
    return
  }
  
  submitting.value = true
  try {
    const res = await reportApi.create(reportForm.value)
    if (res.code === 200) {
      ElMessage.success('上报成功')
      // 重置表单
      formRef.value.resetFields()
      reportForm.value.images = []
      fileList.value = []
      // 重新加载上报记录
      loadMyReports()
    }
  } catch (e) {
    console.error('上报失败:', e)
    if (e.response?.status === 400) {
      ElMessage.error(e.response.data?.message || '提交失败，请检查必填项')
    } else {
      ElMessage.error('上报失败，请稍后重试')
    }
  } finally {
    submitting.value = false
  }
}

// 查看上报详情
async function viewReport(id) {
  try {
    const res = await reportApi.getDetail(id)
    if (res.code === 200) {
      currentReport.value = res.data
      showReportDetail.value = true
    }
  } catch {
    ElMessage.error('获取详情失败')
  }
}

// 提交评价
async function submitRating() {
  try {
    const res = await reportApi.rate(currentReport.value.id, {
      rating: rating.value,
      feedback: feedback.value
    })
    if (res.code === 200) {
      ElMessage.success('评价成功')
      showReportDetail.value = false
      loadMyReports()
    }
  } catch {
    ElMessage.error('评价失败')
  }
}

// 获取状态类型
function getStatusType(status) {
  const types = {
    pending: 'warning', // 待受理
    processing: 'primary', // 处理中
    completed: 'success', // 已完成
    rejected: 'danger' // 已驳回
  }
  return types[status] || 'info'
}

// 获取状态文本
function getStatusText(status) {
  const texts = {
    pending: '待受理',
    processing: '处理中',
    completed: '已完成',
    rejected: '已驳回'
  }
  return texts[status] || status
}

// 格式化时间
function formatTime(time) {
  return dayjs(time).format('YYYY-MM-DD HH:mm')
}
</script>

<style lang="scss" scoped>
/* 上报页面容器样式 */
.report-page {
  padding: 20px;
}

/* 上报表单样式 */
.report-form {
  max-width: 600px;
  margin-bottom: 30px;
}

/* 位置输入容器样式 */
.location-input {
  display: flex;
  gap: 10px;
}

/* 位置警告样式 */
.location-warning {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  padding: 8px 12px;
  background-color: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4px;
  color: #fa8c16;
  font-size: 13px;
}

/* 我的上报记录样式 */
.my-reports {
  h3 {
    margin-bottom: 15px;
  }
}

/* 地图选择容器样式 */
.map-select-container {
  .map-box {
    height: 400px;
    border-radius: 8px;
    overflow: hidden;
  }
}

/* 评价部分样式 */
.rate-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #eee;
  
  h4 {
    margin-bottom: 10px;
  }
}
</style>
