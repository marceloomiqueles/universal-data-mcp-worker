import {
  averageShopifyMoney,
  formatShopifyMoney,
  parseShopifyMoney,
} from './money'

const maximumRangeMilliseconds = 60 * 24 * 60 * 60 * 1000
const maximumOrdersPerQuery = 5000
const maximumLineItemsPerQuery = 20_000

export type ShopifySalesPeriod =
  'today' | 'yesterday' | 'this_week' | 'last_week' | 'last_7_days'

export interface ShopifySalesQuery {
  readonly start: string
  readonly end: string
  readonly includeTopProducts?: boolean
  readonly topProductsLimit?: number
}

export interface ShopifySalesResult {
  readonly period: { readonly start: string; readonly end: string }
  readonly timezone: string
  readonly orderCount: number
  readonly totalSales: string
  readonly averageOrderValue: string | null
  readonly currency: string
  readonly topProducts: readonly {
    readonly product: string
    readonly variant: string | null
    readonly sku: string | null
    readonly quantity: number
    readonly merchandiseSalesBeforeTax: string
    readonly currency: string
  }[]
  readonly lastSuccessfulSyncAt: string
  readonly coverage: {
    readonly limitation: 'recent_60_days_only'
    readonly windowStart: string
    readonly windowEnd: string
    readonly complete: true
  }
}

export class ShopifySalesQueryError extends Error {
  constructor(
    readonly code: 'INVALID_RANGE' | 'COVERAGE_UNAVAILABLE' | 'MIXED_CURRENCY',
  ) {
    super('Shopify sales data cannot be queried for the requested period.')
    this.name = 'ShopifySalesQueryError'
  }
}

interface SuccessfulRun {
  status: string
  coverage_complete: number
  completed_at: number
  window_start: number
  window_end: number
  shop_timezone: string
  shop_currency: string
}

interface OrderAmountRow {
  current_total_amount: string
  currency_code: string
}

interface LineAmountRow {
  product_gid: string | null
  variant_gid: string | null
  title: string
  variant_title: string | null
  sku: string | null
  current_quantity: number
  current_discounted_subtotal: string
  currency_code: string
}

function instant(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || !/Z$/u.test(value))
    throw new ShopifySalesQueryError('INVALID_RANGE')
  return parsed
}

function requireCurrency(actual: string, expected: string): void {
  if (actual !== expected) throw new ShopifySalesQueryError('MIXED_CURRENCY')
}

export async function queryShopifySales(
  db: D1Database,
  input: ShopifySalesQuery,
): Promise<ShopifySalesResult> {
  const start = instant(input.start)
  const end = instant(input.end)
  if (start >= end || end - start > maximumRangeMilliseconds)
    throw new ShopifySalesQueryError('INVALID_RANGE')

  const run = await db
    .prepare(
      `SELECT status, coverage_complete, completed_at, window_start, window_end,
        shop_timezone, shop_currency
       FROM shopify_order_sync_runs
       ORDER BY started_at DESC LIMIT 1`,
    )
    .first<SuccessfulRun>()
  if (
    !run ||
    run.status !== 'complete' ||
    run.coverage_complete !== 1 ||
    !run.shop_timezone ||
    !run.shop_currency ||
    start < run.window_start ||
    end > run.window_end
  )
    throw new ShopifySalesQueryError('COVERAGE_UNAVAILABLE')

  const orders = await db
    .prepare(
      `SELECT current_total_amount, currency_code FROM shopify_orders
       WHERE created_at >= ? AND created_at < ? AND cancelled_at IS NULL
       ORDER BY source_gid LIMIT ?`,
    )
    .bind(start, end, maximumOrdersPerQuery + 1)
    .all<OrderAmountRow>()
  if (orders.results.length > maximumOrdersPerQuery)
    throw new ShopifySalesQueryError('COVERAGE_UNAVAILABLE')

  let total = 0n
  for (const item of orders.results) {
    requireCurrency(item.currency_code, run.shop_currency)
    total += parseShopifyMoney(item.current_total_amount)
  }

  const topLimit = Math.min(
    25,
    Math.max(1, Math.trunc(input.topProductsLimit ?? 10)),
  )
  const groups = new Map<
    string,
    {
      product: string
      variant: string | null
      sku: string | null
      quantity: number
      total: bigint
      currency: string
    }
  >()
  if (input.includeTopProducts) {
    const lines = await db
      .prepare(
        `SELECT li.product_gid, li.variant_gid, li.title, li.variant_title, li.sku,
          li.current_quantity, li.current_discounted_subtotal, li.currency_code
         FROM shopify_order_line_items li
         JOIN shopify_orders o ON o.source_gid = li.order_gid
         WHERE o.created_at >= ? AND o.created_at < ? AND o.cancelled_at IS NULL
         ORDER BY li.source_gid LIMIT ?`,
      )
      .bind(start, end, maximumLineItemsPerQuery + 1)
      .all<LineAmountRow>()
    if (lines.results.length > maximumLineItemsPerQuery)
      throw new ShopifySalesQueryError('COVERAGE_UNAVAILABLE')
    for (const item of lines.results) {
      requireCurrency(item.currency_code, run.shop_currency)
      const key = item.variant_gid
        ? `variant:${item.variant_gid}`
        : item.product_gid
          ? `product:${item.product_gid}\u0000${item.variant_title ?? ''}\u0000${item.sku ?? ''}`
          : `snapshot:${item.title}\u0000${item.variant_title ?? ''}\u0000${item.sku ?? ''}`
      const current = groups.get(key) ?? {
        product: item.title,
        variant: item.variant_title,
        sku: item.sku,
        quantity: 0,
        total: 0n,
        currency: item.currency_code,
      }
      current.quantity += item.current_quantity
      current.total += parseShopifyMoney(item.current_discounted_subtotal)
      groups.set(key, current)
    }
  }

  return {
    period: {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    },
    timezone: run.shop_timezone,
    orderCount: orders.results.length,
    totalSales: formatShopifyMoney(total),
    averageOrderValue: averageShopifyMoney(total, orders.results.length),
    currency: run.shop_currency,
    topProducts: [...groups.values()]
      .sort((left, right) =>
        left.total === right.total ? 0 : left.total > right.total ? -1 : 1,
      )
      .slice(0, topLimit)
      .map((item) => ({
        product: item.product,
        variant: item.variant,
        sku: item.sku,
        quantity: item.quantity,
        merchandiseSalesBeforeTax: formatShopifyMoney(item.total),
        currency: item.currency,
      })),
    lastSuccessfulSyncAt: new Date(run.completed_at).toISOString(),
    coverage: {
      limitation: 'recent_60_days_only',
      windowStart: new Date(run.window_start).toISOString(),
      windowEnd: new Date(run.window_end).toISOString(),
      complete: true,
    },
  }
}

interface LocalDateTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function localParts(instantValue: number, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instantValue)
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

function localToUtc(local: LocalDateTime, timeZone: string): number {
  const target = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  )
  let candidate = target
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = localParts(candidate, timeZone)
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    )
    candidate += target - observedAsUtc
  }
  return candidate
}

function shiftDate(
  date: Pick<LocalDateTime, 'year' | 'month' | 'day'>,
  days: number,
): Pick<LocalDateTime, 'year' | 'month' | 'day'> {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

export function resolveShopifySalesPeriod(
  period: ShopifySalesPeriod,
  now: number,
  timeZone: string,
): { start: string; end: string } {
  const local = localParts(now, timeZone)
  const today = { year: local.year, month: local.month, day: local.day }
  const weekday = new Date(
    Date.UTC(local.year, local.month - 1, local.day),
  ).getUTCDay()
  const sinceMonday = (weekday + 6) % 7
  let startDate = today
  let endDate = shiftDate(today, 1)
  if (period === 'yesterday') {
    startDate = shiftDate(today, -1)
    endDate = today
  } else if (period === 'this_week') {
    startDate = shiftDate(today, -sinceMonday)
    endDate = shiftDate(today, 1)
  } else if (period === 'last_week') {
    endDate = shiftDate(today, -sinceMonday)
    startDate = shiftDate(endDate, -7)
  } else if (period === 'last_7_days') {
    startDate = shiftDate(today, -6)
    endDate = shiftDate(today, 1)
  }
  const start = localToUtc(
    { ...startDate, hour: 0, minute: 0, second: 0 },
    timeZone,
  )
  const end = localToUtc(
    { ...endDate, hour: 0, minute: 0, second: 0 },
    timeZone,
  )
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  }
}
