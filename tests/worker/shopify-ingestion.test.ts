import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptValue } from '../../src/core/security/encrypted-value'
import {
  getLastSuccessfulShopifySyncAt,
  SHOPIFY_MAX_GRAPHQL_REQUESTS,
  SHOPIFY_VARIANT_PAGE_SIZE,
  syncShopifyInventory,
} from '../../src/integrations/shopify/ingestion'
import { queryShopifyInventory } from '../../src/integrations/shopify/inventory-query'
import { handleRequest, type Env } from '../../src/worker/index'

const origin = 'https://admin.example.test'
const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const encryptionContext = 'universal-data-mcp-worker/shopify/client-secret/v1'
const allow: RateLimit = { limit: async () => ({ success: true }) }

function workerEnv(): Env {
  return {
    ASSETS: { fetch: async () => new Response('SPA') },
    DB: env.DB,
    LOGIN_RATE_LIMITER: allow,
    MCP_OAUTH_RATE_LIMITER: allow,
    OAUTH_KV: env.OAUTH_KV,
    OWNER_SETUP_TOKEN: env.OWNER_SETUP_TOKEN,
    INTEGRATION_SECRETS_KEY: key,
  }
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

function adminRequest(
  path: string,
  cookie: string,
  requestOrigin = origin,
): Request {
  return new Request(`${origin}${path}`, {
    method: 'POST',
    headers: { cookie, origin: requestOrigin },
  })
}

async function connectedShopify(): Promise<void> {
  const envelope = await encryptValue('shopify-secret', key, encryptionContext)
  await env.DB.prepare(
    `INSERT INTO shopify_connection
      (id, shop_domain, client_id, client_secret_envelope, status, verified_at,
       last_error_code, created_at, updated_at)
    VALUES (1, 'example.myshopify.com', 'client-id', ?, 'connected', 1, NULL, 1, 1)`,
  )
    .bind(envelope)
    .run()
}

function level(id: string, locationId: string, quantity: number | null) {
  return {
    id: `gid://shopify/InventoryLevel/${id}?inventory_item_id=${id}`,
    updatedAt: '2026-08-16T00:00:00Z',
    location: {
      id: `gid://shopify/Location/${locationId}`,
      name: `Location ${locationId}`,
    },
    quantities: quantity === null ? [] : [{ name: 'available', quantity }],
  }
}

function variant(
  id: string,
  productId: string,
  levels: ReturnType<typeof level>[],
  options: { title?: string; sku?: string | null; levelsNext?: string } = {},
) {
  return {
    id: `gid://shopify/ProductVariant/${id}`,
    title: options.title ?? `Variant ${id}`,
    sku: options.sku === undefined ? `SKU-${id}` : options.sku,
    updatedAt: '2026-08-16T00:00:00Z',
    product: {
      id: `gid://shopify/Product/${productId}`,
      title: `Product ${productId}`,
      handle: `product-${productId}`,
      status: 'ACTIVE',
      updatedAt: '2026-08-16T00:00:00Z',
    },
    inventoryItem: {
      id: `gid://shopify/InventoryItem/${id}`,
      tracked: true,
      inventoryLevels: {
        nodes: levels,
        pageInfo: {
          hasNextPage: Boolean(options.levelsNext),
          endCursor:
            options.levelsNext ?? (levels.length ? `level-${id}` : null),
        },
      },
    },
  }
}

function graphqlResponse(data: Record<string, unknown>): Response {
  return Response.json(
    {
      data,
      extensions: {
        cost: {
          requestedQueryCost: 10,
          actualQueryCost: 5,
          throttleStatus: {
            maximumAvailable: 2000,
            currentlyAvailable: 1990,
            restoreRate: 100,
          },
        },
      },
    },
    { headers: { 'x-shopify-api-version': '2026-07' } },
  )
}

function topPage(
  nodes: ReturnType<typeof variant>[],
  hasNextPage = false,
  endCursor: string | null = nodes.length ? 'top-end' : null,
): Response {
  return graphqlResponse({
    productVariants: {
      nodes,
      pageInfo: { hasNextPage, endCursor },
    },
  })
}

function shopifyFetch(
  pages: Map<string, Response | (() => Response)>,
  nested: Map<string, Response | (() => Response)> = new Map(),
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/admin/oauth/access_token')) {
      return Response.json({
        access_token: 'transient-access-token',
        scope:
          'read_products,read_inventory,read_locations,read_orders,read_all_orders',
      })
    }
    const body = JSON.parse(String(init?.body)) as {
      query: string
      variables: Record<string, unknown>
    }
    expect(init?.headers).toMatchObject({
      'x-shopify-access-token': 'transient-access-token',
    })
    expect(body.query).not.toMatch(/mutation/iu)
    if (body.query.includes('ShopifyInventoryLevels')) {
      const key = `${String(body.variables.id)}:${String(body.variables.after)}`
      const response = nested.get(key)
      if (!response) throw new Error(`Unexpected nested page ${key}`)
      return typeof response === 'function' ? response() : response.clone()
    }
    expect(body.variables.first).toBe(SHOPIFY_VARIANT_PAGE_SIZE)
    const key = String(body.variables.after ?? 'start')
    const response = pages.get(key)
    if (!response) throw new Error(`Unexpected top page ${key}`)
    return typeof response === 'function' ? response() : response.clone()
  }) as typeof fetch
}

async function sync(cookie: string): Promise<Response> {
  return handleRequest(
    adminRequest('/api/integrations/shopify/sync', cookie),
    workerEnv(),
  )
}

async function count(table: string): Promise<number> {
  const result = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM ${table}`,
  ).first<{ count: number }>()
  return result!.count
}

beforeEach(async () => {
  vi.unstubAllGlobals()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM shopify_inventory_levels'),
    env.DB.prepare('DELETE FROM shopify_variants'),
    env.DB.prepare('DELETE FROM shopify_inventory_items'),
    env.DB.prepare('DELETE FROM shopify_products'),
    env.DB.prepare('DELETE FROM shopify_locations'),
    env.DB.prepare('DELETE FROM shopify_sync_runs'),
    env.DB.prepare('DELETE FROM shopify_connection'),
    env.DB.prepare('DELETE FROM admin_sessions'),
    env.DB.prepare('DELETE FROM owner_credentials'),
  ])
})

describe('Shopify inventory Admin boundary', () => {
  it('requires owner authentication, exact Origin, and a connected integration', async () => {
    expect(
      (
        await handleRequest(
          new Request(`${origin}/api/integrations/shopify/sync`, {
            method: 'POST',
            headers: { origin },
          }),
          workerEnv(),
        )
      ).status,
    ).toBe(401)
    const cookie = await session()
    expect(
      (
        await handleRequest(
          adminRequest(
            '/api/integrations/shopify/sync',
            cookie,
            'https://attacker.example',
          ),
          workerEnv(),
        )
      ).status,
    ).toBe(403)
    const disconnected = await sync(cookie)
    expect(disconnected.status).toBe(409)
    await expect(disconnected.json()).resolves.toMatchObject({
      error: { code: 'NOT_CONNECTED' },
    })
  })

  it('prevents concurrent invocations from advancing the same scan', async () => {
    const cookie = await session()
    await connectedShopify()
    let release!: (value: Response) => void
    const delayed = new Promise<Response>((resolve) => (release = resolve))
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'transient-access-token',
          scope:
            'read_products,read_inventory,read_locations,read_orders,read_all_orders',
        }),
      )
      .mockReturnValueOnce(delayed)
    vi.stubGlobal('fetch', fetcher)
    const first = sync(cookie)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect((await sync(cookie)).status).toBe(409)
    release(topPage([]))
    expect((await first).status).toBe(200)
  })
})

describe('Shopify inventory ingestion', () => {
  it('records the actual terminal time and exposes it as successful-sync freshness', async () => {
    await connectedShopify()
    const startedAt = Date.UTC(2026, 7, 16, 18, 0, 0)
    const completedAt = startedAt + 45_000
    const clock = vi
      .fn<() => number>()
      .mockReturnValueOnce(startedAt)
      .mockReturnValueOnce(completedAt)

    const result = await syncShopifyInventory(
      env.DB,
      key,
      shopifyFetch(
        new Map([
          ['start', topPage([variant('1', '10', [level('1', '1', 4)])])],
        ]),
      ),
      clock,
    )

    expect(result.startedAt).toBe(new Date(startedAt).toISOString())
    expect(result.completedAt).toBe(new Date(completedAt).toISOString())
    expect(Date.parse(result.startedAt)).toBeLessThan(
      Date.parse(result.completedAt!),
    )
    await expect(getLastSuccessfulShopifySyncAt(env.DB)).resolves.toBe(
      new Date(completedAt).toISOString(),
    )
    await expect(queryShopifyInventory(env.DB)).resolves.toMatchObject({
      lastSuccessfulSyncAt: new Date(completedAt).toISOString(),
    })
  })

  it.each([
    {
      name: 'failed',
      pages: new Map<string, Response | (() => Response)>([
        ['start', () => new Response('unavailable', { status: 503 })],
      ]),
      expectedStatus: 'failed',
    },
    {
      name: 'partial',
      pages: new Map<string, Response | (() => Response)>([
        [
          'start',
          topPage([variant('1', '10', [level('1', '1', 4)])], true, 'page-1'),
        ],
        ['page-1', () => new Response('unavailable', { status: 503 })],
      ]),
      expectedStatus: 'partial',
    },
  ])(
    'records the actual terminal time for a $name run',
    async ({ pages, expectedStatus }) => {
      await connectedShopify()
      const startedAt = Date.UTC(2026, 7, 16, 19, 0, 0)
      const completedAt = startedAt + 30_000
      const clock = vi
        .fn<() => number>()
        .mockReturnValueOnce(startedAt)
        .mockReturnValueOnce(completedAt)

      const result = await syncShopifyInventory(
        env.DB,
        key,
        shopifyFetch(pages),
        clock,
      )

      expect(result).toMatchObject({
        status: expectedStatus,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
      })
    },
  )

  it('counts each product once across source pages and repeated syncs', async () => {
    await connectedShopify()
    const pages = new Map<string, Response>([
      [
        'start',
        topPage([variant('1', 'A', [level('1', '1', 4)])], true, 'page-1'),
      ],
      [
        'page-1',
        topPage([
          variant('2', 'A', [level('2', '1', 3)]),
          variant('3', 'B', [level('3', '1', 2)]),
        ]),
      ],
    ])

    const first = await syncShopifyInventory(env.DB, key, shopifyFetch(pages))
    expect(first.counts).toMatchObject({ products: 2, variants: 3 })
    expect(await count('shopify_products')).toBe(2)
    expect(await count('shopify_variants')).toBe(3)

    const repeated = await syncShopifyInventory(
      env.DB,
      key,
      shopifyFetch(pages),
    )
    expect(repeated.counts).toMatchObject({ products: 2, variants: 3 })
    expect(await count('shopify_products')).toBe(2)
    expect(await count('shopify_variants')).toBe(3)
  })

  it('ingests multiple pages and locations idempotently without persisting the token', async () => {
    const cookie = await session()
    await connectedShopify()
    const pages = new Map<string, Response>([
      [
        'start',
        topPage(
          [variant('1', '10', [level('1-a', '1', 4), level('1-b', '2', 0)])],
          true,
          'page-1',
        ),
      ],
      ['page-1', topPage([variant('2', '20', [level('2-a', '1', 9)])])],
    ])
    vi.stubGlobal('fetch', shopifyFetch(pages))
    const first = await sync(cookie)
    expect(first.status).toBe(200)
    await expect(first.json()).resolves.toMatchObject({
      sync: { status: 'complete', coverageComplete: true },
    })
    const state = await handleRequest(
      new Request(`${origin}/api/integrations/shopify`, {
        headers: { cookie },
      }),
      workerEnv(),
    )
    await expect(state.json()).resolves.toMatchObject({
      sync: {
        status: 'complete',
        counts: { products: 2, variants: 2, inventoryLevels: 3 },
      },
      lastSuccessfulSyncAt: expect.any(String),
    })
    expect(await count('shopify_products')).toBe(2)
    expect(await count('shopify_variants')).toBe(2)
    expect(await count('shopify_inventory_items')).toBe(2)
    expect(await count('shopify_locations')).toBe(2)
    expect(await count('shopify_inventory_levels')).toBe(3)

    vi.stubGlobal('fetch', shopifyFetch(pages))
    expect((await sync(cookie)).status).toBe(200)
    expect(await count('shopify_products')).toBe(2)
    expect(await count('shopify_variants')).toBe(2)
    expect(await count('shopify_inventory_levels')).toBe(3)
    const quantity = await env.DB.prepare(
      `SELECT available_quantity FROM shopify_inventory_levels
       WHERE source_gid LIKE '%1-a%'`,
    ).first<{ available_quantity: number }>()
    expect(quantity?.available_quantity).toBe(4)
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE sql LIKE '%access_token%'",
      ).first<{ count: number }>(),
    ).toEqual({ count: 0 })
  })

  it('continues nested inventory-level pagination and updates quantities', async () => {
    const cookie = await session()
    await connectedShopify()
    const itemGid = 'gid://shopify/InventoryItem/1'
    const pages = new Map<string, Response>([
      [
        'start',
        topPage([
          variant('1', '10', [level('1-a', '1', 4)], {
            levelsNext: 'levels-1',
          }),
        ]),
      ],
    ])
    const nested = new Map<string, Response>([
      [
        `${itemGid}:levels-1`,
        graphqlResponse({
          inventoryItem: {
            id: itemGid,
            inventoryLevels: {
              nodes: [level('1-b', '2', 7)],
              pageInfo: { hasNextPage: false, endCursor: 'levels-2' },
            },
          },
        }),
      ],
    ])
    vi.stubGlobal('fetch', shopifyFetch(pages, nested))
    expect((await sync(cookie)).status).toBe(200)
    expect(await count('shopify_inventory_levels')).toBe(2)

    const changed = new Map<string, Response>([
      ['start', topPage([variant('1', '10', [level('1-a', '1', 12)])])],
    ])
    vi.stubGlobal('fetch', shopifyFetch(changed))
    expect((await sync(cookie)).status).toBe(200)
    const values = await env.DB.prepare(
      'SELECT available_quantity FROM shopify_inventory_levels',
    ).all<{ available_quantity: number }>()
    expect(values.results.map((item) => item.available_quantity)).toEqual([12])
  })

  it('reconciles disappearance only after complete coverage', async () => {
    const cookie = await session()
    await connectedShopify()
    vi.stubGlobal(
      'fetch',
      shopifyFetch(
        new Map<string, Response | (() => Response)>([
          [
            'start',
            topPage([
              variant('1', '10', [level('1', '1', 1)]),
              variant('2', '20', [level('2', '2', 2)]),
            ]),
          ],
        ]),
      ),
    )
    await sync(cookie)
    expect(await count('shopify_variants')).toBe(2)

    vi.stubGlobal(
      'fetch',
      shopifyFetch(
        new Map<string, Response | (() => Response)>([
          [
            'start',
            topPage([variant('1', '10', [level('1', '1', 5)])], true, 'next'),
          ],
          ['next', () => new Response('unavailable', { status: 503 })],
        ]),
      ),
    )
    const partial = await sync(cookie)
    expect(partial.status).toBe(502)
    await expect(partial.json()).resolves.toMatchObject({
      sync: {
        status: 'partial',
        coverageComplete: false,
        lastErrorCode: 'SOURCE_UNAVAILABLE',
      },
    })
    expect(await count('shopify_variants')).toBe(2)

    // A failed partial scan is resumed from its committed cursor.
    vi.stubGlobal('fetch', shopifyFetch(new Map([['next', topPage([])]])))
    expect((await sync(cookie)).status).toBe(200)
    expect(await count('shopify_variants')).toBe(1)
    expect(await count('shopify_products')).toBe(1)
    expect(await count('shopify_inventory_levels')).toBe(1)
  })

  it('records throttling without reconciling previously stored data', async () => {
    const cookie = await session()
    await connectedShopify()
    vi.stubGlobal(
      'fetch',
      shopifyFetch(
        new Map([
          ['start', topPage([variant('1', '10', [level('1', '1', 1)])])],
        ]),
      ),
    )
    await sync(cookie)

    const throttled = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/admin/oauth/access_token')
        ? Response.json({
            access_token: 'transient-access-token',
            scope:
              'read_products,read_inventory,read_locations,read_orders,read_all_orders',
          })
        : new Response('limited', { status: 429 }),
    ) as typeof fetch
    vi.stubGlobal('fetch', throttled)
    const response = await sync(cookie)
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({
      sync: { status: 'failed', lastErrorCode: 'RATE_LIMITED' },
    })
    expect(await count('shopify_variants')).toBe(1)
  })

  it('rejects duplicate or structurally invalid source identities before committing a page', async () => {
    const cookie = await session()
    await connectedShopify()
    const duplicate = variant('1', '10', [level('1', '1', 1)])
    vi.stubGlobal(
      'fetch',
      shopifyFetch(new Map([['start', topPage([duplicate, duplicate])]])),
    )
    const failed = await sync(cookie)
    await expect(failed.json()).resolves.toMatchObject({
      sync: { status: 'failed', lastErrorCode: 'MALFORMED_RESPONSE' },
    })
    expect(await count('shopify_variants')).toBe(0)
  })

  it('reports bounded partial coverage and resumes after the page cap', async () => {
    const cookie = await session()
    await connectedShopify()
    const pages = new Map<string, Response>()
    let cursor = 'start'
    for (let index = 0; index < 6; index += 1) {
      const next = `page-${index + 1}`
      pages.set(
        cursor,
        topPage(
          [variant(String(index + 1), String(index + 1), [])],
          index < 5,
          next,
        ),
      )
      cursor = next
    }
    vi.stubGlobal('fetch', shopifyFetch(pages))
    const partial = await sync(cookie)
    await expect(partial.json()).resolves.toMatchObject({
      sync: {
        status: 'partial',
        continuationAvailable: true,
        counts: { pages: 5 },
      },
    })
    vi.stubGlobal('fetch', shopifyFetch(pages))
    const complete = await sync(cookie)
    await expect(complete.json()).resolves.toMatchObject({
      sync: { status: 'complete', coverageComplete: true },
    })
    expect(await count('shopify_variants')).toBe(6)
    expect(SHOPIFY_MAX_GRAPHQL_REQUESTS).toBe(20)
  })
})
