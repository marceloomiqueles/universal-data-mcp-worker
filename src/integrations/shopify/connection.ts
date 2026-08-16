import { decryptValue, encryptValue } from '../../core/security/encrypted-value'
import type { IntegrationStatus } from '../../core/integrations/registry'
import {
  canonicalShopDomain,
  ShopifyConnectionError,
  type ShopifyConnectionErrorCode,
  verifyShopifyConnection,
} from './provider'

const encryptionContext = 'universal-data-mcp-worker/shopify/client-secret/v1'

interface ShopifyRow {
  shop_domain: string
  client_id: string
  client_secret_envelope: string
  status: Exclude<IntegrationStatus, 'not_configured'>
  verified_at: number | null
  last_error_code: ShopifyConnectionErrorCode | null
  created_at: number
  updated_at: number
}

export interface ShopifyConnectionState {
  readonly shopDomain: string
  readonly clientId: string
  readonly secretConfigured: true
  readonly status: Exclude<IntegrationStatus, 'not_configured'>
  readonly verifiedAt: string | null
  readonly lastErrorCode: ShopifyConnectionErrorCode | null
}

export interface SaveShopifyConfiguration {
  readonly shopDomain: string
  readonly clientId: string
  readonly clientSecret?: string
}

async function row(db: D1Database): Promise<ShopifyRow | null> {
  return db
    .prepare(
      `SELECT shop_domain, client_id, client_secret_envelope, status,
    verified_at, last_error_code, created_at, updated_at FROM shopify_connection WHERE id = 1`,
    )
    .first<ShopifyRow>()
}

function publicState(value: ShopifyRow): ShopifyConnectionState {
  return {
    shopDomain: value.shop_domain,
    clientId: value.client_id,
    secretConfigured: true,
    status: value.status,
    verifiedAt:
      value.verified_at === null
        ? null
        : new Date(value.verified_at).toISOString(),
    lastErrorCode: value.last_error_code,
  }
}

export async function getShopifyConnection(
  db: D1Database,
): Promise<ShopifyConnectionState | null> {
  const value = await row(db)
  return value ? publicState(value) : null
}

export async function readShopifyStatus(
  db: D1Database,
): Promise<IntegrationStatus> {
  return (await row(db))?.status ?? 'not_configured'
}

export async function saveShopifyConfiguration(
  db: D1Database,
  key: string,
  input: SaveShopifyConfiguration,
  now = Date.now(),
): Promise<ShopifyConnectionState> {
  const shopDomain = canonicalShopDomain(input.shopDomain)
  const clientId = input.clientId.trim()
  if (!clientId || clientId.length > 256)
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  const existing = await row(db)
  if (!existing && !input.clientSecret)
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  if (
    input.clientSecret !== undefined &&
    (input.clientSecret.length < 1 || input.clientSecret.length > 4096)
  )
    throw new ShopifyConnectionError('MALFORMED_RESPONSE')
  const envelope =
    input.clientSecret === undefined
      ? existing!.client_secret_envelope
      : await encryptValue(input.clientSecret, key, encryptionContext)
  const updatedAt = existing ? Math.max(now, existing.updated_at + 1) : now
  await db
    .prepare(
      `INSERT INTO shopify_connection
    (id, shop_domain, client_id, client_secret_envelope, status, verified_at, last_error_code, created_at, updated_at)
    VALUES (1, ?, ?, ?, 'configured', NULL, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET shop_domain = excluded.shop_domain, client_id = excluded.client_id,
      client_secret_envelope = excluded.client_secret_envelope, status = 'configured', verified_at = NULL,
      last_error_code = NULL, updated_at = excluded.updated_at`,
    )
    .bind(
      shopDomain,
      clientId,
      envelope,
      existing?.created_at ?? now,
      updatedAt,
    )
    .run()
  return publicState((await row(db))!)
}

export async function verifySavedShopifyConnection(
  db: D1Database,
  key: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<ShopifyConnectionState | null> {
  const existing = await row(db)
  if (!existing) return null
  let code: ShopifyConnectionErrorCode | null = null
  try {
    const clientSecret = await decryptValue(
      existing.client_secret_envelope,
      key,
      encryptionContext,
    )
    await verifyShopifyConnection(
      {
        shopDomain: existing.shop_domain,
        clientId: existing.client_id,
        clientSecret,
      },
      fetcher,
    )
  } catch (cause) {
    code = cause instanceof ShopifyConnectionError ? cause.code : 'UNKNOWN'
  }
  await db
    .prepare(
      `UPDATE shopify_connection SET status = ?, verified_at = ?, last_error_code = ?, updated_at = ?
    WHERE id = 1 AND updated_at = ?`,
    )
    .bind(
      code ? 'connection_error' : 'connected',
      code ? null : now,
      code,
      Math.max(now, existing.updated_at + 1),
      existing.updated_at,
    )
    .run()
  return getShopifyConnection(db)
}

export async function disconnectShopify(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM shopify_connection WHERE id = 1').run()
}
