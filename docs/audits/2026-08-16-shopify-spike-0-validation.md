# Shopify Spike 0 Validation

Date: 2026-08-16

## Scope

This validation tests source viability only: a Cloudflare Worker-compatible, read-only request path from an isolated local spike to a maintainer-controlled Shopify development store. It does not establish a production Shopify integration, register Shopify in the application, expose Shopify through Admin or MCP, synchronize data, persist commerce data, or mutate the store.

## Configuration and authentication

- Official Shopify Dev Dashboard app installed on a development store in the same organization.
- Client credentials grant through the store's documented token endpoint.
- Admin GraphQL API version `2026-07` from one source constant.
- Exact granted scopes: `read_products`, `read_inventory`, and `read_locations`.
- The initial two-scope run proved that `location.name` was denied without `read_locations`. After that minimum evidence-backed scope was granted, the complete fixed query succeeded.
- Shop domain, client ID, and client secret remained in ignored `.dev.vars` configuration. The access token remained in memory and was not printed or persisted.

## Real development-store result

The bounded live run succeeded against the Project Owner's development store:

- token acquisition: succeeded;
- GraphQL access: succeeded;
- pages read: 3;
- cursor pagination: exercised;
- products read: 6;
- variants read: 10;
- inventory items read: 10;
- inventory levels read: 10;
- location identity and name: available;
- available inventory quantities: available;
- product-page hard limit reached: yes, reported as `truncated` rather than fetching without a bound;
- store mutations: none.

Shopify returned query-cost metadata for every page. Requested cost was 100 per page; actual costs were 7, 7, and 9. The observed available budget remained above 1,990 with a restore rate of 100, so this one bounded run did not encounter throttling.

## Safety and compatibility evidence

- The implementation uses Worker-compatible `fetch`, headers, form encoding, JSON, and abort signals; it adds no Shopify runtime dependency and needs no Node server.
- The spike Worker is a separate local-only entry point and rejects non-loopback hostnames.
- The fixed GraphQL operation begins with `query`; a guard and regression test reject mutation operations.
- Request count, page size, variant count, inventory-level count, response size, and request duration are bounded.
- Diagnostics omit the access token, client secret, and authorization headers. Provider errors use stable sanitized classifications.
- Shopify was not added to the Integration Registry, Admin Web, Admin API, MCP, D1, or production Worker composition.

## Automated evidence

The Worker test suite covers token request construction, exact scope validation, canonical shop-domain validation, GraphQL request construction and headers, two-page cursor behavior, hard page limits, duplicate product rejection, response parsing, authentication/scope/GraphQL/throttle/network/malformed-response handling, secret redaction, and the absence of mutation operations.

## Decision

**GO for a later, separately designed Shopify product slice.**

The spike proves that official authentication, Admin GraphQL reads, product-to-variant-to-inventory relationships, location data, and bounded pagination work from the Cloudflare Workers programming model. This decision does not authorize production architecture, merchant installation, synchronization, persistence, webhooks, Admin activation, or MCP tools.
