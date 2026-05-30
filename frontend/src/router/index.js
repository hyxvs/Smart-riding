// 导入Vue Router核心功能
import { createRouter, createWebHistory } from 'vue-router'
// 导入用户状态管理store
import { useUserStore } from '@/stores/user'

// 路由配置数组
const routes = [
  {
    path: '/', // 根路径
    component: () => import('@/layouts/UserLayout.vue'), // 用户布局组件
    redirect: '/home', // 默认重定向到首页
    children: [
      {
        path: 'home', // 首页路径
        name: 'Home', // 路由名称
        component: () => import('@/views/home.vue'), // 首页组件
        meta: { title: '首页' } // 页面标题
      },
      {
        path: 'report', // 民情上报路径
        name: 'Report', // 路由名称
        component: () => import('@/views/report.vue'), // 民情上报组件
        meta: { title: '民情上报' } // 页面标题
      },
      {
        path: 'team', // 组队骑行路径
        name: 'Team', // 路由名称
        component: () => import('@/views/team.vue'), // 组队骑行组件
        meta: { title: '组队骑行' } // 页面标题
      },
      {
        path: 'user', // 个人中心路径
        name: 'UserCenter', // 路由名称
        component: () => import('@/views/user.vue'), // 个人中心组件
        meta: { title: '个人中心', requiresAuth: true } // 页面标题和认证要求
      },
      {
        path: 'social',
        name: 'Social',
        component: () => import('@/views/social.vue'),
        meta: { title: '社交广场' }
      },
      {
        path: 'challenge',
        name: 'Challenge',
        component: () => import('@/views/challenge.vue'),
        meta: { title: '骑行挑战' }
      },
      {
        path: 'analysis', // 空间分析路径
        name: 'Analysis', // 路由名称
        component: () => import('@/layouts/AnalysisLayout.vue'), // 分析布局组件
        redirect: '/analysis/isochrone', // 默认重定向到服务范围分析
        meta: { title: '空间分析' }, // 页面标题
        children: [
          {
            path: 'isochrone', // 服务范围分析路径
            name: 'Isochrone', // 路由名称
            component: () => import('@/views/analysis/isochrone.vue'), // 服务范围分析组件
            meta: { title: '服务范围分析' } // 页面标题
          },
          {
            path: 'buffer', // 周边分析路径
            name: 'Buffer', // 路由名称
            component: () => import('@/views/analysis/buffer.vue'), // 周边分析组件
            meta: { title: '周边分析' } // 页面标题
          },
          {
            path: 'route', // 路线分析路径
            name: 'AnalysisRoute', // 路由名称
            component: () => import('@/views/analysis/route.vue'), // 路线分析组件
            meta: { title: '路线分析' } // 页面标题
          },
          {
            path: 'gis', // GIS高级分析路径
            name: 'GisAnalysis', // 路由名称
            component: () => import('@/views/analysis/gis.vue'), // GIS分析组件
            meta: { title: 'GIS空间分析' } // 页面标题
          }
        ]
      }
    ]
  },
  {
    path: '/admin', // 管理员路径
    component: () => import('@/layouts/AdminLayout.vue'), // 管理员布局组件
    redirect: '/admin/dashboard', // 默认重定向到管理首页
    meta: { requiresAdmin: true }, // 需要管理员权限
    children: [
      {
        path: 'dashboard', // 管理首页路径
        name: 'AdminDashboard', // 路由名称
        component: () => import('@/views/admin/dashboard.vue'), // 管理首页组件
        meta: { title: '管理首页' } // 页面标题
      },
      {
        path: 'users', // 用户管理路径
        name: 'AdminUsers', // 路由名称
        component: () => import('@/views/admin/users.vue'), // 用户管理组件
        meta: { title: '用户管理' } // 页面标题
      },
      {
        path: 'reports', // 民情处置路径
        name: 'AdminReports', // 路由名称
        component: () => import('@/views/admin/reports.vue'), // 民情处置组件
        meta: { title: '民情处置' } // 页面标题
      },
      {
        path: 'heatmap', // 热点分析路径
        name: 'AdminHeatmap', // 路由名称
        component: () => import('@/views/admin/heatmap.vue'), // 热点分析组件
        meta: { title: '热点分析' } // 页面标题
      },
      {
        path: 'poi', // POI管理路径
        name: 'AdminPoi', // 路由名称
        component: () => import('@/views/admin/poi.vue'), // POI管理组件
        meta: { title: 'POI 管理' } // 页面标题
      },
      {
        path: 'road', // 道路分析路径
        name: 'AdminRoad', // 路由名称
        component: () => import('@/views/admin/road.vue'), // 道路分析组件
        meta: { title: '道路分析' } // 页面标题
      }
    ]
  },
  {
    path: '/login', // 登录路径
    name: 'Login', // 路由名称
    component: () => import('@/views/auth/login.vue'), // 登录组件
    meta: { title: '登录' } // 页面标题
  },
  {
    path: '/register', // 注册路径
    name: 'Register', // 路由名称
    component: () => import('@/views/auth/register.vue'), // 注册组件
    meta: { title: '注册' } // 页面标题
  },
  {
    path: '/:pathMatch(.*)*', // 404路径
    name: 'NotFound', // 路由名称
    component: () => import('@/views/error/404.vue'), // 404组件
    meta: { title: '页面不存在' } // 页面标题
  }
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(), // 使用HTML5历史模式
  routes // 路由配置
})

// 路由前置守卫
router.beforeEach((to, from, next) => {
  // 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - 骑行智慧民生` : '骑行智慧民生服务平台'

  // 获取用户store实例
  const userStore = useUserStore()

  // 检查是否需要认证
  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    // 未登录则跳转到登录页面
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  // 检查是否需要管理员权限
  if (to.meta.requiresAdmin && userStore.role !== 'admin') {
    // 非管理员则跳转到首页
    next({ name: 'Home' })
    return
  }

  // 继续导航
  next()
})

// 导出路由实例
export default router
