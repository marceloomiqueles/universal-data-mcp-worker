import { createApp, nextTick } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'

import App from '../src/admin/App.vue'
import { createAdminRouter } from '../src/admin/router'
import { vuetify } from '../src/admin/vuetify'

let mountedElement: HTMLElement | undefined
let mountedApp: ReturnType<typeof createApp> | undefined

afterEach(() => {
  mountedApp?.unmount()
  mountedElement?.remove()
  mountedApp = undefined
  mountedElement = undefined
  window.innerWidth = 1024
  window.dispatchEvent(new Event('resize'))
})

async function renderRoute(path: string): Promise<HTMLElement> {
  const router = createAdminRouter(createMemoryHistory())

  await router.push(path)
  await router.isReady()

  mountedElement = document.createElement('div')
  document.body.append(mountedElement)
  mountedApp = createApp(App)
  mountedApp.use(router).use(vuetify).mount(mountedElement)
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

  it('renders the production loading route', async () => {
    const element = await renderRoute('/loading')

    expect(element.textContent).toContain('Loading application state')
  })

  it('renders the not-found state', async () => {
    const element = await renderRoute('/missing')

    expect(element.textContent).toContain('Page not found')
  })

  it('uses a temporary navigation drawer on narrow screens', async () => {
    window.innerWidth = 375
    window.dispatchEvent(new Event('resize'))
    const element = await renderRoute('/')
    const toggle = element.querySelector<HTMLButtonElement>(
      '[aria-label="Toggle navigation"]',
    )

    expect(toggle).not.toBeNull()
    expect(element.querySelector('.v-navigation-drawer--active')).toBeNull()

    toggle?.click()
    await nextTick()

    expect(element.querySelector('.v-navigation-drawer--active')).not.toBeNull()
  })

  it('keeps persistent navigation on wide screens', async () => {
    window.innerWidth = 1440
    window.dispatchEvent(new Event('resize'))
    const element = await renderRoute('/')

    expect(element.querySelector('[aria-label="Toggle navigation"]')).toBeNull()
    expect(element.querySelector('.v-navigation-drawer--active')).not.toBeNull()
  })
})
