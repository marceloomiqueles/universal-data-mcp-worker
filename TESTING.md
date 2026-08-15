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

The Admin tests use the production Vue Router definitions and verify the scaffold views and responsive navigation. Worker tests apply the real D1 migration and verify first setup, setup authorization, atomic singleton races, password verification, digest-only sessions, cookie attributes, expiration, logout, CSRF origin checks, default `/api/*` protection, unchanged `/mcp/*`, and SPA asset delegation.

`pnpm typecheck` uses separate Admin-test and Worker-test TypeScript projects. Each project includes its runtime source and related tests without mixing DOM types into Worker code or Worker types into Admin code.

For local backend validation, create an ignored `.dev.vars` with a random `OWNER_SETUP_TOKEN` of at least 32 characters, then apply the migration before starting development:

```sh
pnpm exec wrangler d1 migrations apply DB --local
pnpm dev
```

The backend endpoints are:

```text
GET  /api/auth/setup-status
POST /api/auth/setup
POST /api/auth/login
GET  /api/auth/session
POST /api/auth/logout
```

All POST requests require `Content-Type: application/json` and an `Origin` exactly matching the Worker origin. Setup JSON contains only `username` and `password`; password confirmation remains a client responsibility. Authorization is supplied separately through the `X-Owner-Bootstrap-Proof` header. The future SPA obtains that proof from `/login#bootstrap=<proof>`, removes the fragment, and keeps it only in memory. Remove the setup secret after the owner is created. The current UI does not submit these operations yet.

Local preview validation has confirmed setup status, first setup, current session, authenticated Admin API access, logout, post-logout rejection, and unchanged MCP boundary behavior. PBKDF2 login measured approximately 76–88 ms wall time in local workerd. This is not production CPU evidence.

Cloudflare deployment remains unvalidated and no deployment script is documented yet. The zero UUID in `wrangler.jsonc` is a local-development placeholder and must be replaced with the actual D1 database identifier before deployment.
