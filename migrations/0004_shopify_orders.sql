CREATE TABLE shopify_order_sync_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'partial', 'failed')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  shop_timezone TEXT,
  shop_currency TEXT,
  top_cursor TEXT,
  top_has_next INTEGER NOT NULL DEFAULT 1 CHECK (top_has_next IN (0, 1)),
  pending_page_active INTEGER NOT NULL DEFAULT 0 CHECK (pending_page_active IN (0, 1)),
  pending_next_top_cursor TEXT,
  pending_next_top_has_next INTEGER CHECK (pending_next_top_has_next IN (0, 1)),
  requests_count INTEGER NOT NULL DEFAULT 0 CHECK (requests_count >= 0),
  pages_count INTEGER NOT NULL DEFAULT 0 CHECK (pages_count >= 0),
  orders_count INTEGER NOT NULL DEFAULT 0 CHECK (orders_count >= 0),
  line_items_count INTEGER NOT NULL DEFAULT 0 CHECK (line_items_count >= 0),
  coverage_complete INTEGER NOT NULL DEFAULT 0 CHECK (coverage_complete IN (0, 1)),
  last_error_code TEXT,
  CHECK (window_start < window_end)
) STRICT;

CREATE TABLE shopify_order_sync_pending_orders (
  run_id TEXT NOT NULL REFERENCES shopify_order_sync_runs(id) ON DELETE CASCADE,
  source_gid TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  current_total_amount TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  line_cursor TEXT,
  line_has_next INTEGER NOT NULL CHECK (line_has_next IN (0, 1)),
  PRIMARY KEY (run_id, source_gid)
) STRICT;

CREATE TABLE shopify_order_sync_pending_line_items (
  run_id TEXT NOT NULL,
  source_gid TEXT NOT NULL,
  order_gid TEXT NOT NULL,
  product_gid TEXT,
  variant_gid TEXT,
  title TEXT NOT NULL,
  variant_title TEXT,
  sku TEXT,
  current_quantity INTEGER NOT NULL CHECK (current_quantity >= 0),
  current_discounted_subtotal TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  PRIMARY KEY (run_id, source_gid),
  FOREIGN KEY (run_id, order_gid)
    REFERENCES shopify_order_sync_pending_orders(run_id, source_gid)
    ON DELETE CASCADE
) STRICT;

CREATE TABLE shopify_orders (
  source_gid TEXT PRIMARY KEY,
  name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  current_total_amount TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  last_seen_order_scan_id TEXT NOT NULL REFERENCES shopify_order_sync_runs(id)
) STRICT;

CREATE TABLE shopify_order_line_items (
  source_gid TEXT PRIMARY KEY,
  order_gid TEXT NOT NULL REFERENCES shopify_orders(source_gid) ON DELETE CASCADE,
  product_gid TEXT,
  variant_gid TEXT,
  title TEXT NOT NULL,
  variant_title TEXT,
  sku TEXT,
  current_quantity INTEGER NOT NULL CHECK (current_quantity >= 0),
  current_discounted_subtotal TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  last_seen_order_scan_id TEXT NOT NULL REFERENCES shopify_order_sync_runs(id)
) STRICT;

CREATE INDEX shopify_orders_created_idx ON shopify_orders(created_at);
CREATE INDEX shopify_orders_updated_idx ON shopify_orders(updated_at);
CREATE INDEX shopify_line_items_order_idx ON shopify_order_line_items(order_gid);
CREATE INDEX shopify_line_items_product_idx ON shopify_order_line_items(product_gid, variant_gid);
CREATE INDEX shopify_order_sync_started_idx ON shopify_order_sync_runs(started_at DESC);
CREATE UNIQUE INDEX shopify_one_running_order_sync_idx ON shopify_order_sync_runs((1)) WHERE status = 'running';
