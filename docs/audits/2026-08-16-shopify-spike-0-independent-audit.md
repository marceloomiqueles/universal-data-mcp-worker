# Shopify Spike 0 Independent Audit

Date: 2026-08-16

## Scope

This read-only audit evaluates whether Shopify Spike 0 proves Shopify as a technically viable, official, read-only data source from the Cloudflare Workers runtime. It distinguishes source inspection and mocked tests from a newly repeated request against the maintainer-controlled Shopify development store.

The audit reviewed `AGENTS.md`, `ARCHITECTURE.md`, issue #15, commit `cf4747b72bf4c14a0419ab683027eb089aace23e`, the spike source and Wrangler entry point, tests, configuration examples, dependency metadata, production composition, migrations, legal notes, and the earlier validation record. It also compared the implementation with Shopify's current official documentation for [Dev Dashboard apps](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard), the [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant), [access scopes](https://shopify.dev/docs/api/admin-rest/usage/access-scopes), the [location-scope clarification](https://shopify.dev/changelog/location-id-queryable-with-inventory-scopes), and [GraphQL API limits](https://shopify.dev/docs/api/usage/limits).

## Evidence levels

| Evidence level                      | Independently verified evidence                                                                                                                                                                                                                                                                     |
|-------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Source inspection                   | Fixed Shopify-specific query, canonical shop-domain validation, client credentials exchange, exact scope validation, explicit API version, bounded cursor loop, response parsing, sanitized error classes, loopback-only spike entry point, and no production imports.                              |
| Mocked tests                        | Token request construction, rejected scope sets, sanitized authentication/network failures, GraphQL headers and endpoint, two-page cursors, hard page bound, duplicate detection, inventory parsing, GraphQL/HTTP throttle handling, malformed responses, query-only guard, and loopback isolation. |
| Local Workers runtime               | Wrangler 4.123.0 loaded the isolated spike in its local Worker runtime and kept configured values hidden. The request ran through the spike Worker rather than a standalone Node script.                                                                                                            |
| Actual token acquisition            | A fresh audit run successfully exchanged the configured Dev Dashboard client ID and secret at the official store token endpoint. The returned token was not printed; the successful downstream GraphQL call and returned exact scopes independently establish acquisition.                          |
| Actual Admin GraphQL request        | A fresh audit run received API version `2026-07`, three cost records, and three cursor pages from Shopify.                                                                                                                                                                                          |
| Actual product and inventory result | The fresh run returned 6 products, 10 variants, 10 inventory items, 10 inventory levels, 10 named locations, and 10 available-quantity values.                                                                                                                                                      |

## Authentication and secret handling

The spike uses Shopify's official OAuth 2.0 client credentials grant at `https://{shop}.myshopify.com/admin/oauth/access_token`, with `application/x-www-form-urlencoded`, `grant_type=client_credentials`, client ID, and client secret. Shopify documents this grant specifically for apps developed by an organization and installed on a store owned by that organization. Issue and validation provenance identify the selected store as the maintainer-controlled development store; no merchant/client production-store flow exists in the implementation.

The shop domain, client ID, and client secret are read only by the isolated Worker from ignored `.dev.vars` configuration. The client secret is never returned by the Worker or included in a browser variable. The access token exists only in the invocation's local function state, is passed in `X-Shopify-Access-Token`, and is not returned or persisted by project code. Error tests inject credential-like values and prove that stable errors do not echo them. Git and bundle inspection found no credential value, and the production browser and Worker bundles contain no Shopify spike identifier or configuration name.

The local Cloudflare toolchain copies `.dev.vars` into ignored server-side build output for preview, as already documented for the project. `dist/`, `.dev.vars`, and `.wrangler/` remain ignored, the production client bundle passed the secret inspection, and no Shopify value entered tracked files. This known local-artifact behavior does not expose the secret to browser code or the deployed production composition.

## API, scopes, and Workers compatibility

The Admin GraphQL version is defined once as stable version `2026-07`; requests use the versioned endpoint and reject a mismatched `X-Shopify-API-Version` response.

The exact accepted scope set is:

- `read_products` for products and variants;
- `read_inventory` for inventory items and levels;
- `read_locations` for the selected location name.

These are read scopes only. The third scope is evidence-based rather than speculative: the initial live request received `ACCESS_DENIED` at `location.name`, and Shopify's official clarification states that `Location.id` can use inventory access while other fields such as `name` still require `read_locations`. The token parser rejects missing and additional scopes.

The runtime path uses only Web APIs available to Workers: `fetch`, `Headers`, `URLSearchParams`, JSON, `TextEncoder`, and `AbortSignal.timeout`. It adds no Shopify SDK, Node server library, GraphQL framework, `nodejs_compat`, or runtime dependency. The standalone `wrangler.shopify-spike.jsonc` entry is local-only, disables `workers.dev`, and rejects non-loopback request hostnames. Source inspection and the production build confirm that the spike is absent from the deployed application bundle.

## Read-only and bounded behavior

The only Shopify GraphQL document is the fixed named `query ShopifySpikeProducts`. No mutation document, webhook registration, seed operation, or store-writing path exists. The code checks the fixed operation before sending it, and regression tests both accept the production query and reject a mutation operation.

The request is bounded to 2 products per page, 3 product pages, 20 variants per product, 20 inventory levels per item, a 1 MB response, and a 10-second request timeout. Nested truncation and the overall page cap are reported explicitly. The live audit exercised three cursor pages without a duplicate product and stopped at the configured cap with `truncated: true`; it did not silently represent the partial result as complete.

The implementation distinguishes missing configuration, token/authentication rejection, missing scope, GraphQL failure, GraphQL or HTTP throttling, provider/network failure, unexpected API version, and malformed response. It records bounded query-cost metadata but implements no speculative retry framework. That is proportional for a single controlled spike run.

## Real Shopify evidence

The independent live run produced this sanitized aggregate result:

```text
API version:             2026-07
Granted scopes:          read_inventory, read_locations, read_products
Pages read:              3
Pagination exercised:   yes
Page cap reached:        yes, explicitly reported as truncated
Products:                6
Variants:                10
Inventory items:         10
Inventory levels:        10
Named locations:         10
Available quantities:    10
Actual query costs:      7, 7, 9
Lowest observed budget:  1991
Observed restore rate:   100
```

No throttle occurred. The result independently proves a real Product → ProductVariant → InventoryItem → InventoryLevel → Location relationship and quantity state. No raw token, client secret, authorization header, full raw provider payload, or customer/order data was recorded in this audit.

## Production isolation

Shopify is not present in the compiled Integration Registry, Admin API, Admin Web, MCP runtime, or production Worker entry point. No Shopify D1 table or migration exists. No synchronization, checkpoint, webhook, merchant authorization, activation UI, persistence, Shopify MCP tool, generic commerce provider, or generic GraphQL abstraction was introduced. The only package change is the root command that starts the isolated existing-Wrangler entry point; `pnpm-lock.yaml` did not change and no third-party code dependency was added.

Third-party documentation accurately identifies Shopify as an external trademark and service, the use of the official developer surface, the development-only and non-production scope, the absence of an incorporated Shopify SDK, and the separation of Shopify terms from the project license. This audit does not extend that narrow API-surface verification into a general commercial/legal review.

## Validation

The following commands were executed successfully from the audited commit:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Results: 21 Node tooling tests, 23 Admin tests, and 56 Worker tests passed (100 total). The production build and client-secret inspection passed. The known upstream MCP SDK source-map warnings did not fail the build and are unrelated to Shopify.

## Findings

### P0

None.

### P1

None.

### P2

None.

### P3

None.

The experiment intentionally does not prove remote production deployment, arbitrary merchant installation, durable token handling, production synchronization, or operational retries. Those are excluded future product concerns, not defects in this source-viability spike.

## Conclusions

### SHOPIFY AUTH

`ACCEPTED`

### WORKERS COMPATIBILITY

`ACCEPTED`

### READ-ONLY SAFETY

`ACCEPTED`

### REAL PRODUCT ACCESS

`VALIDATED`

### REAL INVENTORY ACCESS

`VALIDATED`

### SHOPIFY SOURCE VIABILITY

`GO`

### NEXT MVP SLICE

`READY`
