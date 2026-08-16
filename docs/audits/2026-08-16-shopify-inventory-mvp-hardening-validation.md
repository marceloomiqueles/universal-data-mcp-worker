# Shopify Inventory MVP Hardening Validation

Date: 2026-08-16

## Scope

This record captures the evidence used to close the three P2 findings from the Shopify Products and Inventory MVP Audit. It covers sync completion timestamps, run-wide product counting, and the remaining real ChatGPT zero-result scenario. It introduces no new product capability.

## Deployment

- Cloudflare Worker version: `a35cdfd0-6ae8-4218-a6f7-bdca3e3edca0`.
- Canonical MCP endpoint: `https://manhattan.paperco.de/mcp`.
- The existing D1 database was reused and had no pending migrations.
- The deployment used the repository's defensive Cloudflare provisioner.

No credential, OAuth token, session cookie, encryption key, authorization header, or raw Shopify response is recorded here.

## Completion timestamp correction

`syncShopifyInventory` now receives a narrowly scoped clock function. The clock is evaluated when a new run starts and again when the invocation records a terminal `complete`, `partial`, or `failed` result. Shopify provider timestamps are not used as Worker execution timestamps.

Deterministic tests advance the injected clock and verify:

- `startedAt < completedAt` for a completed run;
- the same terminal-time semantics for partial and failed runs;
- the Admin/application last-successful-sync value uses the actual successful completion time;
- the D1 inventory query, and therefore `get_inventory`, exposes that completion time as freshness.

## Run-wide product count correction

Page-local product-count increments were removed. When an invocation reaches a terminal state, the run metadata counts distinct persisted products marked with that run's `last_seen_scan_id`. This is one bounded database-side count per invocation, not one query per page, and it remains correct when a partial run resumes in a later invocation.

The regression fixture places product A on two Shopify cursor pages and product B on the second page. The resulting run records two products and three variants. D1 contains two product rows and three variant rows, and an identical repeated sync produces the same counts and rows.

## Real ChatGPT zero-result validation

- Client: ChatGPT Work, developer mode.
- Natural-language prompt: `Do I have inventory for SKU MCP-ZERO-RESULT-DOES-NOT-EXIST?`
- Tool selected: the expanded ChatGPT processing trace showed the inventory-by-SKU action backed by `get_inventory`.
- Result: the MCP call succeeded with zero matching rows. ChatGPT stated that the exact SKU was not found in the server's inventory.
- No-hallucination observation: ChatGPT did not invent a product, SKU, quantity, or location, did not substitute another inventory item, and did not imply that Shopify was queried live.
- Freshness: the answer included the server's last successful persisted inventory sync timestamp.

The impossible SKU was only a query filter. Shopify data and D1 inventory were not changed to manufacture the empty result.

## Positive ChatGPT regression

- Natural-language prompt: `Which products are out of stock? Use my self-hosted server's current inventory.`
- Tool selected: the expanded processing trace showed the out-of-stock inventory action backed by `get_inventory`.
- Result: ChatGPT returned The Collection Snowboard: Hydrogen, default variant, with 0 units at Shop location and no assigned SKU.
- Freshness: the response included the same persisted last-successful-sync timestamp.

The positive and zero-result MCP paths use the same D1 query. `get_inventory` contains no Shopify provider call; the production-path MCP regression test continues to fail if provider network access is attempted.

## Validation

The following commands passed after the corrections:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm test:shopify-live
```

Results included 24 Node/tooling tests, 32 Admin tests, 94 Worker tests, and one opt-in real Shopify product-path test. The live harness remained read-only and used isolated local D1 state.

## Finding status

```text
P2-1 Sync completion timestamps: RESOLVED
P2-2 Run-wide product count: RESOLVED
P2-3 ChatGPT zero-result validation: RESOLVED
```
