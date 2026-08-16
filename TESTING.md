# Testing and Validation

The project uses Vitest for Vue rendering tests and Cloudflare's official Workers Vitest integration for authentication, D1 migration, OAuth, MCP protocol, and route-boundary tests under workerd. It does not enforce a coverage percentage.

## Requirements

- Node.js 22.13 or newer;
- pnpm 11.22.0 or a compatible pnpm 11 release;
- dependencies installed with `pnpm install`.

## Commands

Run the complete current validation set from the repository root:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Use `pnpm format` to format project source and configuration. Existing policy and historical Markdown are excluded to prevent unrelated formatting churn.

Start the Vite-native Cloudflare development environment with:

```sh
pnpm dev
```

Build and preview the production output under the local Workers runtime with:

```sh
pnpm preview
```

The Admin tests use the production Vue Router and session code. They verify first-run setup, bootstrap-fragment removal and separate proof transport, missing-proof/configuration guidance, password confirmation, normal login, generic login failure, session restoration, protected navigation UX, loading without authenticated-content flash, logout, unavailable-API feedback, not-found behavior, and responsive navigation. Worker tests apply the real D1 migration and verify owner/session behavior plus the separate OAuth 2.1 and MCP boundaries. MCP coverage exercises DCR, exact redirect and resource validation, scope enforcement, PKCE S256, one-time authorization codes, refresh rotation, provider and owner revocation, bearer isolation, initialization, HTTP method and content negotiation, protocol-version handling, notifications, JSON-RPC errors, tool discovery/call, real and empty registries, malformed requests, size bounds, and Origin/HTTPS checks through production Worker composition.

OAuth authorization-code and token expiry are enforced by the provider's real clock and KV TTLs. The integration suite verifies one-time code use, refresh rotation, invalid credentials, and both revocation paths without adding a project-owned OAuth clock. Deterministic wall-clock expiry testing remains delegated to the upstream provider rather than introducing test-only timing infrastructure into this project.

`pnpm typecheck` uses separate Admin-test and Worker-test TypeScript projects. Each project includes its runtime source and related tests without mixing DOM types into Worker code or Worker types into Admin code.

For local validation, let the repository script create or preserve the ignored secret and apply pending local D1 migrations, then start development:

```sh
pnpm setup:local
pnpm dev
```

The script prints the authorized URL only after migrations succeed. It is safe to rerun: existing valid owner-bootstrap and integration-encryption secrets plus owner/session data remain unchanged, while Wrangler applies only pending migrations. Use `pnpm setup:url` to print the URL again from an existing `.dev.vars`. Vite uses fixed local port `5173` and fails rather than silently changing the setup URL when that port is occupied.

The Node setup-tool tests verify 256-bit Base64URL generation, private file permissions, repeat preservation, refusal to overwrite invalid configuration, the exact bootstrap-fragment contract, migration-before-URL ordering, and the deliberately unusable committed example. Provisioning-tool tests verify D1 reuse/fail-closed selection, regeneration from the committed template, defensive Wrangler `--strict`/`--keep-vars` deployment, refusal to replace a missing integration key while encrypted Shopify configuration exists, stable per-installation rate-limit namespaces, and workers.dev URL extraction without contacting Cloudflare. Browser-build inspection fails when any non-empty local `.dev.vars` value appears under `dist/client`.

The backend endpoints are:

```text
GET  /api/auth/setup-status
POST /api/auth/setup
POST /api/auth/login
GET  /api/auth/session
POST /api/auth/logout
GET  /api/mcp/oauth/grants
POST /api/mcp/oauth/revoke
POST /mcp
```

OAuth discovery additionally uses `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`; DCR and token lifecycle use `/oauth/register` and `/oauth/token`. `/api/mcp/oauth/authorize` is the owner-authenticated consent endpoint. OAuth access tokens never authorize `/api/*`, and the Admin cookie never authorizes `/mcp`.

Admin API JSON POST requests require `Content-Type: application/json` and an `Origin` exactly matching the Worker origin. The OAuth consent form uses its standard form media type, rejects any present external Origin, and permits only the provider-validated client callback origin in its CSP. Setup JSON contains only `username` and `password`; password confirmation remains a client responsibility. Authorization is supplied separately through the `X-Owner-Bootstrap-Proof` header. The SPA obtains that proof from `/login#bootstrap=<proof>`, removes the fragment immediately, keeps it only in memory, and never represents it as account data. Remove the setup secret after the owner is created.

The login endpoint uses the configured Cloudflare Rate Limiting binding before expensive password verification. It permits five attempts per 60-second window per Cloudflare source address, returns generic `429` JSON with `Retry-After: 60`, and recovers automatically without persisted account lockout. Cloudflare documents this mechanism as permissive and location-local, so it mitigates ordinary guessing and computational abuse but is not an exact accounting boundary.

Local HTTP is accepted only on loopback hostnames. Non-loopback Admin API requests over HTTP return `426 HTTPS_REQUIRED`; HTTPS requests retain `Secure` cookies. The provisioned `workers.dev` Admin API was validated to return `426 HTTPS_REQUIRED` over HTTP and normal setup status over HTTPS. This validates the authentication-surface invariant without requiring all static SPA traffic to redirect.

To reset only local owner/session state while preserving migrations, run `pnpm auth:reset:local`. This deletes the local owner and all local sessions. Never adapt that local reset command to a production database without a separately reviewed operational procedure.

Local preview validation has confirmed setup status, first setup, current session, authenticated Admin API access, logout, and post-logout rejection. Workerd tests validate MCP 2025-11-25 Streamable HTTP and OAuth paths. On 2026-08-16, the official MCP Inspector completed OAuth, discovered the tool, and invoked `list_integrations` against the deployed HTTPS Worker. ChatGPT Work developer mode then completed its CIMD/PKCE authorization flow, discovered the same read-only tool, selected it from an indirect data-source question, and correctly interpreted Garmin as registered and not configured. A disposable Cloudflare deployment with an empty compiled registry produced a successful empty tool result that ChatGPT explained without inventing integrations. Revoking the owner's grants caused the existing ChatGPT connection to require reconnection; a new authorization restored successful invocation. The custom domain used for OAuth and MCP must remain the same canonical origin because resource audiences are exact. The original 600,000-iteration PBKDF2 profile measured approximately 76–88 ms wall time locally but exceeded Cloudflare's hosted PBKDF2 iteration limit. Production verification of the compatible versioned 100,000-iteration profile is required whenever its parameters change.

`pnpm provision:cloudflare` fails before changing resources when Wrangler is unauthenticated. Authenticated validation created and then reused D1, applied the owner-auth migration, confirmed a repeat run had no pending migrations, deployed the Worker and its rate-limit binding, verified HTTPS setup status and HTTP rejection, and generated an authorized setup link. A subsequent audit found that a stale ignored deployment snapshot had removed an existing custom domain before it was manually restored. The provisioner now regenerates that snapshot from committed configuration on every run and uses Wrangler `--strict` to reject conflicting remote settings plus `--keep-vars` to preserve dashboard-managed variables. Regression tests cover the defensive command and stale-snapshot behavior; a deliberate remote conflict test remains unperformed because no disposable routed installation was authorized. The provisioner stores account-specific D1 identity only in ignored `.wrangler.production.jsonc`; upstream `wrangler.jsonc` omits `database_id` so Cloudflare can automatically provision the resource. Tests reject the former zero-UUID placeholder as invalid. The installing owner, not automated validation, chooses the real username and password.

Cloudflare's Vite plugin intentionally copies the active `.dev.vars` into the ignored Worker output for `vite preview`; that file is not deployed. Do not archive or share the complete `dist/` directory. `pnpm build` now checks that no local secret value entered `dist/client`, which is the browser-visible artifact.

## Shopify Spike 0

The isolated Shopify viability spike is not a registered product integration and is not exposed through the Admin Web or MCP. It uses a maintainer-controlled Shopify development store only and performs bounded GraphQL queries without mutations.

Configure these ignored `.dev.vars` entries for a Dev Dashboard app installed on a development store in the same Shopify organization:

```text
SHOPIFY_SHOP_DOMAIN="example.myshopify.com"
SHOPIFY_CLIENT_ID="..."
SHOPIFY_CLIENT_SECRET="..."
```

The app must grant exactly `read_products`, `read_inventory`, and `read_locations`. The real API rejected the inventory-level location name without `read_locations`, so the spike keeps that scope to identify inventory locations in its diagnostic output.

Start the local-only spike Worker, then invoke its bounded run once:

```sh
pnpm spike:shopify
curl --silent --show-error http://127.0.0.1:8788/
```

The Worker refuses non-loopback hosts. It obtains a short-lived access token through Shopify's client credentials grant, keeps the token in memory, queries Admin GraphQL API version `2026-07`, reads at most two products per page and three pages, and prints only bounded development-store product, variant, inventory, location, and query-cost diagnostics. It never prints credentials or authorization headers. The fixed operation is statically checked as a query and contains no mutation.

Automated tests mock network access and cover request construction, exact scopes, domain validation, pagination bounds, response parsing, provider errors, secret-safe failures, and the query-only guard. Real-store evidence is recorded separately in the Shopify Spike 0 validation audit.

## Shopify activation backend

Worker tests apply migration `0002_shopify_connection.sql` and exercise the authenticated Shopify configuration, verification, revalidation, and disconnect paths. They verify AES-256-GCM roundtrip/authentication failure, absence of plaintext credentials and access-token storage, exact Origin enforcement, safe response DTOs, exact Shopify scopes and API version, sanitized provider failures, secret retention/replacement, and registry status derived from D1. Shopify network behavior is replaced only at the narrow `fetch` transport boundary.

Admin tests exercise the production Shopify client and Integrations page for initial configuration, required-field feedback, retaining or replacing an existing secret, verification progress, sanitized connection failure, retry, connected details, explicit disconnect confirmation, and registry refresh. Tests also verify that the entered secret is omitted when retained, disappears from rendered state after saving, and is never written to browser storage.

Provider tests additionally cover exact/missing/additional scopes, GraphQL throttling/access-denial/generic failures, API-version and shop-identity mismatches, network and timeout failures, undecryptable saved credentials, disconnect without decryption, and edit/disconnect races against an in-flight verification.

The committed opt-in live harness exercises the actual production Admin API handlers with an isolated migrated D1 database and ignored maintainer development-store credentials:

```sh
pnpm test:shopify-live
```

It requires non-empty `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_CLIENT_ID`, and `SHOPIFY_CLIENT_SECRET` values in ignored `.dev.vars`. It creates an ephemeral owner and encryption key, saves configuration through the authenticated production endpoint, verifies the real development store, invokes the production `POST /api/integrations/shopify/sync` path twice, and asserts encrypted-at-rest configuration, complete coverage, non-zero product/inventory records, stable repeated row counts, and absence of access-token persistence. It performs no mutation and prints only a sanitized summary. The command is excluded from ordinary `pnpm test`; never use it with a merchant or production store.

The activation harness passed against the maintainer-controlled development store on 2026-08-16. The extended ingestion validation recorded 18 products, 27 variants/items, 29 inventory levels, and 3 locations with complete coverage and stable repeated counts. Sanitized results are recorded in [the activation validation](docs/audits/2026-08-16-shopify-activation-live-validation.md) and [the ingestion backend validation](docs/audits/2026-08-16-shopify-ingestion-backend-validation.md); credentials and provider payloads are deliberately absent.

## Shopify ingestion backend

Worker tests apply migration `0003_shopify_inventory.sql` and exercise the production authenticated sync endpoint. Coverage includes canonical GID relationships, multi-page and nested inventory-level cursors, multi-location quantities, deterministic repeated upserts, quantity changes, bounded continuation, concurrent-trigger rejection, provider throttling/failure, complete-scan reconciliation, and the invariant that partial/failed scans delete nothing. The endpoint is intentionally manual and backend-only; no scheduler or catalog UI exists yet.

Admin tests exercise the operational Shopify Manage controls against the production client contract. They cover never-synchronized state, pending submission with duplicate prevention, complete/partial/failed outcomes, incomplete-coverage messaging, bounded entity counts, last-successful timestamps, and absence of the sync action while Shopify is disconnected. The view deliberately contains no commerce reporting, scheduling, charts, or analytics.

## Shopify inventory MCP

The D1 query tests cover empty inventory, explicit tracked-stock semantics, configurable low-stock thresholds, exact case-insensitive SKU filtering, partial product and location filters, multi-location results, result limits with opaque cursor continuation, and freshness from the latest successful complete sync. Production-path MCP tests verify conditional `get_inventory` discovery for connected Shopify, its bounded structured result, preservation of `list_integrations`, and the absence of provider network access during an inventory query.

The real Cloudflare/ChatGPT validation on 2026-08-16 first invoked the authenticated production sync endpoint and recorded a complete run of 18 products, 27 variants, 29 inventory levels, and 3 locations. After refreshing the ChatGPT Work developer-mode app's frozen tool snapshot, four natural prompts caused `get_inventory` invocations for out-of-stock products, quantities of five or fewer, exact SKU `sku-hosted-1`, and that SKU's locations. ChatGPT's answers matched remote D1 and included the last successful sync timestamp. See [the sanitized validation record](docs/audits/2026-08-16-shopify-inventory-mcp-validation.md). No Shopify credential, MCP token, Admin session token, or raw provider payload is recorded.

The inventory hardening regression tests use a narrow injected clock to prove that complete, partial, and failed runs record their actual terminal time and that Admin/MCP freshness uses the successful completion timestamp. A two-page fixture proves run-wide product counting when variants for one product cross a cursor boundary. On 2026-08-16, ChatGPT Work developer mode also invoked `get_inventory` naturally for the deliberately nonexistent SKU `MCP-ZERO-RESULT-DOES-NOT-EXIST`, reported no match without inventing inventory, and then passed a positive out-of-stock regression against the same persisted D1 data. See [the hardening validation record](docs/audits/2026-08-16-shopify-inventory-mvp-hardening-validation.md).
