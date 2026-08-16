import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { queryShopifyInventory } from '../../src/integrations/shopify/inventory-query'

const completedAt = Date.UTC(2026, 7, 16, 12, 0, 0)

async function clearInventory(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM shopify_inventory_levels'),
    env.DB.prepare('DELETE FROM shopify_variants'),
    env.DB.prepare('DELETE FROM shopify_inventory_items'),
    env.DB.prepare('DELETE FROM shopify_locations'),
    env.DB.prepare('DELETE FROM shopify_products'),
    env.DB.prepare('DELETE FROM shopify_sync_runs'),
  ])
}

async function seedInventory(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO shopify_sync_runs
       (id, status, started_at, completed_at, top_has_next, coverage_complete)
       VALUES ('scan-1', 'complete', ?, ?, 0, 1)`,
    ).bind(completedAt - 1000, completedAt),
    env.DB.prepare(
      `INSERT INTO shopify_products
       (source_gid, title, handle, status, source_updated_at, last_seen_scan_id)
       VALUES
       ('gid://shopify/Product/1', 'Trail Shoe', 'trail-shoe', 'ACTIVE', '2026-08-16T12:00:00Z', 'scan-1'),
       ('gid://shopify/Product/2', 'Desk Widget', 'desk-widget', 'ACTIVE', '2026-08-16T12:00:00Z', 'scan-1')`,
    ),
    env.DB.prepare(
      `INSERT INTO shopify_inventory_items
       (source_gid, tracked, last_seen_scan_id)
       VALUES
       ('gid://shopify/InventoryItem/1', 1, 'scan-1'),
       ('gid://shopify/InventoryItem/2', 1, 'scan-1'),
       ('gid://shopify/InventoryItem/3', 0, 'scan-1')`,
    ),
    env.DB.prepare(
      `INSERT INTO shopify_variants
       (source_gid, product_gid, title, sku, inventory_item_gid, source_updated_at, last_seen_scan_id)
       VALUES
       ('gid://shopify/ProductVariant/1', 'gid://shopify/Product/1', 'Blue', 'SKU-LOW', 'gid://shopify/InventoryItem/1', '2026-08-16T12:00:00Z', 'scan-1'),
       ('gid://shopify/ProductVariant/2', 'gid://shopify/Product/1', 'Red', 'SKU-HIGH', 'gid://shopify/InventoryItem/2', '2026-08-16T12:00:00Z', 'scan-1'),
       ('gid://shopify/ProductVariant/3', 'gid://shopify/Product/2', 'Default', NULL, 'gid://shopify/InventoryItem/3', '2026-08-16T12:00:00Z', 'scan-1')`,
    ),
    env.DB.prepare(
      `INSERT INTO shopify_locations (source_gid, name, last_seen_scan_id)
       VALUES
       ('gid://shopify/Location/1', 'North Warehouse', 'scan-1'),
       ('gid://shopify/Location/2', 'South Store', 'scan-1')`,
    ),
    env.DB.prepare(
      `INSERT INTO shopify_inventory_levels
       (source_gid, inventory_item_gid, location_gid, available_quantity, source_updated_at, last_seen_scan_id)
       VALUES
       ('gid://shopify/InventoryLevel/1', 'gid://shopify/InventoryItem/1', 'gid://shopify/Location/1', 3, '2026-08-16T12:00:00Z', 'scan-1'),
       ('gid://shopify/InventoryLevel/2', 'gid://shopify/InventoryItem/1', 'gid://shopify/Location/2', 0, '2026-08-16T12:00:00Z', 'scan-1'),
       ('gid://shopify/InventoryLevel/3', 'gid://shopify/InventoryItem/2', 'gid://shopify/Location/1', 10, '2026-08-16T12:00:00Z', 'scan-1')`,
    ),
  ])
}

beforeEach(clearInventory)

describe('Shopify inventory query', () => {
  it('returns an empty bounded result without a completed sync', async () => {
    await expect(queryShopifyInventory(env.DB)).resolves.toEqual({
      items: [],
      nextCursor: null,
      lastSuccessfulSyncAt: null,
    })
  })

  it('applies explicit stock semantics without treating untracked inventory as zero', async () => {
    await seedInventory()

    const out = await queryShopifyInventory(env.DB, {
      stockState: 'out_of_stock',
    })
    expect(out.items).toEqual([
      expect.objectContaining({
        sku: 'SKU-LOW',
        location: 'South Store',
        available: 0,
      }),
    ])

    const low = await queryShopifyInventory(env.DB, {
      stockState: 'low_stock',
      lowStockThreshold: 3,
    })
    expect(low.items).toEqual([
      expect.objectContaining({
        sku: 'SKU-LOW',
        location: 'North Warehouse',
        available: 3,
      }),
    ])

    const inStock = await queryShopifyInventory(env.DB, {
      stockState: 'in_stock',
    })
    expect(inStock.items.map(({ available }) => available)).toEqual([3, 10])
  })

  it('filters by exact SKU and partial product or location text', async () => {
    await seedInventory()

    const sku = await queryShopifyInventory(env.DB, { sku: 'sku-low' })
    expect(sku.items).toHaveLength(2)
    expect(sku.items.every((item) => item.sku === 'SKU-LOW')).toBe(true)

    const product = await queryShopifyInventory(env.DB, {
      productText: 'trail',
    })
    expect(product.items).toHaveLength(3)

    const location = await queryShopifyInventory(env.DB, {
      location: 'south',
    })
    expect(location.items).toEqual([
      expect.objectContaining({ sku: 'SKU-LOW', location: 'South Store' }),
    ])
  })

  it('represents multi-location inventory and paginates without overlap', async () => {
    await seedInventory()

    const multiLocation = await queryShopifyInventory(env.DB, {
      sku: 'SKU-LOW',
    })
    expect(multiLocation.items.map(({ location }) => location).sort()).toEqual([
      'North Warehouse',
      'South Store',
    ])

    const first = await queryShopifyInventory(env.DB, { limit: 1 })
    expect(first.items).toHaveLength(1)
    expect(first.nextCursor).not.toBeNull()
    const second = await queryShopifyInventory(env.DB, {
      limit: 1,
      cursor: first.nextCursor!,
    })
    expect(second.items).toHaveLength(1)
    expect(second.items[0]).not.toEqual(first.items[0])
  })

  it('returns freshness from the latest complete full-coverage sync', async () => {
    await seedInventory()
    await env.DB.prepare(
      `INSERT INTO shopify_sync_runs
       (id, status, started_at, completed_at, top_has_next, coverage_complete)
       VALUES ('partial-scan', 'partial', ?, ?, 1, 0)`,
    )
      .bind(completedAt + 1000, completedAt + 2000)
      .run()

    const result = await queryShopifyInventory(env.DB)
    expect(result.lastSuccessfulSyncAt).toBe(
      new Date(completedAt).toISOString(),
    )
  })
})
