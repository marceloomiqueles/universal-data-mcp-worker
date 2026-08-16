# Integration Registry and Admin Listing Audit

- Date: 2026-08-15
- Scope: completed Integration Registry and Admin Listing slice
- Method: independent read-only architecture, source, import-boundary, migration, test, build, and local-runtime review
- Result: accepted with one P3 documentation finding

## Objective

Determine whether the first integration-management slice establishes a minimal common registry and authenticated Admin listing without becoming a speculative provider or plugin framework.

The audit reviewed the accepted architecture and ADRs, current gaps, the complete owner/session and installation evidence, issue #10, the registry and Garmin slice, Worker composition and Admin API, the production Admin client/router/view/shell, migrations, and related Worker/Admin tests. The implementation reports were not treated as proof.

No implementation was modified. This document is the only repository artifact created by the audit.

## Executive Summary

The slice satisfies its bounded objective. Garmin contributes a four-field descriptor from its vertical slice. The Worker composition root explicitly passes that descriptor to one static registry. The common registry contains no Garmin knowledge, provider behavior, persistence, discovery, capability model, generic type hierarchy, or future-facing lifecycle machinery.

The authenticated Admin API projects registry values into a small public JSON response. The Admin SPA fetches that endpoint through a same-origin client, contains no production Garmin fixture, and handles loading, loaded, empty, and failure states. Existing owner/session protections and the unimplemented MCP boundary remain intact.

No P0, P1, or P2 finding was identified. `TESTING.md` still describes an auth-only backend endpoint inventory and omits the new registry/UI coverage; this is a P3 documentation mismatch.

## Architecture Assessment

### Static registration and composition

Registration is entirely static and compiled:

```text
Garmin descriptor
      ↓
src/worker/integrations.ts
      ↓
createIntegrationRegistry([...])
      ↓
Worker passes registry to Admin API
```

`src/worker/integrations.ts` is the single composition source of truth. It explicitly imports and registers `garminIntegrationDescriptor`. No runtime mutation or discovery path exists.

Repository searches found no dynamic import, filesystem discovery, package scanning, reflection-based registration, plugin manifest, marketplace, external extension loader, or runtime provider loading in application source.

### Minimal registry contract

The common contract contains exactly:

- `id`;
- `name`;
- `description`;
- `status`.

The only status currently modeled is `not_configured`, which truthfully communicates that a compiled integration exists but has no connection/configuration. The implementation does not prematurely materialize the broader conceptual lifecycle from ADR-0003.

The ordinary `IntegrationDescriptor` and `IntegrationRegistry` interfaces describe current consumers and are not speculative framework abstractions. There are no generic parameters, provider methods, factories, type hierarchies, credential contracts, sync contracts, generic repositories, universal errors, or capability schemas.

### Stable identity and duplicate handling

Garmin uses stable machine identifier `garmin`. Registry construction tracks IDs and throws `Duplicate integration id: garmin` on a duplicate. It never overwrites an existing registration. The deterministic behavior has direct test coverage.

### Core and Garmin boundary

The common registry under `src/core/integrations` contains no `garmin` reference or source-specific behavior. Garmin's ID, display name, description, and initial status live under `src/integrations/garmin/descriptor.ts`.

The Garmin slice contains no authentication, credentials, provider adapter, network call, OAuth, synchronization, schema, migration, capability, health, freshness, or domain-data behavior.

## Persistence Assessment

Static registry metadata is process/code state and is not persisted. The repository still contains only:

```text
migrations/0001_owner_auth.sql
```

No integrations table, placeholder state table, Garmin schema, generic repository, or migration was introduced. D1 remains limited to the existing owner/session consumer.

## Admin API Assessment

`GET /api/integrations` is reached only after the existing default Admin session validation. An unauthenticated request receives the established `401 UNAUTHENTICATED` response.

For an authenticated owner, the endpoint returns:

```json
{
  "integrations": [
    {
      "id": "garmin",
      "name": "Garmin",
      "description": "Garmin integration for health and activity data.",
      "status": "not_configured"
    }
  ]
}
```

The handler explicitly projects the four approved fields rather than serializing a registry implementation object. The array is bounded by compiled registrations and exposes no credentials, secrets, provider configuration, methods, persistence details, or internal classes. The response uses `Cache-Control: no-store`.

The Admin API consumes a registry supplied by Worker composition; it does not define the registry or contain Garmin constants.

## Admin UI Assessment

The production router defines one authenticated `/integrations` route and reuses the existing session guard. The responsive application navigation links to that route without a second routing or state system.

`src/admin/integrations.ts` performs a same-origin request to `/api/integrations`, validates the bounded response contract, and returns only API data. The production Admin source contains no `Garmin` or `garmin` value. Garmin appears only through the mocked API response in tests, which is appropriate test fixture data rather than a production fallback.

The view uses Vuetify primitives and renders only name, description, and a label derived from status. It implements:

- loading progress;
- loaded cards;
- empty-registry information;
- API failure feedback.

There is no Connect button, disabled future action, detail page, configuration form, activation behavior, global store, or fake production list.

## Framework-creep Review

The slice does not resemble a premature integration framework:

| Risk                                       | Result |
|--------------------------------------------|--------|
| Generic provider base classes              | Absent |
| Provider factories/type hierarchy          | Absent |
| Runtime package or filesystem discovery    | Absent |
| Plugin loader/manifests/marketplace        | Absent |
| Universal capability schema                | Absent |
| Generic credentials or sync interfaces     | Absent |
| Generic integration persistence/repository | Absent |
| Integration-specific knowledge in core     | Absent |

The registry's small factory, descriptor, duplicate check, and list operation are ordinary mechanisms required by the current slice.

## Test Assessment

### Registry and Worker

Automated tests verify:

- the application-composed registry contains Garmin;
- the descriptor has exactly the approved keys;
- duplicate IDs throw deterministically;
- unauthenticated API access is rejected;
- authenticated API access returns the exact four-field shape;
- the response contains no secret/internal terminology;
- MCP routing remains unchanged.

The Worker tests execute the production request path under Cloudflare's workerd test runtime with the real owner/session migration.

### Admin Web

Admin tests use the production router, session controller, API client, and view. They verify:

- Integrations navigation;
- authenticated `/integrations` routing;
- same-origin request to the production endpoint path;
- Garmin descriptor rendering from the response fixture;
- loading with a genuinely pending request;
- empty registry;
- API failure without fallback data.

Existing session tests continue to cover owner setup, login, restoration, logout, protected navigation, and responsive shell behavior.

## Local and Standard Validation

Executed validation:

```text
pnpm install        PASS
pnpm typecheck      PASS
pnpm lint           PASS
pnpm format:check   PASS
pnpm test           PASS — 20 Node, 22 Admin, 21 Worker tests
pnpm build          PASS
```

Local runtime checks against the process on port 5173 established:

```text
GET /integrations       200 text/html — SPA fallback/deep link
GET /api/integrations   401 application/json — Admin auth boundary
GET /mcp                501 application/json — unchanged MCP placeholder
```

The authenticated `200` registry response is covered through the real Worker request path under workerd. No local owner credential or state was modified to manufacture an authenticated manual session.

The build produced separate Worker and browser artifacts and passed the existing browser-secret inspection.

## Critical-check Matrix

| Check                                          | Result |
|------------------------------------------------|--------|
| Static/compiled registration                   | Pass   |
| One registry composition source                | Pass   |
| No dynamic plugin mechanism                    | Pass   |
| Stable ID and duplicate rejection              | Pass   |
| Contract limited to consumed fields            | Pass   |
| Garmin metadata in Garmin slice                | Pass   |
| No Garmin provider/auth/sync                   | Pass   |
| No unjustified D1 schema                       | Pass   |
| Authenticated Admin API                        | Pass   |
| Bounded public response                        | Pass   |
| UI uses real API client path                   | Pass   |
| No production fake integration data            | Pass   |
| Loading/empty/error states                     | Pass   |
| Owner/session regression                       | Pass   |
| MCP boundary unchanged                         | Pass   |
| No speculative provider/repository abstraction | Pass   |

## Findings

### P3-1 — Testing documentation omits the integration endpoint and coverage

`TESTING.md` introduces its endpoint block as “The backend endpoints are” but lists only the five authentication endpoints. It also describes Admin and Worker coverage without mentioning the registry, authenticated integration list, or Integrations page states.

This does not affect runtime correctness or the executable validation commands, but the public testing reference no longer describes the complete implemented surface. Update it in a later documentation pass or alongside the next relevant change.

No P0, P1, or P2 finding was identified.

## Independent Conclusions

### REGISTRY MECHANISM

`ACCEPTED`

### CORE / SLICE BOUNDARY

`ACCEPTED`

### ADMIN API

`ACCEPTED`

### ADMIN UI

`ACCEPTED`

### NEXT PRODUCT SLICE

`READY`
