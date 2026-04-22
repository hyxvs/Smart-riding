// 导入Vue核心功能
import { createApp } from 'vue'
// 导入Pinia状态管理库
import { createPinia } from 'pinia'
// 导入Element Plus UI组件库
import ElementPlus from 'element-plus'
// 导入Element Plus样式
import 'element-plus/dist/index.css'
// 导入OpenLayers地图库样式
import 'ol/ol.css'
// 导入Element Plus中文语言包
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
// 导入Element Plus所有图标组件
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

// 导入根组件
import App from './App.vue'
// 导入路由配置
import router from './router'
// 导入全局样式
import './styles/index.scss'

// 创建Vue应用实例
const app = createApp(App)

// 注册所有Element Plus图标组件
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 使用Pinia状态管理
app.use(createPinia())
// 使用Vue Router路由管理
app.use(router)
// 使用Element Plus组件库（配置为中文）
app.use(ElementPlus, { locale: zhCn })

// 将应用挂载到DOM元素#app
app.mount('#app')
