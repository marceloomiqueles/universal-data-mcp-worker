import { env } from 'cloudflare:test'
import { expect, it } from 'vitest'

import {
  acquireShopifyAccessToken,
  SHOPIFY_API_VERSION,
  SHOPIFY_REQUIRED_SCOPES,
} from '../../src/integrations/shopify/provider'
import { handleRequest, type Env } from '../../src/worker/index'

const origin = 'https://shopify-live-validation.example.test'
const allow: RateLimit = { limit: async () => ({ success: true }) }

interface LiveOrderSync {
  status: 'complete' | 'partial' | 'failed'
  coverageComplete: boolean
  sourceCoverage: string
  currency: string | null
  shopTimezone: string | null
  counts: { orders: number; lineItems: number }
  lastErrorCode: string | null
}

function workerEnv(): Env {
  return {
    ASSETS: { fetch: async () => new Response('SPA') },
    DB: env.DB,
    LOGIN_RATE_LIMITER: allow,
    MCP_OAUTH_RATE_LIMITER: allow,
    OAUTH_KV: env.OAUTH_KV,
    OWNER_SETUP_TOKEN: env.OWNER_SETUP_TOKEN,
    INTEGRATION_SECRETS_KEY: env.INTEGRATION_SECRETS_KEY,
  }
}

function adminRequest(
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

it('validates the real Shopify development store through the production Admin backend', async () => {
  const { grantedScopes } = await acquireShopifyAccessToken({
    shopDomain: env.LIVE_SHOPIFY_SHOP_DOMAIN,
    clientId: env.LIVE_SHOPIFY_CLIENT_ID,
    clientSecret: env.LIVE_SHOPIFY_CLIENT_SECRET,
  })
  const setup = await handleRequest(
    new Request(`${origin}/api/auth/setup`, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-owner-bootstrap-proof': env.OWNER_SETUP_TOKEN,
      },
      body: JSON.stringify({
        username: 'live-validation-owner',
        password: 'temporary live validation password',
      }),
    }),
    workerEnv(),
  )
  expect(setup.status).toBe(201)
  const cookie = (setup.headers.get('set-cookie') ?? '').split(';', 1)[0]!

  const saved = await handleRequest(
    adminRequest('/api/integrations/shopify/configuration', cookie, 'PUT', {
      shopDomain: env.LIVE_SHOPIFY_SHOP_DOMAIN,
      clientId: env.LIVE_SHOPIFY_CLIENT_ID,
      clientSecret: env.LIVE_SHOPIFY_CLIENT_SECRET,
    }),
    workerEnv(),
  )
  expect(saved.status).toBe(200)
  const stored = await env.DB.prepare(
    'SELECT client_secret_envelope FROM shopify_connection WHERE id = 1',
  ).first<{ client_secret_envelope: string }>()
  expect(stored?.client_secret_envelope).toBeTruthy()
  expect(stored?.client_secret_envelope).not.toContain(
    env.LIVE_SHOPIFY_CLIENT_SECRET,
  )

  const verified = await handleRequest(
    adminRequest('/api/integrations/shopify/verify', cookie, 'POST'),
    workerEnv(),
  )
  const verifiedBody = (await verified.json()) as {
    status?: string
    secretConfigured?: boolean
    lastErrorCode?: string | null
    error?: { code?: string }
  }
  expect({
    httpStatus: verified.status,
    status: verifiedBody.status,
    secretConfigured: verifiedBody.secretConfigured,
    lastErrorCode: verifiedBody.lastErrorCode,
    errorCode: verifiedBody.error?.code,
  }).toEqual({
    httpStatus: 200,
    status: 'connected',
    secretConfigured: true,
    lastErrorCode: null,
    errorCode: undefined,
  })
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE sql LIKE '%access_token%'",
    ).first<{ count: number }>(),
  ).toEqual({ count: 0 })

  const synchronized = await handleRequest(
    adminRequest('/api/integrations/shopify/sync', cookie, 'POST'),
    workerEnv(),
  )
  expect(synchronized.status).toBe(200)
  await expect(synchronized.json()).resolves.toMatchObject({
    sync: { status: 'complete', coverageComplete: true },
  })
  const tables = [
    'shopify_products',
    'shopify_variants',
    'shopify_inventory_items',
    'shopify_inventory_levels',
    'shopify_locations',
  ] as const
  const counts = Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [
        table,
        (await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{
          count: number
        }>())!.count,
      ]),
    ),
  )
  expect(counts.shopify_products).toBeGreaterThan(0)
  expect(counts.shopify_variants).toBeGreaterThan(0)
  expect(counts.shopify_inventory_items).toBeGreaterThan(0)
  expect(counts.shopify_inventory_levels).toBeGreaterThan(0)
  expect(counts.shopify_locations).toBeGreaterThan(0)

  const repeated = await handleRequest(
    adminRequest('/api/integrations/shopify/sync', cookie, 'POST'),
    workerEnv(),
  )
  expect(repeated.status).toBe(200)
  const repeatedCounts = Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [
        table,
        (await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{
          count: number
        }>())!.count,
      ]),
    ),
  )
  expect(repeatedCounts).toEqual(counts)

  let orderSync: LiveOrderSync | null = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const orders = await handleRequest(
      adminRequest('/api/integrations/shopify/orders/sync', cookie, 'POST'),
      workerEnv(),
    )
    expect(orders.status).toBe(200)
    const result = (await orders.json()) as { sync: LiveOrderSync }
    orderSync = result.sync
    if (orderSync?.status !== 'partial') break
  }
  expect(orderSync).toMatchObject({
    status: 'complete',
    coverageComplete: true,
    sourceCoverage: 'recent_60_days_only',
    lastErrorCode: null,
  })
  const orderCounts = {
    orders: (await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM shopify_orders',
    ).first<{ count: number }>())!.count,
    lineItems: (await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM shopify_order_line_items',
    ).first<{ count: number }>())!.count,
  }
  expect(orderSync?.counts).toMatchObject(orderCounts)
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE sql LIKE '%customer%' OR sql LIKE '%email%' OR sql LIKE '%address%'",
    ).first<{ count: number }>(),
  ).toEqual({ count: 0 })

  console.info(
    'Sanitized Shopify product and order-path validation evidence:',
    {
      apiVersion: SHOPIFY_API_VERSION,
      requiredProductScopes: [...SHOPIFY_REQUIRED_SCOPES],
      providerReportedGrantedScopes: [...grantedScopes].sort(),
      store: 'maintainer-controlled development store',
      encryptedAtRest: true,
      tokenPersisted: false,
      resultingState: 'connected',
      syncStatus: 'complete',
      counts,
      repeatedSyncStable: true,
      orderSync: {
        status: orderSync?.status,
        sourceCoverage: orderSync?.sourceCoverage,
        currency: orderSync?.currency,
        shopTimezoneConfigured: Boolean(orderSync?.shopTimezone),
        counts: orderCounts,
        customerIdentityPersisted: false,
      },
    },
  )
})
