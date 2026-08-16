# Shopify Orders Ingestion Backend Validation

Date: 2026-08-16

## Scope

This record covers the backend-only Shopify Orders and Sales stage. It validates the bounded order source, Shopify-owned D1 persistence, operational Admin endpoint, and application sales read model. It does not validate an Admin order-sync UI, an MCP `get_sales` tool, or ChatGPT behavior.

## Deterministic evidence

The complete repository suite passed after applying migration `0004_shopify_orders.sql` to isolated test databases. Production-path Worker tests established:

- exact required scopes include `read_orders` and exclude `read_all_orders`, write scopes, and customer scopes;
- the fixed Admin GraphQL operations contain no mutation or customer identity fields;
- top-level order and nested line-item cursor pagination are bounded and resumable;
- a 20-request invocation checkpoint resumes without committing an incomplete order;
- stable Shopify Order and LineItem GIDs produce idempotent upserts;
- current order totals, quantities, cancellations, and removed line items replace prior source truth;
- partial failures retain previously committed data and never claim complete coverage;
- decimal amounts use exact fixed-six-decimal `BigInt` arithmetic and preserve currency;
- merchant calendar boundaries use Shopify's IANA timezone;
- the authenticated, exact-Origin order-sync endpoint rejects disconnected and concurrent execution;
- no customer, email, address, raw provider payload, Shopify access token, or credential is persisted.

## Live development-store attempt

The opt-in `pnpm test:shopify-live` harness ran through the production Admin backend path using ignored credentials for the maintainer-controlled development store. Connection verification returned the sanitized `SCOPE_FAILED` state because the installed app had not yet granted the newly required `read_orders` scope.

The harness stopped before order acquisition. It performed no Shopify mutation, persisted no access token, and emitted no credentials or authorization headers. Therefore real token acquisition with the complete scope set, real order GraphQL access, D1 order counts, and repeated real order-sync stability remain **not yet validated**.

Rerun the same committed harness after the development-store app grants exactly:

- `read_products`;
- `read_inventory`;
- `read_locations`;
- `read_orders`.

Do not add `read_all_orders`; the backend reports the standard recent 60-day coverage limitation explicitly.
