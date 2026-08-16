import { getConnectedShopifyCredentials } from './connection'
import {
  acquireShopifyAccessToken,
  boundedShopifyJson,
  SHOPIFY_API_VERSION,
  ShopifyConnectionError,
  type ShopifyConnectionErrorCode,
  shopifyProviderFetch,
} from './provider'

export const SHOPIFY_VARIANT_PAGE_SIZE = 20
export const SHOPIFY_MAX_TOP_LEVEL_PAGES = 5
export const SHOPIFY_LEVEL_PAGE_SIZE = 20
export const SHOPIFY_MAX_GRAPHQL_REQUESTS = 20

const maximumResponseBytes = 1_000_000

const variantsQuery = `query ShopifyInventoryVariants($first: Int!, $after: String) {
  productVariants(first: $first, after: $after, sortKey: ID) {
    nodes {
      id title sku updatedAt
      product { id title handle status updatedAt }
      inventoryItem {
        id tracked
        inventoryLevels(first: ${SHOPIFY_LEVEL_PAGE_SIZE}) {
          nodes { id updatedAt location { id name } quantities(names: ["available"]) { name quantity } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const levelsQuery = `query ShopifyInventoryLevels($id: ID!, $first: Int!, $after: String) {
  inventoryItem(id: $id) {
    id
    inventoryLevels(first: $first, after: $after) {
      nodes { id updatedAt location { id name } quantities(names: ["available"]) { name quantity } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

type SyncStatus = 'running' | 'complete' | 'partial' | 'failed'

interface SyncRunRow {
  id: string
  status: SyncStatus
  started_at: number
  completed_at: number | null
  top_cursor: string | null
  top_has_next: 0 | 1
  pending_levels_json: string
  requests_count: number
  pages_count: number
  products_count: number
  variants_count: number
  levels_count: number
  coverage_complete: 0 | 1
  last_error_code: ShopifyConnectionErrorCode | null
}

interface PendingLevels {
  itemGid: string
  cursor: string
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface InventoryLevelRecord {
  id: string
  updatedAt: string
  location: { id: string; name: string }
  available: number | null
}

interface VariantRecord {
  id: string
  title: string
  sku: string | null
  updatedAt: string
  product: {
    id: string
    title: string
    handle: string
    status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT' | 'UNLISTED'
    updatedAt: string
  }
  inventoryItem: {
    id: string
    tracked: boolean
    levels: InventoryLevelRecord[]
    pageInfo: PageInfo
  }
}

interface GraphqlCost {
  requested: number
  currentlyAvailable: number
}

export interface ShopifySyncResult {
  readonly status: Exclude<SyncStatus, 'running'>
  readonly coverageComplete: boolean
  readonly continuationAvailable: boolean
  readonly startedAt: string
  readonly completedAt: string | null
  readonly lastErrorCode: ShopifyConnectionErrorCode | null
  readonly counts: {
    readonly requests: number
    readonly pages: number
    readonly products: number
    readonly variants: number
    readonly inventoryLevels: number
  }
}

export class ShopifySyncConflictError extends Error {
  constructor(readonly code: 'NOT_CONNECTED' | 'SYNC_IN_PROGRESS') {
    super('Shopify inventory synchronization cannot start.')
    this.name = 'ShopifySyncConflictError'
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return value
}

function requiredGid(value: unknown, type: string): string {
  const gid = requiredString(value)
  if (!gid.startsWith(`gid://shopify/${type}/`))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return gid
}

function pageInfo(value: unknown): PageInfo {
  const result = object(value)
  if (
    typeof result?.hasNextPage !== 'boolean' ||
    !(
      result.endCursor === null ||
      result.endCursor === undefined ||
      typeof result.endCursor === 'string'
    ) ||
    (result.hasNextPage && !result.endCursor)
  )
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return {
    hasNextPage: result.hasNextPage,
    endCursor: typeof result.endCursor === 'string' ? result.endCursor : null,
  }
}

function inventoryLevel(value: unknown): InventoryLevelRecord {
  const result = object(value)
  const location = object(result?.location)
  const quantities = Array.isArray(result?.quantities) ? result.quantities : []
  const available = quantities.find(
    (quantity) => object(quantity)?.name === 'available',
  )
  const quantity = object(available)?.quantity
  if (!(quantity === undefined || typeof quantity === 'number'))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return {
    id: requiredGid(result?.id, 'InventoryLevel'),
    updatedAt: requiredString(result?.updatedAt),
    location: {
      id: requiredGid(location?.id, 'Location'),
      name: requiredString(location?.name),
    },
    available: typeof quantity === 'number' ? quantity : null,
  }
}

function inventoryLevels(value: unknown): {
  levels: InventoryLevelRecord[]
  pageInfo: PageInfo
} {
  const result = object(value)
  if (!Array.isArray(result?.nodes))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return {
    levels: result.nodes.map(inventoryLevel),
    pageInfo: pageInfo(result.pageInfo),
  }
}

function variant(value: unknown): VariantRecord {
  const result = object(value)
  const product = object(result?.product)
  const item = object(result?.inventoryItem)
  const levels = inventoryLevels(item?.inventoryLevels)
  const status = product?.status
  if (
    status !== 'ACTIVE' &&
    status !== 'ARCHIVED' &&
    status !== 'DRAFT' &&
    status !== 'UNLISTED'
  )
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  if (!(result?.sku === null || typeof result?.sku === 'string'))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  if (typeof item?.tracked !== 'boolean')
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return {
    id: requiredGid(result.id, 'ProductVariant'),
    title: requiredString(result.title),
    sku: result.sku,
    updatedAt: requiredString(result.updatedAt),
    product: {
      id: requiredGid(product?.id, 'Product'),
      title: requiredString(product?.title),
      handle: requiredString(product?.handle),
      status,
      updatedAt: requiredString(product?.updatedAt),
    },
    inventoryItem: {
      id: requiredGid(item.id, 'InventoryItem'),
      tracked: item.tracked,
      levels: levels.levels,
      pageInfo: levels.pageInfo,
    },
  }
}

function graphqlCost(value: unknown): GraphqlCost {
  const extensions = object(value)
  const cost = object(extensions?.cost)
  const throttle = object(cost?.throttleStatus)
  if (
    typeof cost?.requestedQueryCost !== 'number' ||
    typeof throttle?.currentlyAvailable !== 'number'
  )
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return {
    requested: cost.requestedQueryCost,
    currentlyAvailable: throttle.currentlyAvailable,
  }
}

function classifyGraphqlErrors(value: unknown): never {
  if (!Array.isArray(value) || value.length === 0)
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  const codes = value.map((entry) => object(object(entry)?.extensions)?.code)
  if (codes.includes('THROTTLED'))
    throw new ShopifyConnectionError('RATE_LIMITED')
  if (codes.includes('ACCESS_DENIED'))
    throw new ShopifyConnectionError('SCOPE_FAILED')
  throw new ShopifyConnectionError('PROVIDER_CHANGED')
}

async function graphql(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<{ body: Record<string, unknown>; cost: GraphqlCost }> {
  const response = await shopifyProviderFetch(
    fetcher,
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-access-token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
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
  const body = await boundedShopifyJson(response, maximumResponseBytes)
  if (body.errors !== undefined) classifyGraphqlErrors(body.errors)
  return { body, cost: graphqlCost(body.extensions) }
}

async function latestRun(db: D1Database): Promise<SyncRunRow | null> {
  return db
    .prepare(
      `SELECT id, status, started_at, completed_at, top_cursor, top_has_next, pending_levels_json,
        requests_count, pages_count, products_count, variants_count, levels_count,
        coverage_complete, last_error_code
      FROM shopify_sync_runs ORDER BY started_at DESC LIMIT 1`,
    )
    .first<SyncRunRow>()
}

async function acquireRun(db: D1Database, now: number): Promise<SyncRunRow> {
  const current = await latestRun(db)
  if (current?.status === 'running')
    throw new ShopifySyncConflictError('SYNC_IN_PROGRESS')
  if (current?.status === 'partial') {
    let updated: D1Result
    try {
      updated = await db
        .prepare(
          `UPDATE shopify_sync_runs SET status = 'running', completed_at = NULL, last_error_code = NULL
          WHERE id = ? AND status = 'partial'`,
        )
        .bind(current.id)
        .run()
    } catch {
      throw new ShopifySyncConflictError('SYNC_IN_PROGRESS')
    }
    if (updated.meta.changes !== 1)
      throw new ShopifySyncConflictError('SYNC_IN_PROGRESS')
    return {
      ...current,
      status: 'running',
      completed_at: null,
      last_error_code: null,
    }
  }

  const id = crypto.randomUUID()
  try {
    await db
      .prepare(
        `INSERT INTO shopify_sync_runs (id, status, started_at) VALUES (?, 'running', ?)`,
      )
      .bind(id, now)
      .run()
  } catch {
    if ((await latestRun(db))?.status === 'running')
      throw new ShopifySyncConflictError('SYNC_IN_PROGRESS')
    throw new Error('Shopify synchronization state could not be created.')
  }
  return (await latestRun(db))!
}

function pending(value: string): PendingLevels[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (item) =>
          typeof object(item)?.itemGid !== 'string' ||
          typeof object(item)?.cursor !== 'string',
      )
    )
      throw new Error()
    return parsed as PendingLevels[]
  } catch {
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  }
}

function upsertLevelStatements(
  db: D1Database,
  scanId: string,
  itemGid: string,
  levels: InventoryLevelRecord[],
): D1PreparedStatement[] {
  return levels.flatMap((level) => [
    db
      .prepare(
        `INSERT INTO shopify_locations (source_gid, name, last_seen_scan_id) VALUES (?, ?, ?)
        ON CONFLICT(source_gid) DO UPDATE SET name = excluded.name, last_seen_scan_id = excluded.last_seen_scan_id`,
      )
      .bind(level.location.id, level.location.name, scanId),
    db
      .prepare(
        `INSERT INTO shopify_inventory_levels
          (source_gid, inventory_item_gid, location_gid, available_quantity, source_updated_at, last_seen_scan_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_gid) DO UPDATE SET inventory_item_gid = excluded.inventory_item_gid,
          location_gid = excluded.location_gid, available_quantity = excluded.available_quantity,
          source_updated_at = excluded.source_updated_at, last_seen_scan_id = excluded.last_seen_scan_id`,
      )
      .bind(
        level.id,
        itemGid,
        level.location.id,
        level.available,
        level.updatedAt,
        scanId,
      ),
  ])
}

async function commitVariantPage(
  db: D1Database,
  run: SyncRunRow,
  variants: VariantRecord[],
  nextCursor: string | null,
  topHasNext: boolean,
  pendingLevels: PendingLevels[],
): Promise<void> {
  const statements: D1PreparedStatement[] = []
  const products = new Map(
    variants.map((item) => [item.product.id, item.product]),
  )
  for (const product of products.values()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO shopify_products
            (source_gid, title, handle, status, source_updated_at, last_seen_scan_id)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_gid) DO UPDATE SET title = excluded.title, handle = excluded.handle,
            status = excluded.status, source_updated_at = excluded.source_updated_at,
            last_seen_scan_id = excluded.last_seen_scan_id`,
        )
        .bind(
          product.id,
          product.title,
          product.handle,
          product.status,
          product.updatedAt,
          run.id,
        ),
    )
  }
  for (const item of variants) {
    statements.push(
      db
        .prepare(
          `INSERT INTO shopify_inventory_items (source_gid, tracked, last_seen_scan_id) VALUES (?, ?, ?)
          ON CONFLICT(source_gid) DO UPDATE SET tracked = excluded.tracked,
            last_seen_scan_id = excluded.last_seen_scan_id`,
        )
        .bind(
          item.inventoryItem.id,
          item.inventoryItem.tracked ? 1 : 0,
          run.id,
        ),
      db
        .prepare(
          `INSERT INTO shopify_variants
            (source_gid, product_gid, title, sku, inventory_item_gid, source_updated_at, last_seen_scan_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_gid) DO UPDATE SET product_gid = excluded.product_gid, title = excluded.title,
            sku = excluded.sku, inventory_item_gid = excluded.inventory_item_gid,
            source_updated_at = excluded.source_updated_at, last_seen_scan_id = excluded.last_seen_scan_id`,
        )
        .bind(
          item.id,
          item.product.id,
          item.title,
          item.sku,
          item.inventoryItem.id,
          item.updatedAt,
          run.id,
        ),
      ...upsertLevelStatements(
        db,
        run.id,
        item.inventoryItem.id,
        item.inventoryItem.levels,
      ),
    )
  }
  const levels = variants.reduce(
    (total, item) => total + item.inventoryItem.levels.length,
    0,
  )
  statements.push(
    db
      .prepare(
        `UPDATE shopify_sync_runs SET top_cursor = ?, top_has_next = ?, pending_levels_json = ?,
          requests_count = requests_count + 1, pages_count = pages_count + 1,
          variants_count = variants_count + ?,
          levels_count = levels_count + ? WHERE id = ? AND status = 'running'`,
      )
      .bind(
        nextCursor,
        topHasNext ? 1 : 0,
        JSON.stringify(pendingLevels),
        variants.length,
        levels,
        run.id,
      ),
  )
  await db.batch(statements)
}

async function commitLevelPage(
  db: D1Database,
  runId: string,
  itemGid: string,
  levels: InventoryLevelRecord[],
  pendingLevels: PendingLevels[],
): Promise<void> {
  await db.batch([
    ...upsertLevelStatements(db, runId, itemGid, levels),
    db
      .prepare(
        `UPDATE shopify_sync_runs SET pending_levels_json = ?, requests_count = requests_count + 1,
          levels_count = levels_count + ? WHERE id = ? AND status = 'running'`,
      )
      .bind(JSON.stringify(pendingLevels), levels.length, runId),
  ])
}

async function reconcile(db: D1Database, runId: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        'DELETE FROM shopify_inventory_levels WHERE last_seen_scan_id <> ?',
      )
      .bind(runId),
    db
      .prepare('DELETE FROM shopify_variants WHERE last_seen_scan_id <> ?')
      .bind(runId),
    db
      .prepare(
        'DELETE FROM shopify_inventory_items WHERE last_seen_scan_id <> ?',
      )
      .bind(runId),
    db
      .prepare('DELETE FROM shopify_products WHERE last_seen_scan_id <> ?')
      .bind(runId),
    db
      .prepare('DELETE FROM shopify_locations WHERE last_seen_scan_id <> ?')
      .bind(runId),
  ])
}

async function finishRun(
  db: D1Database,
  id: string,
  status: Exclude<SyncStatus, 'running'>,
  now: number,
  errorCode: ShopifyConnectionErrorCode | null,
): Promise<SyncRunRow> {
  await db
    .prepare(
      `UPDATE shopify_sync_runs SET status = ?, completed_at = ?, coverage_complete = ?,
        last_error_code = ?, products_count =
          (SELECT COUNT(*) FROM shopify_products WHERE last_seen_scan_id = ?)
        WHERE id = ? AND status = 'running'`,
    )
    .bind(status, now, status === 'complete' ? 1 : 0, errorCode, id, id)
    .run()
  return (await latestRun(db))!
}

function result(run: SyncRunRow): ShopifySyncResult {
  return {
    status: run.status === 'running' ? 'partial' : run.status,
    coverageComplete: run.coverage_complete === 1,
    continuationAvailable: run.status === 'partial',
    startedAt: new Date(run.started_at).toISOString(),
    completedAt:
      run.completed_at === null
        ? null
        : new Date(run.completed_at).toISOString(),
    lastErrorCode: run.last_error_code,
    counts: {
      requests: run.requests_count,
      pages: run.pages_count,
      products: run.products_count,
      variants: run.variants_count,
      inventoryLevels: run.levels_count,
    },
  }
}

export async function getShopifySyncStatus(
  db: D1Database,
): Promise<ShopifySyncResult | null> {
  const run = await latestRun(db)
  return run ? result(run) : null
}

export async function getLastSuccessfulShopifySyncAt(
  db: D1Database,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT completed_at FROM shopify_sync_runs
       WHERE status = 'complete' AND coverage_complete = 1
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .first<{ completed_at: number }>()
  return row ? new Date(row.completed_at).toISOString() : null
}

export async function syncShopifyInventory(
  db: D1Database,
  encryptionKey: string,
  fetcher: typeof fetch = fetch,
  clock: () => number = Date.now,
): Promise<ShopifySyncResult> {
  const connected = await getConnectedShopifyCredentials(db, encryptionKey)
  if (!connected) throw new ShopifySyncConflictError('NOT_CONNECTED')
  const run = await acquireRun(db, clock())
  let invocationRequests = 0
  let invocationTopPages = 0

  try {
    const { accessToken } = await acquireShopifyAccessToken(
      connected.credentials,
      fetcher,
    )
    let pendingLevels = pending(run.pending_levels_json)

    let topHasNextPage = (await latestRun(db))!.top_has_next === 1
    while (invocationRequests < SHOPIFY_MAX_GRAPHQL_REQUESTS) {
      if (pendingLevels.length > 0) {
        const current = pendingLevels[0]!
        const response = await graphql(
          connected.credentials.shopDomain,
          accessToken,
          levelsQuery,
          {
            id: current.itemGid,
            first: SHOPIFY_LEVEL_PAGE_SIZE,
            after: current.cursor,
          },
          fetcher,
        )
        invocationRequests += 1
        const item = object(object(response.body.data)?.inventoryItem)
        if (requiredGid(item?.id, 'InventoryItem') !== current.itemGid)
          throw new ShopifyConnectionError('MALFORMED_RESPONSE')
        const levels = inventoryLevels(item?.inventoryLevels)
        pendingLevels = levels.pageInfo.hasNextPage
          ? [
              { itemGid: current.itemGid, cursor: levels.pageInfo.endCursor! },
              ...pendingLevels.slice(1),
            ]
          : pendingLevels.slice(1)
        await commitLevelPage(
          db,
          run.id,
          current.itemGid,
          levels.levels,
          pendingLevels,
        )
        if (response.cost.currentlyAvailable < response.cost.requested) break
        continue
      }
      if (!topHasNextPage || invocationTopPages >= SHOPIFY_MAX_TOP_LEVEL_PAGES)
        break
      const currentRun = (await latestRun(db))!
      const response = await graphql(
        connected.credentials.shopDomain,
        accessToken,
        variantsQuery,
        { first: SHOPIFY_VARIANT_PAGE_SIZE, after: currentRun.top_cursor },
        fetcher,
      )
      invocationRequests += 1
      invocationTopPages += 1
      const connection = object(object(response.body.data)?.productVariants)
      if (!Array.isArray(connection?.nodes))
        throw new ShopifyConnectionError('MALFORMED_RESPONSE')
      const variants = connection.nodes.map(variant)
      if (new Set(variants.map((item) => item.id)).size !== variants.length)
        throw new ShopifyConnectionError('MALFORMED_RESPONSE')
      const info = pageInfo(connection.pageInfo)
      topHasNextPage = info.hasNextPage
      pendingLevels = variants.flatMap((item) =>
        item.inventoryItem.pageInfo.hasNextPage
          ? [
              {
                itemGid: item.inventoryItem.id,
                cursor: item.inventoryItem.pageInfo.endCursor!,
              },
            ]
          : [],
      )
      await commitVariantPage(
        db,
        run,
        variants,
        info.endCursor,
        info.hasNextPage,
        pendingLevels,
      )
      if (response.cost.currentlyAvailable < response.cost.requested) break
    }

    const current = (await latestRun(db))!
    const hasPending = pending(current.pending_levels_json).length > 0
    if (!topHasNextPage && !hasPending) {
      await reconcile(db, run.id)
      return result(await finishRun(db, run.id, 'complete', clock(), null))
    }
    return result(await finishRun(db, run.id, 'partial', clock(), null))
  } catch (cause) {
    const code =
      cause instanceof ShopifyConnectionError ? cause.code : 'UNKNOWN'
    const current = (await latestRun(db))!
    const status = current.pages_count > 0 ? 'partial' : 'failed'
    return result(await finishRun(db, run.id, status, clock(), code))
  }
}
