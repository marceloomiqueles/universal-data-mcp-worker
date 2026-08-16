# Architecture

## Status and Scope

This document describes only the architecture currently agreed for `universal-data-mcp-worker`. It does not define components, TypeScript contracts, HTTP routes, tables, or libraries that do not exist yet.

Terms used:

- **Decided:** a current constraint or direction.
- **Provisional:** useful guidance whose details require evidence.
- **Gap:** a deliberately open decision recorded in [`docs/gaps/`](docs/gaps/README.md).

## Certainty Map

| Category | Current content |
|---|---|
| Decided | One deployment; one pnpm root project; core vs. slices; compiled integrations; shared MCP plus specific surfaces; shared D1/migrations plus slice schemas; Vue 3/TypeScript/Vuetify/Vue Router SPA; one owner; retention before purge |
| Provisional | Exact lifecycle names and the list of mechanisms that may belong in core |
| Working assumptions | Garmin provides evidence for the first slice; D1 is used only where persistence is needed; standard MCP should be sufficient for ChatGPT until proven otherwise |
| Gaps | Contracts, Garmin tools, sync/freshness/retention values, libraries, and real platform/provider behavior |
| Out of scope | Enterprise platform, universal model, dynamic plugins, additional AI clients, and speculative infrastructure |
| To validate | Workers/free-tier compatibility, end-to-end ChatGPT behavior, idempotency, Garmin/D1 limits, and operation by non-technical users |

Assumptions are not architectural commitments. If evidence contradicts them, update the documentation and record the resulting decision.

## System Goal

`universal-data-mcp-worker` is a public, source-available, privacy-first, self-hosted project licensed under FSL-1.1-ALv2. Licensing does not change the architectural boundaries in this document.

```text
Garmin Connect → Cloudflare Worker → D1 where appropriate → MCP → ChatGPT
```

Target flow:

```text
Deploy → Admin Web → authenticate → connect Garmin → activate
→ bootstrap/sync → connect MCP to ChatGPT → converse
```

The target user may not be technical. Installation and operation should avoid code edits, manual SQL, and unnecessary infrastructure.

## Deployment

**Decided:** one Cloudflare Worker/deployment serves all three inbound surfaces and contains shared mechanisms and compiled integrations.

```text
Cloudflare Worker / deployment
│
├── Admin Web (Vue 3 + TypeScript + Vuetify + Vue Router, SPA)
│   └── consumes Admin API HTTP/JSON
├── Admin API
├── MCP runtime
│   └── aggregates capabilities from active integrations
├── Shared core
├── Registered integrations
│   └── Garmin (first real integration)
└── D1 where appropriate
```

Exact future product paths and internal structures remain implementation-driven. One KV namespace is now justified for the standard Cloudflare OAuth provider that protects MCP; additional Workers, Queues, Durable Objects, KV namespaces, R2, and external services remain unjustified.

Installation provisioning is outside the application runtime. Project-owned tooling authenticates through Wrangler to create or bind D1, apply migrations, configure Worker secrets, and deploy. Runtime code receives only logical bindings such as `env.DB`; it does not receive Cloudflare management credentials or depend on resource IDs. The Wrangler provisioning path has been validated against a real Cloudflare installation.

## Core and Vertical Slices

Two rules govern separation:

> **Shared behavior lives in core; specific behavior lives in the integration's vertical slice.**

> **Reuse mechanisms, not models.**

Core may contain only mechanisms that remain necessary if Garmin is replaced. Current candidates include MCP runtime, registry and lifecycle, technical D1/migrations, shared sync orchestration, configuration, Admin authentication/session, shared error classification, and diagnostics.

This list does not require an abstraction for every mechanism. Final core granularity and the integration contract remain open until real code and reuse evidence exist.

The Garmin slice owns anything that must understand its provider or domain: connection, source authentication, mappings, schema, queries, sync/freshness rules, diagnostics, and MCP capabilities.

Do not design an enterprise framework, universal sports model, generic repository, or dynamic plugin system.

## Integrations

Where appropriate, an integration can:

1. access a source;
2. persist its data;
3. synchronize it;
4. contribute capabilities to the shared MCP runtime.

**Decided:** one deployment may contain N compiled integrations. If included in the deployment, an integration is registered. Registration does not mean connected or active.

There is no dynamic discovery, remote code installation, or plugin marketplace. Garmin is enough to validate the first boundaries; other sources will not be implemented merely to demonstrate extensibility.

## MCP

The architecture separates:

- **Shared mechanism:** standard MCP server/runtime, registration, aggregation, execution, technical plumbing, and common error handling.
- **Slice surface:** tool/capability names, descriptions, schemas, operations, filters, limits, and pagination.

The shared runtime does not know Garmin. Only active integrations expose capabilities. Tools minimize data and answer bounded queries rather than returning massive dumps.

The initial shared runtime uses stable MCP `2025-11-25` Streamable HTTP and exposes one bounded read-only registry tool. MCP clients authenticate separately from the Admin browser session through OAuth 2.1 authorization code with PKCE; the existing owner supplies identity and consent, while provider-managed OAuth state lives in KV. ChatGPT is the first intended client. No client-specific adapter is assumed while standard MCP is sufficient, and real ChatGPT behavior remains unvalidated.

## Persistence

D1 is the primary persistence mechanism when local state is required.

- **Shared:** binding/connection, technical execution, and migration runner; additional primitives only after real use.
- **Slice:** schema, tables, indexes, queries, mappings, and semantics.

There will be no universal schema, generic JSON table for every domain, or accidental promotion of a provider's internal model into a permanent contract.

## Migrations

Migrations are required from the beginning of persistence. They must be incremental, versioned, safe, compatible with existing deployments, applied only when pending, and idempotent once recorded.

They must be runnable during startup/deploy where appropriate and during integration activation where appropriate.

The desired Rails-like experience detects pending migrations, applies only those required, records them, and requires neither manual SQL nor normal D1 recreation.

The exact mechanism, sequence, and response to Worker/D1 limits must still be designed and tested.

## Sync

Core supplies shared execution and state mechanisms; the slice decides what data to synchronize, sources/destinations, ranges, mappings, and policies.

Bootstrap, background sync, on-demand sync, and reconciliation reuse one mechanism rather than parallel pipelines. Reconciliation remains explicit or optional until evidence justifies automation.

Idempotency is transversal:

```text
bootstrap × N       = same state
sync × N            = same state
reconciliation × N  = same state
retry after failure = consistent state
purge × N           = same final state
```

Retries, checkpoints, concurrency, locking/coalescing, historical ranges, and concrete policies remain gaps until Garmin and Cloudflare are measured.

## Admin

**Decided:** Admin Web is a Vue 3 and TypeScript SPA using Vuetify and Vue Router. It consumes an HTTP/JSON Admin API and never accesses D1 or providers directly. Admin Web, Admin API, and MCP live in one deployment. Vuexy source and protected assets are excluded because its Regular License is incompatible with the intended public redistribution model.

The UI is intentionally small and operational. Expected product areas, when implemented, are login, system status, integrations, integration details and state, activation/deactivation, sync/bootstrap status, capabilities, diagnostics, basic settings, retention information, and confirmation of destructive operations. This list is not an implementation plan or authorization to create screens early.

Use Vuetify primitives before project-owned components. Do not build a custom design system, introduce Tailwind CSS or Bootstrap, or add a second component/CSS framework. Keep project-owned theme customization small.

Prefer Vue composition and local state. Pinia is not part of the initial scaffold and requires an actual client-side state need before adoption.

The initial deployment has one owner/admin. Authentication requires an admin credential, secure password hashing, and a session cookie with `HttpOnly`, `Secure`, and appropriate `SameSite`. Multi-user behavior, RBAC, organizations, mandatory email, and email recovery are excluded.

The session is server-managed. The SPA neither reads nor persists the session token. Frontend route guards are navigation UX only; the Admin API enforces authentication.

The first product slice uses D1 for the singleton owner credential and revocable Admin sessions. Passwords use a versioned PBKDF2-HMAC-SHA-256 verifier through Workers Web Crypto. Opaque session tokens are stored only as SHA-256 digests and delivered in an `HttpOnly`, `SameSite=Strict`, `/api`-scoped cookie with a 12-hour absolute lifetime. A temporary Cloudflare `OWNER_SETUP_TOKEN` protects atomic first-owner creation. The deployment owner enters through a setup URL carrying the proof in its fragment; the SPA removes the fragment immediately, retains the proof only in memory, and transports it in a dedicated setup header rather than presenting it as account data. The same project-owned session controller restores the session, drives setup/login/logout UI state, and supports navigation guards; Admin API authorization remains authoritative. A native Cloudflare Rate Limiting binding bounds repeated login work without persistent lockout. Non-loopback Admin API traffic requires HTTPS, while loopback HTTP remains available for local development. Expired session cleanup is bounded and opportunistic within existing auth operations.

## Scaffold and Repository Shape

**Decided:** use one repository, one deployable application, one root `package.json`, one `pnpm-lock.yaml`, pnpm, no workspaces, and no monorepo package boundaries. Vite and the official Cloudflare Vite integration build the SPA and Worker for the same deployment.

Conceptual routing:

```text
/api/*  → Admin API
/mcp/*  → MCP
/*      → static SPA assets / Vue Router fallback
```

Exact paths may evolve with implementation evidence.

The approved conceptual shape is:

```text
/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── wrangler.jsonc
├── index.html
├── src/
│   ├── worker/
│   │   ├── index.ts
│   │   ├── admin-api/
│   │   └── mcp/
│   ├── core/
│   ├── integrations/
│   │   └── garmin/
│   └── admin/
│       ├── main.ts
│       ├── App.vue
│       ├── pages/
│       ├── layouts/
│       ├── navigation/
│       ├── components/
│       ├── theme/
│       └── assets/
```

This tree records boundaries, not mandatory empty directories. Scaffolding creates only paths with an immediate consumer.

## Conceptual Lifecycle

The system must conceptually distinguish:

- `registered` / available;
- `inactive`;
- `activating`;
- `active`;
- `degraded`;
- `disabled` or error/attention required.

These names are not yet an enum or persisted contract. Core keeps shared operational state; each slice keeps source details.

An active integration contributes MCP capabilities and may synchronize. A disabled integration exposes no capabilities and runs no background sync.

## Retention, Reactivation, and Purge

Disablement is not deletion:

1. data is retained for a configurable `N`-day window;
2. UI shows the retention deadline;
3. reactivation during the window reuses data where possible;
4. expiration triggers safe, idempotent purge;
5. secrets/tokens may need stricter policy than historical data;
6. explicit reset/delete may skip retention, with confirmation.

The default `N` remains an open gap.

## Security, Privacy, and Operations

- The repository and history are public; committed artifacts must contain no secrets, tokens, exploitable private endpoints, or real personal data.
- The system works with remote telemetry disabled by default.
- Fixed secrets use Cloudflare secrets/environment configuration, never D1.
- Persisted sensitive state is encrypted where appropriate; its key is never stored in D1 or logged.
- Credentials, tokens, personal payloads, and detailed sports metrics are not normally logged.
- Destructive operations require explicit confirmation.
- Local diagnostics must be actionable for non-technical users.
- Additional infrastructure cost should remain close to `$0` for reasonable personal use within the Cloudflare free tier.

Concrete controls must be defined and verified during implementation. This document does not claim unimplemented protections.

## Out of Scope

Without explicit agreement and evidence: multi-tenancy, multiple owners, enterprise RBAC, billing, ERP, BI, forecasting, ML, a universal sports model, plugin marketplace, dynamic integration loading, universal sync framework, multiple AI-client adapters, and speculative infrastructure.

## Traceability

- Accepted decisions: [`docs/adr/`](docs/adr/README.md)
- Open decisions: [`docs/gaps/`](docs/gaps/README.md)
- Verified initial state: [`docs/audits/2026-08-15-initial-documentation-audit.md`](docs/audits/2026-08-15-initial-documentation-audit.md)
- Next stage: [`docs/plans/next-architecture-detailing.md`](docs/plans/next-architecture-detailing.md)
