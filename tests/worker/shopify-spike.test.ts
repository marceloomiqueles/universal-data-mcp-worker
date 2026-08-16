import { describe, expect, it, vi } from 'vitest'

import {
  acquireShopifyAccessToken,
  assertReadOnlyShopifyQuery,
  runShopifySpike,
  SHOPIFY_API_VERSION,
  SHOPIFY_MAX_PAGES,
  SHOPIFY_PRODUCTS_QUERY,
  ShopifySpikeError,
  validateShopDomain,
  type ShopifySpikeConfig,
} from '../../src/spikes/shopify/client'
import { handleShopifySpikeRequest } from '../../src/spikes/shopify/worker'

const config: ShopifySpikeConfig = {
  shopDomain: 'spike-store.myshopify.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
}

function json(value: unknown, init: ResponseInit = {}): Response {
  return Response.json(value, init)
}

function tokenResponse(overrides: Record<string, unknown> = {}): Response {
  return json({
    access_token: 'test-access-token',
    expires_in: 86_399,
    scope: 'read_products,read_inventory,read_locations',
    ...overrides,
  })
}

function product(id: string) {
  return {
    id: `gid://shopify/Product/${id}`,
    title: `Product ${id}`,
    handle: `product-${id}`,
    variants: {
      nodes: [
        {
          id: `gid://shopify/ProductVariant/${id}`,
          title: 'Default',
          sku: `SKU-${id}`,
          inventoryItem: {
            id: `gid://shopify/InventoryItem/${id}`,
            tracked: true,
            inventoryLevels: {
              nodes: [
                {
                  id: `gid://shopify/InventoryLevel/${id}`,
                  location: {
                    id: 'gid://shopify/Location/1',
                    name: 'Test location',
                  },
                  quantities: [{ name: 'available', quantity: 4 }],
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  }
}

function productPage(
  ids: string[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null },
  overrides: Record<string, unknown> = {},
): Response {
  return json(
    {
      data: { products: { nodes: ids.map(product), pageInfo } },
      extensions: {
        cost: {
          requestedQueryCost: 12,
          actualQueryCost: 8,
          throttleStatus: { currentlyAvailable: 92, restoreRate: 100 },
        },
      },
      ...overrides,
    },
    { headers: { 'x-shopify-api-version': SHOPIFY_API_VERSION } },
  )
}

function fetchSequence(responses: Response[]) {
  return vi.fn(async () => {
    const response = responses.shift()
    if (!response) throw new Error('Unexpected fetch')
    return response
  }) as unknown as typeof fetch
}

describe('Shopify Spike 0 configuration and authentication', () => {
  it('accepts only canonical myshopify.com hostnames', () => {
    expect(validateShopDomain(' Spike-Store.myshopify.com ')).toBe(
      'spike-store.myshopify.com',
    )
    for (const value of [
      'https://spike-store.myshopify.com',
      'spike-store.myshopify.com/path',
      'myshopify.com',
      'spike-store.myshopify.com.attacker.test',
      'attacker.test',
    ]) {
      expect(() => validateShopDomain(value)).toThrow(ShopifySpikeError)
    }
  })

  it('constructs the documented client-credentials request', async () => {
    const fetcher = fetchSequence([tokenResponse()])
    const result = await acquireShopifyAccessToken(config, fetcher)
    expect(result).toEqual({
      accessToken: 'test-access-token',
      expiresIn: 86_399,
      scopes: ['read_inventory', 'read_locations', 'read_products'],
    })

    const [url, init] = vi.mocked(fetcher).mock.calls[0]!
    expect(url).toBe(
      'https://spike-store.myshopify.com/admin/oauth/access_token',
    )
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    )
    expect(new URLSearchParams(init?.body as string).get('grant_type')).toBe(
      'client_credentials',
    )
    expect(new URLSearchParams(init?.body as string).get('client_id')).toBe(
      config.clientId,
    )
    expect(new URLSearchParams(init?.body as string).get('client_secret')).toBe(
      config.clientSecret,
    )
  })

  it('rejects missing or excessive scopes and malformed tokens', async () => {
    for (const response of [
      tokenResponse({ scope: 'read_products,read_inventory' }),
      tokenResponse({
        scope: 'read_products,read_inventory,read_locations,read_orders',
      }),
    ]) {
      await expect(
        acquireShopifyAccessToken(config, fetchSequence([response])),
      ).rejects.toMatchObject({ code: 'SCOPE_FAILED' })
    }

    await expect(
      acquireShopifyAccessToken(
        config,
        fetchSequence([tokenResponse({ access_token: '' })]),
      ),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it('reports authentication and network failures without credential values', async () => {
    const rejected = json(
      { error: config.clientSecret, access_token: 'provider-token' },
      { status: 401 },
    )
    const authentication = await acquireShopifyAccessToken(
      config,
      fetchSequence([rejected]),
    ).catch((error: unknown) => error)
    expect(authentication).toMatchObject({ code: 'AUTH_FAILED' })
    expect(String(authentication)).not.toContain(config.clientSecret)
    expect(String(authentication)).not.toContain('provider-token')

    const unavailable = await acquireShopifyAccessToken(
      config,
      vi.fn(async () => {
        throw new Error(`network ${config.clientSecret}`)
      }) as unknown as typeof fetch,
    ).catch((error: unknown) => error)
    expect(unavailable).toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    expect(String(unavailable)).not.toContain(config.clientSecret)
  })
})

describe('Shopify Spike 0 query and pagination', () => {
  it('uses a read-only query, authenticated versioned endpoint, and two pages', async () => {
    const fetcher = fetchSequence([
      tokenResponse(),
      productPage(['1', '2'], { hasNextPage: true, endCursor: 'page-2' }),
      productPage(['3'], { hasNextPage: false, endCursor: null }),
    ])
    const result = await runShopifySpike(config, fetcher)

    expect(result).toMatchObject({
      apiVersion: '2026-07',
      pagesRead: 2,
      paginationExercised: true,
      truncated: false,
    })
    expect(result.products.map(({ id }) => id)).toEqual([
      'gid://shopify/Product/1',
      'gid://shopify/Product/2',
      'gid://shopify/Product/3',
    ])
    expect(result.products[0]?.variants[0]?.inventoryItem.levels[0]).toEqual({
      id: 'gid://shopify/InventoryLevel/1',
      location: {
        id: 'gid://shopify/Location/1',
        name: 'Test location',
      },
      available: 4,
    })

    const [url, init] = vi.mocked(fetcher).mock.calls[1]!
    expect(url).toBe(
      'https://spike-store.myshopify.com/admin/api/2026-07/graphql.json',
    )
    expect(new Headers(init?.headers).get('x-shopify-access-token')).toBe(
      'test-access-token',
    )
    const firstBody = JSON.parse(String(init?.body)) as {
      query: string
      variables: { after: string | null }
    }
    expect(firstBody.query).toBe(SHOPIFY_PRODUCTS_QUERY)
    expect(firstBody.variables.after).toBeNull()
    const secondBody = JSON.parse(
      String(vi.mocked(fetcher).mock.calls[2]?.[1]?.body),
    ) as { variables: { after: string } }
    expect(secondBody.variables.after).toBe('page-2')
  })

  it('stops at the hard page bound', async () => {
    const responses = [tokenResponse()]
    for (let page = 1; page <= SHOPIFY_MAX_PAGES; page += 1) {
      responses.push(
        productPage([String(page)], {
          hasNextPage: true,
          endCursor: `page-${page + 1}`,
        }),
      )
    }
    const result = await runShopifySpike(config, fetchSequence(responses))
    expect(result.pagesRead).toBe(SHOPIFY_MAX_PAGES)
    expect(result.truncated).toBe(true)
  })

  it('rejects duplicate products across cursor pages', async () => {
    await expect(
      runShopifySpike(
        config,
        fetchSequence([
          tokenResponse(),
          productPage(['1'], { hasNextPage: true, endCursor: 'next' }),
          productPage(['1'], { hasNextPage: false, endCursor: null }),
        ]),
      ),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it('classifies GraphQL scope, throttle, general, HTTP, and malformed failures', async () => {
    const cases: Array<[Response, string]> = [
      [
        productPage(
          [],
          { hasNextPage: false, endCursor: null },
          {
            errors: [{ extensions: { code: 'ACCESS_DENIED' } }],
          },
        ),
        'SCOPE_FAILED',
      ],
      [
        productPage(
          [],
          { hasNextPage: false, endCursor: null },
          {
            errors: [{ extensions: { code: 'THROTTLED' } }],
          },
        ),
        'THROTTLED',
      ],
      [
        productPage(
          [],
          { hasNextPage: false, endCursor: null },
          {
            errors: [{ extensions: { code: 'OTHER' } }],
          },
        ),
        'GRAPHQL_ERROR',
      ],
      [json({}, { status: 429 }), 'THROTTLED'],
      [json({}, { status: 503 }), 'PROVIDER_UNAVAILABLE'],
      [new Response('not json'), 'MALFORMED_RESPONSE'],
    ]

    for (const [response, code] of cases) {
      await expect(
        runShopifySpike(config, fetchSequence([tokenResponse(), response])),
      ).rejects.toMatchObject({ code })
    }
  })

  it('contains no mutation operation', () => {
    expect(() =>
      assertReadOnlyShopifyQuery(SHOPIFY_PRODUCTS_QUERY),
    ).not.toThrow()
    expect(SHOPIFY_PRODUCTS_QUERY).not.toMatch(/\bmutation\b/iu)
    expect(() =>
      assertReadOnlyShopifyQuery('mutation ChangeProduct { productUpdate {} }'),
    ).toThrow('query operations only')
  })
})

describe('Shopify Spike 0 Worker isolation', () => {
  it('is loopback-only and reports missing configuration safely', async () => {
    const remote = await handleShopifySpikeRequest(
      new Request('https://example.test/'),
      {},
    )
    expect(remote.status).toBe(404)

    const local = await handleShopifySpikeRequest(
      new Request('http://localhost:8788/'),
      {},
    )
    expect(local.status).toBe(400)
    await expect(local.json()).resolves.toEqual({
      ok: false,
      error: {
        code: 'CONFIGURATION_MISSING',
        message:
          'SHOPIFY_SHOP_DOMAIN must be a canonical myshopify.com hostname.',
      },
    })
  })
})
