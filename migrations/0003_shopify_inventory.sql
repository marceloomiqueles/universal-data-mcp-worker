CREATE TABLE shopify_sync_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'partial', 'failed')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  top_cursor TEXT,
  top_has_next INTEGER NOT NULL DEFAULT 1 CHECK (top_has_next IN (0, 1)),
  pending_levels_json TEXT NOT NULL DEFAULT '[]',
  requests_count INTEGER NOT NULL DEFAULT 0 CHECK (requests_count >= 0),
  pages_count INTEGER NOT NULL DEFAULT 0 CHECK (pages_count >= 0),
  products_count INTEGER NOT NULL DEFAULT 0 CHECK (products_count >= 0),
  variants_count INTEGER NOT NULL DEFAULT 0 CHECK (variants_count >= 0),
  levels_count INTEGER NOT NULL DEFAULT 0 CHECK (levels_count >= 0),
  coverage_complete INTEGER NOT NULL DEFAULT 0 CHECK (coverage_complete IN (0, 1)),
  last_error_code TEXT
) STRICT;

CREATE TABLE shopify_products (
  source_gid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  handle TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DRAFT', 'UNLISTED')),
  source_updated_at TEXT NOT NULL,
  last_seen_scan_id TEXT NOT NULL REFERENCES shopify_sync_runs(id)
) STRICT;

CREATE TABLE shopify_inventory_items (
  source_gid TEXT PRIMARY KEY,
  tracked INTEGER NOT NULL CHECK (tracked IN (0, 1)),
  last_seen_scan_id TEXT NOT NULL REFERENCES shopify_sync_runs(id)
) STRICT;

CREATE TABLE shopify_variants (
  source_gid TEXT PRIMARY KEY,
  product_gid TEXT NOT NULL REFERENCES shopify_products(source_gid),
  title TEXT NOT NULL,
  sku TEXT,
  inventory_item_gid TEXT NOT NULL UNIQUE REFERENCES shopify_inventory_items(source_gid),
  source_updated_at TEXT NOT NULL,
  last_seen_scan_id TEXT NOT NULL REFERENCES shopify_sync_runs(id)
) STRICT;

CREATE TABLE shopify_locations (
  source_gid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_seen_scan_id TEXT NOT NULL REFERENCES shopify_sync_runs(id)
) STRICT;

CREATE TABLE shopify_inventory_levels (
  source_gid TEXT PRIMARY KEY,
  inventory_item_gid TEXT NOT NULL REFERENCES shopify_inventory_items(source_gid),
  location_gid TEXT NOT NULL REFERENCES shopify_locations(source_gid),
  available_quantity INTEGER,
  source_updated_at TEXT NOT NULL,
  last_seen_scan_id TEXT NOT NULL REFERENCES shopify_sync_runs(id),
  UNIQUE (inventory_item_gid, location_gid)
) STRICT;

CREATE INDEX shopify_variants_product_idx ON shopify_variants(product_gid);
CREATE INDEX shopify_variants_sku_idx ON shopify_variants(sku);
CREATE INDEX shopify_levels_item_idx ON shopify_inventory_levels(inventory_item_gid);
CREATE INDEX shopify_levels_location_idx ON shopify_inventory_levels(location_gid);
CREATE INDEX shopify_sync_runs_started_idx ON shopify_sync_runs(started_at DESC);
CREATE UNIQUE INDEX shopify_one_running_sync_idx ON shopify_sync_runs((1)) WHERE status = 'running';
