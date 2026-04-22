<template>
  <div class="admin-poi" v-loading="loading">
    <div class="page-container section-shell">
      <div class="page-header section-header">
        <div>
          <h2>POI 管理</h2>
          <p>支持查看、筛选、编辑和新增数据库中的真实 POI 数据。</p>
        </div>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新增 POI
        </el-button>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ summary.total || 0 }}</div>
          <div class="stat-label">POI 总量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ summary.red_spots || 0 }}</div>
          <div class="stat-label">红色资源</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ summary.disabled || 0 }}</div>
          <div class="stat-label">停用记录</div>
        </div>
      </div>

      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="搜索名称或地址" clearable style="width: 220px" @keyup.enter="loadPois(1)" />
        <el-select v-model="category" clearable placeholder="分类" style="width: 180px">
          <el-option label="全部分类" value="" />
          <el-option v-for="item in categories" :key="item.category" :label="`${item.category}（${item.count}）`" :value="item.category" />
        </el-select>
        <el-select v-model="status" clearable placeholder="状态" style="width: 140px">
          <el-option label="全部状态" value="" />
          <el-option label="正常" value="normal" />
          <el-option label="停用" value="disabled" />
        </el-select>
        <el-checkbox v-model="redOnly">仅看红色资源</el-checkbox>
        <el-button type="primary" @click="loadPois(1)">筛选</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <div class="table-card">
        <el-table :data="pois" style="width: 100%">
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="name" label="名称" min-width="160" />
          <el-table-column prop="category" label="分类" width="140" />
          <el-table-column prop="address" label="地址" min-width="220" show-overflow-tooltip />
          <el-table-column prop="is_red_spot" label="红色资源" width="110">
            <template #default="{ row }">
              <el-tag :type="row.is_red_spot ? 'danger' : 'info'" size="small">
                {{ row.is_red_spot ? '是' : '否' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="safety_rating" label="安全评分" width="110">
            <template #default="{ row }">
              <span>{{ row.safety_rating ?? '--' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'normal' ? 'success' : 'warning'" size="small">
                {{ row.status === 'normal' ? '正常' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="updated_at" label="更新时间" width="170">
            <template #default="{ row }">
              {{ formatDate(row.updated_at || row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click="editPoi(row)">编辑</el-button>
              <el-button type="warning" link @click="toggleStatus(row)">
                {{ row.status === 'normal' ? '停用' : '启用' }}
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
          @current-change="loadPois"
        />
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="editingPoiId ? '编辑 POI' : '新增 POI'" width="680px">
      <el-form :model="poiForm" label-width="96px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="名称">
              <el-input v-model="poiForm.name" placeholder="请输入名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="分类">
              <el-input v-model="poiForm.category" placeholder="如：风景名胜 / 餐饮" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="子分类">
              <el-input v-model="poiForm.subCategory" placeholder="可选" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="poiForm.status" style="width: 100%">
                <el-option label="正常" value="normal" />
                <el-option label="停用" value="disabled" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="地址">
          <el-input v-model="poiForm.address" placeholder="请输入地址" />
        </el-form-item>

        <el-form-item label="描述">
          <el-input v-model="poiForm.description" type="textarea" :rows="3" placeholder="请输入描述" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="安全评分">
              <el-input-number v-model="poiForm.safetyRating" :min="0" :max="5" :step="0.1" :precision="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="景观评分">
              <el-input-number v-model="poiForm.sceneryRating" :min="0" :max="5" :step="0.1" :precision="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="红色资源">
          <el-switch v-model="poiForm.isRedSpot" />
        </el-form-item>

        <el-form-item v-if="poiForm.isRedSpot" label="红色介绍">
          <el-input v-model="poiForm.redDescription" type="textarea" :rows="3" placeholder="请输入红色资源介绍" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="经度">
              <el-input-number v-model="poiForm.lng" :precision="6" :step="0.0001" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="纬度">
              <el-input-number v-model="poiForm.lat" :precision="6" :step="0.0001" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="savePoi">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { poiApi } from '@/api'

const loading = ref(false)
const pois = ref([])
const categories = ref([])
const summary = ref({ total: 0, red_spots: 0, disabled: 0 })
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const keyword = ref('')
const category = ref('')
const status = ref('')
const redOnly = ref(false)

const showDialog = ref(false)
const editingPoiId = ref(null)
const poiForm = ref(createEmptyForm())

onMounted(async () => {
  await Promise.all([loadCategories(), loadPois()])
})

function createEmptyForm() {
  return {
    name: '',
    category: '',
    subCategory: '',
    address: '',
    description: '',
    isRedSpot: false,
    redDescription: '',
    safetyRating: null,
    sceneryRating: null,
    status: 'normal',
    lng: null,
    lat: null
  }
}

async function loadCategories() {
  try {
    const res = await poiApi.getCategories()
    if (res.code === 200) {
      categories.value = res.data || []
    }
  } catch (error) {
    console.error('加载 POI 分类失败:', error)
  }
}

async function loadPois(nextPage = page.value) {
  page.value = nextPage
  loading.value = true
  try {
    const res = await poiApi.getList({
      page: page.value,
      limit: limit.value,
      keyword: keyword.value,
      category: category.value,
      status: status.value,
      isRedSpot: redOnly.value ? true : undefined
    })

    if (res.code === 200) {
      pois.value = res.data.list || []
      total.value = res.data.total || 0
      summary.value = res.data.stats || { total: 0, red_spots: 0, disabled: 0 }
    }
  } catch (error) {
    console.error('加载 POI 失败:', error)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  keyword.value = ''
  category.value = ''
  status.value = ''
  redOnly.value = false
  loadPois(1)
}

function openCreateDialog() {
  editingPoiId.value = null
  poiForm.value = createEmptyForm()
  showDialog.value = true
}

function editPoi(poi) {
  editingPoiId.value = poi.id
  poiForm.value = {
    name: poi.name || '',
    category: poi.category || '',
    subCategory: poi.sub_category || '',
    address: poi.address || '',
    description: poi.description || '',
    isRedSpot: Boolean(poi.is_red_spot),
    redDescription: poi.red_description || '',
    safetyRating: poi.safety_rating ?? null,
    sceneryRating: poi.scenery_rating ?? null,
    status: poi.status || 'normal',
    lng: poi.location?.coordinates?.[0] ?? null,
    lat: poi.location?.coordinates?.[1] ?? null
  }
  showDialog.value = true
}

async function savePoi() {
  if (!poiForm.value.name?.trim()) {
    ElMessage.warning('请先填写 POI 名称')
    return
  }

  try {
    const payload = {
      ...poiForm.value,
      name: poiForm.value.name.trim()
    }

    const res = editingPoiId.value
      ? await poiApi.update(editingPoiId.value, payload)
      : await poiApi.create(payload)

    if (res.code === 200) {
      ElMessage.success(editingPoiId.value ? 'POI 更新成功' : 'POI 新增成功')
      showDialog.value = false
      await Promise.all([loadCategories(), loadPois(page.value)])
    }
  } catch (error) {
    console.error('保存 POI 失败:', error)
  }
}

async function toggleStatus(poi) {
  const nextStatus = poi.status === 'normal' ? 'disabled' : 'normal'
  try {
    const res = await poiApi.update(poi.id, { status: nextStatus })
    if (res.code === 200) {
      ElMessage.success(nextStatus === 'normal' ? 'POI 已启用' : 'POI 已停用')
      await loadPois(page.value)
    }
  } catch (error) {
    console.error('更新 POI 状态失败:', error)
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

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 18px 20px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
  }

  .stat-label {
    margin-top: 6px;
    color: #64748b;
    font-size: 13px;
  }
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 20px;
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

@media (max-width: 900px) {
  .stats-row {
    grid-template-columns: 1fr;
  }
}
</style>
