export type ShopifyStockState =
  'all' | 'in_stock' | 'out_of_stock' | 'low_stock'

export interface ShopifyInventoryQuery {
  readonly sku?: string
  readonly productText?: string
  readonly location?: string
  readonly stockState?: ShopifyStockState
  readonly lowStockThreshold?: number
  readonly limit?: number
  readonly cursor?: string
}

export interface ShopifyInventoryItemResult {
  readonly product: string
  readonly variant: string
  readonly sku: string | null
  readonly tracked: boolean
  readonly location: string | null
  readonly available: number | null
}

export interface ShopifyInventoryResult {
  readonly items: readonly ShopifyInventoryItemResult[]
  readonly nextCursor: string | null
  readonly lastSuccessfulSyncAt: string | null
}

interface InventoryRow {
  product_title: string
  product_sort: string
  variant_title: string
  variant_gid: string
  sku: string | null
  tracked: number
  location_name: string | null
  location_gid: string
  available_quantity: number | null
}

interface CursorValue {
  product: string
  variant: string
  location: string
}

const DEFAULT_LIMIT = 25
const MAXIMUM_LIMIT = 100
const DEFAULT_LOW_STOCK_THRESHOLD = 5

function encodeCursor(value: CursorValue): string {
  return btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function decodeCursor(value: string): CursorValue {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    const parsed = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
      ),
    ) as unknown
    if (!parsed || typeof parsed !== 'object') throw new Error()
    const candidate = parsed as Record<string, unknown>
    if (
      typeof candidate.product !== 'string' ||
      typeof candidate.variant !== 'string' ||
      typeof candidate.location !== 'string'
    )
      throw new Error()
    return {
      product: candidate.product,
      variant: candidate.variant,
      location: candidate.location,
    }
  } catch {
    throw new Error('Invalid inventory cursor.')
  }
}

function likePattern(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

export async function queryShopifyInventory(
  db: D1Database,
  input: ShopifyInventoryQuery = {},
): Promise<ShopifyInventoryResult> {
  const limit = Math.min(
    MAXIMUM_LIMIT,
    Math.max(1, Math.trunc(input.limit ?? DEFAULT_LIMIT)),
  )
  const threshold = Math.min(
    1000,
    Math.max(
      0,
      Math.trunc(input.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD),
    ),
  )
  const stockState = input.stockState ?? 'all'
  const conditions: string[] = []
  const bindings: unknown[] = []

  if (input.sku) {
    conditions.push('lower(v.sku) = lower(?)')
    bindings.push(input.sku.trim())
  }
  if (input.productText) {
    conditions.push("lower(p.title) LIKE lower(?) ESCAPE '\\'")
    bindings.push(likePattern(input.productText.trim()))
  }
  if (input.location) {
    conditions.push("lower(l.name) LIKE lower(?) ESCAPE '\\'")
    bindings.push(likePattern(input.location.trim()))
  }
  if (stockState === 'out_of_stock') {
    conditions.push('i.tracked = 1 AND il.available_quantity <= 0')
  } else if (stockState === 'low_stock') {
    conditions.push(
      'i.tracked = 1 AND il.available_quantity > 0 AND il.available_quantity <= ?',
    )
    bindings.push(threshold)
  } else if (stockState === 'in_stock') {
    conditions.push('i.tracked = 1 AND il.available_quantity > 0')
  }

  if (input.cursor) {
    const cursor = decodeCursor(input.cursor)
    conditions.push(
      `(lower(p.title) > ? OR
       (lower(p.title) = ? AND v.source_gid > ?) OR
       (lower(p.title) = ? AND v.source_gid = ? AND COALESCE(l.source_gid, '') > ?))`,
    )
    bindings.push(
      cursor.product,
      cursor.product,
      cursor.variant,
      cursor.product,
      cursor.variant,
      cursor.location,
    )
  }

  const rows = await db
    .prepare(
      `SELECT p.title AS product_title, lower(p.title) AS product_sort,
        v.title AS variant_title, v.source_gid AS variant_gid, v.sku,
        i.tracked, l.name AS location_name, COALESCE(l.source_gid, '') AS location_gid,
        il.available_quantity
      FROM shopify_variants v
      JOIN shopify_products p ON p.source_gid = v.product_gid
      JOIN shopify_inventory_items i ON i.source_gid = v.inventory_item_gid
      LEFT JOIN shopify_inventory_levels il ON il.inventory_item_gid = i.source_gid
      LEFT JOIN shopify_locations l ON l.source_gid = il.location_gid
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY lower(p.title), v.source_gid, COALESCE(l.source_gid, '')
      LIMIT ?`,
    )
    .bind(...bindings, limit + 1)
    .all<InventoryRow>()

  const page = rows.results.slice(0, limit)
  const last = page.at(-1)
  const nextCursor =
    rows.results.length > limit && last
      ? encodeCursor({
          product: last.product_sort,
          variant: last.variant_gid,
          location: last.location_gid,
        })
      : null
  const lastSync = await db
    .prepare(
      `SELECT completed_at FROM shopify_sync_runs
       WHERE status = 'complete' AND coverage_complete = 1
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .first<{ completed_at: number }>()

  return {
    items: page.map((row) => ({
      product: row.product_title,
      variant: row.variant_title,
      sku: row.sku,
      tracked: row.tracked === 1,
      location: row.location_name,
      available: row.available_quantity,
    })),
    nextCursor,
    lastSuccessfulSyncAt: lastSync
      ? new Date(lastSync.completed_at).toISOString()
      : null,
  }
}
