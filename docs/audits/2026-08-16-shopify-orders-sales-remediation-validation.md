# Shopify Orders and Sales Remediation Validation

Date: 2026-08-16

## Scope

This record validates the targeted remediation of the findings in the independent Shopify Orders and Sales MVP audit. It covers required Shopify scope semantics, sales availability after incomplete sync attempts, current documentation, the opt-in live Shopify product path, deployment, and the real comparative ChatGPT scenario. It adds no sales capability or data domain.

## Shopify scope evidence

The three relevant scope sets are distinct:

- Configured Dev Dashboard scopes, as directly inspected by the maintainer: `read_inventory`, `read_locations`, `read_orders`, and `read_products`.
- Product-required scopes: `read_inventory`, `read_locations`, `read_orders`, and `read_products`.
- Provider-reported granted scopes from the live client-credentials response: `read_all_orders`, `read_inventory`, `read_locations`, `read_orders`, and `read_products`.

Current official Shopify documentation describes `read_orders` as the ordinary Order permission with a default recent 60-day window. It describes `read_all_orders` as a separate protected permission used together with `read_orders` or `write_orders` for older orders. The observed additional provider-reported scope is accepted but is neither treated as maintainer-configured nor required by the product.

Connection verification now applies set inclusion:

```text
required product scopes ⊆ provider-reported granted scopes
```

Deterministic tests accept the minimum grant, the observed `read_all_orders` superset, and another harmless additional read scope. They reject missing `read_orders`, missing inventory access, and `read_all_orders` without `read_orders`. Product ingestion remains fixed to `recent_60_days_only` regardless of additional grants.

The opt-in `pnpm test:shopify-live` production-path harness passed against the maintainer-controlled development store. It separately reported the four required scopes and the five provider-reported scopes above, connected successfully, synchronized 18 products, 27 variants, 27 inventory items, 30 inventory levels, 3 locations, 1 order, and 2 line items, and preserved stable repeated inventory counts. No customer-identity schema or access-token persistence was present. No Shopify mutation was performed.

## Mutable order-state availability semantics

The existing persistence model is **latest mutable entity state with separate sync-run metadata**, not a snapshot per sync run.

A fully staged order page writes only valid current order state. A complete nested reread replaces that order's current line-item set atomically with respect to the page batch. A partial run never globally deletes orders that are absent from its bounded query. Therefore, after complete run A, valid rows committed by later partial run B can make some entities newer but cannot invalidate A's proven entity coverage for A's window. A's completion timestamp remains a conservative freshness lower bound rather than a claim that every row is an exact historical snapshot of A.

The sales read model now selects the newest complete run whose window covers the requested period. It separately reports the latest terminal attempt. The result exposes:

- `lastSuccessfulOrderSync`: freshness and coverage authority;
- `latestOrderSyncAttempt.status` and `completedAt`: newer operational outcome.

The Admin API/UI similarly distinguish the latest attempt from the last successful complete order sync. If no complete trustworthy run covers the request, the existing `COVERAGE_UNAVAILABLE` result remains authoritative.

Production-path tests cover:

- complete only;
- complete followed by failure before business-data writes;
- complete followed by partial valid writes, with conservative prior completeness and explicit partial-attempt metadata;
- partial only and failed only;
- complete, failed, then complete;
- complete, partial, then completed continuation;
- D1-only MCP output with a later failed attempt and prior complete coverage.

## Deployment

The first deploy attempt failed at the remote D1 migration gate because the named Wrangler profile required OAuth renewal. Worker publication did not run. After reauthenticating profile `work`, the validated deployment path reported `No migrations to apply!` and then published exactly one Worker version:

```text
024a561b-d490-45cc-9a34-acd59f3e5a7c
```

The deployed endpoint remains `https://manhattan.paperco.de/mcp` through its existing custom domain. No D1 migration or schema change was required by this remediation.

## Real comparative ChatGPT validation

- Product/mode: ChatGPT with the connected Universal Data MCP Worker app in the previously validated developer-mode flow.
- Endpoint host: `manhattan.paperco.de`.
- Natural prompt: `How are sales this week compared with last week?`
- Selected capability: the ChatGPT UI displayed the sales-calculation MCP action backed by `get_sales`.
- Merchant timezone: `America/Santiago`.
- Current-week period: Monday 2026-08-10 00:00 local (`2026-08-10T04:00:00.000Z`) through the latest covered sync instant.
- Previous-week period: Monday 2026-08-03 00:00 local (`2026-08-03T04:00:00.000Z`) through Monday 2026-08-10 00:00 local (`2026-08-10T04:00:00.000Z`).
- Current-week result: 1 non-cancelled order, CLP 3,330.
- Previous-week result: 0 orders, CLP 0.
- Comparison: sales increased from CLP 0 to CLP 3,330; ChatGPT correctly stated that a percentage increase is not meaningful from a zero baseline.
- Freshness: August 16, 2026 at 5:24 PM Chile time.

The tool contract accepts only one named period per invocation, so satisfying this comparison requires two bounded `get_sales` evaluations. ChatGPT grouped them into one visible sales-calculation action. The returned counts, totals, currency, timezone, and boundaries agree with independent read-only D1 queries. Existing production-path fetch interception proves `get_sales` uses D1 only and performs no Shopify request.

No Shopify credential, access token, MCP OAuth token, Admin cookie, encryption key, customer identity, or raw provider response is included in this record.

## Documentation supersession

Historical audit and validation artifacts remain unchanged. Current `README.md`, `TESTING.md`, and Admin copy now state the authoritative four required scopes, inclusion-based validation, optional extra-grant behavior, fixed recent-60-day product coverage, and the distinction between latest attempt and last successful complete order sync.

## Validation results

- `pnpm install --frozen-lockfile`: passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm format:check`: passed.
- `pnpm test`: passed: 27 Node tests, 35 Admin tests, and 117 Worker tests.
- `pnpm build`: passed; browser secret inspection passed.
- `pnpm test:shopify-live`: passed with sanitized scope and row-count evidence.
- Migration-gated remote deployment: passed after Wrangler profile reauthentication.
- Real comparative ChatGPT scenario: passed and correlated with read-only D1 evidence.

## Finding status

- P1-1 incorrect/unnecessary `read_all_orders` requirement and exact-set semantics: **RESOLVED**.
- P1-2 later incomplete sync hides prior usable sales: **RESOLVED**.
- P2-1 comparative-period ChatGPT evidence: **RESOLVED**.
- P3-1 stale current scope/documentation chain: **RESOLVED**; historical artifacts are intentionally preserved and superseded by current documentation and this record.

## Scope confirmation

No new sales feature, MCP tool, Shopify field, customer data, historical ingestion, mutation, background process, migration, generic framework, or next product slice was introduced.
