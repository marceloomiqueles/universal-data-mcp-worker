import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'

import App from '../src/admin/App.vue'
import HomeView from '../src/admin/views/HomeView.vue'
import LoginView from '../src/admin/views/LoginView.vue'
import NotFoundView from '../src/admin/views/NotFoundView.vue'
import StatusView from '../src/admin/views/StatusView.vue'
import { vuetify } from '../src/admin/vuetify'

let mountedElement: HTMLElement | undefined

afterEach(() => {
  mountedElement?.remove()
  mountedElement = undefined
})

async function renderRoute(path: string): Promise<HTMLElement> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomeView },
      { path: '/login', component: LoginView },
      { path: '/status', component: StatusView },
      { path: '/:pathMatch(.*)*', component: NotFoundView },
    ],
  })

  await router.push(path)
  await router.isReady()

  mountedElement = document.createElement('div')
  document.body.append(mountedElement)
  createApp(App).use(router).use(vuetify).mount(mountedElement)
  await nextTick()

  return mountedElement
}

describe('Admin SPA', () => {
  it('renders the application shell', async () => {
    const element = await renderRoute('/')

    expect(element.textContent).toContain('Administration shell')
    expect(element.textContent).toContain(
      'Product capabilities have not been implemented',
    )
  })

  it('renders a deep-linked route', async () => {
    const element = await renderRoute('/status')

    expect(element.textContent).toContain('Scaffold status')
  })

  it('renders the visual login placeholder without auth behavior', async () => {
    const element = await renderRoute('/login')

    expect(element.textContent).toContain(
      'Authentication is intentionally not implemented',
    )
  })

  it('renders the not-found state', async () => {
    const element = await renderRoute('/missing')

    expect(element.textContent).toContain('Page not found')
  })
})
