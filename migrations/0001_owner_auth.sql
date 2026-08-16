CREATE TABLE owner_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  normalized_username TEXT NOT NULL UNIQUE,
  password_verifier TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  credential_updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE admin_sessions (
  token_digest TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owner_credentials(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX admin_sessions_expires_at_idx ON admin_sessions(expires_at);
