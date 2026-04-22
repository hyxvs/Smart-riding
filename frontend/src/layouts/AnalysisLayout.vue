<template>
  <div class="analysis-layout">
    <el-container>
      <el-aside width="200px" class="analysis-sidebar">
        <el-menu
          :default-active="activeMenu"
          class="analysis-menu"
          router
        >
          <el-menu-item index="/analysis/isochrone">
            <el-icon><MapLocation /></el-icon>
            <span>服务范围分析</span>
          </el-menu-item>
          <el-menu-item index="/analysis/buffer">
            <el-icon><Location /></el-icon>
            <span>周边分析</span>
          </el-menu-item>
          <el-menu-item index="/analysis/route">
            <el-icon><TrendCharts /></el-icon>
            <span>路线分析</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <el-main class="analysis-content">
        <router-view />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { MapLocation, Location, TrendCharts } from '@element-plus/icons-vue';

const route = useRoute();

const activeMenu = computed(() => {
  return route.path;
});
</script>

<style scoped>
.analysis-layout {
  min-height: calc(100vh - 60px);
}

.analysis-layout :deep(.el-container) {
  min-height: inherit;
  align-items: stretch;
}

.analysis-sidebar {
  background-color: #f5f7fa;
  border-right: 1px solid #e4e7ed;
  min-height: inherit;
}

.analysis-menu {
  height: 100%;
  border-right: none;
}

.analysis-content {
  padding: 20px;
  overflow: visible;
}

:deep(.el-menu-item) {
  height: 60px;
  line-height: 60px;
  font-size: 14px;
}

:deep(.el-menu-item.is-active) {
  background-color: #ecf5ff !important;
  color: #409eff !important;
}

:deep(.el-menu-item:hover) {
  background-color: #f0f9eb !important;
}
</style>
