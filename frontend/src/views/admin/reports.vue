<template>
  <div class="admin-reports" v-loading="loading">
    <div class="page-container section-shell">
      <div class="page-header section-header">
        <div>
          <h2>民情处置</h2>
          <p>支持对真实上报事件进行筛选、查看详情和部门流转。</p>
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="status" placeholder="状态" clearable style="width: 130px">
          <el-option label="全部状态" value="" />
          <el-option label="待处理" value="pending" />
          <el-option label="处理中" value="processing" />
          <el-option label="已完成" value="completed" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
        <el-select v-model="eventType" placeholder="类型" clearable style="width: 140px">
          <el-option label="全部类型" value="" />
          <el-option label="道路破损" value="道路破损" />
          <el-option label="井盖缺失" value="井盖缺失" />
        </el-select>
        <el-button type="primary" @click="loadReports(1)">筛选</el-button>
      </div>

      <div class="table-card">
        <el-table :data="reports" style="width: 100%">
          <el-table-column prop="report_no" label="编号" width="180" />
          <el-table-column prop="event_type" label="类型" width="120" />
          <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
          <el-table-column prop="address" label="地址" min-width="180" show-overflow-tooltip />
          <el-table-column prop="urgency_level" label="紧急度" width="110">
            <template #default="{ row }">
              <el-rate :model-value="row.urgency_level" disabled :max="3" />
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)" size="small">
                {{ getStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="上报时间" width="170">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click="openHandleDialog(row)">处理</el-button>
              <el-button type="info" link @click="viewDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="pagination">
        <el-pagination
          :current-page="page"
          :page-size="limit"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadReports"
        />
      </div>
    </div>

    <el-dialog v-model="showHandleDialog" title="处理上报" width="520px">
      <el-form :model="handleForm" label-width="92px">
        <el-form-item label="状态">
          <el-select v-model="handleForm.status" style="width: 100%">
            <el-option label="处理中" value="processing" />
            <el-option label="已完成" value="completed" />
            <el-option label="已驳回" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item label="派发部门">
          <el-select v-model="handleForm.deptId" clearable style="width: 100%">
            <el-option v-for="dept in depts" :key="dept.id" :label="dept.name" :value="dept.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理备注">
          <el-input v-model="handleForm.handleNote" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showHandleDialog = false">取消</el-button>
        <el-button type="primary" @click="submitHandle">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDetailDialog" title="上报详情" width="640px">
      <el-descriptions v-if="currentReport" :column="1" border>
        <el-descriptions-item label="编号">{{ currentReport.report_no }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ currentReport.event_type }}</el-descriptions-item>
        <el-descriptions-item label="标题">{{ currentReport.title }}</el-descriptions-item>
        <el-descriptions-item label="描述">{{ currentReport.description || '--' }}</el-descriptions-item>
        <el-descriptions-item label="地址">{{ currentReport.address || '--' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentReport.status)">
            {{ getStatusText(currentReport.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="上报人">
          {{ currentReport.user_name || '--' }}{{ currentReport.user_phone ? `（${currentReport.user_phone}）` : '' }}
        </el-descriptions-item>
        <el-descriptions-item label="部门">{{ currentReport.dept_name || '--' }}</el-descriptions-item>
        <el-descriptions-item label="处理备注">{{ currentReport.handle_note || '--' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { adminApi } from '@/api'

const loading = ref(false)
const reports = ref([])
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const status = ref('')
const eventType = ref('')
const depts = ref([])

const showHandleDialog = ref(false)
const showDetailDialog = ref(false)
const currentReport = ref(null)
const handleForm = ref({
  status: 'processing',
  deptId: null,
  handleNote: ''
})

onMounted(async () => {
  await Promise.all([loadReports(), loadDepts()])
})

async function loadReports(nextPage = page.value) {
  page.value = nextPage
  loading.value = true
  try {
    const res = await adminApi.getReports({
      page: page.value,
      limit: limit.value,
      status: status.value,
      eventType: eventType.value
    })

    if (res.code === 200) {
      reports.value = res.data.list || []
      total.value = res.data.total || 0
    }
  } catch (error) {
    console.error('加载上报列表失败:', error)
  } finally {
    loading.value = false
  }
}

async function loadDepts() {
  try {
    const res = await adminApi.getDepts()
    if (res.code === 200) {
      depts.value = res.data || []
    }
  } catch (error) {
    console.error('加载部门列表失败:', error)
  }
}

function openHandleDialog(report) {
  currentReport.value = report
  handleForm.value = {
    status: report.status === 'pending' ? 'processing' : report.status,
    deptId: report.dept_id || null,
    handleNote: report.handle_note || ''
  }
  showHandleDialog.value = true
}

async function submitHandle() {
  if (!currentReport.value) return

  try {
    const res = await adminApi.handleReport(currentReport.value.id, handleForm.value)
    if (res.code === 200) {
      ElMessage.success('上报处理成功')
      showHandleDialog.value = false
      await loadReports(page.value)
    }
  } catch (error) {
    console.error('提交上报处理失败:', error)
  }
}

function viewDetail(report) {
  currentReport.value = report
  showDetailDialog.value = true
}

function getStatusType(value) {
  return {
    pending: 'warning',
    processing: 'primary',
    completed: 'success',
    rejected: 'danger'
  }[value] || 'info'
}

function getStatusText(value) {
  return {
    pending: '待处理',
    processing: '处理中',
    completed: '已完成',
    rejected: '已驳回'
  }[value] || value
}

function formatDate(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '--'
}
</script>

<style lang="scss" scoped>
.section-shell {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  min-height: auto;
  padding: 0;
}

.section-header {
  h2 {
    margin: 0;
    font-size: 28px;
    color: #0f172a;
  }

  p {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 14px;
  }
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.table-card {
  border-radius: 18px;
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
  overflow: hidden;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
