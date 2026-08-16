import { createApp, nextTick, type App as VueApp } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../src/admin/App.vue'
import { createAdminRouter } from '../src/admin/router'
import { createAdminSession, provideAdminSession } from '../src/admin/session'
import { vuetify } from '../src/admin/vuetify'

Object.defineProperty(globalThis, 'visualViewport', {
  configurable: true,
  value: {
    width: 1024,
    height: 768,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
})

interface RenderOptions {
  path?: string
  responses?: Response[]
  fetch?: typeof fetch
  hash?: string
  hostname?: string
  beforeReady?: (element: HTMLElement) => Promise<void> | void
  navigateOutsideSpa?: (url: string) => void
}

let mountedElement: HTMLElement | undefined
let mountedApp: VueApp<Element> | undefined

afterEach(() => {
  mountedApp?.unmount()
  mountedElement?.remove()
  mountedApp = undefined
  mountedElement = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
      hostname: options.hostname ?? 'localhost',
      pathname: options.path ?? '/',
      search: '',
    },
    history: { replaceState },
  })
  const router = createAdminRouter(
    createMemoryHistory(),
    session,
    options.navigateOutsideSpa,
  )
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

function button(text: string): HTMLButtonElement | undefined {
  const active = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '.v-overlay--active button',
    ),
  ].find((candidate) => candidate.textContent?.trim().includes(text))
  return (
    active ??
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim().includes(text),
    )
  )
}

function shopifyState(
  status: 'not_configured' | 'configured' | 'connected' | 'connection_error',
  overrides: Record<string, unknown> = {},
) {
  return {
    shopDomain: status === 'not_configured' ? null : 'example.myshopify.com',
    clientId: status === 'not_configured' ? null : 'client-id',
    secretConfigured: status !== 'not_configured',
    status,
    verifiedAt: status === 'connected' ? '2026-08-16T12:00:00.000Z' : null,
    lastErrorCode: status === 'connection_error' ? 'AUTH_FAILED' : null,
    ...overrides,
  }
}

function shopifySync(
  status: 'complete' | 'partial' | 'failed',
  overrides: Record<string, unknown> = {},
) {
  return {
    status,
    coverageComplete: status === 'complete',
    continuationAvailable: status === 'partial',
    startedAt: '2026-08-16T18:00:00.000Z',
    completedAt: '2026-08-16T18:01:00.000Z',
    lastErrorCode: status === 'failed' ? 'SOURCE_UNAVAILABLE' : null,
    counts: {
      requests: 2,
      pages: 2,
      products: 18,
      variants: 27,
      inventoryLevels: 29,
    },
    ...overrides,
  }
}

function shopifyOrderSync(
  status: 'complete' | 'partial' | 'failed',
  overrides: Record<string, unknown> = {},
) {
  return {
    status,
    coverageComplete: status === 'complete',
    continuationAvailable: status === 'partial',
    sourceCoverage: 'recent_60_days_only',
    windowStart: '2026-06-17T18:00:00.000Z',
    windowEnd: '2026-08-16T18:00:00.000Z',
    shopTimezone: 'America/Santiago',
    currency: 'CLP',
    startedAt: '2026-08-16T18:00:00.000Z',
    completedAt: '2026-08-16T18:01:00.000Z',
    lastErrorCode: status === 'failed' ? 'SOURCE_UNAVAILABLE' : null,
    counts: { requests: 2, pages: 1, orders: 1, lineItems: 2 },
    ...overrides,
  }
}

function integrationList(
  shopifyStatus:
    | 'not_configured'
    | 'configured'
    | 'connected'
    | 'connection_error' = 'not_configured',
) {
  return {
    integrations: [
      {
        id: 'garmin',
        name: 'Garmin',
        description: 'Garmin integration for health and activity data.',
        status: 'not_configured',
      },
      {
        id: 'shopify',
        name: 'Shopify',
        description:
          'Shopify integration for product, inventory, and recent order sales data.',
        status: shopifyStatus,
      },
    ],
  }
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
      responses: [
        json({ error: {} }, 401),
        json({ setupRequired: true, bootstrapConfigured: true }),
      ],
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
      responses: [
        json({ error: {} }, 401),
        json({ setupRequired: true, bootstrapConfigured: true }),
      ],
    })

    expect(element.textContent).toContain(
      'Open the authorized local setup URL printed by `pnpm setup:url`.',
    )
    expect(
      element.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    ).toBe(true)
  })

  it('explains missing local bootstrap configuration without exposing a secret', async () => {
    const { element } = await render({
      path: '/login',
      responses: [
        json({ error: {} }, 401),
        json({ setupRequired: true, bootstrapConfigured: false }),
      ],
    })

    expect(element.textContent).toContain(
      'Local owner setup is not configured. Run `pnpm setup:local`',
    )
    expect(element.textContent).not.toContain('OWNER_SETUP_TOKEN')
  })

  it('keeps missing-proof production guidance concise', async () => {
    const { element } = await render({
      path: '/login',
      hostname: 'admin.example.test',
      responses: [
        json({ error: {} }, 401),
        json({ setupRequired: true, bootstrapConfigured: true }),
      ],
    })

    expect(element.textContent).toContain(
      'Open the authorized setup link supplied for this deployment.',
    )
    expect(element.textContent).not.toContain('pnpm setup:url')
  })

  it('shows normal login when an owner exists without a session', async () => {
    const { element } = await render({
      path: '/login',
      responses: [
        json({ error: {} }, 401),
        json({ setupRequired: false, bootstrapConfigured: false }),
      ],
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
    const localStorageWrite = vi.fn()
    const sessionStorageWrite = vi.fn()
    Object.defineProperties(window, {
      localStorage: {
        configurable: true,
        value: { setItem: localStorageWrite },
      },
      sessionStorage: {
        configurable: true,
        value: { setItem: sessionStorageWrite },
      },
    })
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: {} }, 401))
      .mockResolvedValueOnce(
        json({ setupRequired: true, bootstrapConfigured: true }),
      )
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
      .mockResolvedValueOnce(
        json({ setupRequired: true, bootstrapConfigured: true }),
      )
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
      .mockResolvedValueOnce(
        json({ setupRequired: false, bootstrapConfigured: false }),
      )
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
      .mockResolvedValueOnce(
        json({ setupRequired: false, bootstrapConfigured: false }),
      )
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
      responses: [
        json({ error: {} }, 401),
        json({ setupRequired: false, bootstrapConfigured: false }),
      ],
    })

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/status')
    expect(element.textContent).toContain('Sign in')
  })

  it('resumes OAuth authorization outside the SPA after restoring a session', async () => {
    const navigateOutsideSpa = vi.fn()
    const redirect =
      '/api/mcp/oauth/authorize?response_type=code&client_id=https%3A%2F%2Fchatgpt.com%2Foauth%2Fclient.json'
    const session = createAdminSession({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(authenticated()),
      location: {
        hash: '',
        hostname: 'localhost',
        pathname: '/login',
        search: `?redirect=${encodeURIComponent(redirect)}`,
      },
      history: { replaceState: vi.fn() },
    })
    const router = createAdminRouter(
      createMemoryHistory(),
      session,
      navigateOutsideSpa,
    )

    await router.push(`/login?redirect=${encodeURIComponent(redirect)}`)
    expect(navigateOutsideSpa).toHaveBeenCalledWith(redirect)
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

  it('exposes Integrations in authenticated navigation', async () => {
    const { element } = await renderAuthenticated()
    const link = [...element.querySelectorAll<HTMLAnchorElement>('a')].find(
      (candidate) => candidate.textContent?.includes('Integrations'),
    )

    expect(link?.getAttribute('href')).toBe('/integrations')
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

describe('Integrations page', () => {
  it('loads and renders the registry response through the production API path', async () => {
    const integrationRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(integrationList()))
      .mockResolvedValueOnce(json(shopifyState('not_configured')))
    vi.stubGlobal('fetch', integrationRequest)

    const { element, router } = await render({
      path: '/integrations',
      responses: [authenticated()],
    })

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Garmin')
    })
    expect(router.currentRoute.value.path).toBe('/integrations')
    expect(element.textContent).toContain(
      'Garmin integration for health and activity data.',
    )
    expect(element.textContent).toContain('Not configured')
    expect(element.textContent).toContain('Shopify')
    expect(integrationRequest).toHaveBeenCalledWith('/api/integrations', {
      credentials: 'same-origin',
    })
  })

  it('saves first configuration without storing the entered secret in browser storage', async () => {
    const localStorageWrite = vi.spyOn(Storage.prototype, 'setItem')
    const sessionStorageWrite = vi.spyOn(window.sessionStorage, 'setItem')
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/api/integrations') return json(integrationList())
      if (input === '/api/integrations/shopify' && !init?.method) {
        return json(shopifyState('not_configured'))
      }
      if (input === '/api/integrations/shopify/configuration') {
        return json(shopifyState('configured'))
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', request)
    const { element } = await render({
      path: '/integrations',
      responses: [authenticated()],
    })
    await vi.waitFor(() => expect(element.textContent).toContain('Shopify'))
    button('Configure')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Shopify connection'),
    )
    expect(document.body.textContent).toContain('same Shopify organization')

    button('Save and continue')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Shop domain and client ID are required.',
      ),
    )
    const dialogInputs = [
      ...document.body.querySelectorAll<HTMLInputElement>('input'),
    ]
    enter(dialogInputs[0]!, 'example.myshopify.com')
    enter(dialogInputs[1]!, 'client-id')
    enter(dialogInputs[2]!, 'entered-secret')
    button('Save and continue')?.click()

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Verify connection'),
    )
    const saveCall = request.mock.calls.find(
      ([url]) => url === '/api/integrations/shopify/configuration',
    )
    expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({
      shopDomain: 'example.myshopify.com',
      clientId: 'client-id',
      clientSecret: 'entered-secret',
    })
    expect(localStorageWrite).not.toHaveBeenCalled()
    expect(sessionStorageWrite).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('entered-secret')
  })

  it('retains an existing secret when blank and replaces it only when entered', async () => {
    const savedBodies: unknown[] = []
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/api/integrations')
        return json(integrationList('configured'))
      if (input === '/api/integrations/shopify' && !init?.method) {
        return json(shopifyState('configured'))
      }
      if (input === '/api/integrations/shopify/configuration') {
        savedBodies.push(JSON.parse(String(init?.body)))
        return json(shopifyState('configured'))
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', request)
    const { element } = await render({
      path: '/integrations',
      responses: [authenticated()],
    })
    await vi.waitFor(() => expect(element.textContent).toContain('Manage'))
    button('Manage')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Edit configuration'),
    )
    button('Edit configuration')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('already stored'),
    )
    button('Save and continue')?.click()
    await vi.waitFor(() => expect(savedBodies).toHaveLength(1))
    expect(savedBodies[0]).toEqual({
      shopDomain: 'example.myshopify.com',
      clientId: 'client-id',
    })

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Edit configuration'),
    )
    button('Edit configuration')?.click()
    await settle()
    const secretInput = [
      ...document.body.querySelectorAll<HTMLInputElement>(
        '.v-overlay--active input',
      ),
    ].at(-1)!
    enter(secretInput, 'replacement-secret')
    await settle()
    button('Save and continue')?.click()
    await vi.waitFor(() => expect(savedBodies).toHaveLength(2))
    expect(savedBodies[1]).toMatchObject({ clientSecret: 'replacement-secret' })
  })

  it('shows verification progress, success, failure, and retry through the real client path', async () => {
    let release!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      release = resolve
    })
    let verificationCount = 0
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/api/integrations')
        return json(
          integrationList(verificationCount > 1 ? 'connected' : 'configured'),
        )
      if (input === '/api/integrations/shopify' && !init?.method)
        return json(
          shopifyState(verificationCount > 1 ? 'connected' : 'configured'),
        )
      if (input === '/api/integrations/shopify/verify') {
        verificationCount += 1
        if (verificationCount === 1) return pending
        return json(shopifyState('connected'))
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', request)
    const { element } = await render({
      path: '/integrations',
      responses: [authenticated()],
    })
    await vi.waitFor(() => expect(element.textContent).toContain('Manage'))
    button('Manage')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Verify connection'),
    )
    button('Verify connection')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Verifying Shopify connection…',
      ),
    )
    release(json(shopifyState('connection_error'), 422))
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Shopify rejected the credentials',
      ),
    )
    button('Verify connection')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Shopify is connected.'),
    )
    expect(document.body.textContent).toContain('Verified')
  })

  it('gives actionable recovery when saved credentials cannot be read', async () => {
    const unavailable = {
      ...shopifyState('connection_error'),
      lastErrorCode: 'CREDENTIALS_UNAVAILABLE',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (input === '/api/integrations')
          return json(integrationList('connection_error'))
        if (input === '/api/integrations/shopify' && !init?.method)
          return json(unavailable)
        throw new Error(`Unexpected request: ${String(input)}`)
      }),
    )
    const { element } = await render({
      path: '/integrations',
      responses: [authenticated()],
    })
    await vi.waitFor(() => expect(element.textContent).toContain('Manage'))
    button('Manage')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Re-enter the Shopify configuration or disconnect the integration.',
      ),
    )
    expect(button('Edit configuration')).not.toBeNull()
    expect(button('Disconnect')).not.toBeNull()
  })

  it('requires confirmation before disconnect and refreshes the listing', async () => {
    let disconnected = false
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/api/integrations')
        return json(
          integrationList(disconnected ? 'not_configured' : 'connected'),
        )
      if (input === '/api/integrations/shopify' && !init?.method)
        return json(shopifyState(disconnected ? 'not_configured' : 'connected'))
      if (input === '/api/integrations/shopify/disconnect') {
        disconnected = true
        return json({ status: 'not_configured' })
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', request)
    const { element } = await render({
      path: '/integrations',
      responses: [authenticated()],
    })
    await vi.waitFor(() => expect(element.textContent).toContain('Connected'))
    button('Manage')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Disconnect'),
    )
    button('Disconnect')?.click()
    expect(disconnected).toBe(false)
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Confirm disconnect'),
    )
    button('Confirm disconnect')?.click()
    await vi.waitFor(() => expect(disconnected).toBe(true))
    await vi.waitFor(() =>
      expect(element.textContent).toContain('Not configured'),
    )
  })

  it('shows never-synced state for a connected Shopify integration', async () => {
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/api/integrations')
        return json(integrationList('connected'))
      if (input === '/api/integrations/shopify' && !init?.method)
        return json(
          shopifyState('connected', {
            sync: null,
            lastSuccessfulSyncAt: null,
          }),
        )
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', request)
    await render({ path: '/integrations', responses: [authenticated()] })
    await vi.waitFor(() => expect(button('Manage')).toBeDefined())
    await settle()
    button('Manage')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Shopify connection'),
    )
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Inventory has never been synchronized.',
      ),
    )
    expect(document.body.textContent).toContain('Last successful sync: Never')
    expect(button('Sync now')).toBeDefined()
    expect(document.body.textContent).toContain(
      'Orders have never been synchronized.',
    )
    expect(document.body.textContent).toContain('recent 60-day window')
    expect(document.body.textContent).toContain(
      'read_all_orders scope permits older orders',
    )
    expect(button('Sync orders now')).toBeDefined()
  })

  it('explains unavailable order access when required scopes are missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (input === '/api/integrations')
          return json(integrationList('connection_error'))
        if (input === '/api/integrations/shopify' && !init?.method)
          return json(
            shopifyState('connection_error', {
              lastErrorCode: 'SCOPE_FAILED',
            }),
          )
        throw new Error(`Unexpected request: ${String(input)}`)
      }),
    )
    await render({ path: '/integrations', responses: [authenticated()] })
    await vi.waitFor(() => expect(button('Manage')).toBeDefined())
    button('Manage')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Order data is unavailable until the Shopify app grants all required read-only order scopes.',
      ),
    )
    expect(button('Sync orders now')).toBeUndefined()
  })

  it('prevents duplicate order sync and renders complete operational state', async () => {
    let release!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      release = resolve
    })
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (input === '/api/integrations')
          return json(integrationList('connected'))
        if (input === '/api/integrations/shopify' && !init?.method)
          return json(shopifyState('connected', { orderSync: null }))
        if (input === '/api/integrations/shopify/orders/sync') {
          calls += 1
          return pending
        }
        throw new Error(`Unexpected request: ${String(input)}`)
      }),
    )
    await render({ path: '/integrations', responses: [authenticated()] })
    await vi.waitFor(() => expect(button('Manage')).toBeDefined())
    button('Manage')?.click()
    await vi.waitFor(() => expect(button('Sync orders now')).toBeDefined())
    const syncButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="shopify-orders-sync-now"]',
    )!
    syncButton.click()
    syncButton.click()
    await vi.waitFor(() => expect(calls).toBe(1))
    expect(syncButton.disabled).toBe(true)

    release(json({ sync: shopifyOrderSync('complete') }))
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Order synchronization completed.',
      ),
    )
    expect(document.body.textContent).toContain('Latest order sync outcome')
    expect(document.body.textContent).toContain('Orders: 1')
    expect(document.body.textContent).toContain('Line items: 2')
    expect(document.body.textContent).toContain('Last order sync')
    expect(document.body.textContent).not.toContain(
      'Stored order coverage is incomplete.',
    )
  })

  it('reports partial and failed order sync without claiming full coverage', async () => {
    const outcomes = [
      json({ sync: shopifyOrderSync('partial') }),
      json({ sync: shopifyOrderSync('failed') }, 502),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (input === '/api/integrations')
          return json(integrationList('connected'))
        if (input === '/api/integrations/shopify' && !init?.method)
          return json(shopifyState('connected', { orderSync: null }))
        if (input === '/api/integrations/shopify/orders/sync')
          return outcomes.shift()!
        throw new Error(`Unexpected request: ${String(input)}`)
      }),
    )
    await render({ path: '/integrations', responses: [authenticated()] })
    await vi.waitFor(() => expect(button('Manage')).toBeDefined())
    button('Manage')?.click()
    await vi.waitFor(() => expect(button('Sync orders now')).toBeDefined())

    button('Sync orders now')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Order synchronization is partial.',
      ),
    )
    expect(document.body.textContent).toContain(
      'Stored order coverage is incomplete.',
    )

    button('Sync orders now')?.click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Order synchronization failed.',
      ),
    )
    expect(document.body.textContent).toContain(
      'Existing stored order data was preserved.',
    )
  })

  it('does not expose synchronization for disconnected Shopify', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (input === '/api/integrations') return json(integrationList())
        if (input === '/api/integrations/shopify' && !init?.method)
          return json(shopifyState('not_configured'))
        throw new Error(`Unexpected request: ${String(input)}`)
      }),
    )
    await render({ path: '/integrations', responses: [authenticated()] })
    await vi.waitFor(() => expect(button('Configure')).toBeDefined())
    button('Configure')?.click()
    await settle()
    expect(button('Sync now')).toBeUndefined()
    expect(button('Sync orders now')).toBeUndefined()
  })

  it('prevents duplicate sync submission and renders successful counts and freshness', async () => {
    let release!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      release = resolve
    })
    let syncCalls = 0
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/api/integrations')
        return json(integrationList('connected'))
      if (input === '/api/integrations/shopify' && !init?.method)
        return json(
          shopifyState('connected', {
            sync: null,
            lastSuccessfulSyncAt: null,
          }),
        )
      if (input === '/api/integrations/shopify/sync') {
        syncCalls += 1
        return pending
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', request)
    await render({ path: '/integrations', responses: [authenticated()] })
    await vi.waitFor(() => expect(button('Manage')).toBeDefined())
    await settle()
    button('Manage')?.click()
    await vi.waitFor(() =>
      expect(
        document.body.querySelector('[data-testid="shopify-sync-now"]'),
      ).not.toBeNull(),
    )
    const syncButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="shopify-sync-now"]',
    )!
    syncButton.click()
    syncButton.click()
    await vi.waitFor(() => expect(syncCalls).toBe(1))
    await vi.waitFor(() => expect(syncButton.disabled).toBe(true))

    release(json({ sync: shopifySync('complete') }))
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Inventory synchronization completed.',
      ),
    )
    expect(document.body.textContent).toContain('Latest outcome')
    expect(document.body.textContent).toContain('Complete')
    expect(document.body.textContent).toContain('Products: 18')
    expect(document.body.textContent).toContain('Variants: 27')
    expect(document.body.textContent).toContain('Inventory levels: 29')
    expect(document.body.textContent).not.toContain(
      'Stored inventory coverage is incomplete.',
    )
  })

  it('reports partial and failed sync outcomes without claiming complete coverage', async () => {
    const outcomes = [
      json({ sync: shopifySync('partial') }),
      json({ sync: shopifySync('failed') }, 502),
    ]
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/api/integrations')
        return json(integrationList('connected'))
      if (input === '/api/integrations/shopify' && !init?.method)
        return json(
          shopifyState('connected', {
            sync: null,
            lastSuccessfulSyncAt: '2026-08-15T12:00:00.000Z',
          }),
        )
      if (input === '/api/integrations/shopify/sync') return outcomes.shift()!
      throw new Error(`Unexpected request: ${String(input)}`)
    })
    vi.stubGlobal('fetch', request)
    await render({ path: '/integrations', responses: [authenticated()] })
    await vi.waitFor(() => expect(button('Manage')).toBeDefined())
    await settle()
    button('Manage')?.click()
    await vi.waitFor(() =>
      expect(
        document.body.querySelector('[data-testid="shopify-sync-now"]'),
      ).not.toBeNull(),
    )

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="shopify-sync-now"]')!
      .click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Inventory synchronization is partial.',
      ),
    )
    expect(document.body.textContent).toContain('Partial')
    expect(document.body.textContent).toContain(
      'Stored inventory coverage is incomplete.',
    )

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="shopify-sync-now"]')!
      .click()
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Inventory synchronization failed.',
      ),
    )
    expect(document.body.textContent).toContain('Failed')
    expect(document.body.textContent).toContain(
      'Stored inventory coverage is incomplete.',
    )
    expect(document.body.textContent).toContain('Last successful sync:')
  })

  it('shows a loading state while the registry request is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => new Promise(() => {})),
    )

    const { element } = await render({
      path: '/integrations',
      responses: [authenticated()],
    })

    expect(element.textContent).toContain('Loading integrations…')
    expect(element.textContent).not.toContain('No integrations')
  })

  it('shows an empty state for a deployment without registered integrations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(json({ integrations: [] })),
    )

    const { element } = await render({
      path: '/integrations',
      responses: [authenticated()],
    })

    await vi.waitFor(() => {
      expect(element.textContent).toContain(
        'No integrations are included in this deployment.',
      )
    })
  })

  it('shows an API failure state without fake integration data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(json({ error: {} }, 500)),
    )

    const { element } = await render({
      path: '/integrations',
      responses: [authenticated()],
    })

    await vi.waitFor(() => {
      expect(element.textContent).toContain(
        'The integration list could not be loaded. Try again later.',
      )
    })
    expect(element.textContent).not.toContain('Garmin')
  })
})
