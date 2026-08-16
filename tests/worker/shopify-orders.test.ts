import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptValue } from '../../src/core/security/encrypted-value'
import {
  SHOPIFY_MAX_ORDER_REQUESTS,
  SHOPIFY_ORDER_PAGE_SIZE,
  ShopifyOrderSyncConflictError,
  syncShopifyOrders,
} from '../../src/integrations/shopify/orders-ingestion'
import { parseShopifyMoney } from '../../src/integrations/shopify/money'
import {
  queryShopifySales,
  resolveShopifySalesPeriod,
  ShopifySalesQueryError,
} from '../../src/integrations/shopify/sales-query'
import { handleRequest, type Env } from '../../src/worker/index'

const origin = 'https://admin.example.test'
const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const encryptionContext = 'universal-data-mcp-worker/shopify/client-secret/v1'
const allow: RateLimit = { limit: async () => ({ success: true }) }
const startedAt = Date.UTC(2026, 7, 16, 18, 0, 0)

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

async function session(): Promise<string> {
  const response = await handleRequest(
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
  return (response.headers.get('set-cookie') ?? '').split(';', 1)[0]!
}

function money(amount: string, currencyCode = 'USD') {
  return { shopMoney: { amount, currencyCode } }
}

function line(
  id: string,
  amount: string,
  options: {
    quantity?: number
    productId?: string | null
    variantId?: string | null
    sku?: string | null
  } = {},
) {
  return {
    id: `gid://shopify/LineItem/${id}`,
    title: `Product ${id}`,
    variantTitle: `Variant ${id}`,
    sku: options.sku === undefined ? `SKU-${id}` : options.sku,
    currentQuantity: options.quantity ?? 1,
    product:
      options.productId === null
        ? null
        : { id: `gid://shopify/Product/${options.productId ?? id}` },
    variant:
      options.variantId === null
        ? null
        : { id: `gid://shopify/ProductVariant/${options.variantId ?? id}` },
    priceAfterAllDiscountsBeforeTaxesSet: money(amount),
  }
}

function order(
  id: string,
  total: string,
  lines: ReturnType<typeof line>[],
  options: {
    createdAt?: string
    updatedAt?: string
    cancelledAt?: string | null
    lineItemsNext?: string
  } = {},
) {
  return {
    id: `gid://shopify/Order/${id}`,
    name: `#${id}`,
    createdAt: options.createdAt ?? '2026-08-16T12:00:00Z',
    updatedAt: options.updatedAt ?? '2026-08-16T13:00:00Z',
    cancelledAt: options.cancelledAt ?? null,
    currentTotalPriceSet: money(total),
    lineItems: {
      nodes: lines,
      pageInfo: {
        hasNextPage: Boolean(options.lineItemsNext),
        endCursor: options.lineItemsNext ?? (lines.length ? 'line-end' : null),
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
  nodes: ReturnType<typeof order>[],
  hasNextPage = false,
  endCursor: string | null = nodes.length ? 'top-end' : null,
): Response {
  return graphqlResponse({
    shop: { currencyCode: 'USD', ianaTimezone: 'America/New_York' },
    orders: { nodes, pageInfo: { hasNextPage, endCursor } },
  })
}

function orderFetcher(
  pages: Map<string, Response | (() => Response)>,
  nested: Map<string, Response | (() => Response)> = new Map(),
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/admin/oauth/access_token')) {
      return Response.json({
        access_token: 'transient-order-token',
        scope: 'read_products,read_inventory,read_locations,read_orders',
      })
    }
    const body = JSON.parse(String(init?.body)) as {
      query: string
      variables: Record<string, unknown>
    }
    expect(body.query).not.toMatch(/mutation/iu)
    expect(body.query).not.toMatch(
      /customer|email|phone|shippingAddress|billingAddress|clientIp|note\b/iu,
    )
    expect(init?.headers).toMatchObject({
      'x-shopify-access-token': 'transient-order-token',
    })
    if (body.query.includes('ShopifyOrderLineItems')) {
      const key = `${String(body.variables.id)}:${String(body.variables.after)}`
      const response = nested.get(key)
      if (!response) throw new Error(`Unexpected nested request ${key}`)
      return typeof response === 'function' ? response() : response.clone()
    }
    expect(body.variables.first).toBe(SHOPIFY_ORDER_PAGE_SIZE)
    expect(String(body.variables.query)).toContain('created_at:>=')
    const response = pages.get(String(body.variables.after ?? 'start'))
    if (!response) throw new Error('Unexpected order page.')
    return typeof response === 'function' ? response() : response.clone()
  }) as typeof fetch
}

async function count(table: string): Promise<number> {
  return (await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{
    count: number
  }>())!.count
}

beforeEach(async () => {
  vi.unstubAllGlobals()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM shopify_order_line_items'),
    env.DB.prepare('DELETE FROM shopify_orders'),
    env.DB.prepare('DELETE FROM shopify_order_sync_runs'),
    env.DB.prepare('DELETE FROM shopify_connection'),
    env.DB.prepare('DELETE FROM admin_sessions'),
    env.DB.prepare('DELETE FROM owner_credentials'),
  ])
})

describe('Shopify order ingestion', () => {
  it('ingests real-shaped orders idempotently without PII or token persistence', async () => {
    await connectedShopify()
    const pages = new Map([
      [
        'start',
        topPage([
          order('1', '10.10', [line('1', '8.10')]),
          order('2', '0.20', [
            line('2', '0.20', { productId: null, variantId: null }),
          ]),
        ]),
      ],
    ])
    const first = await syncShopifyOrders(
      env.DB,
      key,
      orderFetcher(pages),
      vi
        .fn()
        .mockReturnValueOnce(startedAt)
        .mockReturnValueOnce(startedAt + 1000),
    )
    expect(first).toMatchObject({
      status: 'complete',
      coverageComplete: true,
      sourceCoverage: 'recent_60_days_only',
      shopTimezone: 'America/New_York',
      currency: 'USD',
      counts: { orders: 2, lineItems: 2 },
    })
    expect(Date.parse(first.windowEnd) - Date.parse(first.windowStart)).toBe(
      60 * 24 * 60 * 60 * 1000,
    )
    expect(await count('shopify_orders')).toBe(2)
    expect(await count('shopify_order_line_items')).toBe(2)
    const missingCatalog = await env.DB.prepare(
      `SELECT product_gid, variant_gid FROM shopify_order_line_items
       WHERE source_gid = 'gid://shopify/LineItem/2'`,
    ).first<{ product_gid: string | null; variant_gid: string | null }>()
    expect(missingCatalog).toEqual({ product_gid: null, variant_gid: null })
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE sql LIKE '%access_token%' OR sql LIKE '%customer%' OR sql LIKE '%email%' OR sql LIKE '%address%'",
      ).first<{ count: number }>(),
    ).toEqual({ count: 0 })

    await syncShopifyOrders(env.DB, key, orderFetcher(pages))
    expect(await count('shopify_orders')).toBe(2)
    expect(await count('shopify_order_line_items')).toBe(2)
  })

  it('paginates orders and nested line items, then replaces changed source truth', async () => {
    await connectedShopify()
    const firstOrder = order('1', '15', [line('1', '5')], {
      lineItemsNext: 'lines-1',
    })
    const pages = new Map<string, Response>([
      ['start', topPage([firstOrder], true, 'orders-1')],
      ['orders-1', topPage([order('2', '20', [line('3', '20')])])],
    ])
    const nested = new Map<string, Response>([
      [
        'gid://shopify/Order/1:lines-1',
        graphqlResponse({
          order: {
            id: 'gid://shopify/Order/1',
            lineItems: {
              nodes: [line('2', '10')],
              pageInfo: { hasNextPage: false, endCursor: 'lines-end' },
            },
          },
        }),
      ],
    ])
    const result = await syncShopifyOrders(
      env.DB,
      key,
      orderFetcher(pages, nested),
    )
    expect(result.counts).toMatchObject({ orders: 2, lineItems: 3, pages: 2 })

    const changed = new Map([
      [
        'start',
        topPage([
          order('1', '7.25', [line('1', '7.25', { quantity: 2 })], {
            updatedAt: '2026-08-16T17:00:00Z',
          }),
        ]),
      ],
    ])
    await syncShopifyOrders(env.DB, key, orderFetcher(changed))
    expect(await count('shopify_orders')).toBe(2)
    expect(await count('shopify_order_line_items')).toBe(2)
    const updated = await env.DB.prepare(
      `SELECT current_total_amount, updated_at FROM shopify_orders
       WHERE source_gid = 'gid://shopify/Order/1'`,
    ).first<{ current_total_amount: string; updated_at: number }>()
    expect(updated).toEqual({
      current_total_amount: '7.25',
      updated_at: Date.parse('2026-08-16T17:00:00Z'),
    })
  })

  it('resumes a nested line-item cursor after the per-invocation request bound', async () => {
    await connectedShopify()
    const nested = new Map<string, Response>()
    for (let page = 1; page <= SHOPIFY_MAX_ORDER_REQUESTS; page += 1) {
      nested.set(
        `gid://shopify/Order/1:lines-${page}`,
        graphqlResponse({
          order: {
            id: 'gid://shopify/Order/1',
            lineItems: {
              nodes: [line(`nested-${page}`, '1')],
              pageInfo: {
                hasNextPage: page < SHOPIFY_MAX_ORDER_REQUESTS,
                endCursor:
                  page < SHOPIFY_MAX_ORDER_REQUESTS
                    ? `lines-${page + 1}`
                    : 'lines-end',
              },
            },
          },
        }),
      )
    }
    const fetcher = orderFetcher(
      new Map([
        [
          'start',
          topPage([order('1', '20', [], { lineItemsNext: 'lines-1' })]),
        ],
      ]),
      nested,
    )

    const partial = await syncShopifyOrders(env.DB, key, fetcher)
    expect(partial).toMatchObject({
      status: 'partial',
      continuationAvailable: true,
      counts: { requests: SHOPIFY_MAX_ORDER_REQUESTS, pages: 0 },
    })
    expect(await count('shopify_orders')).toBe(0)

    const complete = await syncShopifyOrders(env.DB, key, fetcher)
    expect(complete).toMatchObject({
      status: 'complete',
      coverageComplete: true,
      counts: {
        requests: SHOPIFY_MAX_ORDER_REQUESTS + 1,
        pages: 1,
        orders: 1,
        lineItems: SHOPIFY_MAX_ORDER_REQUESTS,
      },
    })
    expect(await count('shopify_order_line_items')).toBe(
      SHOPIFY_MAX_ORDER_REQUESTS,
    )
  })

  it('rejects a concurrent order scan through the production D1 guard', async () => {
    await connectedShopify()
    let release!: () => void
    let reached!: () => void
    const reachedTopRequest = new Promise<void>((resolve) => {
      reached = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/admin/oauth/access_token'))
        return Response.json({
          access_token: 'transient-order-token',
          scope: 'read_products,read_inventory,read_locations,read_orders',
        })
      reached()
      await blocked
      return topPage([])
    }) as typeof fetch

    const first = syncShopifyOrders(env.DB, key, fetcher)
    await reachedTopRequest
    await expect(syncShopifyOrders(env.DB, key, fetcher)).rejects.toMatchObject(
      {
        code: 'SYNC_IN_PROGRESS',
      } satisfies Partial<ShopifyOrderSyncConflictError>,
    )
    release()
    await expect(first).resolves.toMatchObject({ status: 'complete' })
  })

  it('preserves prior data and truthful status after a later-page failure', async () => {
    await connectedShopify()
    await syncShopifyOrders(
      env.DB,
      key,
      orderFetcher(new Map([['start', topPage([order('old', '4', [])])]])),
    )
    const result = await syncShopifyOrders(
      env.DB,
      key,
      orderFetcher(
        new Map<string, Response | (() => Response)>([
          ['start', topPage([order('new', '8', [])], true, 'next')],
          ['next', () => new Response('unavailable', { status: 503 })],
        ]),
      ),
    )
    expect(result).toMatchObject({
      status: 'partial',
      coverageComplete: false,
      lastErrorCode: 'SOURCE_UNAVAILABLE',
    })
    expect(await count('shopify_orders')).toBe(2)
    await expect(
      queryShopifySales(env.DB, {
        start: '2026-08-16T00:00:00.000Z',
        end: '2026-08-16T18:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'COVERAGE_UNAVAILABLE' })
  })

  it('rejects cross-currency source values without committing them', async () => {
    await connectedShopify()
    const invalid = order('1', '10', [line('1', '10')])
    invalid.currentTotalPriceSet = money('10', 'CAD')
    const result = await syncShopifyOrders(
      env.DB,
      key,
      orderFetcher(new Map([['start', topPage([invalid])]])),
    )
    expect(result).toMatchObject({
      status: 'failed',
      lastErrorCode: 'PROVIDER_CHANGED',
    })
    expect(await count('shopify_orders')).toBe(0)
  })

  it('records a bounded sanitized failure when Shopify throttles order acquisition', async () => {
    await connectedShopify()
    const result = await syncShopifyOrders(
      env.DB,
      key,
      orderFetcher(
        new Map([['start', new Response('limited', { status: 429 })]]),
      ),
    )
    expect(result).toMatchObject({
      status: 'failed',
      coverageComplete: false,
      lastErrorCode: 'RATE_LIMITED',
      counts: { requests: 1, pages: 0 },
    })
    expect(await count('shopify_orders')).toBe(0)
  })
})

describe('Shopify sales read model', () => {
  it('parses bounded decimal money exactly and rejects unsupported precision', () => {
    expect(parseShopifyMoney('0.1') + parseShopifyMoney('0.2')).toBe(
      parseShopifyMoney('0.3'),
    )
    expect(() => parseShopifyMoney('1.0000001')).toThrow()
    expect(() => parseShopifyMoney('NaN')).toThrow()
  })
  it('aggregates exact current sales, excludes cancellations, and ranks lines', async () => {
    await connectedShopify()
    const pages = new Map([
      [
        'start',
        topPage([
          order('1', '0.1', [line('1', '0.1', { quantity: 2 })]),
          order('2', '0.2', [
            line('1b', '0.2', {
              productId: '1',
              variantId: '1',
              sku: 'SKU-1',
              quantity: 1,
            }),
          ]),
          order('3', '99', [line('3', '99')], {
            cancelledAt: '2026-08-16T14:00:00Z',
          }),
        ]),
      ],
    ])
    await syncShopifyOrders(
      env.DB,
      key,
      orderFetcher(pages),
      vi
        .fn()
        .mockReturnValueOnce(startedAt)
        .mockReturnValueOnce(startedAt + 1000),
    )
    const result = await queryShopifySales(env.DB, {
      start: '2026-08-16T00:00:00.000Z',
      end: '2026-08-16T18:00:00.000Z',
      includeTopProducts: true,
    })
    expect(result).toMatchObject({
      orderCount: 2,
      totalSales: '0.3',
      averageOrderValue: '0.15',
      currency: 'USD',
      timezone: 'America/New_York',
      coverage: { limitation: 'recent_60_days_only', complete: true },
    })
    expect(result.topProducts).toHaveLength(1)
    expect(result.topProducts[0]).toMatchObject({
      quantity: 3,
      merchandiseSalesBeforeTax: '0.3',
    })
  })

  it('returns valid zero sales and rejects uncovered ranges', async () => {
    await connectedShopify()
    await syncShopifyOrders(
      env.DB,
      key,
      orderFetcher(new Map([['start', topPage([])]])),
      vi
        .fn()
        .mockReturnValueOnce(startedAt)
        .mockReturnValueOnce(startedAt + 1000),
    )
    await expect(
      queryShopifySales(env.DB, {
        start: '2026-08-16T00:00:00.000Z',
        end: '2026-08-16T18:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      orderCount: 0,
      totalSales: '0',
      averageOrderValue: null,
      topProducts: [],
    })
    await expect(
      queryShopifySales(env.DB, {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-02T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: 'COVERAGE_UNAVAILABLE',
    } satisfies Partial<ShopifySalesQueryError>)
  })

  it('resolves merchant calendar boundaries across daylight saving time', () => {
    expect(
      resolveShopifySalesPeriod(
        'today',
        Date.parse('2026-03-08T16:00:00Z'),
        'America/New_York',
      ),
    ).toEqual({
      start: '2026-03-08T05:00:00.000Z',
      end: '2026-03-09T04:00:00.000Z',
    })
  })
})

describe('Shopify order sync Admin boundary', () => {
  it('requires authentication, exact Origin, and connected Shopify', async () => {
    const path = '/api/integrations/shopify/orders/sync'
    expect(
      (
        await handleRequest(
          new Request(`${origin}${path}`, {
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
          new Request(`${origin}${path}`, {
            method: 'POST',
            headers: { cookie, origin: 'https://attacker.example' },
          }),
          workerEnv(),
        )
      ).status,
    ).toBe(403)
    const disconnected = await handleRequest(
      new Request(`${origin}${path}`, {
        method: 'POST',
        headers: { cookie, origin },
      }),
      workerEnv(),
    )
    expect(disconnected.status).toBe(409)
  })
})
