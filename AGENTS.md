# AGENTS.md

## Core Principles

1. Don't assume. Don't hide confusion. Surface tradeoffs.
2. Minimum code that solves the problem. Nothing speculative.
3. Touch only what you must. Clean up only your own mess.
4. Define success criteria. Loop until verified.
5. Don't reinvent the wheel. Prefer standard, boring solutions that solve the problem without unnecessary complexity.

---

Instructions for coding agents working in this repository.

## Repository Language

**English is the canonical language for every artifact committed to this public repository.**

This includes source code identifiers, comments, documentation, UI copy, logs, errors, diagnostics, validation messages, tests, authored fixture text, configuration descriptions, issues, pull requests, and commit messages produced by coding agents.

Private or interactive design discussions may occur in Spanish or another language. Regardless of the prompt language, anything materialized in the repository must be written in clear technical English.

Do not maintain parallel translated documentation unless the project explicitly adopts a translation strategy based on demonstrated demand.

Do not translate or alter external or user-provided data, including Garmin payload values, third-party API fields, protocol-defined values, external identifiers, names, and proper nouns. The rule applies to content authored by this project.

Technical names—including files, directories, modules, types, functions, variables, database objects, APIs, and MCP tools—must use English unless an external source or protocol requires an exact identifier.

## Project Context

`universal-data-mcp-worker` is a **source-available, privacy-first, self-hosted** project whose first real use case is connecting Garmin Connect data to ChatGPT through MCP.

Initial target:

`Garmin Connect → Cloudflare Worker → D1 where appropriate → MCP → ChatGPT`

The project must demonstrate that a person can deploy it in their own Cloudflare account, connect Garmin, and use ChatGPT to converse with real data through MCP.

Initial stack:

- TypeScript end to end
- Cloudflare Workers
- Cloudflare D1
- standard MCP
- Admin Web: Vue 3 + TypeScript + Vuexy
- OpenAI ChatGPT as the first supported and validated client

Operational goals:

- additional infrastructure cost close to `$0` for reasonable personal use;
- use the Cloudflare free tier;
- one self-hosted deployment managed by its owner;
- the same Worker and deployment serve Admin Web, Admin API, and MCP;
- remote telemetry disabled by default;
- installation and operation without editing code.

Target product flow:

`Deploy → open Admin Web → authenticate → connect Garmin → activate integration → bootstrap/sync → connect MCP to ChatGPT → converse`

The target user may not be technical. Installation and operation must be as elementary as reasonably possible.

Sponsorship, “Buy me a coffee,” or assisted installation/support may exist, but the self-hosted software must work fully without paid support.

## Architectural Purpose

Garmin is the **first real integration and the vertical that must be solved well**, but it must not define the software core.

The reusable learning is primarily:

`data source → integration → persistence where appropriate → MCP → AI`

The repository is a real laboratory for maturing:

- MCP;
- source integration;
- persistence;
- synchronization;
- authentication;
- secret management;
- migrations;
- self-hosting;
- operations;
- observability;
- error handling;
- compatibility;
- edge cases;
- developer experience.

Do not build a generic enterprise framework. Do not anticipate ERP, Shopify, forecasting, ML, enterprise reporting, multi-tenancy, billing, or other nonexistent verticals.

Central principle:

**Define boundaries early; abstract only with evidence.**

And:

**Designing for replacement does not mean implementing alternatives before they are needed.**

Practical rule:

**Reuse mechanisms, not models.**

## Architectural Model

One deployment may contain **N compiled and registered integrations**. If an integration is included in the deployment, it is registered.

Do not implement dynamic discovery, a plugin marketplace, remote code installation, or a generic plugin framework without a real need.

```text
Cloudflare Worker / Deployment
│
├── Admin Web (Vue 3 + TypeScript + Vuexy)
│   └── Admin API HTTP/JSON
├── MCP runtime
│   ├── Garmin capabilities
│   └── capabilities from other registered integrations
├── Core / shared mechanisms
└── Registered integrations
    ├── Garmin
    ├── Polar (only if ever implemented)
    └── Zwift (only if ever implemented)
```

Do not implement Polar, Zwift, or other sources merely to demonstrate extensibility. Garmin is sufficient to validate the boundaries.

## Core vs. Vertical Slice Rule

Apply the same criterion throughout the architecture:

> **Shared behavior lives in core; integration-specific behavior lives in the integration's vertical slice.**

Do not move something into core only because it might be reusable someday.

If a component must understand Garmin to work, it is probably not shared. If it remains necessary when Garmin is replaced by another source, it may be a candidate for a shared mechanism.

Separation must emerge from real cases and remain pragmatic.

## Core / Shared Mechanisms

Core contains mechanisms that must not depend on the Garmin domain. Current candidates include:

- MCP runtime;
- integration registry;
- shared integration lifecycle;
- technical D1 persistence;
- migration runner;
- shared sync mechanisms;
- shared operational state;
- error classification and propagation;
- retries/backoff;
- freshness mechanisms;
- shared diagnostics;
- configuration;
- secrets;
- Admin Web authentication/session;
- shared primitives that emerge from real use.

Do not assume each mechanism requires a complex abstraction. Prefer direct, standard implementations.

Do not create `GenericRepository<T>`, `UniversalDataSource<T>`, buses, CQRS, event sourcing, plugin frameworks, or DSLs without evidence.

## Integrations / Vertical Slices

An integration is a self-contained functional vertical that can:

1. access a data source;
2. store data where needed;
3. expose data or capabilities to AI through the deployment's MCP runtime.

Where appropriate, an integration may contribute:

- connection/activation logic;
- source-specific authentication;
- provider/source adapter;
- its own schema and migrations;
- mappings;
- repositories/queries;
- source-specific sync decisions;
- bootstrap;
- reconciliation;
- source-specific freshness policies;
- MCP capabilities/tools;
- source-specific diagnostics;
- translation of provider errors into shared error categories.

Do not force every integration to persist or synchronize in the same way. Persistence and sync are available mechanisms; concrete behavior belongs to the integration.

## Integration Registration and Activation

An integration compiled into the deployment is registered. Admin Web must list registered integrations and their state.

Conceptual activation flow:

```text
Admin Web
→ start connection
→ run the integration-specific flow
→ validate access
→ apply pending migrations where appropriate
→ activate integration
→ register/expose MCP capabilities
→ start bootstrap/sync where appropriate
```

Session handling, integration listing, and shared lifecycle mechanisms belong to core. Source-specific connection steps belong to the slice.

If multiple real integrations need OAuth2, a shared OAuth2 mechanism may move into core. Endpoints, scopes, callbacks, token semantics, and source-specific behavior remain in the slice. Do not abstract OAuth2 in advance for a single case.

## Integration Lifecycle

Use a small, understandable lifecycle. Avoid a sophisticated state machine without demonstrated need.

The system must conceptually distinguish at least:

- registered/available;
- inactive;
- activating;
- active;
- degraded;
- disabled;
- error/attention required.

Exact names may change during implementation. Core keeps shared operational state; the slice keeps source-specific details.

## Errors and Availability

Do not invent a special error system when standard patterns suffice.

### Transient / Recoverable Errors

Examples:

- timeout;
- temporary network errors;
- `429`;
- some `5xx` responses;
- temporary unavailability.

Use bounded retries with backoff. Never retry forever.

### Errors Requiring Intervention or Disablement

Examples:

- invalid or revoked credentials;
- provider removed;
- incompatible integration;
- endpoint removed;
- structural provider change that prevents operation.

Do not hide these cases behind endless retry. The slice translates provider errors into shared categories; core applies shared behavior.

Keep categories such as these where appropriate:

- `SOURCE_UNAVAILABLE`
- `AUTH_FAILED`
- `RATE_LIMITED`
- `PROVIDER_CHANGED`
- `SYNC_PARTIAL`
- `UNKNOWN`

Do not collapse every problem into one generic error.

## MCP: Shared Mechanism and Specific Surface

MCP has two explicit parts.

### Shared MCP

Core provides:

- server/runtime;
- standard protocol;
- capability/tool registration;
- execution;
- technical plumbing;
- shared MCP error handling;
- infrastructure required to expose capabilities.

The MCP mechanism must not know Garmin.

### Integration-Specific MCP

Each slice defines its own:

- tools/capabilities;
- names and descriptions;
- input and output schemas;
- domain operations;
- limits, filters, and pagination.

Do not create universal tools merely to appear generic. Do not create `UniversalTool<T>` without need.

The runtime aggregates capabilities from active integrations. Disabled integrations must not remain available to MCP clients.

## ChatGPT

ChatGPT is the first supported and validated MCP client. Use standard MCP.

Do not add ChatGPT-specific logic unless real integration evidence shows standard MCP is insufficient. Do not create adapters for Claude, Gemini, or other clients without demand and validation.

```text
Integration → MCP capabilities → standard MCP → ChatGPT
```

Do not assume a `ChatGPTAdapter` is needed.

## MCP Tool Design

Tools must be:

- bounded;
- filterable;
- paginated where appropriate;
- efficient;
- explicit about limits;
- oriented toward concrete questions.

Avoid massive JSON dumps to the LLM. Return only the data needed for the query.

Tools must not contain synchronization or technical provider-access logic when that logic belongs in slice use cases or services.

## Persistence: Shared Mechanism, Specific Schema

D1 is the primary persistence mechanism when an integration requires local storage.

Shared concerns:

- D1 binding/connection;
- SQL execution;
- migration runner;
- technical persistence mechanisms;
- shared primitives only after real use.

Slice concerns:

- schema;
- tables;
- indexes;
- queries;
- repositories;
- mappings;
- data semantics.

Do not design a universal schema. Do not put everything into a generic JSON table. Do not accidentally persist a provider's internal model as a permanent contract. Do not design a universal sports model.

## Migrations

Migrations are mandatory from the beginning. They must be:

- versioned;
- incremental;
- safe;
- repeatable;
- applied only when pending;
- compatible with existing deployments.

The desired operational experience is Rails-like:

- detect pending migrations;
- apply only those needed;
- record applied migrations;
- require no secret manual scripts;
- never treat D1 recreation as normal procedure.

Migrations must be runnable:

1. during startup/deploy where appropriate;
2. during integration activation when that integration has pending migrations.

Both paths must be safe and idempotent. Re-running the migration runner after all migrations are applied must not change the final state.

Disclose any data-loss risk before implementing a migration.

## Sync: Shared Mechanism, Specific Decisions

Bootstrap, background sync, on-demand sync, and reconciliation must reuse shared mechanisms rather than parallel pipelines.

Core may provide:

- sync execution;
- lifecycle;
- retries/backoff;
- checkpoints;
- state;
- idempotency;
- observability;
- execution control;
- success/partial/failure reporting.

The slice decides:

- what to synchronize;
- source and destination;
- datasets and ranges;
- endpoints and mappings;
- tables;
- update policy;
- reconciliation behavior;
- all source-specific choices.

> **Core orchestrates; the integration decides the concrete synchronization behavior.**

Do not build a universal sync framework without evidence.

## Idempotency

Idempotency is critical:

- `bootstrap × N = same state`
- `sync × N = same state`
- `reconciliation × N = same state`
- `retry after failure = consistent state`
- `migration runner × N = same state once applied`
- `purge × N = same final state`

Do not accept duplicate records, silent corruption, or results that depend on retry count.

When modifying ingestion, persistence, migrations, or purge, explicitly verify idempotency.

## Freshness

Freshness is a shared mechanism with integration-specific policy. Core may represent and evaluate freshness; each integration chooses concrete rules based on actual data behavior.

Garmin initially retains these conceptual classes:

- `HOT`
- `DAILY`
- `HISTORICAL`

Do not introduce arbitrary TTLs without evidence or distribute freshness rules inconsistently across MCP tools. One data family may behave differently by time range or mutability.

## Reconciliation

The system must be able to correct historical data when an integration needs it. Do not run expensive reconciliation automatically without evidence.

Reconciliation must:

- reuse existing pipeline/mechanisms;
- be idempotent;
- be detectable;
- be optional or explicit where appropriate;
- respect source cost and limits.

Concrete reconciliation behavior belongs to the slice.

## Admin Web

The project includes a self-hosted administrative interface:

- Vue 3;
- TypeScript;
- Vuexy;
- SPA;
- natural routing/tooling for the selected Vuexy variant;
- no SSR unless a real need is demonstrated.

The UI never accesses D1 or providers directly. It consumes an Admin HTTP/JSON API served by the same Worker.

```text
Browser
→ Admin Web
→ Admin API
→ Core / Integrations / D1
```

Do not add RPC/tRPC or another layer without demonstrated benefit.

## Admin API

Admin API is an inbound surface separate from MCP. Where appropriate it must support:

- login/logout/session;
- listing registered integrations;
- viewing state;
- starting activation;
- disabling/reactivating;
- enabling/disabling capabilities when that feature exists;
- starting bootstrap/sync;
- viewing diagnostics;
- explicit administrative operations;
- reset/delete with confirmation.

Integration-specific activation logic belongs to the slice. The API must not duplicate domain logic already in core or slices.

## Admin Authentication and Session

The initial deployment has one owner/admin. Do not implement multi-user behavior, RBAC, organizations, invitations, email verification/recovery, or enterprise identity.

Use a simple standard mechanism compatible with Cloudflare Workers/free tier:

- admin credential;
- secure password hashing;
- session;
- `HttpOnly`, `Secure`, and appropriate `SameSite` cookie;
- logout;
- credential change/rotation when implemented.

Do not invent cryptography. Use standard Worker-compatible primitives and libraries.

## Secrets and Sensitive Data

Separate:

### Fixed Sensitive Configuration

Use Cloudflare secrets/environment configuration.

### Persisted Sensitive State

Encrypt in D1 where necessary.

The encryption key:

- must never be stored in D1;
- must never appear in logs;
- must be able to evolve toward rotation/versioning;
- does not require a complex key-management system without evidence.

Never commit credentials, tokens, keys, secrets, or personal debugging payloads.

Normally do not log full sports payloads, personal data, credentials, tokens, or detailed sports metrics.

## Retention and Disablement

Disabling an integration **does not immediately delete its data**.

Use a configurable `N`-day retention policy to allow reactivation without full reprocessing or resynchronization.

- disabling removes MCP capabilities;
- background sync stops;
- data remains during the retention window;
- UI shows the retention deadline;
- reactivation within the window reuses existing data;
- expiration triggers safe, idempotent purge;
- secrets/tokens may need a stricter policy than historical data;
- explicit delete/reset may skip retention, with confirmation.

Do not choose `N` arbitrarily. Document the gap until a default is decided.

## Reset and Data Ownership

The system must support complete reset. Every destructive operation requires explicit confirmation.

Do not treat deleting and recreating D1 as a valid maintenance strategy. Avoid decisions that unnecessarily obstruct future export/import. Complete export/import is not an MVP requirement unless later decided.

## Local Diagnostics

The deployment must show understandable operational state to non-technical users, for example:

- Worker: healthy;
- MCP: ready;
- D1: healthy;
- integration: active/degraded/disabled;
- last sync;
- next retention purge;
- records stored where useful;
- last error;
- suggested action.

Messages must be actionable and avoid unnecessary internal detail.

## Diagnostics and Remote Telemetry

The system must work fully without remote telemetry.

Default: `remote telemetry = disabled`.

If enabled for support, it must be explicit, temporary, minimal, and disableable. It may include version, error code/class, duration, counts, timestamps, sync state, logical endpoint, and technical D1 state.

It should not normally include personal data, detailed sports data, full payloads, credentials, or tokens.

Do not introduce artificial complexity to create support dependency.

## Installation and Operation

The target user may not be technical. Avoid requiring code edits, manual SQL/migrations, multiple services, MCP internals, manual tool registration, undocumented secret handling, or unnecessary infrastructure.

Prefer:

`Deploy → Admin Web → connect → activate → synchronize → connect MCP → use`

Do not introduce internal extensibility that makes installation or operation worse without real need.

## Cost and Infrastructure

Target: **no additional infrastructure cost for reasonable personal use within the Cloudflare free tier**.

The user's ChatGPT plan is not project infrastructure cost.

Before adding Workers, Queues, Durable Objects, R2, KV, external services, extra scheduled processing, or non-Cloudflare infrastructure, demonstrate need.

Prefer solving within the same Worker/free tier, without email or unnecessary infrastructure. Do not sacrifice correctness or integrity for irrelevant savings.

## Frontend and Routing

Keep Admin Web, Admin API, and MCP in the same deployment with clear logical separation. The SPA consumes Admin HTTP/JSON API.

Conceptual routes:

```text
/            → SPA
/api/*       → Admin API
/mcp/*       → MCP
```

Exact paths may change. Do not add SSR or a separate backend without demonstrated need.

## Dependencies

Before building infrastructure, find a standard solution compatible with TypeScript, Cloudflare Workers, the free tier, reasonable bundle size, active maintenance, security, and simplicity.

Every new dependency must justify:

- the concrete problem it solves;
- why native capabilities or existing dependencies are insufficient;
- bundle/runtime impact;
- maintenance;
- security.

Prefer small, mature libraries. Do not add a dependency for a few trivial lines. Do not hand-roll authentication, hashing, OAuth2, retry, routing, validation, or other standard mechanisms when a mature compatible solution exists.

## Licensing, Contributions, and Third-Party Rights

- The Project is licensed under `FSL-1.1-ALv2`; protected versions are source-available and must not be described as OSI Open Source.
- Do not change licensing, CLA, commercial, or trademark terms without explicit Project Owner approval.
- External code contributions require acceptance of the applicable CLA through a durable, auditable mechanism before merge. A pull-request checkbox alone is insufficient.
- Contributors retain copyright; the CLA grants Marcelo Miqueles explicit sublicensing, relicensing, proprietary-licensing, and dual- or multi-licensing rights without copyright assignment.
- Until CLA acceptance enforcement is operational, external code may be discussed and reviewed but must not be merged, copied, or trivially rewritten into the Project.
- Incorporate third-party code or assets only under compatible terms with documented provenance and redistribution rights.
- Vuexy source and protected assets must not be committed until public redistribution rights are verified.
- Garmin/provider licenses and service terms are independent of the Project software license and require separate review.
- Use third-party trademarks only for truthful descriptive reference; never imply endorsement, partnership, or official status.

## Testing

Tests must be proportional to risk. Prioritize:

1. integration lifecycle;
2. sync;
3. idempotency;
4. persistence and migrations;
5. retention/purge;
6. error handling;
7. freshness/quality;
8. MCP contracts;
9. Admin API;
10. auth/session;
11. encryption;
12. real edge cases.

Do not pursue coverage percentages for their own sake. Coverage must protect meaningful behavior.

Add a regression test for a reproducible bug when reasonable. Document concrete commands in `TESTING.md` once tooling exists; do not invent tooling.

## Before Changing Code

Minimum process:

1. Confirm objective and scope.
2. Inspect the real repository state.
3. Identify affected entry points, core, and slices.
4. Separate facts from assumptions.
5. Review documented decisions and gaps.
6. Look for a standard solution first.
7. Define success criteria.
8. Identify needed tests.
9. Implement the minimum change.
10. Run validations.
11. Correct until criteria pass.
12. Update documentation where appropriate.

Do not propose architecture based only on file names. Read relevant code and documentation first.

## When Modifying Specific Areas

### Core

- keep it free of Garmin/vertical knowledge;
- require a real case for abstractions;
- keep shared mechanisms small;
- avoid breaking integrations.

### Integration

- keep specific logic inside the slice;
- avoid unnecessary core changes;
- verify lifecycle and diagnostics;
- update MCP surface where appropriate.

### Provider/Source

- verify error handling and rate limits/retries;
- do not leak provider details into core;
- update relevant tests.

### Sync

- verify idempotency, retry, partial sync, and relevant concurrency;
- review free-tier impact;
- do not duplicate pipelines.

### D1/Schema

- create a migration;
- preserve existing data;
- verify indexes/queries;
- update tests;
- document incompatible changes.

### Migrations

- verify startup/deploy and integration activation;
- verify repeated execution;
- require no manual intervention.

### MCP Runtime

- remain integration-independent and standard-compliant;
- avoid ChatGPT-specific behavior without evidence.

### MCP Capabilities/Tools

- keep them inside the slice;
- limit volume and consider pagination/ranges;
- avoid dumps;
- update documentation.

### Admin Web/API

- keep UI away from direct D1/provider access;
- keep API simple;
- prioritize non-technical users;
- avoid unnecessary administrative flows.

### Authentication/Encryption

- treat as sensitive;
- never log secrets;
- use standard primitives;
- test failure scenarios.

### Retention/Purge

- verify deactivate does not delete accidentally;
- verify retention date, reactivation, idempotent purge, and confirmed reset/delete.

### Architecture or Conventions

- record an ADR for transversal or hard-to-reverse decisions;
- record gaps where implementation must provide evidence.

## Decisions and Gaps Documentation

Do not block implementation by speculatively closing every question. Explicitly document decisions, assumptions, open questions, gaps, and provisional choices needing evidence.

Use:

- `docs/adr/` for architectural decisions and tradeoffs;
- `docs/gaps/` for known uncertainty/debt;
- `docs/audits/` for current-state analysis;
- `docs/plans/` for staged work;
- `docs/runbooks/` for operations and support.

If implementation and measurement can answer a question better, record it as a gap and proceed. Never hide uncertainty.

## Repository Documentation

Create documentation only when real content exists. Target structure:

- `README.md`
- `ARCHITECTURE.md`
- `CONTRIBUTING.md`
- `TESTING.md`
- `docs/security/README.md`
- `docs/flows/README.md`
- `docs/domain/README.md`
- `docs/standards-and-conventions/README.md`
- `docs/standards-and-conventions/definition-of-done.md`
- `docs/standards-and-conventions/testing-policy.md`
- `docs/standards-and-conventions/style-and-formatting.md`
- `docs/gaps/README.md`
- `docs/adr/README.md`
- `docs/audits/README.md`
- `docs/plans/README.md`
- `docs/runbooks/README.md`

Do not create empty documents merely to complete the structure.

## Currently Acceptable Gaps

Do not block the MVP while evidence is missing for:

- final integration contract granularity;
- exact MCP capabilities;
- how much sync belongs in core;
- real ChatGPT behavior beyond standard MCP;
- concrete TTL/freshness;
- exact initial historical window;
- default retention `N`;
- real need for coalescing/locking;
- concrete libraries that do not affect boundaries;
- minor lifecycle details;
- portability to other MCP clients.

Resolve and document them with evidence.

## Out of Scope Without Explicit Agreement

- multi-tenancy;
- multiple owners/admins per deployment;
- organizations;
- enterprise RBAC;
- billing/plans;
- enterprise reporting;
- forecasting/ML/BI;
- ERP/Shopify;
- universal sports model or schemas;
- plugin marketplace or dynamic integration loading;
- universal sync framework;
- generic enterprise abstractions;
- adapters for multiple AI clients;
- massive refactors or cosmetic reorganizations;
- stack changes;
- speculative infrastructure;
- mandatory paid services;
- transactional email for MVP authentication.

## Relationship to `decision-intelligence`

This repository primarily matures MCP, integration, sync, persistence, authentication, operations, infrastructure, self-hosting, errors, migrations, edge cases, and DX.

`decision-intelligence` primarily matures applied statistics, forecasting, ML, business intelligence, and reporting.

Generic learning may flow between them. Do not add enterprise features here merely because they may help a private project. Clean boundaries should enable reuse without turning this repository into an anticipated enterprise platform.

## Definition of Done

A change is not done merely because it compiles. Verify as applicable:

- objective achieved;
- relevant tests passing;
- error behavior tested;
- idempotency preserved;
- migrations verified;
- lifecycle correct;
- retention/purge considered;
- secrets protected;
- operational cost considered;
- non-technical user experience considered;
- documentation updated;
- known gaps explicit;
- no out-of-scope changes;
- no speculative code.

Explicitly state anything that could not be verified.

## Guiding Criterion

`universal-data-mcp-worker` must be:

**an excellent, easy-to-install self-hosted MCP service for connecting Garmin to ChatGPT, with mechanisms clean enough to add future integrations without contaminating core.**

Garmin is the first real case. Do not build a framework. Do not reinvent the wheel. Solve the real problem. Measure. Learn. Abstract afterward.
