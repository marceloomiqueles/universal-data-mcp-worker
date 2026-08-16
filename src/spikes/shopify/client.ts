export const SHOPIFY_API_VERSION = '2026-07'
export const SHOPIFY_PRODUCT_PAGE_SIZE = 2
export const SHOPIFY_MAX_PAGES = 3
export const SHOPIFY_MAX_VARIANTS_PER_PRODUCT = 20
export const SHOPIFY_MAX_LEVELS_PER_ITEM = 20

const requiredScopes = new Set([
  'read_inventory',
  'read_locations',
  'read_products',
])
const maximumResponseBytes = 1_000_000
const requestTimeoutMs = 10_000

export const SHOPIFY_PRODUCTS_QUERY = `
query ShopifySpikeProducts($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    nodes {
      id
      title
      handle
      variants(first: ${SHOPIFY_MAX_VARIANTS_PER_PRODUCT}) {
        nodes {
          id
          title
          sku
          inventoryItem {
            id
            tracked
            inventoryLevels(first: ${SHOPIFY_MAX_LEVELS_PER_ITEM}) {
              nodes {
                id
                location { id name }
                quantities(names: ["available"]) { name quantity }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

export type ShopifySpikeErrorCode =
  | 'CONFIGURATION_MISSING'
  | 'AUTH_FAILED'
  | 'SCOPE_FAILED'
  | 'GRAPHQL_ERROR'
  | 'THROTTLED'
  | 'PROVIDER_UNAVAILABLE'
  | 'MALFORMED_RESPONSE'

export class ShopifySpikeError extends Error {
  constructor(
    readonly code: ShopifySpikeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ShopifySpikeError'
  }
}

export interface ShopifySpikeConfig {
  shopDomain: string
  clientId: string
  clientSecret: string
}

export interface ShopifyInventoryLevel {
  id: string
  location: { id: string; name: string }
  available: number | null
}

export interface ShopifyVariant {
  id: string
  title: string
  sku: string | null
  inventoryItem: {
    id: string
    tracked: boolean
    levels: ShopifyInventoryLevel[]
    truncated: boolean
  }
}

export interface ShopifyProduct {
  id: string
  title: string
  handle: string
  variants: ShopifyVariant[]
  variantsTruncated: boolean
}

export interface ShopifyQueryCost {
  requested: number
  actual: number
  currentlyAvailable: number
  restoreRate: number
}

export interface ShopifySpikeResult {
  apiVersion: typeof SHOPIFY_API_VERSION
  grantedScopes: string[]
  pagesRead: number
  paginationExercised: boolean
  truncated: boolean
  products: ShopifyProduct[]
  queryCosts: ShopifyQueryCost[]
}

type Fetch = typeof fetch

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function requiredString(value: unknown): string {
  const result = string(value)
  if (!result) throw malformedResponse()
  return result
}

function malformedResponse(): ShopifySpikeError {
  return new ShopifySpikeError(
    'MALFORMED_RESPONSE',
    'Shopify returned an unexpected response.',
  )
}

async function boundedJson(response: Response): Promise<unknown> {
  const announcedLength = Number(response.headers.get('content-length'))
  if (
    Number.isFinite(announcedLength) &&
    announcedLength > maximumResponseBytes
  ) {
    throw malformedResponse()
  }

  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
    throw malformedResponse()
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw malformedResponse()
  }
}

function requestSignal(): AbortSignal {
  return AbortSignal.timeout(requestTimeoutMs)
}

async function providerFetch(
  fetcher: Fetch,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(input, { ...init, signal: requestSignal() })
  } catch {
    throw new ShopifySpikeError(
      'PROVIDER_UNAVAILABLE',
      'Shopify could not be reached.',
    )
  }
}

export function validateShopDomain(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,59}[a-z0-9])?\.myshopify\.com$/u.test(normalized)
  ) {
    throw new ShopifySpikeError(
      'CONFIGURATION_MISSING',
      'SHOPIFY_SHOP_DOMAIN must be a canonical myshopify.com hostname.',
    )
  }
  return normalized
}

export function validateConfiguration(
  config: ShopifySpikeConfig,
): ShopifySpikeConfig {
  const shopDomain = validateShopDomain(config.shopDomain)
  if (!config.clientId.trim() || !config.clientSecret) {
    throw new ShopifySpikeError(
      'CONFIGURATION_MISSING',
      'Shopify Spike 0 configuration is incomplete.',
    )
  }
  return { ...config, shopDomain }
}

export function assertReadOnlyShopifyQuery(query: string): void {
  if (!/^\s*query\b/u.test(query) || /\bmutation\b/iu.test(query)) {
    throw new Error('Shopify Spike 0 permits GraphQL query operations only.')
  }
}

function parseScopes(value: unknown): string[] {
  const scopes = string(value)
    ?.split(/[ ,]+/u)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .sort()
  if (
    !scopes ||
    scopes.length !== requiredScopes.size ||
    scopes.some((scope) => !requiredScopes.has(scope))
  ) {
    throw new ShopifySpikeError(
      'SCOPE_FAILED',
      'Shopify did not grant the exact read-only spike scopes.',
    )
  }
  return scopes
}

export async function acquireShopifyAccessToken(
  input: ShopifySpikeConfig,
  fetcher: Fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number; scopes: string[] }> {
  const config = validateConfiguration(input)
  const response = await providerFetch(
    fetcher,
    `https://${config.shopDomain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    },
  )

  if (!response.ok) {
    throw new ShopifySpikeError(
      'AUTH_FAILED',
      'Shopify rejected the development-store credentials.',
    )
  }

  const body = record(await boundedJson(response))
  const accessToken = string(body?.access_token)
  const expiresIn = number(body?.expires_in)
  if (!accessToken || !expiresIn || expiresIn <= 0) throw malformedResponse()

  return { accessToken, expiresIn, scopes: parseScopes(body?.scope) }
}

function parsePageInfo(value: unknown): {
  hasNextPage: boolean
  endCursor: string | null
} {
  const pageInfo = record(value)
  const hasNextPage = boolean(pageInfo?.hasNextPage)
  const endCursor = pageInfo?.endCursor
  if (
    hasNextPage === undefined ||
    !(endCursor === null || typeof endCursor === 'string') ||
    (hasNextPage && !endCursor)
  ) {
    throw malformedResponse()
  }
  return { hasNextPage, endCursor }
}

function parseInventoryLevel(value: unknown): ShopifyInventoryLevel {
  const level = record(value)
  const location = record(level?.location)
  const quantities = Array.isArray(level?.quantities) ? level.quantities : []
  const available = quantities.find(
    (quantity) => record(quantity)?.name === 'available',
  )
  const quantity = record(available)?.quantity
  if (!(quantity === undefined || typeof quantity === 'number')) {
    throw malformedResponse()
  }

  return {
    id: requiredString(level?.id),
    location: {
      id: requiredString(location?.id),
      name: requiredString(location?.name),
    },
    available: quantity ?? null,
  }
}

function parseVariant(value: unknown): ShopifyVariant {
  const variant = record(value)
  const inventoryItem = record(variant?.inventoryItem)
  const inventoryLevels = record(inventoryItem?.inventoryLevels)
  if (!Array.isArray(inventoryLevels?.nodes)) throw malformedResponse()
  const sku = variant?.sku
  if (!(sku === null || typeof sku === 'string')) throw malformedResponse()

  return {
    id: requiredString(variant?.id),
    title: requiredString(variant?.title),
    sku,
    inventoryItem: {
      id: requiredString(inventoryItem?.id),
      tracked:
        boolean(inventoryItem?.tracked) ??
        (() => {
          throw malformedResponse()
        })(),
      levels: inventoryLevels.nodes.map(parseInventoryLevel),
      truncated: parsePageInfo(inventoryLevels.pageInfo).hasNextPage,
    },
  }
}

function parseProduct(value: unknown): ShopifyProduct {
  const product = record(value)
  const variants = record(product?.variants)
  if (!Array.isArray(variants?.nodes)) throw malformedResponse()
  return {
    id: requiredString(product?.id),
    title: requiredString(product?.title),
    handle: requiredString(product?.handle),
    variants: variants.nodes.map(parseVariant),
    variantsTruncated: parsePageInfo(variants.pageInfo).hasNextPage,
  }
}

function parseCost(value: unknown): ShopifyQueryCost {
  const extensions = record(value)
  const cost = record(extensions?.cost)
  const throttle = record(cost?.throttleStatus)
  const requested = number(cost?.requestedQueryCost)
  const actual = number(cost?.actualQueryCost)
  const currentlyAvailable = number(throttle?.currentlyAvailable)
  const restoreRate = number(throttle?.restoreRate)
  if (
    requested === undefined ||
    actual === undefined ||
    currentlyAvailable === undefined ||
    restoreRate === undefined
  ) {
    throw malformedResponse()
  }
  return { requested, actual, currentlyAvailable, restoreRate }
}

function classifyGraphqlErrors(value: unknown): never {
  if (!Array.isArray(value) || value.length === 0) throw malformedResponse()
  const errors = value.map((error) => record(error))
  const codes = errors.map((error) => string(record(error?.extensions)?.code))
  if (codes.includes('THROTTLED')) {
    throw new ShopifySpikeError(
      'THROTTLED',
      'Shopify throttled the spike query.',
    )
  }
  if (codes.includes('ACCESS_DENIED')) {
    const denied = errors.find(
      (error) => string(record(error?.extensions)?.code) === 'ACCESS_DENIED',
    )
    const path = Array.isArray(denied?.path)
      ? denied.path
          .filter(
            (segment): segment is string | number =>
              typeof segment === 'string' || typeof segment === 'number',
          )
          .join('.')
      : ''
    throw new ShopifySpikeError(
      'SCOPE_FAILED',
      path
        ? `Shopify denied a required read-only scope at ${path}.`
        : 'Shopify denied a required read-only scope.',
    )
  }
  throw new ShopifySpikeError(
    'GRAPHQL_ERROR',
    'Shopify could not complete the spike query.',
  )
}

async function fetchProductPage(
  config: ShopifySpikeConfig,
  accessToken: string,
  after: string | null,
  fetcher: Fetch,
): Promise<{
  products: ShopifyProduct[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
  cost: ShopifyQueryCost
}> {
  assertReadOnlyShopifyQuery(SHOPIFY_PRODUCTS_QUERY)
  const response = await providerFetch(
    fetcher,
    `https://${config.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-access-token': accessToken,
      },
      body: JSON.stringify({
        query: SHOPIFY_PRODUCTS_QUERY,
        variables: { first: SHOPIFY_PRODUCT_PAGE_SIZE, after },
      }),
    },
  )

  if (response.status === 401 || response.status === 403) {
    throw new ShopifySpikeError(
      'AUTH_FAILED',
      'Shopify rejected the Admin API credential.',
    )
  }
  if (response.status === 429) {
    throw new ShopifySpikeError(
      'THROTTLED',
      'Shopify throttled the spike query.',
    )
  }
  if (!response.ok) {
    throw new ShopifySpikeError(
      'PROVIDER_UNAVAILABLE',
      'Shopify could not complete the Admin API request.',
    )
  }
  if (response.headers.get('x-shopify-api-version') !== SHOPIFY_API_VERSION) {
    throw new ShopifySpikeError(
      'MALFORMED_RESPONSE',
      'Shopify served an unexpected Admin API version.',
    )
  }

  const body = record(await boundedJson(response))
  if (body?.errors !== undefined) classifyGraphqlErrors(body.errors)
  const products = record(record(body?.data)?.products)
  if (!Array.isArray(products?.nodes)) throw malformedResponse()
  return {
    products: products.nodes.map(parseProduct),
    pageInfo: parsePageInfo(products.pageInfo),
    cost: parseCost(body?.extensions),
  }
}

export async function runShopifySpike(
  input: ShopifySpikeConfig,
  fetcher: Fetch = fetch,
): Promise<ShopifySpikeResult> {
  const config = validateConfiguration(input)
  const { accessToken, scopes } = await acquireShopifyAccessToken(
    config,
    fetcher,
  )
  const products: ShopifyProduct[] = []
  const queryCosts: ShopifyQueryCost[] = []
  const ids = new Set<string>()
  let after: string | null = null
  let hasNextPage = true
  let pagesRead = 0

  while (hasNextPage && pagesRead < SHOPIFY_MAX_PAGES) {
    const page = await fetchProductPage(config, accessToken, after, fetcher)
    for (const product of page.products) {
      if (ids.has(product.id)) {
        throw new ShopifySpikeError(
          'MALFORMED_RESPONSE',
          'Shopify pagination returned a duplicate product.',
        )
      }
      ids.add(product.id)
      products.push(product)
    }
    queryCosts.push(page.cost)
    pagesRead += 1
    hasNextPage = page.pageInfo.hasNextPage
    after = page.pageInfo.endCursor
  }

  return {
    apiVersion: SHOPIFY_API_VERSION,
    grantedScopes: scopes,
    pagesRead,
    paginationExercised: pagesRead > 1,
    truncated: hasNextPage,
    products,
    queryCosts,
  }
}
