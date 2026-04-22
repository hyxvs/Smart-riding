<template>
  <div class="admin-users" v-loading="loading">
    <div class="page-container section-shell">
      <div class="page-header section-header">
        <div>
          <h2>用户管理</h2>
          <p>支持按昵称、手机号、角色和状态筛选真实用户数据。</p>
        </div>
      </div>

      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="搜索昵称或手机号" style="width: 220px" clearable @keyup.enter="loadUsers(1)">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="role" placeholder="角色" clearable style="width: 130px">
          <el-option label="全部角色" value="" />
          <el-option label="管理员" value="admin" />
          <el-option label="用户" value="user" />
        </el-select>
        <el-select v-model="status" placeholder="状态" clearable style="width: 130px">
          <el-option label="全部状态" value="" />
          <el-option label="正常" value="active" />
          <el-option label="停用" value="disabled" />
        </el-select>
        <el-button type="primary" @click="loadUsers(1)">筛选</el-button>
      </div>

      <div class="table-card">
        <el-table :data="users" style="width: 100%">
          <el-table-column prop="id" label="ID" width="90" />
          <el-table-column prop="nickname" label="昵称" min-width="140" />
          <el-table-column prop="phone" label="手机号" width="150" />
          <el-table-column prop="role" label="角色" width="100">
            <template #default="{ row }">
              <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">
                {{ row.role === 'admin' ? '管理员' : '用户' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="level" label="等级" width="90" />
          <el-table-column prop="total_points" label="积分" width="90" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'warning'" size="small">
                {{ row.status === 'active' ? '正常' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="last_login_at" label="最近登录" width="170">
            <template #default="{ row }">
              {{ formatDate(row.last_login_at) }}
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="注册时间" width="170">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button :type="row.status === 'active' ? 'danger' : 'success'" link @click="toggleStatus(row)">
                {{ row.status === 'active' ? '停用' : '启用' }}
              </el-button>
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
          @current-change="loadUsers"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { adminApi } from '@/api'

const loading = ref(false)
const users = ref([])
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const keyword = ref('')
const role = ref('')
const status = ref('')

onMounted(() => {
  loadUsers()
})

async function loadUsers(nextPage = page.value) {
  page.value = nextPage
  loading.value = true
  try {
    const res = await adminApi.getUsers({
      page: page.value,
      limit: limit.value,
      keyword: keyword.value,
      role: role.value,
      status: status.value
    })
    if (res.code === 200) {
      users.value = res.data.list || []
      total.value = res.data.total || 0
    }
  } catch (error) {
    console.error('加载用户列表失败:', error)
  } finally {
    loading.value = false
  }
}

async function toggleStatus(user) {
  const newStatus = user.status === 'active' ? 'disabled' : 'active'
  const actionText = newStatus === 'disabled' ? '停用' : '启用'

  try {
    await ElMessageBox.confirm(`确定要${actionText}该用户吗？`, '提示', { type: 'warning' })
    const res = await adminApi.updateUserStatus(user.id, { status: newStatus })
    if (res.code === 200) {
      ElMessage.success(`${actionText}成功`)
      loadUsers(page.value)
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('用户状态更新失败')
    }
  }
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
