import {
  createPasswordVerifier,
  createSessionToken,
  digestSecret,
  secretsEqual,
  verifyPassword,
} from './crypto'
import type { IntegrationRegistry } from '../../core/integrations/registry'
import { listIntegrations } from './integrations'
import {
  deleteShopify,
  getShopify,
  putShopify,
  syncShopify,
  verifyShopify,
} from './shopify'

const SESSION_COOKIE = 'admin_session'
const BOOTSTRAP_PROOF_HEADER = 'x-owner-bootstrap-proof'
const SESSION_LIFETIME_SECONDS = 12 * 60 * 60
const LOGIN_RATE_LIMIT_SECONDS = 60
const EXPIRED_SESSION_CLEANUP_LIMIT = 100
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u

export interface AuthEnv {
  DB: D1Database
  LOGIN_RATE_LIMITER: RateLimit
  OWNER_SETUP_TOKEN?: string
  OAUTH_PROVIDER?: OAuthHelpers
  INTEGRATION_SECRETS_KEY?: string
}

interface OwnerRecord {
  id: number
  username: string
  normalized_username: string
  password_verifier: string
}

interface SessionRecord {
  username: string
  expires_at: number
}

export interface AuthenticatedOwner {
  readonly username: string
}

interface Credentials {
  username: string
  password: string
}

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('cache-control', 'no-store')
  return Response.json(data, { status, headers: responseHeaders })
}

function error(
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
): Response {
  return json({ error: { code, message } }, status, headers)
}

function normalizeUsername(username: string): string {
  return username.toLowerCase()
}

function validPassword(password: string): boolean {
  const byteLength = new TextEncoder().encode(password).byteLength
  return password.length >= 12 && password.length <= 128 && byteLength <= 256
}

async function readJson<T>(request: Request): Promise<T | undefined> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return undefined
  }

  try {
    const text = await request.text()
    if (text.length > 4096) return undefined
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

function hasCredentials(value: unknown): value is Credentials {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Credentials>
  return (
    typeof candidate.username === 'string' &&
    typeof candidate.password === 'string'
  )
}

function validateOrigin(request: Request): Response | undefined {
  const origin = request.headers.get('origin')
  if (origin !== new URL(request.url).origin) {
    return error('FORBIDDEN_ORIGIN', 'The request origin is not allowed.', 403)
  }

  return undefined
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  )
}

function requireSecureTransport(request: Request): Response | undefined {
  const url = new URL(request.url)
  if (url.protocol === 'https:' || isLoopbackHostname(url.hostname)) {
    return undefined
  }

  return error(
    'HTTPS_REQUIRED',
    'HTTPS is required for administration requests.',
    426,
    { upgrade: 'TLS/1.2' },
  )
}

function loginRateLimitKey(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'local-development'
}

async function getOwner(db: D1Database): Promise<OwnerRecord | null> {
  return db
    .prepare(
      `SELECT id, username, normalized_username, password_verifier
       FROM owner_credentials
       WHERE id = 1`,
    )
    .first<OwnerRecord>()
}

function cookieToken(request: Request): string | undefined {
  const cookie = request.headers.get('cookie')
  if (!cookie) return undefined

  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === SESSION_COOKIE) return value.join('=') || undefined
  }

  return undefined
}

function sessionCookie(token: string, request: Request): string {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api',
    `Max-Age=${SESSION_LIFETIME_SECONDS}`,
  ]
  if (new URL(request.url).protocol === 'https:') attributes.push('Secure')
  return attributes.join('; ')
}

function expiredSessionCookie(request: Request): string {
  const attributes = [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api',
    'Max-Age=0',
  ]
  if (new URL(request.url).protocol === 'https:') attributes.push('Secure')
  return attributes.join('; ')
}

async function createSession(
  db: D1Database,
  ownerId: number,
  now: number,
): Promise<{
  token: string
  expiresAt: number
  statement: D1PreparedStatement
}> {
  const token = createSessionToken()
  const tokenDigest = await digestSecret(token)
  const expiresAt = now + SESSION_LIFETIME_SECONDS * 1000
  const statement = db
    .prepare(
      `INSERT INTO admin_sessions (token_digest, owner_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(tokenDigest, ownerId, now, expiresAt)

  return { token, expiresAt, statement }
}

async function validateSession(
  request: Request,
  db: D1Database,
  now: number,
): Promise<SessionRecord | null> {
  const token = cookieToken(request)
  if (!token) return null

  const digest = await digestSecret(token)
  const session = await db
    .prepare(
      `SELECT owner_credentials.username, admin_sessions.expires_at
       FROM admin_sessions
       JOIN owner_credentials ON owner_credentials.id = admin_sessions.owner_id
       WHERE admin_sessions.token_digest = ?`,
    )
    .bind(digest)
    .first<SessionRecord>()

  if (!session) return null
  if (session.expires_at <= now) {
    await db
      .prepare('DELETE FROM admin_sessions WHERE token_digest = ?')
      .bind(digest)
      .run()
    return null
  }
  return session
}

export async function authenticatedOwner(
  request: Request,
  env: AuthEnv,
  now = Date.now(),
): Promise<AuthenticatedOwner | null> {
  const session = await validateSession(request, env.DB, now)
  return session ? { username: session.username } : null
}

async function setupStatus(env: AuthEnv): Promise<Response> {
  const owner = await getOwner(env.DB)
  return json({
    setupRequired: owner === null,
    bootstrapConfigured:
      owner === null &&
      typeof env.OWNER_SETUP_TOKEN === 'string' &&
      env.OWNER_SETUP_TOKEN.length >= 32,
  })
}

async function setupOwner(
  request: Request,
  env: AuthEnv,
  now: number,
): Promise<Response> {
  const originError = validateOrigin(request)
  if (originError) return originError

  if (await getOwner(env.DB)) {
    return error('ALREADY_CONFIGURED', 'Owner setup is already complete.', 409)
  }

  const body = await readJson<unknown>(request)
  if (!hasCredentials(body)) {
    return error('INVALID_REQUEST', 'Valid setup details are required.', 400)
  }

  const { username, password } = body
  if (!USERNAME_PATTERN.test(username) || !validPassword(password)) {
    return error('INVALID_REQUEST', 'Valid setup details are required.', 400)
  }

  const bootstrapProof = request.headers.get(BOOTSTRAP_PROOF_HEADER)
  if (
    !env.OWNER_SETUP_TOKEN ||
    env.OWNER_SETUP_TOKEN.length < 32 ||
    !bootstrapProof ||
    bootstrapProof.length > 512 ||
    !(await secretsEqual(bootstrapProof, env.OWNER_SETUP_TOKEN))
  ) {
    return error('SETUP_UNAVAILABLE', 'Owner setup is not authorized.', 403)
  }

  const passwordVerifier = await createPasswordVerifier(password)
  const session = await createSession(env.DB, 1, now)

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO owner_credentials
             (id, username, normalized_username, password_verifier, created_at, credential_updated_at)
           VALUES (1, ?, ?, ?, ?, ?)`,
      ).bind(username, normalizeUsername(username), passwordVerifier, now, now),
      session.statement,
    ])
  } catch (cause) {
    if (await getOwner(env.DB)) {
      return error(
        'ALREADY_CONFIGURED',
        'Owner setup is already complete.',
        409,
      )
    }
    throw cause
  }

  return json(
    {
      authenticated: true,
      owner: { username },
      expiresAt: new Date(session.expiresAt).toISOString(),
    },
    201,
    { 'set-cookie': sessionCookie(session.token, request) },
  )
}

async function login(
  request: Request,
  env: AuthEnv,
  now: number,
): Promise<Response> {
  const originError = validateOrigin(request)
  if (originError) return originError

  const body = await readJson<unknown>(request)
  if (!hasCredentials(body)) {
    return error('INVALID_CREDENTIALS', 'Invalid username or password.', 401)
  }

  const rateLimit = await env.LOGIN_RATE_LIMITER.limit({
    key: loginRateLimitKey(request),
  })
  if (!rateLimit.success) {
    return error(
      'TOO_MANY_ATTEMPTS',
      'Too many sign-in attempts. Try again later.',
      429,
      { 'retry-after': LOGIN_RATE_LIMIT_SECONDS.toString() },
    )
  }

  const owner = await getOwner(env.DB)
  if (!owner) return error('SETUP_REQUIRED', 'Owner setup is required.', 409)

  const passwordMatches = await verifyPassword(
    body.password,
    owner.password_verifier,
  )
  if (
    !passwordMatches ||
    normalizeUsername(body.username) !== owner.normalized_username
  ) {
    return error('INVALID_CREDENTIALS', 'Invalid username or password.', 401)
  }

  await env.DB.prepare(
    `DELETE FROM admin_sessions
     WHERE token_digest IN (
       SELECT token_digest FROM admin_sessions
       WHERE expires_at <= ?
       ORDER BY expires_at
       LIMIT ?
     )`,
  )
    .bind(now, EXPIRED_SESSION_CLEANUP_LIMIT)
    .run()
  const session = await createSession(env.DB, owner.id, now)
  await session.statement.run()

  return json(
    {
      authenticated: true,
      owner: { username: owner.username },
      expiresAt: new Date(session.expiresAt).toISOString(),
    },
    200,
    { 'set-cookie': sessionCookie(session.token, request) },
  )
}

async function currentSession(
  request: Request,
  env: AuthEnv,
  now: number,
): Promise<Response> {
  const session = await validateSession(request, env.DB, now)
  if (!session)
    return error('UNAUTHENTICATED', 'Authentication is required.', 401)

  return json({
    authenticated: true,
    owner: { username: session.username },
    expiresAt: new Date(session.expires_at).toISOString(),
  })
}

async function logout(request: Request, env: AuthEnv): Promise<Response> {
  const originError = validateOrigin(request)
  if (originError) return originError

  const token = cookieToken(request)
  if (!token)
    return error('UNAUTHENTICATED', 'Authentication is required.', 401)

  const digest = await digestSecret(token)
  const result = await env.DB.prepare(
    'DELETE FROM admin_sessions WHERE token_digest = ?',
  )
    .bind(digest)
    .run()
  if (result.meta.changes === 0) {
    return error('UNAUTHENTICATED', 'Authentication is required.', 401)
  }

  return json({ authenticated: false }, 200, {
    'set-cookie': expiredSessionCookie(request),
  })
}

async function mcpGrantStatus(env: AuthEnv): Promise<Response> {
  if (!env.OAUTH_PROVIDER) {
    return error('OAUTH_UNAVAILABLE', 'MCP authorization is unavailable.', 503)
  }
  const grants = await env.OAUTH_PROVIDER.listUserGrants('owner-1', {
    limit: 100,
  })
  return json({ connected: grants.items.length > 0 })
}

async function revokeMcpGrants(
  request: Request,
  env: AuthEnv,
): Promise<Response> {
  const originError = validateOrigin(request)
  if (originError) return originError
  if (!env.OAUTH_PROVIDER) {
    return error('OAUTH_UNAVAILABLE', 'MCP authorization is unavailable.', 503)
  }

  let cursor: string | undefined
  let revoked = 0
  do {
    const grants = await env.OAUTH_PROVIDER.listUserGrants('owner-1', {
      limit: 100,
      cursor,
    })
    for (const grant of grants.items) {
      await env.OAUTH_PROVIDER.revokeGrant(grant.id, 'owner-1')
      revoked += 1
    }
    cursor = grants.cursor
  } while (cursor)

  return json({ revoked })
}

export async function handleAdminApi(
  request: Request,
  env: AuthEnv,
  registry: IntegrationRegistry,
  now = Date.now(),
): Promise<Response> {
  const { pathname } = new URL(request.url)
  const method = request.method.toUpperCase()

  try {
    const transportError = requireSecureTransport(request)
    if (transportError) return transportError

    if (pathname === '/api/auth/setup-status' && method === 'GET') {
      return await setupStatus(env)
    }
    if (pathname === '/api/auth/setup' && method === 'POST') {
      return await setupOwner(request, env, now)
    }
    if (pathname === '/api/auth/login' && method === 'POST') {
      return await login(request, env, now)
    }
    if (pathname === '/api/auth/session' && method === 'GET') {
      return await currentSession(request, env, now)
    }
    if (pathname === '/api/auth/logout' && method === 'POST') {
      return await logout(request, env)
    }

    const session = await validateSession(request, env.DB, now)
    if (!session) {
      return error('UNAUTHENTICATED', 'Authentication is required.', 401)
    }

    if (pathname === '/api/integrations' && method === 'GET') {
      return await listIntegrations(registry, env.DB)
    }
    if (pathname === '/api/integrations/shopify' && method === 'GET') {
      return await getShopify(request, env)
    }
    if (
      pathname === '/api/integrations/shopify/configuration' &&
      method === 'PUT'
    ) {
      const originError = validateOrigin(request)
      return originError ?? (await putShopify(request, env))
    }
    if (pathname === '/api/integrations/shopify/verify' && method === 'POST') {
      const originError = validateOrigin(request)
      return originError ?? (await verifyShopify(env))
    }
    if (pathname === '/api/integrations/shopify/sync' && method === 'POST') {
      const originError = validateOrigin(request)
      return originError ?? (await syncShopify(env))
    }
    if (
      pathname === '/api/integrations/shopify/disconnect' &&
      method === 'POST'
    ) {
      const originError = validateOrigin(request)
      return originError ?? (await deleteShopify(env))
    }
    if (pathname === '/api/mcp/oauth/grants' && method === 'GET') {
      return mcpGrantStatus(env)
    }
    if (pathname === '/api/mcp/oauth/revoke' && method === 'POST') {
      return revokeMcpGrants(request, env)
    }

    return json({ boundary: 'admin-api', status: 'not-implemented' }, 501)
  } catch (cause) {
    console.error('Admin API request failed.', {
      error: cause instanceof Error ? cause.name : 'UnknownError',
      method,
      pathname,
    })
    return error('INTERNAL_ERROR', 'The request could not be completed.', 500)
  }
}
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'
