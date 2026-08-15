# GAP-004: Remaining Implementation Choices and Real Platform Behavior

- Status: Open
- Source: `AGENTS.md`

## Unknowns

- Concrete libraries for MCP, Worker routing, validation, auth, hashing, and retry.
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

## Constraint While Open

Do not select dependencies for convenience or add infrastructure without demonstrated need. Justify every dependency by problem, compatibility, bundle, maintenance, and security.
