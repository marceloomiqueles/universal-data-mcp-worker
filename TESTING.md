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

The Admin tests use the production Vue Router and session code. They verify first-run setup, bootstrap-fragment removal and separate proof transport, missing-proof/configuration guidance, password confirmation, normal login, generic login failure, session restoration, protected navigation UX, loading without authenticated-content flash, logout, unavailable-API feedback, not-found behavior, and responsive navigation. Worker tests apply the real D1 migration and verify owner/session behavior plus the separate OAuth 2.1 and MCP boundaries. MCP coverage exercises DCR, PKCE authorization, resource metadata, bearer isolation, initialization, tool discovery/call, real and empty registries, malformed requests, size bounds, Origin/HTTPS checks, and owner revocation through production Worker composition.

`pnpm typecheck` uses separate Admin-test and Worker-test TypeScript projects. Each project includes its runtime source and related tests without mixing DOM types into Worker code or Worker types into Admin code.

For local validation, let the repository script create or preserve the ignored secret and apply pending local D1 migrations, then start development:

```sh
pnpm setup:local
pnpm dev
```

The script prints the authorized URL only after migrations succeed. It is safe to rerun: existing valid configuration and owner/session data remain unchanged, while Wrangler applies only pending migrations. Use `pnpm setup:url` to print the URL again from an existing `.dev.vars`. Vite uses fixed local port `5173` and fails rather than silently changing the setup URL when that port is occupied.

The Node setup-tool tests verify 256-bit Base64URL generation, private file permissions, repeat preservation, refusal to overwrite invalid configuration, the exact bootstrap-fragment contract, migration-before-URL ordering, and the deliberately unusable committed example. Provisioning-tool tests verify D1 reuse/fail-closed selection, regeneration from the committed template, defensive Wrangler `--strict`/`--keep-vars` deployment, stable per-installation rate-limit namespaces, and workers.dev URL extraction without contacting Cloudflare. Browser-build inspection fails when any non-empty local `.dev.vars` value appears under `dist/client`.

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

All POST requests require `Content-Type: application/json` and an `Origin` exactly matching the Worker origin. Setup JSON contains only `username` and `password`; password confirmation remains a client responsibility. Authorization is supplied separately through the `X-Owner-Bootstrap-Proof` header. The SPA obtains that proof from `/login#bootstrap=<proof>`, removes the fragment immediately, keeps it only in memory, and never represents it as account data. Remove the setup secret after the owner is created.

The login endpoint uses the configured Cloudflare Rate Limiting binding before expensive password verification. It permits five attempts per 60-second window per Cloudflare source address, returns generic `429` JSON with `Retry-After: 60`, and recovers automatically without persisted account lockout. Cloudflare documents this mechanism as permissive and location-local, so it mitigates ordinary guessing and computational abuse but is not an exact accounting boundary.

Local HTTP is accepted only on loopback hostnames. Non-loopback Admin API requests over HTTP return `426 HTTPS_REQUIRED`; HTTPS requests retain `Secure` cookies. The provisioned `workers.dev` Admin API was validated to return `426 HTTPS_REQUIRED` over HTTP and normal setup status over HTTPS. This validates the authentication-surface invariant without requiring all static SPA traffic to redirect.

To reset only local owner/session state while preserving migrations, run `pnpm auth:reset:local`. This deletes the local owner and all local sessions. Never adapt that local reset command to a production database without a separately reviewed operational procedure.

Local preview validation has confirmed setup status, first setup, current session, authenticated Admin API access, logout, and post-logout rejection. Workerd tests validate the MCP 2025-11-25 Streamable HTTP and OAuth paths; deployed MCP Inspector and ChatGPT validation remain intentionally unclaimed. The original 600,000-iteration PBKDF2 profile measured approximately 76–88 ms wall time locally but exceeded Cloudflare's hosted PBKDF2 iteration limit. Production verification of the compatible versioned 100,000-iteration profile is required whenever its parameters change.

`pnpm provision:cloudflare` fails before changing resources when Wrangler is unauthenticated. Authenticated validation created and then reused D1, applied the owner-auth migration, confirmed a repeat run had no pending migrations, deployed the Worker and its rate-limit binding, verified HTTPS setup status and HTTP rejection, and generated an authorized setup link. A subsequent audit found that a stale ignored deployment snapshot had removed an existing custom domain before it was manually restored. The provisioner now regenerates that snapshot from committed configuration on every run and uses Wrangler `--strict` to reject conflicting remote settings plus `--keep-vars` to preserve dashboard-managed variables. Regression tests cover the defensive command and stale-snapshot behavior; a deliberate remote conflict test remains unperformed because no disposable routed installation was authorized. The provisioner stores account-specific D1 identity only in ignored `.wrangler.production.jsonc`; upstream `wrangler.jsonc` omits `database_id` so Cloudflare can automatically provision the resource. Tests reject the former zero-UUID placeholder as invalid. The installing owner, not automated validation, chooses the real username and password.

Cloudflare's Vite plugin intentionally copies the active `.dev.vars` into the ignored Worker output for `vite preview`; that file is not deployed. Do not archive or share the complete `dist/` directory. `pnpm build` now checks that no local secret value entered `dist/client`, which is the browser-visible artifact.
