<template>
  <div class="user-layout">
    <header class="header">
      <div class="header-left">
        <router-link to="/" class="logo">
          <el-icon :size="28"><Bicycle /></el-icon>
          <!-- Bicycle 图标：骑行 -->
          <span>骑行智慧民生</span>
        </router-link>
      </div>
      
      <nav class="nav">
        <router-link to="/home" class="nav-item" :class="{ active: $route.path === '/home' }">
          <el-icon><HomeFilled /></el-icon>
          <span>首页</span>
          <!-- HomeFilled 图标：首页 -->
        </router-link>
        <router-link to="/report" class="nav-item" :class="{ active: $route.path === '/report' }">
          <el-icon><Warning /></el-icon>
          <span>民情上报</span>
        </router-link>
        <router-link to="/team" class="nav-item" :class="{ active: $route.path === '/team' }">
          <el-icon><UserFilled /></el-icon>
          <span>组队骑行</span>
        </router-link>
        <router-link to="/challenge" class="nav-item" :class="{ active: $route.path === '/challenge' }">
          <el-icon><Trophy /></el-icon>
          <span>骑行挑战</span>
        </router-link>
        <router-link to="/analysis" class="nav-item" :class="{ active: $route.path === '/analysis' }">
          <el-icon><DataAnalysis /></el-icon>
          <span>民生分析</span>
        </router-link>
      </nav>
      
      <div class="header-right">
        <div class="ai-assistant" @click="showAiChat = true">
          <el-icon :size="20"><ChatDotRound /></el-icon>
          <span>小虔助手</span>
        </div>
        
        <template v-if="userStore.isLoggedIn">
          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" :src="userStore.avatar">
                {{ (userStore.nickname || 'U').charAt(0) }}
              </el-avatar>
              <span class="nickname">{{ userStore.nickname }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="user">
                  <el-icon><User /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item command="admin" v-if="userStore.role === 'admin'">
                  <el-icon><Setting /></el-icon>管理后台
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
        <template v-else>
          <router-link to="/login" class="login-btn">登录</router-link>
          <router-link to="/register" class="register-btn">注册</router-link>
        </template>
      </div>
    </header>
    
    <main class="main">
      <router-view />
    </main>
    
    <AiChat v-model="showAiChat" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import AiChat from '@/components/AiChat.vue'

const router = useRouter()
const userStore = useUserStore()
const showAiChat = ref(false)

const handleCommand = (command) => {
  switch (command) {
    case 'user':
      router.push('/user')
      break
    case 'admin':
      router.push('/admin')
      break
    case 'logout':
      userStore.logout()
      break
  }
}
</script>

<style lang="scss" scoped>
.user-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  height: 60px;
  background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
  display: flex;
  align-items: center;
  padding: 0 20px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.header-left {
  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    font-size: 18px;
    font-weight: 600;
  }
}

.nav {
  display: flex;
  gap: 5px;
  margin-left: 40px;
  
  .nav-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    color: rgba(255,255,255, 0.85);
    border-radius: 4px;
    transition: all 0.3s;
    
    &:hover {
      background: rgba(255,255,255, 0.1);
      color: #fff;
    }
    
    &.active {
      background: rgba(255,255,255, 0.2);
      color: #fff;
    }
  }
}

.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 15px;
}

.ai-assistant {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: rgba(255,255,255, 0.2);
  border-radius: 20px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  
  &:hover {
    background: rgba(255,255,255, 0.3);
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  cursor: pointer;
  
  .nickname {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.login-btn, .register-btn {
  padding: 6px 16px;
  border-radius: 4px;
  color: #fff;
  transition: all 0.3s;
}

.login-btn {
  border: 1px solid rgba(255,255,255, 0.5);
  
  &:hover {
    background: rgba(255,255,255, 0.1);
  }
}

.register-btn {
  background: rgba(255,255,255, 0.2);
  
  &:hover {
    background: rgba(255,255,255, 0.3);
  }
}

.main {
  margin-top: 60px;
  flex: 1;
  background: #f5f7fa;
}
</style>
