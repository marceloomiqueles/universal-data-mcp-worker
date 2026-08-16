# GAP-004: Remaining Implementation Choices and Real Platform Behavior

- Status: Open
- Source: `AGENTS.md`

## Unknowns

- Concrete libraries for MCP and retry.
- Worker/MCP transport and runtime compatibility under `workerd` and deployed Workers.
- Whether concurrent sync requires locking/coalescing.
- D1 migration runner atomicity, duration, and recovery.
- Garmin and Cloudflare limits that affect design.

## Why It Does Not Block Now

The scaffold now validates the one-root pnpm/Vite/Worker build, SPA framework, UI framework, and route precedence locally. Product runtime mechanisms still require evidence from their first real consumers.

## Evidence Needed to Close

- Bounded disposable spikes.
- Current official MCP and Cloudflare documentation.
- CPU, duration, request, D1, and bundle measurements.
- Concurrency, partial-failure, and retry tests on the first Garmin flow.
- Explicit comparison of maintained Worker-compatible alternatives.

## Evidence Collected

The 2026-08-15 pre-scaffolding audit confirmed that Cloudflare currently supports a Vite-native Worker development/build path, integrated static SPA assets, SPA fallback, and explicit Worker-first route patterns. ADR-0007 selected that mechanism and the one-root project shape. This does not select exact dependency versions or validate MCP, migration-at-activation, or concurrency behavior.

The initial scaffold subsequently established and locked mutually compatible versions for Node, pnpm, Vue, Vuetify, Vue Router, Vite, TypeScript, the Cloudflare Vite plugin, Wrangler, and Worker types. Vitest, ESLint, TypeScript-ESLint, eslint-plugin-vue, and Prettier are operational. Local development and built Worker preview both demonstrated that `/` and `/status` use the SPA while `/api/*` and `/mcp/*` reach the Worker first. These results close the version, test-tooling, lint/format-tooling, and basic static-routing portions of this gap; they do not validate MCP protocol behavior or production deployment.

The scaffold-hardening follow-up added regression coverage for exact, nested, trailing-slash, query-string, and near-prefix Worker routes; reused production Vue Router definitions in Admin tests; verified Vuetify responsive navigation behavior; and added separate static typecheck projects for Admin and Worker tests. These findings are resolved without changing the remaining MCP, persistence, sync, provider, or production-deployment gaps.

The owner-session backend selected no runtime auth framework. It uses Workers Web Crypto for PBKDF2-HMAC-SHA-256 password verification, cryptographic random session tokens, and SHA-256 token digests; D1 stores the singleton owner and revocable sessions. The official Cloudflare Workers Vitest integration 0.21.3 applies the real migration and validates the API under workerd. Atomic concurrent setup, expiration, logout, origin checks, default Admin API protection, and unchanged MCP routing are covered.

The 600,000-iteration PBKDF2 operation measured approximately 76–88 ms wall time in the local built Worker preview. Actual production CPU accounting and free-tier compatibility remain unvalidated and must be measured before claiming production readiness. A native Cloudflare Rate Limiting binding now prevents each source address from triggering unbounded password verification, returns a generic `429`, and recovers automatically after its 60-second window. The binding is permissive and location-local by platform design; deployed behavior remains to be measured. Wrangler migrations were validated on an empty local database and through repeated test application; automatic startup/deploy and integration-activation migration behavior remains open.

The first-run contract transports the bootstrap proof separately from account data. The installation context supplies a `/login#bootstrap=<proof>` URL; fragments stay out of the initial HTTP request, and the SPA erases the fragment immediately and submits the in-memory proof through `X-Owner-Bootstrap-Proof`. The implemented Admin UI validates setup/login input, restores authenticated sessions without exposing protected content while state is unknown, supports logout, and uses the production router for navigation UX. Local development now has a committed secret template and a tested, repeatable `pnpm setup:local` flow that creates or preserves the ignored secret, applies pending local D1 migrations, and prints the complete URL only after migration success. Producing the link automatically for a real deployment remains unimplemented.

Non-loopback Admin API requests over HTTP are now rejected before auth behavior, and HTTPS responses retain secure cookies. A real Cloudflare deployment must still validate edge-level HTTP-to-HTTPS enforcement; this repository does not claim that production evidence.

## Constraint While Open

Do not select dependencies for convenience or add infrastructure without demonstrated need. Justify every dependency by problem, compatibility, bundle, maintenance, and security.
