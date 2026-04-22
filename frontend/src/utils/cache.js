/**
 * API 响应缓存工具
 * 用于缓存 GET 请求响应，减少服务器压力
 */

class ApiCache {
  constructor() {
    this.cache = new Map()
    this.defaultTTL = 5 * 60 * 1000 // 默认缓存5分钟
  }

  /**
   * 生成缓存key
   * @param {string} url - 请求URL
   * @param {object} params - 请求参数
   * @returns {string}
   */
  generateKey(url, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&')
    return `${url}?${sortedParams}`
  }

  /**
   * 获取缓存数据
   * @param {string} key - 缓存key
   * @returns {object|null}
   */
  get(key) {
    const item = this.cache.get(key)
    if (!item) return null

    // 检查是否过期
    if (Date.now() > item.expireTime) {
      this.cache.delete(key)
      return null
    }

    return item.data
  }

  /**
   * 设置缓存数据
   * @param {string} key - 缓存key
   * @param {any} data - 缓存数据
   * @param {number} ttl - 过期时间(毫秒)
   */
  set(key, data, ttl = this.defaultTTL) {
    this.cache.set(key, {
      data,
      expireTime: Date.now() + ttl
    })
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存key
   */
  delete(key) {
    this.cache.delete(key)
  }

  /**
   * 清除所有缓存
   */
  clear() {
    this.cache.clear()
  }

  /**
   * 清除匹配前缀的缓存
   * @param {string} prefix - URL前缀
   */
  clearByPrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {object}
   */
  getStats() {
    let validCount = 0
    let expiredCount = 0

    for (const item of this.cache.values()) {
      if (Date.now() <= item.expireTime) {
        validCount++
      } else {
        expiredCount++
      }
    }

    return {
      total: this.cache.size,
      valid: validCount,
      expired: expiredCount
    }
  }
}

// 单例模式导出
const apiCache = new ApiCache()

/**
 * 创建带缓存的请求函数
 * @param {Function} requestFn - 请求函数
 * @param {object} options - 配置选项
 * @returns {Function}
 */
export function withCache(requestFn, options = {}) {
  const { ttl = 5 * 60 * 1000, cacheKey: customKey } = options

  return async function cachedRequest(...args) {
    const [url, config = {}] = args
    
    // 只缓存 GET 请求
    if (config.method && config.method.toLowerCase() !== 'get') {
      return requestFn(...args)
    }

    const cacheKey = customKey 
      ? customKey(...args) 
      : apiCache.generateKey(url, config.params)

    // 尝试从缓存获取
    const cached = apiCache.get(cacheKey)
    if (cached) {
      console.log(`[Cache Hit] ${cacheKey}`)
      return cached
    }

    // 发起请求
    const response = await requestFn(...args)
    
    // 缓存成功响应
    if (response && response.code === 200) {
      apiCache.set(cacheKey, response, ttl)
    }

    return response
  }
}

/**
 * 清除指定接口的缓存
 * @param {string} urlPrefix - URL前缀
 */
export function clearCache(urlPrefix) {
  apiCache.clearByPrefix(urlPrefix)
}

/**
 * 清除所有缓存
 */
export function clearAllCache() {
  apiCache.clear()
}

export { apiCache }
export default apiCache
