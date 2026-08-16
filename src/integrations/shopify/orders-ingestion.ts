import { getConnectedShopifyCredentials } from './connection'
import { formatShopifyMoney, parseShopifyMoney } from './money'
import {
  acquireShopifyAccessToken,
  boundedShopifyJson,
  SHOPIFY_API_VERSION,
  ShopifyConnectionError,
  type ShopifyConnectionErrorCode,
  shopifyProviderFetch,
} from './provider'

export const SHOPIFY_ORDER_PAGE_SIZE = 20
export const SHOPIFY_LINE_ITEM_PAGE_SIZE = 20
export const SHOPIFY_MAX_ORDER_PAGES = 5
export const SHOPIFY_MAX_ORDER_REQUESTS = 20
export const SHOPIFY_ORDER_WINDOW_DAYS = 60

const maximumResponseBytes = 1_000_000
const orderWindowMilliseconds = SHOPIFY_ORDER_WINDOW_DAYS * 24 * 60 * 60 * 1000

const lineItemFields = `
  id title variantTitle sku currentQuantity
  product { id }
  variant { id }
  priceAfterAllDiscountsBeforeTaxesSet { shopMoney { amount currencyCode } }
`

const ordersQuery = `query ShopifyRecentOrders($first: Int!, $after: String, $query: String!) {
  shop { currencyCode ianaTimezone }
  orders(first: $first, after: $after, sortKey: UPDATED_AT, query: $query) {
    nodes {
      id name createdAt updatedAt cancelledAt
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: ${SHOPIFY_LINE_ITEM_PAGE_SIZE}) {
        nodes { ${lineItemFields} }
        pageInfo { hasNextPage endCursor }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const lineItemsQuery = `query ShopifyOrderLineItems($id: ID!, $first: Int!, $after: String) {
  order(id: $id) {
    id
    lineItems(first: $first, after: $after) {
      nodes { ${lineItemFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

type OrderSyncStatus = 'running' | 'complete' | 'partial' | 'failed'

interface OrderSyncRunRow {
  id: string
  status: OrderSyncStatus
  started_at: number
  completed_at: number | null
  window_start: number
  window_end: number
  shop_timezone: string | null
  shop_currency: string | null
  top_cursor: string | null
  top_has_next: 0 | 1
  pending_page_active: 0 | 1
  pending_next_top_cursor: string | null
  pending_next_top_has_next: 0 | 1 | null
  requests_count: number
  pages_count: number
  orders_count: number
  line_items_count: number
  coverage_complete: 0 | 1
  last_error_code: ShopifyConnectionErrorCode | null
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface OrderLineItem {
  id: string
  productGid: string | null
  variantGid: string | null
  title: string
  variantTitle: string | null
  sku: string | null
  currentQuantity: number
  currentDiscountedSubtotal: string
  currencyCode: string
}

interface OrderRecord {
  id: string
  name: string | null
  createdAt: number
  updatedAt: number
  cancelledAt: number | null
  currentTotalAmount: string
  currencyCode: string
  lineItems: OrderLineItem[]
  lineItemsPageInfo: PageInfo
}

interface GraphqlResult {
  body: Record<string, unknown>
  requestedCost: number
  currentlyAvailable: number
}

export interface ShopifyOrderSyncResult {
  readonly status: Exclude<OrderSyncStatus, 'running'>
  readonly coverageComplete: boolean
  readonly continuationAvailable: boolean
  readonly sourceCoverage: 'recent_60_days_only'
  readonly windowStart: string
  readonly windowEnd: string
  readonly shopTimezone: string | null
  readonly currency: string | null
  readonly startedAt: string
  readonly completedAt: string | null
  readonly lastErrorCode: ShopifyConnectionErrorCode | null
  readonly counts: {
    readonly requests: number
    readonly pages: number
    readonly orders: number
    readonly lineItems: number
  }
}

export class ShopifyOrderSyncConflictError extends Error {
  constructor(readonly code: 'NOT_CONNECTED' | 'SYNC_IN_PROGRESS') {
    super('Shopify order synchronization cannot start.')
    this.name = 'ShopifyOrderSyncConflictError'
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return value
}

function gid(value: unknown, type: string): string {
  const id = string(value)
  if (!id.startsWith(`gid://shopify/${type}/`))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return id
}

function nullableGid(value: unknown, type: string): string | null {
  if (value === null || value === undefined) return null
  return gid(object(value)?.id, type)
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(string(value))
  if (!Number.isFinite(parsed))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return parsed
}

function nullableTimestamp(value: unknown): number | null {
  return value === null ? null : timestamp(value)
}

function pageInfo(value: unknown): PageInfo {
  const info = object(value)
  if (
    typeof info?.hasNextPage !== 'boolean' ||
    !(
      info.endCursor === null ||
      info.endCursor === undefined ||
      typeof info.endCursor === 'string'
    ) ||
    (info.hasNextPage && !info.endCursor)
  )
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return {
    hasNextPage: info.hasNextPage,
    endCursor: typeof info.endCursor === 'string' ? info.endCursor : null,
  }
}

function money(value: unknown): { amount: string; currencyCode: string } {
  const shopMoney = object(object(value)?.shopMoney)
  const amount = formatShopifyMoney(
    parseShopifyMoney(string(shopMoney?.amount)),
  )
  const currencyCode = string(shopMoney?.currencyCode)
  if (!/^[A-Z]{3}$/u.test(currencyCode))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return { amount, currencyCode }
}

function lineItem(value: unknown, shopCurrency: string): OrderLineItem {
  const item = object(value)
  const currentQuantity = item?.currentQuantity
  if (!Number.isSafeInteger(currentQuantity) || Number(currentQuantity) < 0)
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  const current = money(item?.priceAfterAllDiscountsBeforeTaxesSet)
  if (current.currencyCode !== shopCurrency)
    throw new ShopifyConnectionError('PROVIDER_CHANGED')
  if (
    !(item?.variantTitle === null || typeof item?.variantTitle === 'string') ||
    !(item?.sku === null || typeof item?.sku === 'string')
  )
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return {
    id: gid(item?.id, 'LineItem'),
    productGid: nullableGid(item?.product, 'Product'),
    variantGid: nullableGid(item?.variant, 'ProductVariant'),
    title: string(item?.title),
    variantTitle: item.variantTitle,
    sku: item.sku,
    currentQuantity: Number(currentQuantity),
    currentDiscountedSubtotal: current.amount,
    currencyCode: current.currencyCode,
  }
}

function lineItems(
  value: unknown,
  shopCurrency: string,
): { items: OrderLineItem[]; pageInfo: PageInfo } {
  const connection = object(value)
  if (!Array.isArray(connection?.nodes))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  const items = connection.nodes.map((item) => lineItem(item, shopCurrency))
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return { items, pageInfo: pageInfo(connection.pageInfo) }
}

function order(value: unknown, shopCurrency: string): OrderRecord {
  const source = object(value)
  if (!(source?.name === null || typeof source?.name === 'string'))
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  const total = money(source?.currentTotalPriceSet)
  if (total.currencyCode !== shopCurrency)
    throw new ShopifyConnectionError('PROVIDER_CHANGED')
  const lines = lineItems(source?.lineItems, shopCurrency)
  return {
    id: gid(source?.id, 'Order'),
    name: source.name,
    createdAt: timestamp(source?.createdAt),
    updatedAt: timestamp(source?.updatedAt),
    cancelledAt: nullableTimestamp(source?.cancelledAt),
    currentTotalAmount: total.amount,
    currencyCode: total.currencyCode,
    lineItems: lines.items,
    lineItemsPageInfo: lines.pageInfo,
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
): Promise<GraphqlResult> {
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
  const cost = object(body.extensions)?.cost
  const throttle = object(object(cost)?.throttleStatus)
  if (
    typeof object(cost)?.requestedQueryCost !== 'number' ||
    typeof throttle?.currentlyAvailable !== 'number'
  )
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  return {
    body,
    requestedCost: object(cost)!.requestedQueryCost as number,
    currentlyAvailable: throttle.currentlyAvailable,
  }
}

async function latestRun(db: D1Database): Promise<OrderSyncRunRow | null> {
  return db
    .prepare(
      `SELECT id, status, started_at, completed_at, window_start, window_end,
        shop_timezone, shop_currency, top_cursor, top_has_next,
        pending_page_active, pending_next_top_cursor, pending_next_top_has_next,
        requests_count, pages_count, orders_count, line_items_count,
        coverage_complete, last_error_code
       FROM shopify_order_sync_runs ORDER BY started_at DESC LIMIT 1`,
    )
    .first<OrderSyncRunRow>()
}

async function acquireRun(
  db: D1Database,
  now: number,
): Promise<OrderSyncRunRow> {
  const current = await latestRun(db)
  if (current?.status === 'running')
    throw new ShopifyOrderSyncConflictError('SYNC_IN_PROGRESS')
  if (current?.status === 'partial') {
    const updated = await db
      .prepare(
        `UPDATE shopify_order_sync_runs SET status = 'running', completed_at = NULL,
          last_error_code = NULL WHERE id = ? AND status = 'partial'`,
      )
      .bind(current.id)
      .run()
    if (updated.meta.changes !== 1)
      throw new ShopifyOrderSyncConflictError('SYNC_IN_PROGRESS')
    return {
      ...current,
      status: 'running',
      completed_at: null,
      last_error_code: null,
    }
  }
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO shopify_order_sync_runs
       (id, status, started_at, window_start, window_end)
       VALUES (?, 'running', ?, ?, ?)`,
    )
    .bind(id, now, now - orderWindowMilliseconds, now)
    .run()
  return (await latestRun(db))!
}

function queryWindow(run: OrderSyncRunRow): string {
  return `created_at:>=${new Date(run.window_start).toISOString()} created_at:<${new Date(run.window_end).toISOString()}`
}

async function recordRequest(db: D1Database, runId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE shopify_order_sync_runs SET requests_count = requests_count + 1
       WHERE id = ? AND status = 'running'`,
    )
    .bind(runId)
    .run()
}

async function stagePage(
  db: D1Database,
  run: OrderSyncRunRow,
  orders: OrderRecord[],
  shopTimezone: string,
  shopCurrency: string,
  nextCursor: string | null,
  hasNextPage: boolean,
): Promise<void> {
  const statements: D1PreparedStatement[] = []
  for (const item of orders) {
    statements.push(
      db
        .prepare(
          `INSERT INTO shopify_order_sync_pending_orders
           (run_id, source_gid, name, created_at, updated_at, cancelled_at,
            current_total_amount, currency_code, line_cursor, line_has_next)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          run.id,
          item.id,
          item.name,
          item.createdAt,
          item.updatedAt,
          item.cancelledAt,
          item.currentTotalAmount,
          item.currencyCode,
          item.lineItemsPageInfo.endCursor,
          item.lineItemsPageInfo.hasNextPage ? 1 : 0,
        ),
    )
    for (const line of item.lineItems) {
      statements.push(
        db
          .prepare(
            `INSERT INTO shopify_order_sync_pending_line_items
             (run_id, source_gid, order_gid, product_gid, variant_gid, title,
              variant_title, sku, current_quantity, current_discounted_subtotal,
              currency_code)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            run.id,
            line.id,
            item.id,
            line.productGid,
            line.variantGid,
            line.title,
            line.variantTitle,
            line.sku,
            line.currentQuantity,
            line.currentDiscountedSubtotal,
            line.currencyCode,
          ),
      )
    }
  }
  statements.push(
    db
      .prepare(
        `UPDATE shopify_order_sync_runs SET shop_timezone = ?, shop_currency = ?,
          pending_page_active = 1, pending_next_top_cursor = ?,
          pending_next_top_has_next = ?
         WHERE id = ? AND status = 'running'`,
      )
      .bind(
        shopTimezone,
        shopCurrency,
        nextCursor,
        hasNextPage ? 1 : 0,
        run.id,
      ),
  )
  await db.batch(statements)
}

interface PendingOrderRow {
  source_gid: string
  name: string | null
  created_at: number
  updated_at: number
  cancelled_at: number | null
  current_total_amount: string
  currency_code: string
}

interface PendingLineRow {
  source_gid: string
  order_gid: string
  product_gid: string | null
  variant_gid: string | null
  title: string
  variant_title: string | null
  sku: string | null
  current_quantity: number
  current_discounted_subtotal: string
  currency_code: string
}

async function appendPendingLines(
  db: D1Database,
  runId: string,
  orderId: string,
  items: OrderLineItem[],
  info: PageInfo,
): Promise<void> {
  await db.batch([
    ...items.map((line) =>
      db
        .prepare(
          `INSERT INTO shopify_order_sync_pending_line_items
           (run_id, source_gid, order_gid, product_gid, variant_gid, title,
            variant_title, sku, current_quantity, current_discounted_subtotal,
            currency_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          line.id,
          orderId,
          line.productGid,
          line.variantGid,
          line.title,
          line.variantTitle,
          line.sku,
          line.currentQuantity,
          line.currentDiscountedSubtotal,
          line.currencyCode,
        ),
    ),
    db
      .prepare(
        `UPDATE shopify_order_sync_pending_orders
         SET line_cursor = ?, line_has_next = ?
         WHERE run_id = ? AND source_gid = ?`,
      )
      .bind(info.endCursor, info.hasNextPage ? 1 : 0, runId, orderId),
  ])
}

async function commitPendingPage(
  db: D1Database,
  run: OrderSyncRunRow,
): Promise<void> {
  const orders = await db
    .prepare(
      `SELECT source_gid, name, created_at, updated_at, cancelled_at,
        current_total_amount, currency_code
       FROM shopify_order_sync_pending_orders WHERE run_id = ?
       ORDER BY source_gid`,
    )
    .bind(run.id)
    .all<PendingOrderRow>()
  const lines = await db
    .prepare(
      `SELECT source_gid, order_gid, product_gid, variant_gid, title,
        variant_title, sku, current_quantity, current_discounted_subtotal,
        currency_code
       FROM shopify_order_sync_pending_line_items WHERE run_id = ?
       ORDER BY source_gid`,
    )
    .bind(run.id)
    .all<PendingLineRow>()
  const statements: D1PreparedStatement[] = []
  for (const item of orders.results) {
    statements.push(
      db
        .prepare(
          `INSERT INTO shopify_orders
           (source_gid, name, created_at, updated_at, cancelled_at,
            current_total_amount, currency_code, last_seen_order_scan_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(source_gid) DO UPDATE SET name = excluded.name,
             created_at = excluded.created_at, updated_at = excluded.updated_at,
             cancelled_at = excluded.cancelled_at,
             current_total_amount = excluded.current_total_amount,
             currency_code = excluded.currency_code,
             last_seen_order_scan_id = excluded.last_seen_order_scan_id`,
        )
        .bind(
          item.source_gid,
          item.name,
          item.created_at,
          item.updated_at,
          item.cancelled_at,
          item.current_total_amount,
          item.currency_code,
          run.id,
        ),
    )
    for (const line of lines.results.filter(
      (line) => line.order_gid === item.source_gid,
    )) {
      statements.push(
        db
          .prepare(
            `INSERT INTO shopify_order_line_items
             (source_gid, order_gid, product_gid, variant_gid, title, variant_title,
              sku, current_quantity, current_discounted_subtotal, currency_code,
              last_seen_order_scan_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(source_gid) DO UPDATE SET order_gid = excluded.order_gid,
               product_gid = excluded.product_gid, variant_gid = excluded.variant_gid,
               title = excluded.title, variant_title = excluded.variant_title,
               sku = excluded.sku, current_quantity = excluded.current_quantity,
               current_discounted_subtotal = excluded.current_discounted_subtotal,
               currency_code = excluded.currency_code,
               last_seen_order_scan_id = excluded.last_seen_order_scan_id`,
          )
          .bind(
            line.source_gid,
            line.order_gid,
            line.product_gid,
            line.variant_gid,
            line.title,
            line.variant_title,
            line.sku,
            line.current_quantity,
            line.current_discounted_subtotal,
            line.currency_code,
            run.id,
          ),
      )
    }
    statements.push(
      db
        .prepare(
          `DELETE FROM shopify_order_line_items
           WHERE order_gid = ? AND last_seen_order_scan_id <> ?`,
        )
        .bind(item.source_gid, run.id),
    )
  }
  statements.push(
    db
      .prepare(
        `DELETE FROM shopify_order_sync_pending_line_items WHERE run_id = ?`,
      )
      .bind(run.id),
    db
      .prepare(`DELETE FROM shopify_order_sync_pending_orders WHERE run_id = ?`)
      .bind(run.id),
    db
      .prepare(
        `UPDATE shopify_order_sync_runs SET top_cursor = pending_next_top_cursor,
          top_has_next = pending_next_top_has_next, pending_page_active = 0,
          pending_next_top_cursor = NULL, pending_next_top_has_next = NULL,
          pages_count = pages_count + 1,
          orders_count = (SELECT COUNT(*) FROM shopify_orders WHERE last_seen_order_scan_id = ?),
          line_items_count = (SELECT COUNT(*) FROM shopify_order_line_items WHERE last_seen_order_scan_id = ?)
         WHERE id = ? AND status = 'running'`,
      )
      .bind(run.id, run.id, run.id),
  )
  await db.batch(statements)
}

async function finishRun(
  db: D1Database,
  id: string,
  status: Exclude<OrderSyncStatus, 'running'>,
  now: number,
  errorCode: ShopifyConnectionErrorCode | null,
): Promise<OrderSyncRunRow> {
  await db
    .prepare(
      `UPDATE shopify_order_sync_runs SET status = ?, completed_at = ?,
        coverage_complete = ?, last_error_code = ?
       WHERE id = ? AND status = 'running'`,
    )
    .bind(status, now, status === 'complete' ? 1 : 0, errorCode, id)
    .run()
  return (await latestRun(db))!
}

function publicResult(run: OrderSyncRunRow): ShopifyOrderSyncResult {
  return {
    status: run.status === 'running' ? 'partial' : run.status,
    coverageComplete: run.coverage_complete === 1,
    continuationAvailable: run.status === 'partial',
    sourceCoverage: 'recent_60_days_only',
    windowStart: new Date(run.window_start).toISOString(),
    windowEnd: new Date(run.window_end).toISOString(),
    shopTimezone: run.shop_timezone,
    currency: run.shop_currency,
    startedAt: new Date(run.started_at).toISOString(),
    completedAt:
      run.completed_at === null
        ? null
        : new Date(run.completed_at).toISOString(),
    lastErrorCode: run.last_error_code,
    counts: {
      requests: run.requests_count,
      pages: run.pages_count,
      orders: run.orders_count,
      lineItems: run.line_items_count,
    },
  }
}

export async function getShopifyOrderSyncStatus(
  db: D1Database,
): Promise<ShopifyOrderSyncResult | null> {
  const run = await latestRun(db)
  return run ? publicResult(run) : null
}

export async function syncShopifyOrders(
  db: D1Database,
  encryptionKey: string,
  fetcher: typeof fetch = fetch,
  clock: () => number = Date.now,
): Promise<ShopifyOrderSyncResult> {
  const connected = await getConnectedShopifyCredentials(db, encryptionKey)
  if (!connected) throw new ShopifyOrderSyncConflictError('NOT_CONNECTED')
  const run = await acquireRun(db, clock())
  let invocationRequests = 0
  let invocationPages = 0

  try {
    const { accessToken } = await acquireShopifyAccessToken(
      connected.credentials,
      fetcher,
    )
    while (
      invocationPages < SHOPIFY_MAX_ORDER_PAGES &&
      invocationRequests < SHOPIFY_MAX_ORDER_REQUESTS
    ) {
      let current = (await latestRun(db))!
      if (current.pending_page_active === 0) {
        if (current.top_has_next === 0) break
        invocationRequests += 1
        await recordRequest(db, run.id)
        const response = await graphql(
          connected.credentials.shopDomain,
          accessToken,
          ordersQuery,
          {
            first: SHOPIFY_ORDER_PAGE_SIZE,
            after: current.top_cursor,
            query: queryWindow(run),
          },
          fetcher,
        )
        const data = object(response.body.data)
        const shop = object(data?.shop)
        const shopCurrency = string(shop?.currencyCode)
        const shopTimezone = string(shop?.ianaTimezone)
        try {
          new Intl.DateTimeFormat('en', { timeZone: shopTimezone }).format(0)
        } catch {
          throw new ShopifyConnectionError('MALFORMED_RESPONSE')
        }
        if (!/^[A-Z]{3}$/u.test(shopCurrency))
          throw new ShopifyConnectionError('MALFORMED_RESPONSE')
        const connection = object(data?.orders)
        if (!Array.isArray(connection?.nodes))
          throw new ShopifyConnectionError('MALFORMED_RESPONSE')
        const orders = connection.nodes.map((item) => order(item, shopCurrency))
        if (new Set(orders.map((item) => item.id)).size !== orders.length)
          throw new ShopifyConnectionError('MALFORMED_RESPONSE')
        const info = pageInfo(connection.pageInfo)
        await stagePage(
          db,
          run,
          orders,
          shopTimezone,
          shopCurrency,
          info.endCursor,
          info.hasNextPage,
        )
        if (
          response.currentlyAvailable < response.requestedCost &&
          (info.hasNextPage ||
            orders.some((item) => item.lineItemsPageInfo.hasNextPage))
        )
          return publicResult(
            await finishRun(db, run.id, 'partial', clock(), 'RATE_LIMITED'),
          )
        current = (await latestRun(db))!
      }

      while (invocationRequests < SHOPIFY_MAX_ORDER_REQUESTS) {
        const pending = await db
          .prepare(
            `SELECT source_gid, line_cursor FROM shopify_order_sync_pending_orders
             WHERE run_id = ? AND line_has_next = 1 ORDER BY source_gid LIMIT 1`,
          )
          .bind(run.id)
          .first<{ source_gid: string; line_cursor: string }>()
        if (!pending) break
        invocationRequests += 1
        await recordRequest(db, run.id)
        const nested = await graphql(
          connected.credentials.shopDomain,
          accessToken,
          lineItemsQuery,
          {
            id: pending.source_gid,
            first: SHOPIFY_LINE_ITEM_PAGE_SIZE,
            after: pending.line_cursor,
          },
          fetcher,
        )
        const returnedOrder = object(object(nested.body.data)?.order)
        if (gid(returnedOrder?.id, 'Order') !== pending.source_gid)
          throw new ShopifyConnectionError('MALFORMED_RESPONSE')
        const next = lineItems(returnedOrder?.lineItems, current.shop_currency!)
        await appendPendingLines(
          db,
          run.id,
          pending.source_gid,
          next.items,
          next.pageInfo,
        )
        if (
          nested.currentlyAvailable < nested.requestedCost &&
          next.pageInfo.hasNextPage
        )
          return publicResult(
            await finishRun(db, run.id, 'partial', clock(), 'RATE_LIMITED'),
          )
      }
      const unfinished = await db
        .prepare(
          `SELECT 1 AS pending FROM shopify_order_sync_pending_orders
           WHERE run_id = ? AND line_has_next = 1 LIMIT 1`,
        )
        .bind(run.id)
        .first<{ pending: number }>()
      if (unfinished)
        return publicResult(
          await finishRun(db, run.id, 'partial', clock(), null),
        )
      await commitPendingPage(db, current)
      invocationPages += 1
    }
    const current = (await latestRun(db))!
    return publicResult(
      await finishRun(
        db,
        run.id,
        current.top_has_next === 0 ? 'complete' : 'partial',
        clock(),
        null,
      ),
    )
  } catch (cause) {
    const code =
      cause instanceof ShopifyConnectionError ? cause.code : 'UNKNOWN'
    const current = (await latestRun(db))!
    return publicResult(
      await finishRun(
        db,
        run.id,
        current.pages_count > 0 ? 'partial' : 'failed',
        clock(),
        code,
      ),
    )
  }
}
