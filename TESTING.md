# Testing and Validation

The project uses Vitest for Vue rendering tests and Cloudflare's official Workers Vitest integration for authentication, D1 migration, and route-boundary tests under workerd. It does not enforce a coverage percentage.

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

The Admin tests use the production Vue Router and session code. They verify first-run setup, bootstrap-fragment removal and separate proof transport, missing-proof/configuration guidance, password confirmation, normal login, generic login failure, session restoration, protected navigation UX, loading without authenticated-content flash, logout, unavailable-API feedback, not-found behavior, and responsive navigation. Worker tests apply the real D1 migration and verify first setup, missing/valid/invalid setup configuration, atomic singleton races, password verification, native rate-limit decisions, digest-only sessions, cookie attributes, expiration and bounded cleanup, logout, CSRF origin checks, the HTTPS invariant, default `/api/*` protection, unchanged `/mcp/*`, and SPA asset delegation.

`pnpm typecheck` uses separate Admin-test and Worker-test TypeScript projects. Each project includes its runtime source and related tests without mixing DOM types into Worker code or Worker types into Admin code.

For local validation, let the repository script create or preserve the ignored secret and apply pending local D1 migrations, then start development:

```sh
pnpm setup:local
pnpm dev
```

The script prints the authorized URL only after migrations succeed. It is safe to rerun: existing valid configuration and owner/session data remain unchanged, while Wrangler applies only pending migrations. Use `pnpm setup:url` to print the URL again from an existing `.dev.vars`. Vite uses fixed local port `5173` and fails rather than silently changing the setup URL when that port is occupied.

The Node setup-tool tests verify 256-bit Base64URL generation, private file permissions, repeat preservation, refusal to overwrite invalid configuration, the exact bootstrap-fragment contract, migration-before-URL ordering, and the deliberately unusable committed example.

The backend endpoints are:

```text
GET  /api/auth/setup-status
POST /api/auth/setup
POST /api/auth/login
GET  /api/auth/session
POST /api/auth/logout
```

All POST requests require `Content-Type: application/json` and an `Origin` exactly matching the Worker origin. Setup JSON contains only `username` and `password`; password confirmation remains a client responsibility. Authorization is supplied separately through the `X-Owner-Bootstrap-Proof` header. The SPA obtains that proof from `/login#bootstrap=<proof>`, removes the fragment immediately, keeps it only in memory, and never represents it as account data. Remove the setup secret after the owner is created.

The login endpoint uses the configured Cloudflare Rate Limiting binding before expensive password verification. It permits five attempts per 60-second window per Cloudflare source address, returns generic `429` JSON with `Retry-After: 60`, and recovers automatically without persisted account lockout. Cloudflare documents this mechanism as permissive and location-local, so it mitigates ordinary guessing and computational abuse but is not an exact accounting boundary.

Local HTTP is accepted only on loopback hostnames. Non-loopback Admin API requests over HTTP return `426 HTTPS_REQUIRED`; HTTPS requests retain `Secure` cookies. Production Cloudflare routing is still unvalidated and must enforce visitor HTTPS independently.

To reset only local owner/session state while preserving migrations, run `pnpm auth:reset:local`. This deletes the local owner and all local sessions. Never adapt that local reset command to a production database without a separately reviewed operational procedure.

Local preview validation has confirmed setup status, first setup, current session, authenticated Admin API access, logout, post-logout rejection, and unchanged MCP boundary behavior. PBKDF2 login measured approximately 76–88 ms wall time in local workerd. This is not production CPU evidence.

Cloudflare deployment remains unvalidated and no deployment script is documented yet. The zero UUID in `wrangler.jsonc` is a local-development placeholder and must be replaced with the actual D1 database identifier before deployment.
