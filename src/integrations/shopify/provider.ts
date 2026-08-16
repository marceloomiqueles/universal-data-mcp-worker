export const SHOPIFY_API_VERSION = '2026-07'
export const SHOPIFY_REQUIRED_SCOPES = [
  'read_inventory',
  'read_locations',
  'read_orders',
  'read_products',
] as const

export type ShopifyConnectionErrorCode =
  | 'CREDENTIALS_UNAVAILABLE'
  | 'AUTH_FAILED'
  | 'SCOPE_FAILED'
  | 'RATE_LIMITED'
  | 'SOURCE_UNAVAILABLE'
  | 'PROVIDER_CHANGED'
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN'

export class ShopifyConnectionError extends Error {
  constructor(readonly code: ShopifyConnectionErrorCode) {
    super('Shopify connection verification failed.')
    this.name = 'ShopifyConnectionError'
  }
}

export interface ShopifyCredentials {
  readonly shopDomain: string
  readonly clientId: string
  readonly clientSecret: string
}

export function canonicalShopDomain(value: string): string {
  const domain = value.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,59}[a-z0-9])?\.myshopify\.com$/u.test(domain))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return domain
}

const verificationQuery = `query VerifyShopifyConnection { shop { id myshopifyDomain } }`

export async function boundedShopifyJson(
  response: Response,
  maximumBytes = 64 * 1024,
): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > maximumBytes)
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  try {
    const value = JSON.parse(text) as unknown
    if (!value || typeof value !== 'object') throw new Error()
    return value as Record<string, unknown>
  } catch {
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  }
}

export async function shopifyProviderFetch(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(input, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ShopifyConnectionError('SOURCE_UNAVAILABLE')
  }
}

export async function verifyShopifyConnection(
  credentials: ShopifyCredentials,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const shopDomain = canonicalShopDomain(credentials.shopDomain)
  const { accessToken: token } = await acquireShopifyAccessToken(
    { ...credentials, shopDomain },
    fetcher,
  )

  const response = await shopifyProviderFetch(
    fetcher,
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-access-token': token,
      },
      body: JSON.stringify({ query: verificationQuery }),
    },
  )
  if (response.status === 429) throw new ShopifyConnectionError('RATE_LIMITED')
  if (response.status === 401 || response.status === 403)
    throw new ShopifyConnectionError('AUTH_FAILED')
  if (!response.ok)
    throw new ShopifyConnectionError(
      response.status >= 500 ? 'SOURCE_UNAVAILABLE' : 'PROVIDER_CHANGED',
    )
  if (response.headers.get('x-shopify-api-version') !== SHOPIFY_API_VERSION)
    throw new ShopifyConnectionError('PROVIDER_CHANGED')
  const body = await boundedShopifyJson(response)
  if (Array.isArray(body.errors)) {
    const codes = body.errors.map((item) => {
      const error =
        item && typeof item === 'object'
          ? (item as Record<string, unknown>)
          : {}
      const extensions =
        error.extensions && typeof error.extensions === 'object'
          ? (error.extensions as Record<string, unknown>)
          : {}
      return extensions.code
    })
    if (codes.includes('THROTTLED'))
      throw new ShopifyConnectionError('RATE_LIMITED')
    if (codes.includes('ACCESS_DENIED'))
      throw new ShopifyConnectionError('SCOPE_FAILED')
    throw new ShopifyConnectionError('PROVIDER_CHANGED')
  }
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : undefined
  const shop =
    data?.shop && typeof data.shop === 'object'
      ? (data.shop as Record<string, unknown>)
      : undefined
  if (typeof shop?.id !== 'string' || shop.myshopifyDomain !== shopDomain)
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
}

export async function acquireShopifyAccessToken(
  credentials: ShopifyCredentials,
  fetcher: typeof fetch = fetch,
): Promise<{ accessToken: string; grantedScopes: readonly string[] }> {
  const shopDomain = canonicalShopDomain(credentials.shopDomain)
  const tokenResponse = await shopifyProviderFetch(
    fetcher,
    `https://${shopDomain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
    },
  )
  if (tokenResponse.status === 429)
    throw new ShopifyConnectionError('RATE_LIMITED')
  if (!tokenResponse.ok)
    throw new ShopifyConnectionError(
      tokenResponse.status >= 500 ? 'SOURCE_UNAVAILABLE' : 'AUTH_FAILED',
    )
  const tokenBody = await boundedShopifyJson(tokenResponse)
  const token =
    typeof tokenBody.access_token === 'string'
      ? tokenBody.access_token
      : undefined
  const scopes =
    typeof tokenBody.scope === 'string'
      ? tokenBody.scope.split(/[ ,]+/u).filter(Boolean)
      : []
  if (!token) throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  if (SHOPIFY_REQUIRED_SCOPES.some((scope) => !scopes.includes(scope)))
    throw new ShopifyConnectionError('SCOPE_FAILED')
  return { accessToken: token, grantedScopes: scopes }
}
