import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { createIntegrationRegistry } from '../../src/core/integrations/registry'
import { handleRequest, type Env } from '../../src/worker/index'
import { handleMcpRequest } from '../../src/worker/mcp/server'

const origin = 'https://mcp.example.test'
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

async function oauthAccessToken(): Promise<{
  accessToken: string
  adminCookie: string
}> {
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
  expect(registration.status).toBe(201)
  const client = await registration.json<{ client_id: string }>()
  const adminCookie = await setupOwner()
  const verifier =
    'test-verifier-with-at-least-forty-three-characters-1234567890'
  const challenge = base64Url(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  )
  const authorize = new URL(`${origin}/api/mcp/oauth/authorize`)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', client.client_id)
  authorize.searchParams.set(
    'redirect_uri',
    'https://client.example.test/callback',
  )
  authorize.searchParams.set('scope', 'integrations:read')
  authorize.searchParams.set('state', 'test-state')
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 'S256')
  authorize.searchParams.set('resource', `${origin}/mcp`)

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

  const token = await call('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      redirect_uri: 'https://client.example.test/callback',
      code,
      code_verifier: verifier,
      resource: `${origin}/mcp`,
    }),
  })
  expect(token.status).toBe(200)
  const tokenBody = await token.json<{ access_token: string }>()
  return { accessToken: tokenBody.access_token, adminCookie }
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
