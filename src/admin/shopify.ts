export type ShopifyStatus =
  'not_configured' | 'configured' | 'connected' | 'connection_error'

export type ShopifyErrorCode =
  | 'CREDENTIALS_UNAVAILABLE'
  | 'AUTH_FAILED'
  | 'SCOPE_FAILED'
  | 'RATE_LIMITED'
  | 'SOURCE_UNAVAILABLE'
  | 'PROVIDER_CHANGED'
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN'

const shopifyErrorCodes: readonly ShopifyErrorCode[] = [
  'CREDENTIALS_UNAVAILABLE',
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
  sync?: ShopifySyncState | null
  lastSuccessfulSyncAt?: string | null
  orderSync?: ShopifyOrderSyncState | null
  lastSuccessfulOrderSyncAt?: string | null
}

export type ShopifySyncStatus = 'complete' | 'partial' | 'failed'

export interface ShopifySyncState {
  status: ShopifySyncStatus
  coverageComplete: boolean
  continuationAvailable: boolean
  startedAt: string
  completedAt: string | null
  lastErrorCode: ShopifyErrorCode | null
  counts: {
    requests: number
    pages: number
    products: number
    variants: number
    inventoryLevels: number
  }
}

export interface ShopifyOrderSyncState {
  status: ShopifySyncStatus
  coverageComplete: boolean
  continuationAvailable: boolean
  sourceCoverage: 'recent_60_days_only'
  windowStart: string
  windowEnd: string
  shopTimezone: string | null
  currency: string | null
  startedAt: string
  completedAt: string | null
  lastErrorCode: ShopifyErrorCode | null
  counts: {
    requests: number
    pages: number
    orders: number
    lineItems: number
  }
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
      shopifyErrorCodes.includes(state.lastErrorCode as ShopifyErrorCode)) &&
    (state.sync === undefined ||
      state.sync === null ||
      validSync(state.sync)) &&
    (state.lastSuccessfulSyncAt === undefined ||
      state.lastSuccessfulSyncAt === null ||
      typeof state.lastSuccessfulSyncAt === 'string') &&
    (state.orderSync === undefined ||
      state.orderSync === null ||
      validOrderSync(state.orderSync)) &&
    (state.lastSuccessfulOrderSyncAt === undefined ||
      state.lastSuccessfulOrderSyncAt === null ||
      typeof state.lastSuccessfulOrderSyncAt === 'string')
  )
}

function validOrderSync(value: unknown): value is ShopifyOrderSyncState {
  if (!value || typeof value !== 'object') return false
  const sync = value as Partial<ShopifyOrderSyncState>
  const counts = sync.counts as
    Partial<ShopifyOrderSyncState['counts']> | undefined
  return (
    ['complete', 'partial', 'failed'].includes(sync.status ?? '') &&
    typeof sync.coverageComplete === 'boolean' &&
    typeof sync.continuationAvailable === 'boolean' &&
    sync.sourceCoverage === 'recent_60_days_only' &&
    typeof sync.windowStart === 'string' &&
    typeof sync.windowEnd === 'string' &&
    (sync.shopTimezone === null || typeof sync.shopTimezone === 'string') &&
    (sync.currency === null || typeof sync.currency === 'string') &&
    typeof sync.startedAt === 'string' &&
    (sync.completedAt === null || typeof sync.completedAt === 'string') &&
    (sync.lastErrorCode === null ||
      shopifyErrorCodes.includes(sync.lastErrorCode as ShopifyErrorCode)) &&
    !!counts &&
    ['requests', 'pages', 'orders', 'lineItems'].every(
      (key) => typeof counts[key as keyof typeof counts] === 'number',
    )
  )
}

function validSync(value: unknown): value is ShopifySyncState {
  if (!value || typeof value !== 'object') return false
  const sync = value as Partial<ShopifySyncState>
  const counts = sync.counts as Partial<ShopifySyncState['counts']> | undefined
  return (
    ['complete', 'partial', 'failed'].includes(sync.status ?? '') &&
    typeof sync.coverageComplete === 'boolean' &&
    typeof sync.continuationAvailable === 'boolean' &&
    typeof sync.startedAt === 'string' &&
    (sync.completedAt === null || typeof sync.completedAt === 'string') &&
    (sync.lastErrorCode === null ||
      shopifyErrorCodes.includes(sync.lastErrorCode as ShopifyErrorCode)) &&
    !!counts &&
    ['requests', 'pages', 'products', 'variants', 'inventoryLevels'].every(
      (key) => typeof counts[key as keyof typeof counts] === 'number',
    )
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

export async function syncShopifyInventory(
  request: Request = globalThis.fetch.bind(globalThis),
): Promise<ShopifySyncState> {
  const response = await request('/api/integrations/shopify/sync', {
    method: 'POST',
    credentials: 'same-origin',
  })
  const body: unknown = await response.json()
  const sync =
    body && typeof body === 'object'
      ? (body as { sync?: unknown }).sync
      : undefined
  if (!validSync(sync)) throw new Error('Shopify synchronization failed')
  return sync
}

export async function syncShopifyOrders(
  request: Request = globalThis.fetch.bind(globalThis),
): Promise<ShopifyOrderSyncState> {
  const response = await request('/api/integrations/shopify/orders/sync', {
    method: 'POST',
    credentials: 'same-origin',
  })
  const body: unknown = await response.json()
  const sync =
    body && typeof body === 'object'
      ? (body as { sync?: unknown }).sync
      : undefined
  if (!validOrderSync(sync))
    throw new Error('Shopify order synchronization failed')
  return sync
}
