# Shopify Ingestion Backend Validation

- Date: 2026-08-16
- Scope: read-only Shopify products and inventory ingestion through the production Admin backend path
- Store class: maintainer-controlled Shopify development store
- API: Admin GraphQL `2026-07`

## Path exercised

```text
ephemeral authenticated owner
      ↓
encrypted Shopify configuration
      ↓
real connection verification
      ↓
POST /api/integrations/shopify/sync
      ↓
transient client-credentials token
      ↓
bounded read-only productVariants/inventory query
      ↓
Shopify-specific D1 tables
      ↓
repeat the same complete sync
```

The committed opt-in `pnpm test:shopify-live` harness used the production Worker handlers, production Shopify connection/provider code, migration `0003_shopify_inventory.sql`, and an isolated local D1 database. It performed GraphQL queries only and did not modify the store.

## Sanitized result

- Sync status: `complete`
- Coverage complete: yes
- Products persisted: 18
- Variants persisted: 27
- Inventory items persisted: 27
- Inventory levels persisted: 29
- Locations persisted: 3
- Repeated-sync row counts: unchanged
- Client secret encrypted at rest: yes
- Shopify access token persisted: no
- Store mutation: none

No shop credentials, encryption key, access token, authorization header, provider cursor, product names, SKUs, or raw Shopify responses are recorded in this artifact.

## Conclusion

The backend product path is validated for a bounded complete development-store scan and deterministic repeated ingestion. This evidence does not validate scheduled sync, large catalogs, merchant production stores, Shopify webhooks, the future Admin sync UI, or the future MCP inventory tool.
