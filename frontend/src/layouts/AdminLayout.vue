<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="brand-badge">
          <el-icon :size="22"><Setting /></el-icon>
        </div>
        <div class="brand-text">
          <strong>管理后台</strong>
          <span>Admin Center</span>
        </div>
      </div>

      <el-menu
        :default-active="$route.path"
        router
        class="sidebar-menu"
        background-color="transparent"
        text-color="#c6d4e1"
        active-text-color="#ffffff"
      >
        <el-menu-item index="/admin/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据概览</span>
        </el-menu-item>

        <el-sub-menu index="user-mgmt">
          <template #title>
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </template>
          <el-menu-item index="/admin/users">用户列表</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="report-mgmt">
          <template #title>
            <el-icon><Warning /></el-icon>
            <span>民情处置</span>
          </template>
          <el-menu-item index="/admin/reports">上报管理</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="analysis-mgmt">
          <template #title>
            <el-icon><DataAnalysis /></el-icon>
            <span>数据分析</span>
          </template>
          <el-menu-item index="/admin/heatmap">热点分析</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="map-mgmt">
          <template #title>
            <el-icon><MapLocation /></el-icon>
            <span>地图数据</span>
          </template>
          <el-menu-item index="/admin/poi">POI 管理</el-menu-item>
          <el-menu-item index="/admin/road">道路分析</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </aside>

    <div class="main-container">
      <header class="admin-header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/admin/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ $route.meta.title || '管理页面' }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-actions">
          <router-link to="/" class="back-link">
            <el-icon><Back /></el-icon>
            <span>返回前台</span>
          </router-link>

          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="36">{{ (displayName || 'A').charAt(0).toUpperCase() }}</el-avatar>
              <div class="user-meta">
                <strong>{{ displayName }}</strong>
                <span>System Administrator</span>
              </div>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="admin-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const displayName = computed(() => userStore.nickname || '管理员')

function handleCommand(command) {
  if (command === 'logout') {
    userStore.logout()
  }
}
</script>

<style lang="scss" scoped>
.admin-layout {
  min-height: 100vh;
  display: flex;
  background: #f3f6fb;
}

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 248px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #223247 0%, #31465f 100%);
  color: #fff;
  box-shadow: 8px 0 30px rgba(15, 23, 42, 0.12);
  z-index: 20;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px 22px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.brand-badge {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong {
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
  }

  span {
    font-size: 12px;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.56);
    text-transform: uppercase;
  }
}

.sidebar-menu {
  flex: 1;
  padding: 14px 10px 18px;
  border-right: none;
}

.main-container {
  flex: 1;
  margin-left: 248px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.admin-header {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 28px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left {
  min-width: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 14px;
  transition: color 0.2s ease;

  &:hover {
    color: #2563eb;
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 14px;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(148, 163, 184, 0.12);
  }
}

.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.25;

  strong {
    color: #0f172a;
    font-size: 15px;
  }

  span {
    color: #64748b;
    font-size: 12px;
  }
}

.admin-main {
  flex: 1;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 28%),
    linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%);
  overflow-y: auto;
}

:deep(.el-menu) {
  border-right: none;
}

:deep(.el-menu-item),
:deep(.el-sub-menu__title) {
  height: 50px;
  margin: 4px 0;
  border-radius: 14px;
}

:deep(.el-menu-item:hover),
:deep(.el-sub-menu__title:hover) {
  background: rgba(255, 255, 255, 0.08) !important;
}

:deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.28), rgba(14, 165, 233, 0.2)) !important;
  box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.18);
}

:deep(.el-sub-menu .el-menu-item) {
  min-width: auto;
  padding-left: 46px !important;
  background: transparent;
}

:deep(.el-breadcrumb__inner),
:deep(.el-breadcrumb__inner a) {
  color: #475569;
  font-weight: 500;
}

:deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: #0f172a;
}

@media (max-width: 1024px) {
  .sidebar {
    width: 220px;
  }

  .main-container {
    margin-left: 220px;
  }

  .admin-header,
  .admin-main {
    padding-left: 20px;
    padding-right: 20px;
  }
}

@media (max-width: 768px) {
  .sidebar {
    position: static;
    width: 100%;
    height: auto;
  }

  .admin-layout {
    flex-direction: column;
  }

  .main-container {
    margin-left: 0;
  }

  .admin-header {
    height: auto;
    padding: 16px 18px;
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .admin-main {
    padding: 18px;
  }
}
</style>
