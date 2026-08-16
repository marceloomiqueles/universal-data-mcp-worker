export type ShopifyStatus =
  'not_configured' | 'configured' | 'connected' | 'connection_error'

export type ShopifyErrorCode =
  | 'AUTH_FAILED'
  | 'SCOPE_FAILED'
  | 'RATE_LIMITED'
  | 'SOURCE_UNAVAILABLE'
  | 'PROVIDER_CHANGED'
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN'

const shopifyErrorCodes: readonly ShopifyErrorCode[] = [
  'AUTH_FAILED',
  'SCOPE_FAILED',
  'RATE_LIMITED',
  'SOURCE_UNAVAILABLE',
  'PROVIDER_CHANGED',
  'MALFORMED_RESPONSE',
  'UNKNOWN',
]

export interface ShopifyConnectionState {
  shopDomain: string | null
  clientId: string | null
  secretConfigured: boolean
  status: ShopifyStatus
  verifiedAt: string | null
  lastErrorCode: ShopifyErrorCode | null
}

export interface ShopifyConfigurationInput {
  shopDomain: string
  clientId: string
  clientSecret?: string
}

type Request = typeof fetch

function validState(value: unknown): value is ShopifyConnectionState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<ShopifyConnectionState>
  return (
    (state.shopDomain === null || typeof state.shopDomain === 'string') &&
    (state.clientId === null || typeof state.clientId === 'string') &&
    typeof state.secretConfigured === 'boolean' &&
    ['not_configured', 'configured', 'connected', 'connection_error'].includes(
      state.status ?? '',
    ) &&
    (state.verifiedAt === null || typeof state.verifiedAt === 'string') &&
    (state.lastErrorCode === null ||
      shopifyErrorCodes.includes(state.lastErrorCode as ShopifyErrorCode))
  )
}

async function stateResponse(
  response: Response,
): Promise<ShopifyConnectionState> {
  if (!response.ok) throw new Error('Shopify request failed')
  const body: unknown = await response.json()
  if (!validState(body)) throw new Error('Invalid Shopify response')
  return body
}

export async function fetchShopifyConnection(
  request: Request = globalThis.fetch.bind(globalThis),
): Promise<ShopifyConnectionState> {
  return stateResponse(
    await request('/api/integrations/shopify', { credentials: 'same-origin' }),
  )
}

export async function saveShopifyConfiguration(
  input: ShopifyConfigurationInput,
  request: Request = globalThis.fetch.bind(globalThis),
): Promise<ShopifyConnectionState> {
  return stateResponse(
    await request('/api/integrations/shopify/configuration', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function verifyShopifyConnection(
  request: Request = globalThis.fetch.bind(globalThis),
): Promise<ShopifyConnectionState> {
  const response = await request('/api/integrations/shopify/verify', {
    method: 'POST',
    credentials: 'same-origin',
  })
  const body: unknown = await response.json()
  if (!validState(body)) throw new Error('Invalid Shopify response')
  return body
}

export async function disconnectShopify(
  request: Request = globalThis.fetch.bind(globalThis),
): Promise<void> {
  const response = await request('/api/integrations/shopify/disconnect', {
    method: 'POST',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('Shopify disconnect failed')
}
