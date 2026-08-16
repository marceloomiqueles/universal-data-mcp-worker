# Shopify Orders and Sales MVP Audit

Date: 2026-08-16

## Scope

This independent read-only audit evaluates the completed Shopify Orders and Sales path from the official Shopify GraphQL Admin API through D1, MCP, and real ChatGPT use. It covers commit `3927a9f206c71377cf73fc517d49cce63ca2834f` on branch `22-implement-shopify-orders-and-sales`.

The audit inspected the approved GitHub issue, architecture and ADRs, migrations, Shopify activation/provider and ingestion code, the D1 sales read model, Admin API and UI, MCP composition and tests, prior validation records, current official Shopify documentation, and read-only production D1 evidence. No implementation or Cloudflare resource was modified.

## Executive assessment

The slice proves a real bounded path from a maintainer-controlled Shopify development store to persisted D1 orders and line items, then to `get_sales` and ChatGPT. The live result in D1 agrees with the recorded ChatGPT answer: one non-cancelled order totaling CLP 3,330 and two line items totaling CLP 700 and CLP 2,630.

The data model, exact-money implementation, PII minimization, MCP boundary, and positive/zero ChatGPT behavior are sound. Two P1 defects remain before the slice should be treated as generally ready:

1. connection verification requires `read_all_orders`, although the implemented acquisition deliberately queries only a rolling 60-day window and the approved issue requires only `read_orders`;
2. the sales read model requires the latest sync run to be complete, so a later partial or failed run makes previously complete, usable persisted sales data unavailable.

## Official source contract

The implementation uses direct `fetch` against Shopify's versioned GraphQL Admin API (`2026-07`) and the client-credentials token endpoint. No Shopify framework or Node-only source client was added. Access tokens remain transient.

Shopify documents that `read_orders` provides Order access for the default recent 60-day window. `read_all_orders` is a separate protected scope for older orders, used together with an order scope and requested through Shopify's access process. It is not documented as the default order permission. The fact that the audited development-store token included it is real installation evidence, but does not make it necessary for this implementation. Sources: [Shopify access scopes](https://shopify.dev/docs/api/usage/access-scopes), [Order query](https://shopify.dev/docs/api/admin-graphql/latest/queries/order), and [Orders query](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders).

The source query itself applies a `created_at` window of exactly 60 days. That is a deliberate product bound and remains truthful even when the current development-store grant could expose older orders.

## Acquisition audit

- The fixed operations are GraphQL queries, not mutations.
- The selected order fields contain no customer object, email, phone, billing/shipping address, IP address, or customer note.
- Top-level pages contain 20 orders, nested pages contain 20 line items, a run completes at most five top-level pages, and one invocation performs at most 20 GraphQL requests.
- Nested line-item pagination is staged and resumable; an incomplete order is not committed before all of its line-item pages are available.
- HTTP status, GraphQL errors, API-version mismatch, response bounds, timeout, and cost/throttle metadata are handled through sanitized Shopify error categories.
- A Shopify access token is acquired for the run, held in memory, and neither represented in the migration nor written by the ingestion path.
- Each run re-reads a rolling creation-time window, so the design is not append-only. Re-read orders replace their current total, cancellation state, timestamps, and line items.

### Finding P1-1: unnecessary `read_all_orders` requirement

`SHOPIFY_REQUIRED_SCOPES` requires an exact five-scope grant containing both `read_orders` and `read_all_orders`. This contradicts the approved minimum-scope contract and blocks otherwise valid installations that grant the documented `read_orders` scope. The ingestion still queries and reports only `recent_60_days_only`, so the extra permission has no current consumer.

The development-store UI behavior reported during implementation explains why the current token contains the scope, but does not establish that every self-hosted installation receives it by default. Official Shopify documentation identifies it as a separately approved permission. This is a least-privilege and installation-compatibility defect, not evidence that the live development-store read was invalid.

## Persistence and idempotency audit

Migration `0004_shopify_orders.sql` uses Shopify Order and LineItem GIDs as primary keys. It stores exact decimal strings, currency, source timestamps, cancellation state, bounded display metadata, current quantities, and nullable product/variant GIDs. Missing current catalog entities therefore do not prevent historical line-item persistence.

There are no customer, address, email, token, or raw-payload columns. No generic commerce schema, customer domain, analytics framework, or raw JSON store was introduced.

Order and line-item writes use deterministic upserts. A completely re-read order removes only its stale line items after the replacement set has been staged. Tests verify repeated ingestion, changed totals and quantities, removed line items, nullable catalog relations, cross-page orders, nested pagination, partial failure, and concurrency rejection. The logical state does not grow with retry count.

Read-only production D1 inspection confirmed:

- migrations `0001` through `0004` applied;
- latest order sync `complete`, with distinct start and completion timestamps;
- `coverage_complete = 1`, one request, one page, one order, and two line items;
- one non-cancelled CLP order with `current_total_amount = 3330`;
- line-item amounts of CLP 700 and CLP 2,630;
- no D1 writes were performed by the audit queries.

## Temporal and coverage correctness

The ingestion records the run start before acquisition and evaluates the clock again on complete, partial, and failed terminal paths. Production evidence showed a real non-zero duration. The sales result uses `completed_at` as freshness.

Shopify's `shop.ianaTimezone` is persisted with the run. Merchant calendar periods are resolved with that IANA timezone, including a deterministic daylight-saving boundary test. Current periods are capped at the completed run's `window_end`, preventing the server from claiming coverage after the last acquisition.

Coverage is consistently described as `recent_60_days_only`; an explicit query cannot exceed 60 days or fall outside the selected run window.

### Finding P1-2: later incomplete run hides prior usable sales data

`queryShopifySalesPeriod` locates the latest complete run to resolve the merchant timezone, but `queryShopifySales` then independently selects the latest run of any status and rejects it unless it is complete. Consequently, after a successful complete sync, a later partial or failed run causes all sales queries to return `COVERAGE_UNAVAILABLE`, even though the prior complete data and metadata remain in D1.

The automated test explicitly asserts this rejection after a later-page failure. That protects current behavior but also confirms the availability defect. It is conservative and does not return incorrect totals, yet it violates the approved requirement that source failure leave prior usable data intact. The application should consistently select the latest successful complete coverage record (with appropriately truthful freshness) or explicitly document a stricter unavailable-state policy; the current mixed selection is internally inconsistent.

## Changing-order and sales semantics

The source stores `currentTotalPriceSet.shopMoney` and excludes orders with `cancelledAt` from aggregate counts and totals. It updates values on every bounded re-read. Product ranking uses line-item `currentQuantity` and `priceAfterAllDiscountsBeforeTaxesSet.shopMoney`.

Accordingly, project “sales” means current non-cancelled Shopify order totals after Shopify-applied changes/returns, including tax and discounts. Ranked merchandise amounts are after discounts and before tax. The project correctly avoids describing these figures as accounting revenue. Refund/change behavior is verified with deterministic current-value replacement fixtures, not with a real refunded development-store order; claims do not exceed that evidence.

Money parsing converts Shopify decimal strings to fixed six-decimal `BigInt` units and formats only at the output boundary. Totals and half-up averages therefore avoid binary floating-point arithmetic. Every source and query currency must match the shop currency; mixed-currency aggregation fails closed. There is no FX conversion or universal money framework.

The D1 read model supports explicit bounded UTC ranges and merchant-timezone periods. It counts non-cancelled orders, sums current totals, calculates average order value, and optionally ranks at most 25 product snapshots. It bounds source rows at 5,000 orders and 20,000 line items. A no-order period returns count zero and total zero rather than an error.

## Admin and privacy audit

`POST /api/integrations/shopify/orders/sync` requires the owner session and exact Origin protection. It requires connected Shopify, rejects concurrent execution, uses the production ingestion path, and returns bounded sanitized operational metadata.

The Admin Shopify management surface presents order capability, last sync, outcome, coverage, bounded counts, and `Sync orders now`. It handles never-synced, missing-scope, running, complete, partial, failed, and disconnected states. It contains no customer UI, order dump, chart, or sales dashboard.

No requested field, migration column, API response, UI state, or MCP DTO contains customer identity, email, phone, or address data. The live validation record contains only aggregate/test-product evidence.

## MCP audit

`get_sales` is contributed by the Shopify slice only while Shopify is connected. It calls the D1 application query directly; it does not call Shopify or the Admin HTTP API. A production-path test replaces global `fetch` and proves both `get_sales` and `get_inventory` return without a provider network request.

The strict input accepts either one named merchant period or explicit UTC start/end instants, optional top-product inclusion, and a top-product limit capped at 25. The bounded output contains period, timezone, aggregate values, currency, optional ranked product snapshots, last successful sync, and the coverage limitation. It contains no Shopify credential, customer data, raw D1 key, order rows, or provider payload.

`list_integrations` and `get_inventory` remain present and covered. The MCP runtime itself remains integration-independent.

## ChatGPT and deployed evidence

The durable validation record and supplied ChatGPT screenshots distinguish real UI invocation from model-only answers through the displayed MCP action. On 2026-08-16, ChatGPT Pro developer mode against `manhattan.paperco.de` produced:

- zero-order `today` and last-seven-day results without inventing sales or products;
- after a maintainer-created development-store test order and a real sync, one non-cancelled order totaling CLP 3,330;
- two top-product snapshots totaling CLP 2,630 and CLP 700;
- merchant timezone `America/Santiago` and sync freshness.

These answers agree with the independent read-only D1 inspection. Automated fetch interception establishes that the MCP calls were D1-only.

### Finding P2-1: comparative ChatGPT scenario is not durably validated

The approved target includes “this week compared with last week.” The current single-tool contract can support this through two bounded `get_sales` calls, and the date-boundary code is automated-tested, but the durable evidence contains no real ChatGPT comparative interaction. This is an interoperability/evidence gap, not a defect in the proven positive and zero-result paths.

## Documentation consistency

### Finding P3-1: backend validation record contains stale scope claims

`docs/audits/2026-08-16-shopify-orders-ingestion-backend-validation.md` says tests exclude `read_all_orders` and instructs rerunning with exactly four scopes. Current code, tests, `TESTING.md`, and live evidence require and show five scopes. Historical audit artifacts should not be rewritten, but current documentation should clearly supersede this stale pre-live statement. `TESTING.md` already partially does so.

## Architecture assessment

No BI/reporting framework, accounting abstraction, generic analytics engine, generic commerce model, customer domain, forecasting facility, webhook system, scheduler, queue, or background infrastructure was introduced. The small money and time helpers have immediate Shopify sales consumers and do not constitute speculative frameworks.

## Validation executed

- `pnpm install --frozen-lockfile`: passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm format:check`: passed.
- `pnpm test`: passed outside the filesystem/network sandbox: 27 Node tests, 35 Admin tests, and 108 Worker tests.
- `pnpm build`: passed; the expected ignored Worker output contains local `.dev.vars`, while the client-secret check passed and no secret entered `dist/client`.
- Remote D1 inspection: passed, read-only, with zero rows written.

The first sandboxed `pnpm test` attempt could not open Wrangler's local loopback listener or log path. The same unchanged suite passed when executed with the required local runtime permissions; this was an execution-environment restriction, not a repository failure.

## Findings

| Severity | Finding                                                                  | Effect                                                                                                                    |
|----------|--------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| P0       | None                                                                     | No secret exposure, customer PII persistence, destructive reconciliation, invalid money sum, or store mutation was found. |
| P1       | P1-1: `read_all_orders` is required without a current data consumer.     | Valid minimum-scope `read_orders` installations can be rejected and least privilege is weakened.                          |
| P1       | P1-2: a latest partial/failed run masks the prior complete run.          | Persisted sales become unavailable after a source failure until a later complete sync succeeds.                           |
| P2       | P2-1: real comparative-period ChatGPT behavior is not durably validated. | The individual period queries are tested, but model orchestration across two calls remains evidence-limited.              |
| P3       | P3-1: the initial backend validation record has stale scope statements.  | Readers can receive contradictory setup guidance.                                                                         |

## Conclusions

### SHOPIFY ORDER INGESTION

`REQUIRES FIXES`

The source and ingestion mechanics are correct, bounded, idempotent, and genuinely validated, but the unnecessary required scope and failed-run availability behavior require correction.

### SALES SEMANTICS

`ACCEPTED`

### PRIVACY / PII MINIMIZATION

`ACCEPTED`

### D1 ORDER MODEL

`ACCEPTED`

### MCP SALES TOOL

`REQUIRES FIXES`

The tool contract and D1-only execution are accepted; its read model becomes unavailable after a later incomplete run despite retained complete data.

### CHATGPT SALES PATH

`PARTIAL`

Real discovery, natural invocation, positive totals/ranking, and zero-result behavior are validated. The comparative-period scenario remains unvalidated.

### NEXT SLICE

`BLOCKED`

The two P1 findings should be resolved before expanding the sales surface. No data corruption or secret/PII incident was found.
