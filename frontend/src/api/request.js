// 导入Axios库
import axios from 'axios'
// 导入Element Plus消息组件
import { ElMessage } from 'element-plus'
// 导入用户状态管理store
import { useUserStore } from '@/stores/user'
// 导入路由实例
import router from '@/router'
// 导入API缓存工具
import { apiCache } from '@/utils/cache'

// 创建Axios实例
const request = axios.create({
  baseURL: '/api', // API基础路径
  timeout: 30000 // 请求超时时间（30秒）
})

// 需要缓存的接口配置
const cacheConfig = {
  // 上报列表缓存 3 分钟
  '/report/list': { ttl: 3 * 60 * 1000 },
  // 上报统计缓存 5 分钟
  '/report/stats': { ttl: 5 * 60 * 1000 },
  // POI 列表缓存 10 分钟
  '/poi': { ttl: 10 * 60 * 1000 },
  // 用户基础信息缓存 5 分钟
  '/user': { ttl: 5 * 60 * 1000 }
}

// 生成缓存key
function generateCacheKey(config) {
  // 移除baseURL前缀
  const url = config.url.replace(/^\/api/, '')
  // 获取请求参数
  const params = config.params || {}
  // 对参数进行排序，确保相同参数顺序一致
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&')
  // 生成缓存key
  return `${url}?${sortedParams}`
}

// 检查是否需要缓存
function getCacheConfig(url) {
  // 移除baseURL前缀
  const path = url.replace(/^\/api/, '')
  // 遍历缓存配置，检查路径是否匹配
  for (const [prefix, config] of Object.entries(cacheConfig)) {
    if (path.startsWith(prefix)) {
      return config
    }
  }
  return null
}

// 请求拦截器
request.interceptors.request.use(
  config => {
    // 从本地存储获取token
    const token = localStorage.getItem('token')
    // 如果存在token，添加到请求头
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // GET 请求尝试从缓存获取
    if (config.method?.toLowerCase() === 'get') {
      const cacheCfg = getCacheConfig(config.url)
      if (cacheCfg) {
        const cacheKey = generateCacheKey(config)
        const cached = apiCache.get(cacheKey)
        if (cached) {
          // 使用适配器直接返回缓存数据
          config.adapter = () => Promise.resolve({
            data: cached,
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            request: {}
          })
        }
      }
    }

    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  response => {
    const res = response.data
    const config = response.config

    // 处理401未授权错误
    if (res.code === 401) {
      ElMessage.error('登录已过期，请重新登录')
      // 清除本地存储的token和用户信息
      localStorage.removeItem('token')
      localStorage.removeItem('userInfo')
      // 跳转到登录页面
      router.push('/login')
      return Promise.reject(new Error(res.message))
    }

    // 缓存成功的 GET 响应
    if (config.method?.toLowerCase() === 'get' && res.code === 200) {
      const cacheCfg = getCacheConfig(config.url)
      if (cacheCfg && !config.adapter) { // 不是从缓存返回的
        const cacheKey = generateCacheKey(config)
        apiCache.set(cacheKey, res, cacheCfg.ttl)
      }
    }

    return res
  },
  error => {
    console.error('请求错误:', error)

    // 处理401未授权错误
    if (error.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录')
      // 清除本地存储的token和用户信息
      localStorage.removeItem('token')
      localStorage.removeItem('userInfo')
      // 跳转到登录页面
      router.push('/login')
      return Promise.reject(error)
    }

    // 显示错误消息
    ElMessage.error(error.message || '网络请求失败')
    return Promise.reject(error)
  }
)

// 导出Axios实例
export default request
