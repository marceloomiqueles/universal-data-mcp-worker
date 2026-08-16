# Shopify Products and Inventory MVP Audit

Date: 2026-08-16  
Audited commit: `a95df3c9a6a1a2bdc7c9605648741e2819db30a3`  
Audit type: independent, read-only implementation and evidence audit

## Scope

This audit evaluates the completed real-data path:

```text
Shopify development store
        ↓
Cloudflare Worker
        ↓
bounded ingestion
        ↓
D1
        ↓
MCP get_inventory
        ↓
ChatGPT
```

The review covered Shopify acquisition, D1 persistence, idempotency, partial-run and reconciliation behavior, the authenticated Admin sync surface, the MCP inventory query, deployed behavior, and recorded real ChatGPT invocations. It also checked for premature commerce, provider, repository, or synchronization frameworks.

The audit did not modify product code. The repository was clean before this artifact was created.

## Evidence and method

The conclusions distinguish these evidence levels:

1. **Deterministic tests:** mocked Shopify transport tests, D1 ingestion/query tests, Worker route tests, Admin component tests, and MCP production-path tests.
2. **Real Shopify product-path validation:** the opt-in `test:shopify-live` harness was executed during this audit against a maintainer-controlled development store through the production activation and ingestion handlers with isolated local D1 state.
3. **Remote D1 evidence:** the deployed database was inspected read-only. Its latest run was complete, with complete coverage, 18 products, 27 variants, 27 inventory items, 3 locations, and 29 inventory levels. No duplicate variant identities or duplicate inventory-item/location relationships were found.
4. **Deployed MCP evidence:** the recorded deployed endpoint and currently deployed Worker version were inspected. The MCP tool reads persisted D1 data rather than calling Shopify.
5. **Real ChatGPT evidence:** recorded ChatGPT Work developer-mode traces show natural-language discovery and invocation of `get_inventory` for out-of-stock, low-stock, exact-SKU, and location questions. The displayed answers agree with the persisted inventory evidence and include the last successful sync context.

The Shopify source surface uses direct Worker-compatible Web API requests to Shopify's official Admin GraphQL API. Relevant official documentation includes [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant), [Dev Dashboard API access tokens](https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens), [development stores](https://shopify.dev/docs/apps/build/dev-dashboard/stores/development-stores), and the [product variants GraphQL query](https://shopify.dev/docs/api/admin-graphql/latest/queries/productVariants).

## Findings

No P0 or P1 findings were identified.

### P2-1 — Sync completion timestamps use the run start time

The ingestion function evaluates its default `now` value once and reuses that value for both `started_at` and `completed_at`. Remote D1 evidence confirms that the latest completed run has identical start and completion timestamps even though acquisition performed network work.

This does not make stored inventory incorrect, and the reported freshness is conservatively earlier rather than later. However, the Admin UI and MCP response describe the value as completion or last-successful-sync time, so the operational metadata is not strictly truthful. Completion should be captured when the run finishes while preserving deterministic clock control in tests.

Severity: **P2**.

### P2-2 — Per-run product count can overcount across page boundaries

The pipeline deduplicates products within each acquired page and then adds each page's count to the run total. If variants belonging to the same product span Shopify cursor pages, that product can be counted more than once in `products_count` even though the D1 product table remains correctly deduplicated by Shopify GID.

The observed development store did not trigger the issue: both the run metadata and D1 contained 18 products. The defect is limited to operational count reporting, not persistence identity or relationships. Run counts should derive from run-wide unique product identities or from the resulting scoped D1 state.

Severity: **P2**.

### P2-3 — Zero-result behavior lacks deployed ChatGPT evidence

The D1 query has an explicit empty-result test and treats an empty collection as success. The MCP implementation also has bounded structured output, but the evidence set does not include both an explicit production-path `get_inventory` empty-result call and a real ChatGPT prompt that returns zero inventory matches.

The positive real-data ChatGPT path is validated. This finding concerns the requested no-hallucination edge case and does not invalidate the demonstrated end-to-end path.

Severity: **P2**.

## Verification matrix

### Acquisition

|   # | Check                          | Result | Evidence                                                                                                                                                        |
|----:|--------------------------------|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
|   1 | Official Shopify API only      | PASS   | Direct requests target the official token endpoint and versioned Admin GraphQL API. No unofficial Shopify provider is used.                                     |
|   2 | Connected integration required | PASS   | Sync loads the persisted Shopify connection and rejects absent or non-connected state. API tests cover the rejection.                                           |
|   3 | Access token transient         | PASS   | The token remains in request-local memory. The schema contains no token column, tests inspect persistence, and live validation confirms no token was persisted. |
|   4 | Bounded GraphQL                | PASS   | Product, page, nested-level, request-count, response-size, and timeout bounds are explicit.                                                                     |
|   5 | Explicit API version           | PASS   | Shopify API version `2026-07` is centralized in the Shopify provider.                                                                                           |
|   6 | Read-only behavior             | PASS   | Acquisition contains GraphQL queries only. No mutation, webhook registration, or store write path exists.                                                       |
|   7 | Pagination                     | PASS   | Cursor pagination is implemented for variants and nested inventory levels, bounded by explicit limits, and tested across pages.                                 |
|   8 | Throttling/error handling      | PASS   | HTTP and GraphQL throttling, access denial, provider changes, malformed responses, timeouts, and network failures are classified without exposing secrets.      |

### Persistence

|   # | Check                                          | Result | Evidence                                                                                                                                |
|----:|------------------------------------------------|--------|-----------------------------------------------------------------------------------------------------------------------------------------|
|   9 | Products persisted correctly                   | PASS   | Strict product table with Shopify GID primary key and bounded selected fields; real D1 contains 18 products.                            |
|  10 | Variants persisted correctly                   | PASS   | Variants retain product and inventory-item relations; real D1 contains 27 variants.                                                     |
|  11 | Inventory items persisted correctly            | PASS   | Inventory item GIDs are primary identities; real D1 contains 27 items.                                                                  |
|  12 | Locations persisted correctly                  | PASS   | Location GIDs are primary identities; real D1 contains 3 locations.                                                                     |
|  13 | Inventory levels persisted correctly           | PASS   | Item/location identity is unique and quantities are updated; real D1 contains 29 levels.                                                |
|  14 | Stable Shopify identities                      | PASS   | Canonical Shopify GIDs are used directly for all source entities.                                                                       |
|  15 | Correct relationships                          | PASS   | Foreign keys and unique constraints enforce product → variant → item → level → location relationships. Tests cover multi-location data. |
|  16 | No raw provider payload as primary persistence | PASS   | Only selected normalized Shopify fields and sync metadata are stored.                                                                   |
|  17 | No customer/order data                         | PASS   | No order, customer, address, email, or checkout schema or query exists.                                                                 |

### Idempotency

|   # | Check                                                 | Result | Evidence                                                                                                  |
|----:|-------------------------------------------------------|--------|-----------------------------------------------------------------------------------------------------------|
|  18 | Identical repeated sync yields the same logical state | PASS   | Automated repeated-sync tests and the live harness show stable entity counts and values.                  |
|  19 | No duplicate rows                                     | PASS   | Source keys and composite constraints prevent duplicates; remote duplicate checks returned zero.          |
|  20 | Quantity update replaces correctly                    | PASS   | Upserts update inventory quantities in place; covered by ingestion tests.                                 |
|  21 | Relationships remain consistent                       | PASS   | Transactional page batches, foreign keys, and deterministic upserts preserve relationships across reruns. |

### Partial runs and reconciliation

|   # | Check                                                 | Result  | Evidence                                                                                                             |
|----:|-------------------------------------------------------|---------|----------------------------------------------------------------------------------------------------------------------|
|  22 | Partial runs are not reported complete                | PASS    | Later-page failure records `partial`; failure before committed pages records `failed`.                               |
|  23 | Truncated runs are not destructively reconciled       | PASS    | Reconciliation requires complete full coverage. Tests verify retained prior rows for incomplete acquisition.         |
|  24 | Complete runs reconcile only under approved semantics | PASS    | Reconciliation runs only after proven complete coverage and deletes in relationship-safe order.                      |
|  25 | Source failure leaves prior usable data intact        | PASS    | Page commits remain usable and destructive reconciliation is skipped after failure.                                  |
|  26 | Sync status is truthful                               | PARTIAL | Outcome and coverage are truthful, but completion timestamps and cross-page product counts have the P2 issues above. |

### Admin

|   # | Check                         | Result  | Evidence                                                                                                                                                           |
|----:|-------------------------------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|  27 | Owner authentication required | PASS    | The sync route is behind the existing Admin session boundary.                                                                                                      |
|  28 | Origin/CSRF protection        | PASS    | State-changing sync requests use the established exact-origin validation.                                                                                          |
|  29 | UI reports state truthfully   | PARTIAL | Never-synced, pending, success, partial, failure, coverage, timestamps, and bounded counts are represented; timestamp/count precision is subject to P2-1 and P2-2. |
|  30 | No dashboard/reporting creep  | PASS    | The UI adds only operational status and `Sync now`; no charts, analytics, alerts, or reports were introduced.                                                      |

### MCP

|   # | Check                                 | Result | Evidence                                                                                                                                                    |
|----:|---------------------------------------|--------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
|  31 | `get_inventory` reads D1, not Shopify | PASS   | The tool calls the Shopify inventory application query. A production-path test makes provider network access fail if attempted and confirms no call occurs. |
|  32 | Bounded filters                       | PASS   | SKU, title, stock state, location, threshold, limit, and opaque cursor are constrained by schema and query validation.                                      |
|  33 | Bounded output                        | PASS   | Default limit is 25 and maximum is 100, with keyset continuation. Output contains only the approved inventory fields.                                       |
|  34 | Empty result valid                    | PASS   | The D1 query explicitly returns an empty successful result. End-to-end MCP/ChatGPT evidence remains incomplete as described in P2-3.                        |
|  35 | Freshness context                     | PASS   | The response includes the latest complete full-coverage sync timestamp without implying a live Shopify read.                                                |
|  36 | No secrets/internal database fields   | PASS   | Output excludes credentials, tokens, encrypted values, internal row identifiers, and SQL details.                                                           |
|  37 | `list_integrations` intact            | PASS   | Existing discovery behavior and tests remain present and passing.                                                                                           |

### ChatGPT

|   # | Check                                    | Result        | Evidence                                                                                                                       |
|----:|------------------------------------------|---------------|--------------------------------------------------------------------------------------------------------------------------------|
|  38 | Real ChatGPT discovers `get_inventory`   | PASS          | Recorded ChatGPT Work developer-mode evidence shows the deployed tool available and selected.                                  |
|  39 | Natural prompt causes invocation         | PASS          | Four natural inventory questions invoked the MCP action without a manually forced protocol call.                               |
|  40 | Answer matches D1/Shopify evidence       | PASS          | Reported product, SKU, location, quantities, and freshness agree with remote D1 and real Shopify ingestion evidence.           |
|  41 | Zero-result prompt does not hallucinate  | NOT VALIDATED | Query-level empty behavior is tested, but no durable real ChatGPT zero-result invocation is recorded.                          |
|  42 | No live Shopify request during MCP query | PASS          | Tool construction and production-path tests establish the D1-only query path; deployed responses use persisted sync freshness. |

## Architecture assessment

The slice remains narrow and source-specific:

- Shopify acquisition, mapping, persistence, and inventory query code remain in the Shopify vertical slice.
- MCP core receives a bounded integration-contributed tool and contains no Shopify source acquisition logic.
- No generic commerce model, provider hierarchy, ETL framework, repository abstraction, event bus, or background infrastructure was introduced.
- The D1 schema is Shopify-specific rather than a speculative universal catalog.
- The small encryption and registry mechanisms have immediate consumers and do not constitute speculative frameworks.
- No scheduled sync, queue, Durable Object, webhook, customer/order ingestion, or unbounded payload dump exists.

## Real validation evidence

### Real Shopify sync

The committed opt-in product-path harness was executed successfully during this audit. It used ignored credentials for a maintainer-controlled Shopify development store, the production activation and ingestion handlers, isolated local D1, the official client-credentials grant, and read-only GraphQL queries. It observed real products, variants, inventory items, locations, and inventory levels without modifying the store.

### Remote D1

Read-only remote inspection found a latest complete, full-coverage run and these current counts:

| Entity           | Count |
|------------------|------:|
| Products         |    18 |
| Variants         |    27 |
| Inventory items  |    27 |
| Locations        |     3 |
| Inventory levels |    29 |

The latest run used two pages/requests, reported no error, and duplicate identity checks returned zero.

### Deployed MCP and ChatGPT

The canonical remote MCP endpoint was exercised through ChatGPT Work in developer mode. Recorded traces show real `get_inventory` invocation and correct answers for out-of-stock inventory, a five-unit threshold, exact SKU `sku-hosted-1`, and its location. The responses included persisted freshness context. There is no recorded zero-match ChatGPT scenario.

## Repository validation

The following commands were executed at the audited commit:

| Command                          | Result                                                    |
|----------------------------------|-----------------------------------------------------------|
| `pnpm install --frozen-lockfile` | PASS — lockfile current; dependencies already satisfied   |
| `pnpm typecheck`                 | PASS                                                      |
| `pnpm lint`                      | PASS                                                      |
| `pnpm format:check`              | PASS                                                      |
| `pnpm test`                      | PASS — 24 tooling, 32 Admin, and 92 Worker tests          |
| `pnpm build`                     | PASS — Worker and client built; client secret scan passed |
| `pnpm test:shopify-live`         | PASS — one opt-in real product-path validation test       |

The build produced only MCP SDK source-map warnings about unavailable upstream source files. No runtime compatibility failure occurred.

## Severity summary

| Severity | Count | Summary                                                                                                     |
|----------|------:|-------------------------------------------------------------------------------------------------------------|
| P0       |     0 | None                                                                                                        |
| P1       |     0 | None                                                                                                        |
| P2       |     3 | Completion timestamp accuracy; cross-page product count accuracy; missing real ChatGPT zero-result evidence |
| P3       |     0 | None                                                                                                        |

## Independent conclusions

### SHOPIFY INGESTION

`ACCEPTED`

The real Shopify development-store acquisition and bounded ingestion path is operational, read-only, source-specific, and safely handles pagination, partial outcomes, and complete-run reconciliation.

### IDEMPOTENCY

`ACCEPTED`

Stable Shopify identities, constraints, deterministic upserts, automated repetition tests, live repetition evidence, and remote duplicate checks support the conclusion.

### D1 DATA MODEL

`ACCEPTED`

The schema is minimal, relational, Shopify-specific, and contains no raw provider payloads or customer/order data.

### MCP INVENTORY TOOL

`ACCEPTED`

`get_inventory` is read-only, D1-backed, bounded, filterable, fresh-context-aware, and does not leak source acquisition into MCP core.

### CHATGPT REAL-DATA PATH

`PARTIAL`

Real deployed discovery and positive-data invocation are validated. The required real ChatGPT zero-result/no-hallucination scenario is not yet evidenced.

### MVP END-TO-END

`VALIDATED`

The project has demonstrated the complete positive real-data path from a Shopify development store through Worker ingestion and D1 to deployed MCP and real ChatGPT invocation. The remaining findings concern operational metadata accuracy and edge-case validation, not the viability or correctness of that demonstrated path.

### NEXT SLICE

`READY`

There are no P0 or P1 findings. The P2 items should be addressed through bounded corrections and additional validation without blocking the next slice.
