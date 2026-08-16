# universal-data-mcp-worker

A public-source, privacy-first, self-hosted project whose first real use case is connecting Garmin Connect data to ChatGPT through MCP.

```text
Garmin Connect → Cloudflare Worker → D1 where appropriate → MCP → ChatGPT
```

## Current Status

The project has an initial deployable scaffold, single-owner Admin authentication, a compiled integration registry, and a read-only MCP server. One Cloudflare Worker serves the Vue/Vuetify Admin SPA, authenticated Admin API, and an OAuth-protected MCP 2025-11-25 Streamable HTTP endpoint. The `list_integrations` tool reports the real compiled registry. Garmin remains registered but not configured. Shopify can be configured, verified, and synchronized on demand through the Admin Web, then queried from persisted D1 inventory through the `get_inventory` MCP tool. A real Cloudflare deployment and ChatGPT Work have validated that complete path.

The current foundation proves the single-deployment build and routing model without prematurely inventing product contracts.

Because this is a public repository, examples, fixtures, logs, and documents must never contain real credentials, tokens, or personal data.

## Goal

Demonstrate a complete self-hosted flow that a person can deploy in their own Cloudflare account, connect to Garmin, and use from ChatGPT through standard MCP.

Target experience:

```text
Deploy → Admin Web → authenticate → connect Garmin → activate
→ bootstrap/sync → connect MCP to ChatGPT → converse
```

The operational goal is additional infrastructure cost close to `$0` for reasonable personal use within the Cloudflare free tier, with remote telemetry disabled by default and no code changes required for installation or operation.

## Agreed Stack

- TypeScript end to end.
- Cloudflare Workers.
- Cloudflare D1 where appropriate.
- Standard MCP.
- Admin Web SPA with Vue 3, TypeScript, Vuetify, and Vue Router.
- One pnpm root project built with Vite and the official Cloudflare Vite integration.
- ChatGPT as the first client targeted for end-to-end validation.

## Principles

- Shared behavior lives in core; specific behavior lives in the integration's vertical slice.
- Reuse mechanisms, not models.
- Garmin is the first real case, not a universal core model.
- Prefer standard, simple solutions compatible with Workers and the free tier.
- Do not anticipate a plugin framework, universal schema, or enterprise infrastructure.
- Decide with evidence; record unknowns as gaps.
- Use ordinary Vue composition/local state before adding Pinia.
- Do not incorporate Vuexy source or protected assets.

## Current Scope

This repository contains a working infrastructure scaffold and a validated minimal MCP connectivity surface. It does not provide usable Garmin data yet.

Without explicit agreement, the scope excludes multi-tenancy, enterprise RBAC, billing, fictional verticals, a plugin marketplace, dynamic code loading, a universal sports model, forecasting, ML, BI, and speculative infrastructure.

## Development Setup

Requirements:

- Node.js 22.13 or newer;
- pnpm 11.22.0 or a compatible pnpm 11 release.

Install dependencies, prepare local configuration and D1, and start the Cloudflare/Vite development environment:

```sh
pnpm install
pnpm setup:local
pnpm dev
```

`pnpm setup:local` performs the complete non-destructive local preparation:

1. it uses Node's cryptographically secure random generator to create a 256-bit bootstrap proof in `.dev.vars` with mode `0600`, or preserves an existing valid file;
2. it applies every pending migration to the local D1 database through the `DB` binding;
3. after migrations succeed, it prints the authorized first-run URL:

```text
http://localhost:5173/login#bootstrap=<generated-proof>
```

The command is safe to repeat: Wrangler applies only pending migrations, the existing proof is not replaced, and existing owner/session rows are preserved. If `.dev.vars` exists but lacks a valid proof, setup stops without modifying the file. If the development server is already running or the URL is needed again, print it deterministically from the configured secret:

```sh
pnpm setup:url
```

Open that URL, choose the owner username and a password of at least 12 characters, confirm it, and select **Create account**. The URL fragment is not sent while loading the SPA. The SPA removes it immediately, keeps the proof only in memory, and submits it separately from account data. The browser receives an `HttpOnly` session cookie and opens the authenticated Admin shell.

The committed [`.dev.vars.example`](.dev.vars.example) uses Cloudflare's official local-secret convention and lists the required name without providing a usable value. Actual `.dev.vars` files are ignored. The backend accepts the proof only while no owner exists. If an owner already exists, rerunning local setup preserves that owner and the normal `/login` flow remains authoritative. After first-owner setup, the proof can be removed from local configuration; retain it only when a later explicit local auth reset is expected.

After setup, open the Admin Web normally and sign in with the owner username and password. Use **Sign out** in the application bar to invalidate the current session. See [TESTING.md](TESTING.md) for the validated API and UI behavior.

## Self-hosted Cloudflare provisioning

The repository includes a Wrangler-based provisioning command validated against a real Cloudflare Workers and D1 installation. Creating the first owner remains an explicit browser action by the installing owner.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/marceloomiqueles/universal-data-mcp-worker)

The button targets the public default branch. Its D1 automatic-provisioning correction is published, but the complete clean-account flow is still **not yet validated**. A redirect to Cloudflare's dashboard alone is not installation evidence.

Cloudflare's native button can provision D1 and request a Worker secret, but it cannot generate the bootstrap proof and securely return the matching first-owner URL. When the button is enabled, the remaining owner interaction will be documented as a copy/paste flow rather than called one-click: generate one 43-character URL-safe value with a password manager, paste it once into Cloudflare's `OWNER_SETUP_TOKEN` field, retain it until deployment completes, and copy it into the clearly labeled setup-link placeholder supplied by the instructions. The user will not need to understand D1, bindings, Wrangler, migrations, or URL-fragment terminology.

The validated command-line path remains:

```sh
pnpm install
pnpm exec wrangler login
pnpm provision:cloudflare
```

Cloudflare Workers Builds stores its command settings in Cloudflare rather than `wrangler.jsonc`; Cloudflare does not currently honor Wrangler Custom Builds configuration for this purpose. A Git-connected production Worker must use these exact settings under **Settings > Build**:

```text
Root directory: /
Build command: pnpm build
Deploy command: pnpm deploy
Production branch: main
```

Workers Builds runs the build command once and then the deploy command once. `pnpm deploy` applies pending remote D1 migrations and performs the single Worker publication only after migration success. Do not use the default `npx wrangler deploy`: it bypasses the migration gate. The selected Workers Builds user token must retain the normal Worker deployment permissions and add account-level **D1 Edit** so Wrangler can apply migrations. A missing permission fails the build; migrations must never be skipped to make deployment pass. The corrected repository orchestration is validated locally against isolated D1 databases, but the effective production trigger remains unverified until these dashboard values and one real Git deployment are confirmed.

The provisioner authenticates through Wrangler, creates or reuses the deterministically named D1 database, writes its non-secret ID into ignored `.wrangler.production.jsonc`, configures per-installation login and OAuth rate-limit namespaces, builds the application, applies pending remote migrations, generates the temporary owner bootstrap proof, uploads it with `wrangler deploy --strict --keep-vars --secrets-file`, validates the HTTPS Admin API surface, and prints the authorized first-owner URL. Wrangler automatically provisions and preserves the project-owned `OAUTH_KV` binding. Every run regenerates the deployment file from committed `wrangler.jsonc` and carries forward only installer-owned D1 identity. Wrangler strict mode stops on conflicting remote settings instead of silently removing dashboard-managed routes or domains, while `--keep-vars` preserves dashboard-managed variables. The committed `wrangler.jsonc` omits account-specific resource IDs so they never enter Git.

The application runtime receives only logical bindings, including `DB`, `OAUTH_KV`, the two rate limiters, and `OWNER_SETUP_TOKEN`. It never receives Cloudflare account-management credentials or uses resource IDs directly.

Rerunning provisioning reuses a configured D1 database and applies only pending migrations. It never deletes the owner, sessions, Worker, or database. If remote Worker configuration differs materially from the installer-owned configuration, provisioning fails closed before Wrangler applies the code deployment; it does not silently adopt or delete unrelated routes, domains, or settings. If owner setup is incomplete, it rotates the temporary proof explicitly and prints the replacement URL. If the owner exists, it prints the normal login URL. A different database name is an advanced first-install option:

```sh
pnpm provision:cloudflare -- --database-name=my-installation-db
```

Do not change the database name after an installation is bound. See the [self-hosted provisioning runbook](docs/runbooks/cloudflare-self-hosted-installation.md) for behavior, security constraints, and validation evidence.

Installation evidence is tracked separately: local installation is validated; the CLI provisioner is implemented and validated against real Cloudflare; defensive re-run behavior is covered by regression tests but has not been exercised against a disposable remote custom domain; and the public Deploy to Cloudflare button is available but not yet clean-account validated.

### Current configuration

| Name | Purpose | Classification | Requirement | Local development | Production |
|---|---|---|---|---|---|
| `OWNER_SETUP_TOKEN` | Authorizes only the first owner creation | Secret | Required until the owner exists | Ignored `.dev.vars`; create with `pnpm setup:local` | Generated by `provision:cloudflare` and uploaded through a temporary `--secrets-file`; remove after setup when operationally convenient |
| `INTEGRATION_SECRETS_KEY` | Encrypts persisted integration credentials with AES-256-GCM | Secret | Required for Shopify configuration | Generated and preserved in ignored `.dev.vars` by `pnpm setup:local` | Generated once by `provision:cloudflare` when absent; it must be preserved and must never be silently replaced |
| `DB` | Stores the singleton owner verifier, revocable sessions, and encrypted Shopify connection state | D1 binding, not a secret | Required | Declared in `wrangler.jsonc`; local state persists under ignored `.wrangler/` | Bind to the deployment's real D1 database |
| `LOGIN_RATE_LIMITER` | Limits repeated login work per Cloudflare source address | Rate Limiting binding, not a secret | Required | Declared in `wrangler.jsonc` and emulated by the local runtime | Provisioner derives a stable namespace from the installation D1 ID; Cloudflare accepted the deployed binding |
| `MCP_OAUTH_RATE_LIMITER` | Bounds OAuth registration, token, and authorization traffic | Rate Limiting binding, not a secret | Required for MCP OAuth | Declared in `wrangler.jsonc` and emulated by the local runtime | Provisioner derives a separate stable namespace from the installation D1 ID |
| `OAUTH_KV` | Stores OAuth clients, grants, short-lived codes, and hashed token records managed by the Cloudflare OAuth provider | KV binding, not a secret | Required for MCP OAuth | Automatically backed by local Wrangler state | Automatically provisioned by Wrangler/Cloudflare and kept outside D1 |

`INTEGRATION_SECRETS_KEY` cannot be recovered from D1. Losing or changing it makes existing encrypted integration credentials unreadable; re-enter the affected Shopify configuration with the current key or disconnect it. Disconnect does not require decryption. Provisioning preserves an existing key by name and fails closed rather than knowingly rotating it over existing configuration; full key rotation is not implemented.

## MCP status

The Worker exposes standard MCP Streamable HTTP at `/mcp`, targeting the stable `2025-11-25` revision. It requires a separate OAuth 2.1 authorization-code flow with PKCE and the read-only `integrations:read` scope; the Admin browser cookie is not an MCP credential. The existing owner authenticates and explicitly authorizes the client through the same deployment.

`list_integrations` reads the shared compiled registry directly and returns only integration id, name, description, and setup status. It performs no writes and returns an empty collection normally when no integration is registered.

When Shopify is connected, `get_inventory` queries only the latest inventory persisted in D1; it never calls Shopify during an MCP request. It supports exact SKU, partial product-title and location filters, explicit in-stock/out-of-stock/low-stock semantics, an adjustable low-stock threshold, an opaque cursor, and a default limit of 25 with a maximum of 100 results. Each result contains only product, variant, SKU, tracking state, location, and available quantity. The response also reports the latest successful complete-sync timestamp so the client does not imply that quantities are live.

The read-only connection was validated on 2026-08-16 against real Cloudflare deployments and ChatGPT Work in developer mode. ChatGPT completed OAuth 2.1 with PKCE through the deployment owner, discovered `list_integrations`, selected it from an indirect data-source question, and correctly distinguished registered Garmin from accessible data while its status was `not_configured`. A disposable deployment with an empty compiled registry returned no integrations, and ChatGPT reported the empty state without inventing records. Owner revocation invalidated the connected ChatGPT credential, and a new authorization restored access. MCP Inspector independently validated initialization, tool discovery, and invocation against the canonical HTTPS deployment.

On the same date, the deployed Worker synchronized 18 real development-store products, 27 variants, 29 inventory levels, and 3 locations into D1, then ChatGPT discovered and naturally invoked `get_inventory`. It correctly answered out-of-stock, five-or-fewer, exact-SKU, and SKU-location questions from persisted data and reported the sync timestamp. This evidence covers only the two current read-only tools in ChatGPT Work developer mode; it does not claim Garmin data tools, write actions, other ChatGPT plans, or other MCP clients. Sanitized evidence is recorded in [the Shopify inventory MCP validation](docs/audits/2026-08-16-shopify-inventory-mcp-validation.md).

### Reset local owner authentication

To remove only the local owner and sessions while preserving the local schema and migration history:

```sh
pnpm auth:reset:local
```

This command is destructive to **local development auth state only**. It deletes the local owner credential and every local Admin session. It does not target a remote database. Create or retain a valid local bootstrap secret, run `pnpm setup:url`, and repeat first-owner setup afterward.

```text
Deploy → Admin Web → connect Garmin → sync → connect MCP → ChatGPT
```

## Privacy

- Each owner will operate a deployment in their own Cloudflare infrastructure.
- Remote telemetry will be disabled by default.
- Secrets will stay outside D1; persisted sensitive state will be encrypted where appropriate.
- Retention and purge follow the [architecture](ARCHITECTURE.md), including the open retention-value gap.
- When MCP capabilities are used, the necessary data is sent to the connected AI client. Self-hosted does not mean data never leaves for the client selected by the owner.

The project does not operate a centralized service and therefore does not publish a fictional SaaS privacy policy.

## Issues and Contributions

- [GitHub Issues](https://github.com/marceloomiqueles/universal-data-mcp-worker/issues)
- [Contributing guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Support](SUPPORT.md)

Never publish tokens, credentials, personal data, complete Garmin payloads, or unsanitized logs.

## Security

Do not report vulnerabilities through public issues. Use the verified GitHub Private Vulnerability Reporting channel described in [SECURITY.md](SECURITY.md).

## Licensing and Contributions

Protected versions are licensed under [Functional Source License 1.1 with the Apache License 2.0 Future License](LICENSE) (`FSL-1.1-ALv2`). FSL-protected versions are source-available, not OSI Open Source. Each version transitions to Apache-2.0 on the second anniversary of the date it was made available, under the license terms.

Contributors retain their copyright. Code contributions require the [Contributor License Agreement](CONTRIBUTOR_LICENSE_AGREEMENT.md), which grants explicit sublicensing and relicensing rights without copyright assignment. External code merges are currently blocked until acceptance can be recorded and enforced auditably. See [Contributing](CONTRIBUTING.md), [commercial information](COMMERCIAL.md), and the [legal/IP index](docs/legal/README.md).

## Support and Sponsorship

Support is best effort, and the project must remain fully functional without paid support. No commercial support or sponsorship channel is configured. See [SUPPORT.md](SUPPORT.md).

## Independence and Trademarks

This is an independent project. It is not affiliated with, endorsed by, or sponsored by Garmin, Garmin Connect, Cloudflare, OpenAI, or other integration providers. Names and trademarks belong to their respective owners. See the [trademark policy](TRADEMARKS.md).

## Documentation

- [Agreed architecture](ARCHITECTURE.md)
- [Documentation index](docs/index.md)
- [Architecture decisions](docs/adr/README.md)
- [Open gaps](docs/gaps/README.md)
- [Initial documentation audit](docs/audits/2026-08-15-initial-documentation-audit.md)
- [Security and privacy](docs/security/README.md)
- [Security policy](SECURITY.md)
- [Testing and validation](TESTING.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Legal and intellectual-property index](docs/legal/README.md)
- [Commercial information](COMMERCIAL.md)
- [Trademark policy](TRADEMARKS.md)
- [Changelog](CHANGELOG.md)
- [Operations and future runbooks](docs/runbooks/README.md)
- [Next design stage](docs/plans/next-architecture-detailing.md)
- [Agent instructions](AGENTS.md)
