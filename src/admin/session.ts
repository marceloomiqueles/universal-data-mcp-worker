import {
  inject,
  reactive,
  type App,
  type InjectionKey,
  type UnwrapNestedRefs,
} from 'vue'

type SessionStatus = 'loading' | 'setup' | 'login' | 'authenticated' | 'error'

interface SessionOwner {
  username: string
}

interface SessionResponse {
  authenticated: true
  owner: SessionOwner
  expiresAt: string
}

interface SetupStatusResponse {
  setupRequired: boolean
}

interface ApiErrorResponse {
  error?: {
    code?: string
    message?: string
  }
}

interface SessionState {
  status: SessionStatus
  owner: SessionOwner | null
  expiresAt: string | null
  bootstrapAvailable: boolean
  pending: boolean
  error: string | null
}

interface BrowserLocation {
  hash: string
  pathname: string
  search: string
}

interface BrowserHistory {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void
}

interface SessionOptions {
  fetch?: typeof fetch
  location?: BrowserLocation
  history?: BrowserHistory
}

const genericUnavailableMessage =
  'The administration service is unavailable. Check the deployment and try again.'

function isSessionResponse(value: unknown): value is SessionResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SessionResponse>
  return (
    candidate.authenticated === true &&
    typeof candidate.owner?.username === 'string' &&
    typeof candidate.expiresAt === 'string'
  )
}

function isSetupStatusResponse(value: unknown): value is SetupStatusResponse {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as Partial<SetupStatusResponse>).setupRequired === 'boolean'
  )
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function apiMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback
  const message = (value as ApiErrorResponse).error?.message
  return typeof message === 'string' ? message : fallback
}

export interface AdminSession {
  state: UnwrapNestedRefs<SessionState>
  initialize(): Promise<void>
  setup(username: string, password: string): Promise<boolean>
  login(username: string, password: string): Promise<boolean>
  logout(): Promise<boolean>
}

export function createAdminSession(options: SessionOptions = {}): AdminSession {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis)
  const browserLocation = options.location ?? globalThis.location
  const browserHistory = options.history ?? globalThis.history
  let bootstrapProof: string | null = null
  let initialized = false
  let initializing: Promise<void> | null = null

  const state = reactive<SessionState>({
    status: 'loading',
    owner: null,
    expiresAt: null,
    bootstrapAvailable: false,
    pending: false,
    error: null,
  })

  function captureBootstrapProof(): void {
    const hash = browserLocation.hash.startsWith('#')
      ? browserLocation.hash.slice(1)
      : browserLocation.hash
    const proof = new URLSearchParams(hash).get('bootstrap')
    if (!proof) return

    bootstrapProof = proof
    state.bootstrapAvailable = true
    browserHistory.replaceState(
      null,
      '',
      `${browserLocation.pathname}${browserLocation.search}`,
    )
  }

  function clearBootstrapProof(): void {
    bootstrapProof = null
    state.bootstrapAvailable = false
  }

  async function resolveUnauthenticatedState(): Promise<void> {
    const response = await request('/api/auth/setup-status', {
      credentials: 'same-origin',
    })
    const body = await safeJson(response)
    if (!response.ok || !isSetupStatusResponse(body)) {
      throw new Error('Setup status is unavailable')
    }

    state.status = body.setupRequired ? 'setup' : 'login'
    if (!body.setupRequired) clearBootstrapProof()
  }

  async function performInitialization(): Promise<void> {
    captureBootstrapProof()
    state.status = 'loading'
    state.error = null

    try {
      const response = await request('/api/auth/session', {
        credentials: 'same-origin',
      })
      const body = await safeJson(response)
      if (response.ok && isSessionResponse(body)) {
        state.owner = body.owner
        state.expiresAt = body.expiresAt
        state.status = 'authenticated'
        clearBootstrapProof()
        return
      }
      if (response.status !== 401) throw new Error('Session is unavailable')

      state.owner = null
      state.expiresAt = null
      await resolveUnauthenticatedState()
    } catch {
      state.status = 'error'
      state.error = genericUnavailableMessage
    } finally {
      initialized = true
    }
  }

  async function initialize(): Promise<void> {
    if (initialized) return
    initializing ??= performInitialization()
    await initializing
  }

  async function authenticate(
    endpoint: '/api/auth/setup' | '/api/auth/login',
    username: string,
    password: string,
  ): Promise<boolean> {
    state.pending = true
    state.error = null

    try {
      const headers = new Headers({ 'content-type': 'application/json' })
      if (endpoint === '/api/auth/setup') {
        if (!bootstrapProof) {
          state.error =
            'Open the authorized setup link supplied for this deployment.'
          return false
        }
        headers.set('x-owner-bootstrap-proof', bootstrapProof)
      }

      const response = await request(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ username, password }),
      })
      const body = await safeJson(response)
      if (!response.ok || !isSessionResponse(body)) {
        state.error = apiMessage(
          body,
          endpoint === '/api/auth/login'
            ? 'Invalid username or password.'
            : 'The owner account could not be created.',
        )
        if (
          endpoint === '/api/auth/setup' &&
          [403, 409].includes(response.status)
        ) {
          clearBootstrapProof()
        }
        return false
      }

      state.owner = body.owner
      state.expiresAt = body.expiresAt
      state.status = 'authenticated'
      clearBootstrapProof()
      return true
    } catch {
      state.error = genericUnavailableMessage
      return false
    } finally {
      state.pending = false
    }
  }

  async function setup(username: string, password: string): Promise<boolean> {
    return authenticate('/api/auth/setup', username, password)
  }

  async function login(username: string, password: string): Promise<boolean> {
    return authenticate('/api/auth/login', username, password)
  }

  async function logout(): Promise<boolean> {
    state.pending = true
    state.error = null

    try {
      const response = await request('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) {
        state.error = 'Sign out failed. Try again.'
        return false
      }

      state.owner = null
      state.expiresAt = null
      state.status = 'login'
      return true
    } catch {
      state.error = genericUnavailableMessage
      return false
    } finally {
      state.pending = false
    }
  }

  return { state, initialize, setup, login, logout }
}

export const adminSessionKey: InjectionKey<AdminSession> =
  Symbol('admin-session')

export function provideAdminSession(app: App, session: AdminSession): void {
  app.provide(adminSessionKey, session)
}

export function useAdminSession(): AdminSession {
  const session = inject(adminSessionKey)
  if (!session) throw new Error('Admin session was not provided')
  return session
}

export const adminSession = createAdminSession()
