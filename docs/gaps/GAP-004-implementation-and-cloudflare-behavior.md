# GAP-004: Remaining Implementation Choices and Real Platform Behavior

- Status: Open
- Source: `AGENTS.md`

## Unknowns

- Concrete libraries for MCP and retry.
- Worker/MCP transport and runtime compatibility under `workerd` and deployed Workers.
- Whether concurrent sync requires locking/coalescing.
- D1 migration runner atomicity, duration, and recovery.
- Garmin and Cloudflare limits that affect design.
- Clean-account validation of Deploy to Cloudflare from the public default branch.
- Real remote evidence that defensive provisioning rejects an unmanaged route/domain conflict without changing it.

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

The originally selected 600,000-iteration PBKDF2 profile measured approximately 76–88 ms wall time in local workerd but failed in Cloudflare production with `NotSupportedError`: the hosted runtime limits PBKDF2 to 100,000 iterations. New verifiers therefore use a versioned 100,000-iteration PBKDF2-HMAC-SHA-256 profile with a unique salt. This is below the current OWASP PBKDF2-SHA-256 recommendation and remains an explicit security gap until a stronger standard password-hashing mechanism is shown compatible with Workers and the free-tier objective. A native Cloudflare Rate Limiting binding bounds online password verification, returns a generic `429`, and recovers automatically after its 60-second window. The binding is permissive and location-local by platform design; deployed behavior remains to be measured. Wrangler migrations were validated locally and against remote D1; automatic startup/deploy and integration-activation migration behavior remains open.

The first-run contract transports the bootstrap proof separately from account data. The installation context supplies a `/login#bootstrap=<proof>` URL; fragments stay out of the initial HTTP request, and the SPA erases the fragment immediately and submits the in-memory proof through `X-Owner-Bootstrap-Proof`. The implemented Admin UI validates setup/login input, restores authenticated sessions without exposing protected content while state is unknown, supports logout, and uses the production router for navigation UX. Local development now has a committed secret template and a tested, repeatable `pnpm setup:local` flow that creates or preserves the ignored secret, applies pending local D1 migrations, and prints the complete URL only after migration success. The self-hosted provisioner now implements and has validated the equivalent remote D1, migration, secret, deployment, and setup-link flow through Wrangler. The installer deliberately leaves owner credential creation to the owner in the browser.

Non-loopback Admin API requests over HTTP are now rejected before auth behavior, and HTTPS responses retain secure cookies. A real `workers.dev` deployment validated HTTPS setup status and an HTTP `426 HTTPS_REQUIRED` response from the Admin API. This closes the production transport check while owner-driven browser setup remains an installation action rather than automated provisioning.

The installation audit found that an ignored stale Wrangler configuration removed a dashboard-managed custom domain during a provisioning re-run. The provisioner now regenerates its configuration from committed inputs, carries forward only installer-owned D1 identity, and deploys with Wrangler `--strict` plus `--keep-vars`. Unit regression coverage verifies those invariants. After the installation branch reached the default branch, the first native deployment attempt proved that a zero UUID is treated as a real missing D1 resource rather than an automatic-provisioning placeholder. The public template now omits `database_id`, following Cloudflare's supported provisioning contract, and regression tests reject the former placeholder. The public Deploy to Cloudflare button is available from the README so the corrected default-branch flow can be exercised, but it remains explicitly unvalidated until a clean-account deployment succeeds. A disposable remote conflict test and the public button flow are evidence gaps, not reasons to weaken the fail-closed behavior.

The first MCP consumer selected `@modelcontextprotocol/sdk` 1.30.0 and its Web-standard Streamable HTTP transport after workerd compatibility validation. It also selected `@cloudflare/workers-oauth-provider` 0.10.3 for standard OAuth 2.1/PKCE token lifecycle in one Worker and one KV namespace. Local production-path tests validate both libraries without `nodejs_compat`. A real Cloudflare deployment subsequently passed MCP Inspector OAuth, discovery, and invocation and ChatGPT Work developer-mode CIMD/PKCE authorization, discovery, natural tool selection, and response interpretation. Validation identified and corrected two browser integration details: the consent CSP now permits only the provider-validated callback origin, and restored Admin sessions resume the authorization endpoint through a full browser navigation rather than Vue Router. Custom-domain and `workers.dev` audiences remain intentionally distinct; a client must use one canonical MCP origin throughout its OAuth flow.

## Constraint While Open

Do not select dependencies for convenience or add infrastructure without demonstrated need. Justify every dependency by problem, compatibility, bundle, maintenance, and security.
