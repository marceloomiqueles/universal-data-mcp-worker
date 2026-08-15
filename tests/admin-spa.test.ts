import { createApp, nextTick, type App as VueApp } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../src/admin/App.vue'
import { createAdminRouter } from '../src/admin/router'
import { createAdminSession, provideAdminSession } from '../src/admin/session'
import { vuetify } from '../src/admin/vuetify'

interface RenderOptions {
  path?: string
  responses?: Response[]
  fetch?: typeof fetch
  hash?: string
  beforeReady?: (element: HTMLElement) => Promise<void> | void
}

let mountedElement: HTMLElement | undefined
let mountedApp: VueApp<Element> | undefined

afterEach(() => {
  mountedApp?.unmount()
  mountedElement?.remove()
  mountedApp = undefined
  mountedElement = undefined
  vi.restoreAllMocks()
  window.innerWidth = 1024
  window.dispatchEvent(new Event('resize'))
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function authenticated(username = 'owner'): Response {
  return json({
    authenticated: true,
    owner: { username },
    expiresAt: '2026-08-16T12:00:00.000Z',
  })
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

async function render(options: RenderOptions = {}) {
  const responseQueue = [...(options.responses ?? [])]
  const request =
    options.fetch ??
    vi.fn<typeof fetch>(async () => {
      const response = responseQueue.shift()
      if (!response) throw new Error('No mock response available')
      return response
    })
  const replaceState = vi.fn()
  const session = createAdminSession({
    fetch: request,
    location: {
      hash: options.hash ?? '',
      pathname: options.path ?? '/',
      search: '',
    },
    history: { replaceState },
  })
  const router = createAdminRouter(createMemoryHistory(), session)
  const navigation = router.push(options.path ?? '/')

  if (!options.beforeReady) {
    await navigation
    await router.isReady()
  }

  mountedElement = document.createElement('div')
  document.body.append(mountedElement)
  mountedApp = createApp(App)
  provideAdminSession(mountedApp, session)
  mountedApp.use(router).use(vuetify).mount(mountedElement)

  await options.beforeReady?.(mountedElement)
  if (options.beforeReady) {
    await navigation
    await router.isReady()
  }
  await settle()

  return { element: mountedElement, request, replaceState, router, session }
}

function inputs(element: HTMLElement): HTMLInputElement[] {
  return [...element.querySelectorAll<HTMLInputElement>('input')]
}

function enter(input: HTMLInputElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function submit(element: HTMLElement): Promise<void> {
  element
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}

describe('Admin session UI', () => {
  it('shows first-run setup and removes the bootstrap proof from the address bar', async () => {
    const { element, replaceState } = await render({
      path: '/login',
      hash: '#bootstrap=one-time-proof',
      responses: [json({ error: {} }, 401), json({ setupRequired: true })],
    })

    expect(element.textContent).toContain('Set up your account')
    expect(element.textContent).toContain(
      'Create the administrator account for this self-hosted deployment.',
    )
    expect(element.textContent).not.toContain('Setup code')
    expect(inputs(element)).toHaveLength(3)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/login')
  })

  it('explains when the authorized setup context is missing', async () => {
    const { element } = await render({
      path: '/login',
      responses: [json({ error: {} }, 401), json({ setupRequired: true })],
    })

    expect(element.textContent).toContain(
      'Open the authorized setup link supplied for this deployment.',
    )
    expect(
      element.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    ).toBe(true)
  })

  it('shows normal login when an owner exists without a session', async () => {
    const { element } = await render({
      path: '/login',
      responses: [json({ error: {} }, 401), json({ setupRequired: false })],
    })

    expect(element.textContent).toContain('Sign in')
    expect(inputs(element)).toHaveLength(2)
  })

  it('restores an existing session and renders the authenticated shell', async () => {
    const { element, router } = await render({
      path: '/status',
      responses: [authenticated('marcelo')],
    })

    expect(router.currentRoute.value.path).toBe('/status')
    expect(element.textContent).toContain('Scaffold status')
    expect(element.textContent).toContain('marcelo')
    expect(element.textContent).toContain('Sign out')
  })

  it('creates the first owner without placing bootstrap proof in account data', async () => {
    const localStorageWrite = vi.spyOn(window.localStorage, 'setItem')
    const sessionStorageWrite = vi.spyOn(window.sessionStorage, 'setItem')
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: {} }, 401))
      .mockResolvedValueOnce(json({ setupRequired: true }))
      .mockResolvedValueOnce(authenticated('owner'))
    const { element } = await render({
      path: '/login',
      hash: '#bootstrap=one-time-proof',
      fetch: request,
    })
    const [username, password, confirmation] = inputs(element)
    enter(username!, 'owner')
    enter(password!, 'a-secure-password')
    enter(confirmation!, 'a-secure-password')

    await submit(element)

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Administration shell')
    })
    const [, setupOptions] = request.mock.calls[2]!
    const headers = new Headers(setupOptions?.headers)
    expect(headers.get('x-owner-bootstrap-proof')).toBe('one-time-proof')
    expect(JSON.parse(String(setupOptions?.body))).toEqual({
      username: 'owner',
      password: 'a-secure-password',
    })
    expect(localStorageWrite).not.toHaveBeenCalled()
    expect(sessionStorageWrite).not.toHaveBeenCalled()
  })

  it('rejects mismatched setup passwords before calling the API', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: {} }, 401))
      .mockResolvedValueOnce(json({ setupRequired: true }))
    const { element } = await render({
      path: '/login',
      hash: '#bootstrap=one-time-proof',
      fetch: request,
    })
    const [username, password, confirmation] = inputs(element)
    enter(username!, 'owner')
    enter(password!, 'a-secure-password')
    enter(confirmation!, 'a-different-password')

    await submit(element)

    expect(element.textContent).toContain('Passwords do not match.')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('signs in with the browser-managed cookie session', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: {} }, 401))
      .mockResolvedValueOnce(json({ setupRequired: false }))
      .mockResolvedValueOnce(authenticated())
    const { element } = await render({ path: '/login', fetch: request })
    const [username, password] = inputs(element)
    enter(username!, 'owner')
    enter(password!, 'a-secure-password')

    await submit(element)

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Administration shell')
    })
    expect(request.mock.calls[2]?.[1]?.credentials).toBe('same-origin')
  })

  it('shows a generic failed-login response', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: {} }, 401))
      .mockResolvedValueOnce(json({ setupRequired: false }))
      .mockResolvedValueOnce(
        json(
          {
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid username or password.',
            },
          },
          401,
        ),
      )
    const { element } = await render({ path: '/login', fetch: request })
    const [username, password] = inputs(element)
    enter(username!, 'owner')
    enter(password!, 'incorrect-password')

    await submit(element)

    expect(element.textContent).toContain('Invalid username or password.')
    expect(element.textContent).toContain('Sign in')
  })

  it('logs out and returns to the unauthenticated state', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(authenticated())
      .mockResolvedValueOnce(json({ success: true }))
    const { element } = await render({ path: '/', fetch: request })

    ;[...element.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Sign out'))
      ?.click()
    await settle()

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Sign in')
    })
    expect(element.textContent).not.toContain('Administration shell')
    expect(request.mock.calls[1]?.[0]).toBe('/api/auth/logout')
  })

  it('redirects protected navigation to login for an unauthenticated user', async () => {
    const { element, router } = await render({
      path: '/status',
      responses: [json({ error: {} }, 401), json({ setupRequired: false })],
    })

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/status')
    expect(element.textContent).toContain('Sign in')
  })

  it('does not render authenticated content while session resolution is pending', async () => {
    let resolveSession!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveSession = resolve
    })
    const request = vi.fn<typeof fetch>(() => pending)

    await render({
      path: '/',
      fetch: request,
      beforeReady: async (element) => {
        await nextTick()
        expect(element.textContent).toContain('Loading administration session')
        expect(element.textContent).not.toContain('Administration shell')
        resolveSession(authenticated())
      },
    })
  })

  it('shows an actionable error when the session API is unavailable', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('offline'))
    const { element } = await render({ path: '/login', fetch: request })

    expect(element.textContent).toContain(
      'The administration service is unavailable. Check the deployment and try again.',
    )
  })
})

describe('Authenticated application shell', () => {
  async function renderAuthenticated(path = '/') {
    return render({ path, responses: [authenticated()] })
  }

  it('renders the production not-found route', async () => {
    const { element } = await renderAuthenticated('/missing')
    expect(element.textContent).toContain('Page not found')
  })

  it('uses a temporary navigation drawer on narrow screens', async () => {
    window.innerWidth = 375
    window.dispatchEvent(new Event('resize'))
    const { element } = await renderAuthenticated()
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
    const { element } = await renderAuthenticated()

    expect(element.querySelector('[aria-label="Toggle navigation"]')).toBeNull()
    expect(element.querySelector('.v-navigation-drawer--active')).not.toBeNull()
  })
})
