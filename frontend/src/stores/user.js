import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import router from '@/router'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || 'null'))

  const isLoggedIn = computed(() => !!token.value)
  const role = computed(() => userInfo.value?.role || '')
  const nickname = computed(() => userInfo.value?.nickname || '用户')
  const avatar = computed(() => userInfo.value?.avatar || '')

  function setToken(newToken) {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  function setUserInfo(info) {
    userInfo.value = info
    localStorage.setItem('userInfo', JSON.stringify(info))
  }

  async function login(phone, password) {
    const res = await authApi.login({ phone, password })
    if (res.code === 200) {
      setToken(res.data.token)
      setUserInfo(res.data.user)
    }
    return res
  }

  async function register(data) {
    const res = await authApi.register(data)
    return res
  }

  async function fetchUserInfo() {
    const res = await authApi.getMe()
    if (res.code === 200) {
      setUserInfo(res.data)
    }
    return res
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    router.push('/login')
  }

  function initFromStorage() {
    const storedToken = localStorage.getItem('token')
    const storedUserInfo = localStorage.getItem('userInfo')
    if (storedToken) {
      token.value = storedToken
    }
    if (storedUserInfo) {
      try {
        userInfo.value = JSON.parse(storedUserInfo)
      } catch (e) {
        userInfo.value = null
      }
    }
  }

  function isTokenValid() {
    if (!token.value) return false
    
    try {
      const decoded = JSON.parse(atob(token.value.split('.')[1]))
      const currentTime = Date.now() / 1000
      return decoded.exp > currentTime
    } catch (e) {
      return false
    }
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    role,
    nickname,
    avatar,
    setToken,
    setUserInfo,
    login,
    register,
    fetchUserInfo,
    logout,
    initFromStorage,
    isTokenValid
  }
})
