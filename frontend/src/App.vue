<template>
  <!-- 路由视图容器，用于显示当前路由对应的组件 -->
  <router-view />
</template>

<script setup>
// 导入Vue的生命周期钩子
import { onMounted } from 'vue'
// 导入用户状态管理store
import { useUserStore } from '@/stores/user'

// 创建用户store实例
const userStore = useUserStore()

// 组件挂载时执行的逻辑
onMounted(() => {
  // 从本地存储初始化用户状态
  userStore.initFromStorage()
})
</script>

<style>
/* 设置应用根元素的样式 */
#app {
  width: 100%;
  height: 100%;
}
</style>
