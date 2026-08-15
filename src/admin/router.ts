import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router'

import HomeView from './views/HomeView.vue'
import LoadingView from './views/LoadingView.vue'
import LoginView from './views/LoginView.vue'
import NotFoundView from './views/NotFoundView.vue'
import StatusView from './views/StatusView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/status', name: 'status', component: StatusView },
  { path: '/loading', name: 'loading', component: LoadingView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
]

export function createAdminRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({ history, routes })
}

export const router = createAdminRouter()
