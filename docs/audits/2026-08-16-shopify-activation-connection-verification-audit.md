# Shopify Activation and Connection Verification Audit

Date: 2026-08-16

## Scope

This independent read-only audit evaluates the Shopify Activation and Connection Verification slice at commits `64f917d` (backend) and `d033cca` (Admin Web). It compares the implementation with GitHub issue #17, the accepted architecture, the prior Shopify Spike 0 evidence, and the current repository tests and documentation.

The audit did not contact Shopify or modify a store. It distinguishes automated provider fakes, the previously validated Spike 0 source path, and the separately recorded product-backend verification. No product implementation was changed by this audit.

## Executive assessment

The slice converts Shopify into a statically registered, owner-managed integration without introducing commerce ingestion or a generic provider framework. Configuration is persisted in one Shopify-specific D1 row, the client secret is protected with a versioned AES-256-GCM envelope, Shopify access tokens remain transient, and all administrative operations pass through the existing session and exact-origin boundary.

No P0 or P1 defect was found. The implementation is suitable to support the next ingestion slice. Three P2 hardening/evidence findings and one P3 product-copy finding remain; none weakens the current confidentiality or authorization boundary.

## Implementation evidence

### Registration and lifecycle

- `src/worker/integrations.ts` explicitly registers Garmin and Shopify in one static composition root.
- `src/integrations/shopify/descriptor.ts` owns Shopify identity and display metadata; the generic registry contains no Shopify constants.
- The descriptor obtains its runtime state through `readShopifyStatus`, so Admin and MCP listing consume the same persisted state.
- The implemented state vocabulary is exactly `not_configured`, `configured`, `connected`, and `connection_error`. `verifying` exists only as Admin component state.
- Duplicate integration identifiers continue to fail deterministically in the shared registry.

### Persistence and credential security

- Migration `0002_shopify_connection.sql` creates one strict singleton `shopify_connection` table. No product, variant, inventory, order, customer, webhook, checkpoint, or generic integration table was added.
- The stored fields are limited to shop domain, client ID, encrypted client-secret envelope, activation status, verified/error state, and timestamps.
- `INTEGRATION_SECRETS_KEY` is a 32-byte unpadded Base64URL Worker secret. Local and Cloudflare provisioning generate it with cryptographic randomness, preserve an existing value, and keep it outside D1 and all `VITE_*` configuration.
- The encrypted-value mechanism uses AES-256-GCM, a new 96-bit random IV, contextual authenticated additional data, and an envelope containing `version` and `keyVersion`. Authentication failure prevents plaintext recovery.
- The Admin DTO contains only `shopDomain`, `clientId`, `secretConfigured`, `status`, `verifiedAt`, and `lastErrorCode`. Plaintext, ciphertext, IV, keys, and Shopify access tokens never cross that boundary.
- No D1 column stores an access token. The access token is a local variable used only for the bounded verification request.

### Official connection verification

- Production code uses Shopify's official client credentials endpoint with form encoding and direct Workers-compatible `fetch`; no Shopify or Node server framework was added.
- Admin GraphQL API version `2026-07` is defined once in the Shopify provider.
- The exact granted scope set must be `read_products`, `read_inventory`, and `read_locations`.
- Verification executes only the named read-only query `shop { id myshopifyDomain }`, bounds each provider response to 64 KiB, applies a ten-second timeout, checks the response API-version header, and confirms the returned canonical shop domain.
- Provider responses are mapped to bounded error codes rather than returned verbatim. Provider request bodies and response payloads are not logged.
- A failed verification preserves the configuration and records `connection_error`; a later successful verification returns it to `connected`.
- Verification writes are conditional on the configuration's `updated_at`, so a stale result cannot recreate a disconnected row or overwrite newer configuration.

### Admin API and Web

- `GET /api/integrations/shopify`, `PUT /api/integrations/shopify/configuration`, `POST /api/integrations/shopify/verify`, and `POST /api/integrations/shopify/disconnect` are behind the existing Admin session boundary.
- All state-changing operations apply the existing exact-origin CSRF check. MCP bearer credentials are not involved.
- The Admin Web implements the approved two-step save-then-verify flow and uses only the production same-origin Admin client.
- Existing safe fields are populated on edit. The secret is never returned, a blank edit retains the current envelope, and entering a replacement creates a new envelope.
- The entered secret remains component-local, is cleared after save attempts and dialog transitions, and is not written to local storage, session storage, URL state, or router state.
- Connected, connection-error, revalidation, edit, and confirmed-disconnect states are present. Disconnect deletes the complete singleton row without requiring decryption.

## Verification matrix

| Check                                      | Result            | Evidence                                                                                 |
|--------------------------------------------|-------------------|------------------------------------------------------------------------------------------|
| 1. Static real-registry registration       | Pass              | Explicit Shopify descriptor in the production composition root                           |
| 2. Truthful initial state                  | Pass              | Missing singleton row resolves to `not_configured`                                       |
| 3. Two-step Admin flow                     | Pass              | Production view and Admin tests cover save then verify                                   |
| 4. Approved configuration contract         | Pass              | Canonical domain, bounded ID/secret, required initial secret, optional replacement       |
| 5. Secret never returned to browser        | Pass              | Safe DTO projection and response assertions                                              |
| 6. Secret encrypted at rest                | Pass              | AES-GCM envelope written before D1 persistence                                           |
| 7. Key outside D1                          | Pass              | Worker secret generated by existing installation paths                                   |
| 8. Authenticated/versioned payload         | Pass              | AES-GCM plus contextual AAD, `version`, and `keyVersion`                                 |
| 9. No plaintext secret in D1               | Pass              | Storage test and direct schema/code inspection                                           |
| 10. Transient access token                 | Pass              | No token field/schema; token remains provider-call local                                 |
| 11. Official client credentials grant      | Pass              | Documented endpoint and form contract                                                    |
| 12. Bounded read-only verification         | Pass              | Fixed shop query, timeout, and response-size bound                                       |
| 13. Required scopes validated              | Pass              | Exact three-scope comparison                                                             |
| 14. Explicit API version                   | Pass              | Single `2026-07` constant and response-header check                                      |
| 15. Failed verification preserves config   | Pass              | Conditional status update; D1/API regression test                                        |
| 16. Sanitized error state                  | Pass with P2 note | Stable codes; key-loss recovery is not actionable                                        |
| 17. Successful revalidation                | Pass              | Provider/API test covers failure-to-success behavior                                     |
| 18. Retain/replace edit behavior           | Pass              | Ciphertext retention/replacement and Admin request tests                                 |
| 19. Disconnect deletes sensitive state     | Pass              | Singleton row deletion; confirmation in UI                                               |
| 20. Admin authentication                   | Pass              | Production route boundary and unauthenticated test                                       |
| 21. CSRF/origin protection                 | Pass              | Exact-origin validation on every write operation                                         |
| 22. Registry reflects persisted state      | Pass              | Shared registry status reader and API regression test                                    |
| 23. No browser storage secret              | Pass              | Production flow plus local/session-storage spies                                         |
| 24. MCP unchanged                          | Pass              | Existing single `list_integrations` tool remains; no Shopify data tool                   |
| 25. No commerce persistence                | Pass              | Only connection migration exists                                                         |
| 26. No sync/webhooks                       | Pass              | No Shopify sync or webhook implementation exists                                         |
| 27. No generic commerce/provider framework | Pass              | One small provider-specific transport and one immediately used encrypted-value primitive |

## Real Shopify evidence

The evidence has three distinct levels:

1. Automated activation tests use deterministic fake network responses at the narrow `fetch` boundary. They prove production request construction, encryption/persistence, API behavior, state transitions, and UI behavior without contacting Shopify.
2. Shopify Spike 0 independently recorded real token acquisition and real Admin GraphQL product, variant, and inventory access. That evidence proves source viability, but by itself does not prove the product activation path.
3. `TESTING.md` records that, on 2026-08-16, a temporary workerd test exercised the actual production Admin API handlers, an ephemeral migrated D1 database, and ignored maintainer development-store credentials. It reports successful encrypted configuration, real token acquisition, the bounded real verification query, a transition to `connected`, and no access-token persistence. The temporary test and its raw output were deliberately removed.

The third record is relevant product-path evidence, but it is not a durable, independently replayable artifact. This audit therefore classifies connection verification as `PARTIAL`, rather than deriving full validation from Spike 0 or from mocked tests. The Admin browser flow itself has automated production-client coverage but no recorded real-store interactive run.

## Findings

### P2-1 — Lost or incorrect encryption key is not reported as an actionable configuration failure

When `INTEGRATION_SECRETS_KEY` is absent or syntactically invalid, the API correctly fails closed with `CONFIGURATION_UNAVAILABLE`. When a validly encoded but incorrect key cannot authenticate an existing envelope, however, `verifySavedShopifyConnection` catches the Web Crypto failure as `UNKNOWN`, persists `connection_error`, and the UI advises the owner only to try later.

Confidentiality remains intact and disconnect still works without decryption, but the behavior does not meet issue #17's requirement for an actionable sanitized recovery path when the stored configuration can no longer be decrypted. There is also no product-path regression test for wrong-key verification or disconnecting an undecryptable row.

### P2-2 — Provider and concurrency edge-case regression coverage is narrower than the approved contract

The current suite covers the happy path, token endpoint `401`/`429`/`503`, missing scope, malformed GraphQL data, a disconnect-versus-verification race, encryption context authentication, secret retention/replacement, and sanitized failure persistence.

It does not explicitly cover additional granted scopes, GraphQL `THROTTLED`/`ACCESS_DENIED`, API-version mismatch, returned-domain mismatch, network timeout, a configuration-edit-versus-verification race, missing/incorrect encryption keys, or disconnect of an undecryptable row. The implementation contains direct handling for most of these cases, so this is hardening debt rather than evidence of a current correctness failure.

### P2-3 — Real product-path verification evidence is not durable

The repository records a successful real product-backend run, but the temporary test and raw non-sensitive result were removed. A future auditor cannot independently distinguish that execution from a documentation assertion or rerun it through a committed opt-in harness. Keep real credentials ignored, but retain a sanitized validation artifact or a safe opt-in product-path procedure when the next real validation occurs.

### P3-1 — Admin setup copy does not state the complete Shopify ownership restriction

Issue #17 requires the UI to explain that the client credentials grant supports an app and store owned by the same Shopify organization. The current form says only that the app is owned by the deployment owner. Repository legal/testing documentation describes the development-store ownership limitation, but the non-technical Admin flow omits the same-organization store constraint.

## Standard validation

Executed from the audited worktree on 2026-08-16:

| Command                          | Result                                                                                            |
|----------------------------------|---------------------------------------------------------------------------------------------------|
| `pnpm install --frozen-lockfile` | Pass; lockfile already current                                                                    |
| `pnpm typecheck`                 | Pass                                                                                              |
| `pnpm lint`                      | Pass                                                                                              |
| `pnpm format:check`              | Pass                                                                                              |
| `pnpm test`                      | Pass outside the filesystem/network sandbox: 22 tooling, 27 Admin, and 68 Worker tests; 117 total |
| `pnpm build`                     | Pass; browser-secret inspection passed                                                            |

The first sandboxed Worker-test attempt failed because workerd could not bind loopback and Wrangler could not write its local diagnostic log. Re-running the unchanged suite with the required local-runtime permissions passed. The build emitted only the already-known upstream MCP SDK sourcemap warnings during tests. The Cloudflare build keeps ignored local `.dev.vars` outside `dist/client`; the browser-secret check passed.

## Scope regression

No Shopify catalog ingestion, product/inventory/order/customer D1 schema, sync, webhook, Shopify MCP data tool, merchant OAuth, external-store support, generic commerce/provider framework, or new infrastructure was introduced. The existing Admin session, Origin boundary, registry, Garmin descriptor, MCP endpoint, and installation mechanisms remain structurally intact and covered by the passing suite.

## Conclusions

### SHOPIFY ACTIVATION

`ACCEPTED`

### CREDENTIAL SECURITY

`ACCEPTED`

### CONNECTION VERIFICATION

`PARTIAL`

The implementation and automated production path are sound, and a real product-backend success is recorded, but durable independently inspectable real-run evidence is absent.

### ADMIN API/UI

`ACCEPTED`

### MVP DATA-SOURCE STATE

`READY FOR INGESTION`

### NEXT MVP SLICE

`READY`

There are no P0 or P1 findings. The P2 items should be addressed as security/error hardening and evidence preservation, but they do not require expanding or redesigning activation before bounded ingestion work begins.
