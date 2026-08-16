CREATE TABLE shopify_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  shop_domain TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret_envelope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('configured', 'connected', 'connection_error')),
  verified_at INTEGER,
  last_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
