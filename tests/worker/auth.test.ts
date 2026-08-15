import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { handleRequest, type Env } from '../../src/worker/index'

const origin = 'https://admin.example.test'
const assets = {
  fetch: async () =>
    new Response('<!doctype html><html><body>SPA</body></html>', {
      headers: { 'content-type': 'text/html' },
    }),
}

function workerEnv(): Env {
  return {
    ASSETS: assets,
    DB: env.DB,
    OWNER_SETUP_TOKEN: env.OWNER_SETUP_TOKEN,
  }
}

function request(
  path: string,
  init: RequestInit = {},
  requestOrigin = origin,
): Request {
  return new Request(`${requestOrigin}${path}`, init)
}

function post(
  path: string,
  body: unknown,
  extraHeaders?: HeadersInit,
): Request {
  const headers = new Headers(extraHeaders)
  headers.set('content-type', 'application/json')
  headers.set('origin', origin)
  return request(path, { method: 'POST', headers, body: JSON.stringify(body) })
}

async function setupOwner(
  username = 'owner',
  password = 'correct horse battery staple',
  bootstrapProof = env.OWNER_SETUP_TOKEN,
): Promise<{ response: Response; cookie: string }> {
  const response = await handleRequest(
    post(
      '/api/auth/setup',
      { username, password },
      { 'x-owner-bootstrap-proof': bootstrapProof },
    ),
    workerEnv(),
  )
  const setCookie = response.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';', 1)[0]
  return { response, cookie }
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_sessions'),
    env.DB.prepare('DELETE FROM owner_credentials'),
  ])
})

describe('owner setup', () => {
  it('reports setup required and creates one owner with a secure session', async () => {
    const status = await handleRequest(
      request('/api/auth/setup-status'),
      workerEnv(),
    )
    await expect(status.json()).resolves.toEqual({ setupRequired: true })

    const { response, cookie } = await setupOwner('Marcelo.Owner')
    expect(response.status).toBe(201)
    expect(cookie).toMatch(/^admin_session=[A-Za-z0-9_-]{43}$/u)
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Strict')
    expect(setCookie).toContain('Path=/api')
    expect(setCookie).toContain('Max-Age=43200')

    const owner = await env.DB.prepare(
      'SELECT username, normalized_username, password_verifier FROM owner_credentials',
    ).first<{
      username: string
      normalized_username: string
      password_verifier: string
    }>()
    expect(owner?.username).toBe('Marcelo.Owner')
    expect(owner?.normalized_username).toBe('marcelo.owner')
    expect(owner?.password_verifier).toMatch(/^pbkdf2-sha256-v1\$600000\$/u)
    expect(owner?.password_verifier).not.toContain(
      'correct horse battery staple',
    )

    const rawToken = cookie.slice(cookie.indexOf('=') + 1)
    const persisted = await env.DB.prepare(
      'SELECT token_digest FROM admin_sessions',
    ).first<{ token_digest: string }>()
    expect(persisted?.token_digest).not.toBe(rawToken)
    expect(persisted?.token_digest).toMatch(/^[A-Za-z0-9_-]{43}$/u)

    const configured = await handleRequest(
      request('/api/auth/setup-status'),
      workerEnv(),
    )
    await expect(configured.json()).resolves.toEqual({ setupRequired: false })
  })

  it('rejects missing setup authorization and invalid backend input', async () => {
    const missingOrigin = await handleRequest(
      request('/api/auth/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'owner',
          password: 'correct horse battery staple',
        }),
      }),
      workerEnv(),
    )
    expect(missingOrigin.status).toBe(403)

    const invalidCode = await setupOwner(
      'owner',
      'correct horse battery staple',
      'incorrect',
    )
    expect(invalidCode.response.status).toBe(403)

    const proofInAccountData = await handleRequest(
      post('/api/auth/setup', {
        setupCode: env.OWNER_SETUP_TOKEN,
        username: 'owner',
        password: 'correct horse battery staple',
      }),
      workerEnv(),
    )
    expect(proofInAccountData.status).toBe(403)

    const shortPassword = await handleRequest(
      post(
        '/api/auth/setup',
        { username: 'owner', password: 'too-short' },
        { 'x-owner-bootstrap-proof': env.OWNER_SETUP_TOKEN },
      ),
      workerEnv(),
    )
    expect(shortPassword.status).toBe(400)
    expect(
      await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM owner_credentials',
      ).first('count'),
    ).toBe(0)
  })

  it('allows exactly one winner across concurrent setup attempts', async () => {
    const attempts = await Promise.all([
      setupOwner('first-owner'),
      setupOwner('second-owner'),
    ])
    expect(attempts.map(({ response }) => response.status).sort()).toEqual([
      201, 409,
    ])
    expect(
      await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM owner_credentials',
      ).first('count'),
    ).toBe(1)
    expect(
      await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM admin_sessions',
      ).first('count'),
    ).toBe(1)
  })

  it('never accepts an old proof to replace the existing owner', async () => {
    const initial = await setupOwner('original-owner')
    expect(initial.response.status).toBe(201)

    const replacement = await setupOwner('replacement-owner')
    expect(replacement.response.status).toBe(409)
    expect(
      await env.DB.prepare('SELECT username FROM owner_credentials').first(
        'username',
      ),
    ).toBe('original-owner')
  })

  it('keeps the bootstrap proof out of account data and responses', async () => {
    const response = await handleRequest(
      post(
        '/api/auth/setup',
        {
          username: 'owner',
          password: 'correct horse battery staple',
          setupCode: env.OWNER_SETUP_TOKEN,
        },
        { 'x-owner-bootstrap-proof': env.OWNER_SETUP_TOKEN },
      ),
      workerEnv(),
    )
    const responseText = await response.text()
    expect(response.status).toBe(201)
    expect(responseText).not.toContain(env.OWNER_SETUP_TOKEN)

    const ownerColumns = await env.DB.prepare(
      'SELECT * FROM owner_credentials',
    ).first<Record<string, unknown>>()
    expect(JSON.stringify(ownerColumns)).not.toContain(env.OWNER_SETUP_TOKEN)
  })
})

describe('login and session lifecycle', () => {
  it('returns the same generic response for an incorrect username or password', async () => {
    await setupOwner()

    const wrongUsername = await handleRequest(
      post('/api/auth/login', {
        username: 'somebody-else',
        password: 'correct horse battery staple',
      }),
      workerEnv(),
    )
    const wrongPassword = await handleRequest(
      post('/api/auth/login', {
        username: 'owner',
        password: 'this password is definitely incorrect',
      }),
      workerEnv(),
    )

    expect(wrongUsername.status).toBe(401)
    expect(wrongPassword.status).toBe(401)
    expect(await wrongUsername.json()).toEqual(await wrongPassword.json())
  })

  it('logs in, validates the session, and invalidates it on logout', async () => {
    await setupOwner()
    const loginResponse = await handleRequest(
      post('/api/auth/login', {
        username: 'OWNER',
        password: 'correct horse battery staple',
      }),
      workerEnv(),
    )
    expect(loginResponse.status).toBe(200)
    const setCookie = loginResponse.headers.get('set-cookie') ?? ''
    const cookie = setCookie.split(';', 1)[0]

    const current = await handleRequest(
      request('/api/auth/session', { headers: { cookie } }),
      workerEnv(),
    )
    expect(current.status).toBe(200)
    await expect(current.json()).resolves.toMatchObject({
      authenticated: true,
      owner: { username: 'owner' },
    })

    const protectedResponse = await handleRequest(
      request('/api/future-operation', { headers: { cookie } }),
      workerEnv(),
    )
    expect(protectedResponse.status).toBe(501)

    const logout = await handleRequest(
      post('/api/auth/logout', {}, { cookie }),
      workerEnv(),
    )
    expect(logout.status).toBe(200)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')

    const afterLogout = await handleRequest(
      request('/api/auth/session', { headers: { cookie } }),
      workerEnv(),
    )
    expect(afterLogout.status).toBe(401)
  })

  it('rejects missing, invalid, and expired sessions', async () => {
    const missing = await handleRequest(
      request('/api/auth/session'),
      workerEnv(),
    )
    expect(missing.status).toBe(401)

    const invalid = await handleRequest(
      request('/api/auth/session', {
        headers: { cookie: 'admin_session=invalid-token' },
      }),
      workerEnv(),
    )
    expect(invalid.status).toBe(401)

    const { cookie } = await setupOwner()
    await env.DB.prepare('UPDATE admin_sessions SET expires_at = 0').run()
    const expired = await handleRequest(
      request('/api/auth/session', { headers: { cookie } }),
      workerEnv(),
    )
    expect(expired.status).toBe(401)
  })
})

describe('authorization and routing boundaries', () => {
  it('protects Admin API paths by default and leaves MCP unchanged', async () => {
    for (const path of ['/api', '/api/', '/api/health?check=1']) {
      const response = await handleRequest(request(path), workerEnv())
      expect(response.status).toBe(401)
    }

    for (const path of ['/mcp', '/mcp/', '/mcp/session?check=1']) {
      const response = await handleRequest(request(path), workerEnv())
      expect(response.status).toBe(501)
      await expect(response.json()).resolves.toEqual({
        boundary: 'mcp',
        status: 'not-implemented',
      })
    }
  })

  it('rejects cross-origin state changes', async () => {
    const response = await handleRequest(
      request('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://attacker.example',
        },
        body: JSON.stringify({
          username: 'owner',
          password: 'correct horse battery staple',
        }),
      }),
      workerEnv(),
    )
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FORBIDDEN_ORIGIN',
        message: 'The request origin is not allowed.',
      },
    })
  })

  it.each(['/status', '/apiary', '/mcproxy'])(
    'delegates %s to static assets',
    async (path) => {
      const response = await handleRequest(request(path), workerEnv())
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
    },
  )
})

describe('D1 migration', () => {
  it('is recorded and safe to apply repeatedly', async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
    const migrationCount = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM d1_migrations',
    ).first<number>('count')
    expect(migrationCount).toBe(1)
  })
})
