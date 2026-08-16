import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router'

import HomeView from './views/HomeView.vue'
import IntegrationsView from './views/IntegrationsView.vue'
import LoadingView from './views/LoadingView.vue'
import LoginView from './views/LoginView.vue'
import NotFoundView from './views/NotFoundView.vue'
import StatusView from './views/StatusView.vue'
import { adminSession, type AdminSession } from './session'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  {
    path: '/integrations',
    name: 'integrations',
    component: IntegrationsView,
  },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/status', name: 'status', component: StatusView },
  { path: '/loading', name: 'loading', component: LoadingView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
]

function safeRedirect(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//')
    ? value
    : '/'
}

export function createAdminRouter(
  history: RouterHistory = createWebHistory(),
  session: AdminSession = adminSession,
) {
  const router = createRouter({ history, routes })

  router.beforeEach(async (to) => {
    await session.initialize()

    if (session.state.status === 'authenticated') {
      if (to.name === 'login' || to.name === 'loading') {
        return safeRedirect(to.query.redirect)
      }
      return true
    }

    if (to.name !== 'login') {
      return { name: 'login', query: { redirect: to.fullPath } }
    }

    return true
  })

  return router
}

export const router = createAdminRouter()
