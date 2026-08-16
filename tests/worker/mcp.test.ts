import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { createIntegrationRegistry } from '../../src/core/integrations/registry'
import { handleRequest, type Env } from '../../src/worker/index'
import { handleMcpRequest } from '../../src/worker/mcp/server'

const origin = 'https://mcp.example.test'
const redirectUri = 'https://client.example.test/callback'
const verifier = 'test-verifier-with-at-least-forty-three-characters-1234567890'
const allowAll: RateLimit = { limit: async () => ({ success: true }) }
const assets = {
  fetch: async () =>
    new Response('<!doctype html><html><body>SPA</body></html>', {
      headers: { 'content-type': 'text/html' },
    }),
}

function workerEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: assets,
    DB: env.DB,
    LOGIN_RATE_LIMITER: allowAll,
    MCP_OAUTH_RATE_LIMITER: allowAll,
    OAUTH_KV: env.OAUTH_KV,
    OWNER_SETUP_TOKEN: env.OWNER_SETUP_TOKEN,
    INTEGRATION_SECRETS_KEY: env.INTEGRATION_SECRETS_KEY,
    ...overrides,
  }
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return handleRequest(new Request(`${origin}${path}`, init), workerEnv())
}

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

async function clearKv(): Promise<void> {
  let cursor: string | undefined
  do {
    const page = await env.OAUTH_KV.list({ cursor })
    await Promise.all(page.keys.map(({ name }) => env.OAUTH_KV.delete(name)))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
}

async function setupOwner(): Promise<string> {
  const response = await call('/api/auth/setup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-owner-bootstrap-proof': env.OWNER_SETUP_TOKEN,
    },
    body: JSON.stringify({
      username: 'owner',
      password: 'correct horse battery staple',
    }),
  })
  expect(response.status).toBe(201)
  return (response.headers.get('set-cookie') ?? '').split(';', 1)[0]!
}

async function registerClient(): Promise<string> {
  const registration = await call('/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'MCP test client',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  })
  expect(registration.status).toBe(201)
  const client = await registration.json<{ client_id: string }>()
  return client.client_id
}

async function authorizationUrl(
  clientId: string,
  overrides: Record<string, string | undefined> = {},
): Promise<URL> {
  const challenge = base64Url(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  )
  const authorize = new URL(`${origin}/api/mcp/oauth/authorize`)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', redirectUri)
  authorize.searchParams.set('scope', 'integrations:read')
  authorize.searchParams.set('state', 'test-state')
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 'S256')
  authorize.searchParams.set('resource', `${origin}/mcp`)
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) authorize.searchParams.delete(name)
    else authorize.searchParams.set(name, value)
  }
  return authorize
}

async function authorizeCode(
  clientId: string,
  adminCookie: string,
  overrides: Record<string, string | undefined> = {},
): Promise<{ code: string; authorize: URL }> {
  const authorize = await authorizationUrl(clientId, overrides)

  const consent = await handleRequest(
    new Request(authorize, { headers: { cookie: adminCookie } }),
    workerEnv(),
  )
  expect(consent.status).toBe(200)
  expect(await consent.text()).toContain('Authorize MCP access')
  expect(consent.headers.get('content-security-policy')).toContain(
    "form-action 'self' https://client.example.test",
  )
  expect(consent.headers.get('content-security-policy')).not.toContain(
    'attacker.example',
  )

  const crossOriginApproval = await handleRequest(
    new Request(authorize, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin: 'https://attacker.example',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'decision=approve',
    }),
    workerEnv(),
  )
  expect(crossOriginApproval.status).toBe(403)

  const approval = await handleRequest(
    new Request(authorize, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin: 'null',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'decision=approve',
      redirect: 'manual',
    }),
    workerEnv(),
  )
  expect(approval.status).toBe(302)
  const callback = new URL(approval.headers.get('location')!)
  expect(callback.searchParams.get('state')).toBe('test-state')
  const code = callback.searchParams.get('code')!
  return { code, authorize }
}

async function exchangeCode(
  clientId: string,
  code: string,
  codeVerifier: string | null = verifier,
  resource = `${origin}/mcp`,
): Promise<Response> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    resource,
  })
  if (codeVerifier !== null) body.set('code_verifier', codeVerifier)
  return call('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
}

async function oauthAccessToken(): Promise<{
  accessToken: string
  refreshToken: string
  adminCookie: string
  clientId: string
}> {
  const clientId = await registerClient()
  const adminCookie = await setupOwner()
  const { code } = await authorizeCode(clientId, adminCookie)
  const token = await exchangeCode(clientId, code)
  expect(token.status).toBe(200)
  const tokenBody = await token.json<{
    access_token: string
    refresh_token: string
  }>()
  return {
    accessToken: tokenBody.access_token,
    refreshToken: tokenBody.refresh_token,
    adminCookie,
    clientId,
  }
}

function mcpRequest(
  body: unknown,
  accessToken: string,
  extraHeaders: HeadersInit = {},
): Request {
  const headers = new Headers(extraHeaders)
  headers.set('authorization', `Bearer ${accessToken}`)
  headers.set('content-type', 'application/json')
  headers.set('accept', 'application/json, text/event-stream')
  return new Request(`${origin}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_sessions'),
    env.DB.prepare('DELETE FROM owner_credentials'),
  ])
  await clearKv()
})

describe('MCP OAuth boundary', () => {
  it('challenges missing credentials and rejects invalid bearer tokens', async () => {
    const missing = await call('/mcp', { method: 'POST' })
    expect(missing.status).toBe(401)
    expect(missing.headers.get('www-authenticate')).toContain(
      'resource_metadata=',
    )

    const invalid = await call('/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid-token' },
    })
    expect(invalid.status).toBe(401)
  })

  it('keeps Admin cookies and MCP bearer credentials isolated', async () => {
    const { accessToken, adminCookie } = await oauthAccessToken()
    const cookieOnly = await call('/mcp', {
      method: 'POST',
      headers: { cookie: adminCookie },
    })
    expect(cookieOnly.status).toBe(401)

    const bearerOnAdmin = await call('/api/integrations', {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(bearerOnAdmin.status).toBe(401)
  })

  it('lets the authenticated owner revoke all MCP grants', async () => {
    const { accessToken, adminCookie } = await oauthAccessToken()
    const before = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
        accessToken,
      ),
      workerEnv(),
    )
    expect(before.status).toBe(200)

    const revoked = await call('/api/mcp/oauth/revoke', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        origin,
        'content-type': 'application/json',
      },
      body: '{}',
    })
    expect(revoked.status).toBe(200)
    await expect(revoked.json()).resolves.toEqual({ revoked: 1 })

    const after = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        accessToken,
      ),
      workerEnv(),
    )
    expect(after.status).toBe(401)
  })

  it('publishes resource-bound OAuth metadata', async () => {
    const resource = await call('/.well-known/oauth-protected-resource/mcp')
    expect(resource.status).toBe(200)
    await expect(resource.json()).resolves.toMatchObject({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: ['integrations:read'],
    })

    const authorizationServer = await call(
      '/.well-known/oauth-authorization-server',
    )
    expect(authorizationServer.status).toBe(200)
    await expect(authorizationServer.json()).resolves.toMatchObject({
      issuer: origin,
      authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      code_challenge_methods_supported: ['S256'],
    })
  })

  it('rejects unregistered, malformed, and mismatched OAuth targets', async () => {
    const clientId = await registerClient()
    const adminCookie = await setupOwner()

    for (const overrides of [
      { redirect_uri: 'https://attacker.example/callback' },
      { redirect_uri: 'not-a-url' },
    ]) {
      const response = await handleRequest(
        new Request(await authorizationUrl(clientId, overrides), {
          headers: { cookie: adminCookie },
          redirect: 'manual',
        }),
        workerEnv(),
      )
      expect(response.status).toBe(400)
      expect(response.headers.get('location')).toBeNull()
    }

    const resource = await handleRequest(
      new Request(
        await authorizationUrl(clientId, { resource: `${origin}/other` }),
        { headers: { cookie: adminCookie }, redirect: 'manual' },
      ),
      workerEnv(),
    )
    expect(resource.status).toBe(302)
    const resourceError = new URL(resource.headers.get('location')!)
    expect(resourceError.origin + resourceError.pathname).toBe(redirectUri)
    expect(resourceError.searchParams.get('error')).toBe('invalid_target')
  })

  it('rejects unsupported or missing scopes without creating a grant', async () => {
    const clientId = await registerClient()
    const adminCookie = await setupOwner()

    for (const scope of ['other:read', undefined]) {
      const authorize = await authorizationUrl(clientId, { scope })
      const response = await handleRequest(
        new Request(authorize, {
          method: 'POST',
          headers: {
            cookie: adminCookie,
            origin: 'null',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'decision=approve',
          redirect: 'manual',
        }),
        workerEnv(),
      )
      expect(response.status).toBe(302)
      expect(
        new URL(response.headers.get('location')!).searchParams.get('error'),
      ).toBe('invalid_scope')
    }
  })

  it('requires PKCE S256 and rejects missing or invalid verifiers', async () => {
    const clientId = await registerClient()
    const adminCookie = await setupOwner()

    const plain = await handleRequest(
      new Request(
        await authorizationUrl(clientId, {
          code_challenge_method: 'plain',
        }),
        { headers: { cookie: adminCookie }, redirect: 'manual' },
      ),
      workerEnv(),
    )
    expect(plain.status).toBe(302)
    expect(
      new URL(plain.headers.get('location')!).searchParams.get('error'),
    ).toBe('invalid_request')

    for (const codeVerifier of [null, `${verifier}-wrong`]) {
      const { code } = await authorizeCode(clientId, adminCookie)
      const token = await exchangeCode(clientId, code, codeVerifier)
      expect(token.status).toBe(400)
      await expect(token.json()).resolves.toMatchObject({
        error: codeVerifier === null ? 'invalid_request' : 'invalid_grant',
      })
    }
  })

  it('makes authorization codes one-time and resource-bound', async () => {
    const clientId = await registerClient()
    const adminCookie = await setupOwner()

    const first = await authorizeCode(clientId, adminCookie)
    const mismatched = await exchangeCode(
      clientId,
      first.code,
      verifier,
      `${origin}/other`,
    )
    expect(mismatched.status).toBe(400)
    await expect(mismatched.json()).resolves.toMatchObject({
      error: 'invalid_target',
    })

    const { code } = await authorizeCode(clientId, adminCookie)
    const exchanged = await exchangeCode(clientId, code)
    expect(exchanged.status).toBe(200)
    const replay = await exchangeCode(clientId, code)
    expect(replay.status).toBe(400)
    await expect(replay.json()).resolves.toMatchObject({
      error: 'invalid_grant',
    })
  })

  it('rotates refresh tokens and rejects invalid or retired tokens', async () => {
    const { clientId, refreshToken } = await oauthAccessToken()
    const refresh = (token: string) =>
      call('/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: token,
          resource: `${origin}/mcp`,
        }),
      })

    const invalid = await refresh('invalid-refresh-token')
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({
      error: 'invalid_grant',
    })

    const rotated = await refresh(refreshToken)
    expect(rotated.status).toBe(200)
    const rotatedBody = await rotated.json<{ refresh_token: string }>()
    expect(rotatedBody.refresh_token).not.toBe(refreshToken)

    const replacement = await refresh(rotatedBody.refresh_token)
    expect(replacement.status).toBe(200)

    const retired = await refresh(refreshToken)
    expect(retired.status).toBe(400)
    await expect(retired.json()).resolves.toMatchObject({
      error: 'invalid_grant',
    })
  })

  it('supports provider token revocation without adding another revocation path', async () => {
    const { accessToken, clientId } = await oauthAccessToken()
    const revoked = await call('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        token: accessToken,
        token_type_hint: 'access_token',
      }),
    })
    expect(revoked.status).toBe(200)

    const after = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} },
        accessToken,
      ),
      workerEnv(),
    )
    expect(after.status).toBe(401)
  })

  it('revokes a refresh token grant through the provider endpoint', async () => {
    const { accessToken, refreshToken, clientId } = await oauthAccessToken()
    const revoked = await call('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        token: refreshToken,
        token_type_hint: 'refresh_token',
      }),
    })
    expect(revoked.status).toBe(200)

    const protectedRequest = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', id: 14, method: 'tools/list', params: {} },
        accessToken,
      ),
      workerEnv(),
    )
    expect(protectedRequest.status).toBe(401)

    const refresh = await call('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
        resource: `${origin}/mcp`,
      }),
    })
    expect(refresh.status).toBe(400)
    await expect(refresh.json()).resolves.toMatchObject({
      error: 'invalid_grant',
    })
  })

  it('bounds public OAuth traffic without exposing client identity', async () => {
    const denied: RateLimit = { limit: async () => ({ success: false }) }
    const response = await handleRequest(
      new Request(`${origin}/oauth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      workerEnv({ MCP_OAUTH_RATE_LIMITER: denied }),
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    await expect(response.json()).resolves.toEqual({
      error: 'temporarily_unavailable',
      error_description: 'Try again later.',
    })
  })

  it('routes an unauthenticated authorization request through owner login', async () => {
    const registration = await call('/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'MCP test client',
        redirect_uris: ['https://client.example.test/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    })
    const client = await registration.json<{ client_id: string }>()
    const authorize = new URL(`${origin}/api/mcp/oauth/authorize`)
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('client_id', client.client_id)
    authorize.searchParams.set(
      'redirect_uri',
      'https://client.example.test/callback',
    )
    authorize.searchParams.set('scope', 'integrations:read')
    authorize.searchParams.set('state', 'state')
    authorize.searchParams.set('code_challenge', 'A'.repeat(43))
    authorize.searchParams.set('code_challenge_method', 'S256')
    authorize.searchParams.set('resource', `${origin}/mcp`)

    const response = await handleRequest(
      new Request(authorize, { redirect: 'manual' }),
      workerEnv(),
    )
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('redirect')).toBe(
      `${authorize.pathname}${authorize.search}`,
    )
  })

  it('requires HTTPS remotely and validates present origins', async () => {
    const insecure = await handleRequest(
      new Request('http://mcp.example.test/mcp', { method: 'POST' }),
      workerEnv(),
    )
    expect(insecure.status).toBe(426)

    const local = await handleRequest(
      new Request('http://127.0.0.1:5173/mcp', { method: 'POST' }),
      workerEnv(),
    )
    expect(local.status).toBe(401)

    const invalidOrigin = await call('/mcp', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
    })
    expect(invalidOrigin.status).toBe(403)
  })
})

describe('MCP protocol and list_integrations tool', () => {
  it('initializes with 2025-11-25 and advertises only tools', async () => {
    const { accessToken } = await oauthAccessToken()
    const response = await handleRequest(
      mcpRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        },
        accessToken,
      ),
      workerEnv(),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
      },
    })
  })

  it('uses the SDK transport behavior for GET and unsupported HTTP methods', async () => {
    const { accessToken } = await oauthAccessToken()
    const get = await call('/mcp', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'text/event-stream',
        'mcp-protocol-version': '2025-11-25',
      },
    })
    expect(get.status).toBe(200)
    expect(get.headers.get('content-type')).toContain('text/event-stream')
    await get.body?.cancel()

    for (const [method, status] of [
      ['PUT', 405],
      ['DELETE', 200],
      ['PATCH', 405],
    ] as const) {
      const response = await call('/mcp', {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-11-25',
        },
      })
      expect(response.status).toBe(status)
    }
  })

  it('enforces Streamable HTTP content negotiation', async () => {
    const { accessToken } = await oauthAccessToken()
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/list',
      params: {},
    })

    for (const requestHeaders of [
      new Headers({ accept: 'application/json, text/event-stream' }),
      new Headers({
        accept: 'application/json, text/event-stream',
        'content-type': 'text/plain',
      }),
    ]) {
      requestHeaders.set('authorization', `Bearer ${accessToken}`)
      const response = await call('/mcp', {
        method: 'POST',
        headers: requestHeaders,
        body,
      })
      expect(response.status).toBe(415)
    }

    for (const accept of ['application/json', 'text/event-stream']) {
      const response = await call('/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept,
          'content-type': 'application/json',
        },
        body,
      })
      expect(response.status).toBe(406)
    }
  })

  it('accepts notifications and rejects unknown or invalid JSON-RPC requests', async () => {
    const { accessToken } = await oauthAccessToken()
    const notification = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        accessToken,
        { 'mcp-protocol-version': '2025-11-25' },
      ),
      workerEnv(),
    )
    expect(notification.status).toBe(202)
    expect(await notification.text()).toBe('')

    const unknown = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', id: 10, method: 'unknown/method', params: {} },
        accessToken,
        { 'mcp-protocol-version': '2025-11-25' },
      ),
      workerEnv(),
    )
    expect(unknown.status).toBe(200)
    await expect(unknown.json()).resolves.toMatchObject({
      error: { code: -32601 },
    })

    const invalid = await handleRequest(
      mcpRequest({ jsonrpc: '1.0', id: 11, method: 'tools/list' }, accessToken),
      workerEnv(),
    )
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: -32700 },
    })
  })

  it('applies the specified missing and unsupported protocol-version behavior', async () => {
    const { accessToken } = await oauthAccessToken()
    const missing = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', id: 12, method: 'tools/list', params: {} },
        accessToken,
      ),
      workerEnv(),
    )
    expect(missing.status).toBe(200)

    const unsupported = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', id: 13, method: 'tools/list', params: {} },
        accessToken,
        { 'mcp-protocol-version': '2099-01-01' },
      ),
      workerEnv(),
    )
    expect(unsupported.status).toBe(400)
  })

  it('rejects an authorization context without the required scope', async () => {
    const response = await handleMcpRequest(
      new Request(`${origin}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 15,
          method: 'tools/list',
          params: {},
        }),
      }),
      createIntegrationRegistry([]),
      { userId: 'owner-1', scopes: [] },
      env.DB,
    )
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: -32000, message: 'Required scope is missing.' },
    })
  })

  it('lists and invokes exactly the real list_integrations tool', async () => {
    const { accessToken } = await oauthAccessToken()
    const tools = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        accessToken,
        { 'mcp-protocol-version': '2025-11-25' },
      ),
      workerEnv(),
    )
    expect(tools.status).toBe(200)
    const toolsBody = await tools.json<{
      result: { tools: Array<Record<string, unknown>> }
    }>()
    expect(toolsBody.result.tools).toHaveLength(1)
    expect(toolsBody.result.tools[0]).toMatchObject({
      name: 'list_integrations',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    })

    const called = await handleRequest(
      mcpRequest(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'list_integrations', arguments: {} },
        },
        accessToken,
        { 'mcp-protocol-version': '2025-11-25' },
      ),
      workerEnv(),
    )
    expect(called.status).toBe(200)
    await expect(called.json()).resolves.toMatchObject({
      result: {
        structuredContent: {
          integrations: [
            {
              id: 'garmin',
              name: 'Garmin',
              status: 'not_configured',
            },
            {
              id: 'shopify',
              name: 'Shopify',
              status: 'not_configured',
            },
          ],
        },
      },
    })
  })

  it('rejects unsupported protocol headers and unexpected tool input', async () => {
    const { accessToken } = await oauthAccessToken()
    const version = await handleRequest(
      mcpRequest(
        { jsonrpc: '2.0', id: 6, method: 'tools/list', params: {} },
        accessToken,
        { 'mcp-protocol-version': '2099-01-01' },
      ),
      workerEnv(),
    )
    expect(version.status).toBe(400)

    const argumentsResponse = await handleRequest(
      mcpRequest(
        {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'list_integrations',
            arguments: { unexpected: true },
          },
        },
        accessToken,
      ),
      workerEnv(),
    )
    expect(argumentsResponse.status).toBe(200)
    await expect(argumentsResponse.json()).resolves.toMatchObject({
      result: { isError: true },
    })
  })

  it('returns an empty integration collection without an MCP error', async () => {
    const response = await handleMcpRequest(
      new Request(`${origin}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-11-25',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'list_integrations', arguments: {} },
        }),
      }),
      createIntegrationRegistry([]),
      { userId: 'owner-1', scopes: ['integrations:read'] },
      env.DB,
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      result: { structuredContent: { integrations: [] } },
    })
  })

  it('returns sanitized errors for malformed JSON and unknown tools', async () => {
    const { accessToken } = await oauthAccessToken()
    const malformed = await handleRequest(
      new Request(`${origin}/mcp`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: '{not-json',
      }),
      workerEnv(),
    )
    expect(malformed.status).toBe(400)
    expect(await malformed.text()).not.toContain('stack')

    const unknown = await handleRequest(
      mcpRequest(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'unknown_tool', arguments: {} },
        },
        accessToken,
      ),
      workerEnv(),
    )
    expect(unknown.status).toBe(200)
    await expect(unknown.json()).resolves.toMatchObject({
      result: { isError: true },
    })
  })

  it('rejects oversized requests before parsing', async () => {
    const { accessToken } = await oauthAccessToken()
    const response = await call('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'content-length': String(64 * 1024 + 1),
      },
      body: '{}',
    })
    expect(response.status).toBe(413)
  })
})
