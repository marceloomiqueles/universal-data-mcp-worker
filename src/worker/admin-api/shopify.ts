import {
  disconnectShopify,
  getShopifyConnection,
  saveShopifyConfiguration,
  verifySavedShopifyConnection,
} from '../../integrations/shopify/connection'
import { ShopifyConnectionError } from '../../integrations/shopify/provider'
import {
  getShopifySyncStatus,
  ShopifySyncConflictError,
  syncShopifyInventory,
} from '../../integrations/shopify/ingestion'

export interface ShopifyEnv {
  DB: D1Database
  INTEGRATION_SECRETS_KEY?: string
}

function response(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function failure(code: string, message: string, status: number): Response {
  return response({ error: { code, message } }, status)
}

function key(env: ShopifyEnv): string | undefined {
  return typeof env.INTEGRATION_SECRETS_KEY === 'string' &&
    /^[A-Za-z0-9_-]{43}$/u.test(env.INTEGRATION_SECRETS_KEY)
    ? env.INTEGRATION_SECRETS_KEY
    : undefined
}

export async function getShopify(
  request: Request,
  env: ShopifyEnv,
): Promise<Response> {
  const state = await getShopifyConnection(env.DB)
  return response({
    ...(state ?? {
      shopDomain: null,
      clientId: null,
      secretConfigured: false,
      status: 'not_configured',
      verifiedAt: null,
      lastErrorCode: null,
    }),
    sync: await getShopifySyncStatus(env.DB),
  })
}

export async function putShopify(
  request: Request,
  env: ShopifyEnv,
): Promise<Response> {
  const encryptionKey = key(env)
  if (!encryptionKey)
    return failure(
      'CONFIGURATION_UNAVAILABLE',
      'Integration secret encryption is not configured.',
      503,
    )
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json') ||
    Number(request.headers.get('content-length') ?? 0) > 8192
  ) {
    return failure(
      'INVALID_REQUEST',
      'Valid Shopify configuration is required.',
      400,
    )
  }
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > 8192) throw new Error('Request too large')
    body = JSON.parse(text) as unknown
  } catch {
    return failure(
      'INVALID_REQUEST',
      'Valid Shopify configuration is required.',
      400,
    )
  }
  if (!body || typeof body !== 'object')
    return failure(
      'INVALID_REQUEST',
      'Valid Shopify configuration is required.',
      400,
    )
  const value = body as Record<string, unknown>
  if (
    typeof value.shopDomain !== 'string' ||
    typeof value.clientId !== 'string' ||
    !(
      value.clientSecret === undefined || typeof value.clientSecret === 'string'
    )
  ) {
    return failure(
      'INVALID_REQUEST',
      'Valid Shopify configuration is required.',
      400,
    )
  }
  try {
    return response(
      await saveShopifyConfiguration(env.DB, encryptionKey, {
        shopDomain: value.shopDomain,
        clientId: value.clientId,
        clientSecret: value.clientSecret as string | undefined,
      }),
    )
  } catch (cause) {
    if (cause instanceof ShopifyConnectionError)
      return failure(
        'INVALID_REQUEST',
        'Valid Shopify configuration is required.',
        400,
      )
    throw cause
  }
}

export async function verifyShopify(env: ShopifyEnv): Promise<Response> {
  const encryptionKey = key(env)
  if (!encryptionKey)
    return failure(
      'CONFIGURATION_UNAVAILABLE',
      'Integration secret encryption is not configured.',
      503,
    )
  const state = await verifySavedShopifyConnection(env.DB, encryptionKey)
  if (!state)
    return failure('NOT_CONFIGURED', 'Shopify configuration is required.', 409)
  return response(state, state.status === 'connected' ? 200 : 422)
}

export async function deleteShopify(env: ShopifyEnv): Promise<Response> {
  await disconnectShopify(env.DB)
  return response({ status: 'not_configured' })
}

export async function syncShopify(env: ShopifyEnv): Promise<Response> {
  const encryptionKey = key(env)
  if (!encryptionKey)
    return failure(
      'CONFIGURATION_UNAVAILABLE',
      'Integration secret encryption is not configured.',
      503,
    )
  try {
    const sync = await syncShopifyInventory(env.DB, encryptionKey)
    const status =
      sync.lastErrorCode === 'RATE_LIMITED'
        ? 429
        : sync.lastErrorCode
          ? 502
          : 200
    return response({ sync }, status)
  } catch (cause) {
    if (cause instanceof ShopifySyncConflictError) {
      return failure(
        cause.code,
        cause.code === 'NOT_CONNECTED'
          ? 'Shopify must be connected before inventory can be synchronized.'
          : 'A Shopify inventory synchronization is already running.',
        409,
      )
    }
    throw cause
  }
}
