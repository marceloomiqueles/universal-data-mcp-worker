import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  decryptValue,
  encryptValue,
} from '../../src/core/security/encrypted-value'
import { handleRequest, type Env } from '../../src/worker/index'
import {
  ShopifyConnectionError,
  verifyShopifyConnection,
} from '../../src/integrations/shopify/provider'

const origin = 'https://admin.example.test'
const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const allow: RateLimit = { limit: async () => ({ success: true }) }

function workerEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: { fetch: async () => new Response('SPA') },
    DB: env.DB,
    LOGIN_RATE_LIMITER: allow,
    MCP_OAUTH_RATE_LIMITER: allow,
    OAUTH_KV: env.OAUTH_KV,
    OWNER_SETUP_TOKEN: env.OWNER_SETUP_TOKEN,
    INTEGRATION_SECRETS_KEY: key,
    ...overrides,
  }
}

function request(
  path: string,
  cookie: string,
  method = 'GET',
  body?: unknown,
): Request {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      cookie,
      origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function session(): Promise<string> {
  const setup = await handleRequest(
    new Request(`${origin}/api/auth/setup`, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-owner-bootstrap-proof': env.OWNER_SETUP_TOKEN,
      },
      body: JSON.stringify({
        username: 'owner',
        password: 'correct horse battery staple',
      }),
    }),
    workerEnv(),
  )
  return (setup.headers.get('set-cookie') ?? '').split(';', 1)[0]!
}

function successfulShopifyFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/admin/oauth/access_token')) {
      return Response.json({
        access_token: 'transient-token',
        expires_in: 86399,
        scope:
          'read_products,read_inventory,read_locations,read_orders,read_all_orders',
      })
    }
    return Response.json(
      {
        data: {
          shop: {
            id: 'gid://shopify/Shop/1',
            myshopifyDomain: 'example.myshopify.com',
          },
        },
      },
      {
        headers: { 'x-shopify-api-version': '2026-07' },
      },
    )
  }) as typeof fetch
}

beforeEach(async () => {
  vi.unstubAllGlobals()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM shopify_connection'),
    env.DB.prepare('DELETE FROM admin_sessions'),
    env.DB.prepare('DELETE FROM owner_credentials'),
  ])
})

describe('encrypted persisted values', () => {
  it('round-trips ciphertext and rejects a changed context', async () => {
    const encrypted = await encryptValue('client-secret', key, 'shopify')
    expect(encrypted).not.toContain('client-secret')
    await expect(decryptValue(encrypted, key, 'shopify')).resolves.toBe(
      'client-secret',
    )
    await expect(decryptValue(encrypted, key, 'different')).rejects.toThrow()
  })
})

describe('Shopify verification transport', () => {
  const credentials = {
    shopDomain: 'example.myshopify.com',
    clientId: 'client',
    clientSecret: 'secret',
  }

  function fetchWithScopes(scopes: string): typeof fetch {
    return vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/admin/oauth/access_token')
        ? Response.json({ access_token: 'token', scope: scopes })
        : Response.json(
            {
              data: {
                shop: {
                  id: 'gid://shopify/Shop/1',
                  myshopifyDomain: 'example.myshopify.com',
                },
              },
            },
            { headers: { 'x-shopify-api-version': '2026-07' } },
          ),
    ) as typeof fetch
  }

  it('uses client credentials and a minimal read-only versioned query', async () => {
    const fetcher = successfulShopifyFetch()
    await verifyShopifyConnection(credentials, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const first = vi.mocked(fetcher).mock.calls[0]!
    expect(first[0]).toBe(
      'https://example.myshopify.com/admin/oauth/access_token',
    )
    expect(String(first[1]?.body)).toContain('grant_type=client_credentials')
    const second = vi.mocked(fetcher).mock.calls[1]!
    expect(first[1]?.headers).not.toHaveProperty('x-shopify-access-token')
    expect(second[0]).toBe(
      'https://example.myshopify.com/admin/api/2026-07/graphql.json',
    )
    expect(String(second[1]?.body)).toContain('query VerifyShopifyConnection')
    expect(String(second[1]?.body)).not.toMatch(/mutation/iu)
  })

  it.each([
    [new Response('denied', { status: 401 }), 'AUTH_FAILED'],
    [new Response('limited', { status: 429 }), 'RATE_LIMITED'],
    [new Response('unavailable', { status: 503 }), 'SOURCE_UNAVAILABLE'],
  ] as const)('classifies token endpoint failures', async (response, code) => {
    await expect(
      verifyShopifyConnection(
        credentials,
        vi.fn(async () => response) as typeof fetch,
      ),
    ).rejects.toMatchObject({ code } satisfies Partial<ShopifyConnectionError>)
  })

  it.each([
    ['read_products,read_inventory,read_locations,read_orders'],
    ['read_products,read_inventory,read_locations,read_orders,read_all_orders'],
    ['read_products,read_inventory,read_locations,read_orders,read_themes'],
  ])('accepts a grant containing all required scopes: %s', async (scopes) => {
    await expect(
      verifyShopifyConnection(credentials, fetchWithScopes(scopes)),
    ).resolves.toBeUndefined()
  })

  it.each([
    ['read_products,read_inventory,read_locations'],
    ['read_products,read_locations,read_orders'],
    ['read_products,read_inventory,read_locations,read_all_orders'],
  ])('rejects a grant missing a required scope: %s', async (scopes) => {
    await expect(
      verifyShopifyConnection(credentials, fetchWithScopes(scopes)),
    ).rejects.toMatchObject({ code: 'SCOPE_FAILED' })
  })

  it('rejects malformed provider responses', async () => {
    const malformed = vi.fn(async () =>
      Response.json({
        access_token: 'token',
        expires_in: 100,
        scope:
          'read_products,read_inventory,read_locations,read_orders,read_all_orders',
      }),
    ) as typeof fetch
    vi.mocked(malformed)
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'token',
          expires_in: 100,
          scope:
            'read_products,read_inventory,read_locations,read_orders,read_all_orders',
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { data: {} },
          { headers: { 'x-shopify-api-version': '2026-07' } },
        ),
      )
    await expect(
      verifyShopifyConnection(credentials, malformed),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it.each([
    ['THROTTLED', 'RATE_LIMITED'],
    ['ACCESS_DENIED', 'SCOPE_FAILED'],
    ['INTERNAL_SERVER_ERROR', 'PROVIDER_CHANGED'],
  ] as const)('maps GraphQL %s errors to %s', async (providerCode, code) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'token',
          scope:
            'read_products,read_inventory,read_locations,read_orders,read_all_orders',
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { errors: [{ extensions: { code: providerCode } }] },
          { headers: { 'x-shopify-api-version': '2026-07' } },
        ),
      ) as typeof fetch

    await expect(
      verifyShopifyConnection(credentials, fetcher),
    ).rejects.toMatchObject({ code })
  })

  it('rejects an unexpected API version and a mismatched shop identity', async () => {
    const wrongVersion = successfulShopifyFetch()
    vi.mocked(wrongVersion).mockResolvedValueOnce(
      Response.json({
        access_token: 'token',
        scope:
          'read_products,read_inventory,read_locations,read_orders,read_all_orders',
      }),
    )
    vi.mocked(wrongVersion).mockResolvedValueOnce(
      Response.json(
        {
          data: {
            shop: {
              id: 'gid://shopify/Shop/1',
              myshopifyDomain: 'example.myshopify.com',
            },
          },
        },
        { headers: { 'x-shopify-api-version': '2026-04' } },
      ),
    )
    await expect(
      verifyShopifyConnection(credentials, wrongVersion),
    ).rejects.toMatchObject({ code: 'PROVIDER_CHANGED' })

    const wrongShop = successfulShopifyFetch()
    vi.mocked(wrongShop).mockResolvedValueOnce(
      Response.json({
        access_token: 'token',
        scope:
          'read_products,read_inventory,read_locations,read_orders,read_all_orders',
      }),
    )
    vi.mocked(wrongShop).mockResolvedValueOnce(
      Response.json(
        {
          data: {
            shop: {
              id: 'gid://shopify/Shop/2',
              myshopifyDomain: 'other.myshopify.com',
            },
          },
        },
        { headers: { 'x-shopify-api-version': '2026-07' } },
      ),
    )
    await expect(
      verifyShopifyConnection(credentials, wrongShop),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it.each(['network failure', 'request timeout'])(
    'maps %s to source unavailable',
    async (message) => {
      const fetcher = vi.fn(async () => {
        throw new DOMException(message, 'AbortError')
      }) as typeof fetch

      await expect(
        verifyShopifyConnection(credentials, fetcher),
      ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    },
  )
})

describe('Shopify Admin API activation', () => {
  it('requires Admin authentication and exact Origin for writes', async () => {
    const unauthenticated = await handleRequest(
      new Request(`${origin}/api/integrations/shopify`),
      workerEnv(),
    )
    expect(unauthenticated.status).toBe(401)
    const cookie = await session()
    const wrongOrigin = request(
      '/api/integrations/shopify/configuration',
      cookie,
      'PUT',
      {
        shopDomain: 'example.myshopify.com',
        clientId: 'client',
        clientSecret: 'secret',
      },
    )
    wrongOrigin.headers.set('origin', 'https://attacker.example')
    expect((await handleRequest(wrongOrigin, workerEnv())).status).toBe(403)
  })

  it('fails closed when the integration encryption key is missing or malformed', async () => {
    const cookie = await session()
    const missing = await handleRequest(
      request('/api/integrations/shopify/verify', cookie, 'POST'),
      workerEnv({ INTEGRATION_SECRETS_KEY: undefined }),
    )
    expect(missing.status).toBe(503)
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'CONFIGURATION_UNAVAILABLE' },
    })

    const malformed = await handleRequest(
      request('/api/integrations/shopify/verify', cookie, 'POST'),
      workerEnv({ INTEGRATION_SECRETS_KEY: 'not-a-valid-key' }),
    )
    expect(malformed.status).toBe(503)
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: 'CONFIGURATION_UNAVAILABLE' },
    })
  })

  it('stores encrypted configuration and never returns secret material', async () => {
    const cookie = await session()
    const saved = await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'Example.myshopify.com',
        clientId: 'client-id',
        clientSecret: 'top-secret',
      }),
      workerEnv(),
    )
    expect(saved.status).toBe(200)
    const body = await saved.json<Record<string, unknown>>()
    expect(body).toMatchObject({
      shopDomain: 'example.myshopify.com',
      clientId: 'client-id',
      secretConfigured: true,
      status: 'configured',
    })
    expect(JSON.stringify(body)).not.toContain('top-secret')
    expect(body).not.toHaveProperty('clientSecret')
    expect(body).not.toHaveProperty('encryptedClientSecret')
    expect(body).not.toHaveProperty('accessToken')
    const stored = await env.DB.prepare(
      'SELECT client_secret_envelope FROM shopify_connection',
    ).first<{ client_secret_envelope: string }>()
    expect(stored?.client_secret_envelope).not.toContain('top-secret')
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE sql LIKE '%access_token%'",
      ).first<{ count: number }>(),
    ).toEqual({ count: 0 })
  })

  it('verifies, revalidates, retains or replaces the secret, and disconnects', async () => {
    const cookie = await session()
    await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'example.myshopify.com',
        clientId: 'client-id',
        clientSecret: 'first-secret',
      }),
      workerEnv(),
    )
    const original = await env.DB.prepare(
      'SELECT client_secret_envelope FROM shopify_connection',
    ).first<{ client_secret_envelope: string }>()
    vi.stubGlobal('fetch', successfulShopifyFetch())
    const verified = await handleRequest(
      request('/api/integrations/shopify/verify', cookie, 'POST'),
      workerEnv(),
    )
    expect(verified.status).toBe(200)
    await expect(verified.json()).resolves.toMatchObject({
      status: 'connected',
      lastErrorCode: null,
    })

    await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'example.myshopify.com',
        clientId: 'edited-client',
      }),
      workerEnv(),
    )
    const retained = await env.DB.prepare(
      'SELECT client_secret_envelope FROM shopify_connection',
    ).first<{ client_secret_envelope: string }>()
    expect(retained?.client_secret_envelope).toBe(
      original?.client_secret_envelope,
    )
    expect(
      (
        await handleRequest(
          request('/api/integrations/shopify/verify', cookie, 'POST'),
          workerEnv(),
        )
      ).status,
    ).toBe(200)

    await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'example.myshopify.com',
        clientId: 'edited-client',
        clientSecret: 'replacement',
      }),
      workerEnv(),
    )
    const replaced = await env.DB.prepare(
      'SELECT client_secret_envelope FROM shopify_connection',
    ).first<{ client_secret_envelope: string }>()
    expect(replaced?.client_secret_envelope).not.toBe(
      retained?.client_secret_envelope,
    )
    expect(
      (
        await handleRequest(
          request('/api/integrations/shopify/disconnect', cookie, 'POST'),
          workerEnv(),
        )
      ).status,
    ).toBe(200)
    expect(
      await env.DB.prepare('SELECT id FROM shopify_connection').first(),
    ).toBeNull()
  })

  it('preserves configuration and records sanitized verification failures', async () => {
    const cookie = await session()
    await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'example.myshopify.com',
        clientId: 'client-id',
        clientSecret: 'secret',
      }),
      workerEnv(),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('denied', { status: 401 })),
    )
    const failed = await handleRequest(
      request('/api/integrations/shopify/verify', cookie, 'POST'),
      workerEnv(),
    )
    expect(failed.status).toBe(422)
    await expect(failed.json()).resolves.toMatchObject({
      status: 'connection_error',
      lastErrorCode: 'AUTH_FAILED',
      secretConfigured: true,
    })
    expect(
      await env.DB.prepare('SELECT id FROM shopify_connection').first(),
    ).not.toBeNull()
  })

  it('reports undecryptable saved credentials without changing or exposing them', async () => {
    const cookie = await session()
    await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'example.myshopify.com',
        clientId: 'client-id',
        clientSecret: 'secret',
      }),
      workerEnv(),
    )
    const before = await env.DB.prepare(
      'SELECT client_secret_envelope FROM shopify_connection',
    ).first<{ client_secret_envelope: string }>()
    const provider = vi.fn()
    vi.stubGlobal('fetch', provider)

    const failed = await handleRequest(
      request('/api/integrations/shopify/verify', cookie, 'POST'),
      workerEnv({
        INTEGRATION_SECRETS_KEY: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      }),
    )

    expect(failed.status).toBe(422)
    const failedBody = await failed.json<Record<string, unknown>>()
    expect(failedBody).toMatchObject({
      status: 'connection_error',
      lastErrorCode: 'CREDENTIALS_UNAVAILABLE',
      secretConfigured: true,
    })
    expect(JSON.stringify(failedBody)).not.toContain('OperationError')
    expect(provider).not.toHaveBeenCalled()
    const after = await env.DB.prepare(
      'SELECT client_secret_envelope FROM shopify_connection',
    ).first<{ client_secret_envelope: string }>()
    expect(after?.client_secret_envelope).toBe(before?.client_secret_envelope)

    const disconnected = await handleRequest(
      request('/api/integrations/shopify/disconnect', cookie, 'POST'),
      workerEnv({
        INTEGRATION_SECRETS_KEY: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      }),
    )
    expect(disconnected.status).toBe(200)
    expect(
      await env.DB.prepare('SELECT id FROM shopify_connection').first(),
    ).toBeNull()
  })

  it('does not recreate configuration when disconnect wins a verification race', async () => {
    const cookie = await session()
    await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'example.myshopify.com',
        clientId: 'client-id',
        clientSecret: 'secret',
      }),
      workerEnv(),
    )
    let releaseGraphql!: (response: Response) => void
    const graphql = new Promise<Response>((resolve) => {
      releaseGraphql = resolve
    })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'transient',
          expires_in: 100,
          scope:
            'read_products,read_inventory,read_locations,read_orders,read_all_orders',
        }),
      )
      .mockReturnValueOnce(graphql)
    vi.stubGlobal('fetch', fetcher)
    const verification = handleRequest(
      request('/api/integrations/shopify/verify', cookie, 'POST'),
      workerEnv(),
    )
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    await handleRequest(
      request('/api/integrations/shopify/disconnect', cookie, 'POST'),
      workerEnv(),
    )
    releaseGraphql(
      Response.json(
        {
          data: {
            shop: {
              id: 'gid://shopify/Shop/1',
              myshopifyDomain: 'example.myshopify.com',
            },
          },
        },
        { headers: { 'x-shopify-api-version': '2026-07' } },
      ),
    )
    expect((await verification).status).toBe(409)
    expect(
      await env.DB.prepare('SELECT id FROM shopify_connection').first(),
    ).toBeNull()
  })

  it('does not overwrite newer configuration when an old verification finishes', async () => {
    const cookie = await session()
    await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'example.myshopify.com',
        clientId: 'old-client',
        clientSecret: 'old-secret',
      }),
      workerEnv(),
    )
    let releaseGraphql!: (response: Response) => void
    const graphql = new Promise<Response>((resolve) => {
      releaseGraphql = resolve
    })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'transient',
          scope:
            'read_products,read_inventory,read_locations,read_orders,read_all_orders',
        }),
      )
      .mockReturnValueOnce(graphql)
    vi.stubGlobal('fetch', fetcher)
    const verification = handleRequest(
      request('/api/integrations/shopify/verify', cookie, 'POST'),
      workerEnv(),
    )
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))

    await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'example.myshopify.com',
        clientId: 'new-client',
        clientSecret: 'new-secret',
      }),
      workerEnv(),
    )
    const edited = await env.DB.prepare(
      'SELECT client_id, status, updated_at FROM shopify_connection',
    ).first<{ client_id: string; status: string; updated_at: number }>()

    releaseGraphql(
      Response.json(
        {
          data: {
            shop: {
              id: 'gid://shopify/Shop/1',
              myshopifyDomain: 'example.myshopify.com',
            },
          },
        },
        { headers: { 'x-shopify-api-version': '2026-07' } },
      ),
    )
    expect((await verification).status).toBe(422)
    const after = await env.DB.prepare(
      'SELECT client_id, status, updated_at FROM shopify_connection',
    ).first<{ client_id: string; status: string; updated_at: number }>()
    expect(after).toEqual(edited)
    expect(after).toMatchObject({
      client_id: 'new-client',
      status: 'configured',
    })
  })

  it('reflects persisted Shopify state in the shared registry listing', async () => {
    const cookie = await session()
    const initial = await handleRequest(
      request('/api/integrations', cookie),
      workerEnv(),
    )
    expect(await initial.json()).toMatchObject({
      integrations: [
        { id: 'garmin' },
        { id: 'shopify', status: 'not_configured' },
      ],
    })
    await handleRequest(
      request('/api/integrations/shopify/configuration', cookie, 'PUT', {
        shopDomain: 'example.myshopify.com',
        clientId: 'client-id',
        clientSecret: 'secret',
      }),
      workerEnv(),
    )
    const configured = await handleRequest(
      request('/api/integrations', cookie),
      workerEnv(),
    )
    expect(await configured.json()).toMatchObject({
      integrations: [{ id: 'garmin' }, { id: 'shopify', status: 'configured' }],
    })
  })
})
