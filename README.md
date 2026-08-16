# universal-data-mcp-worker

A public-source, privacy-first, self-hosted project whose first real use case is connecting Garmin Connect data to ChatGPT through MCP.

```text
Garmin Connect → Cloudflare Worker → D1 where appropriate → MCP → ChatGPT
```

## Current Status

The project has an initial deployable scaffold and its first product slice. One Cloudflare Worker serves the Vue/Vuetify Admin SPA, a D1-backed single-owner Admin authentication API, and the reserved MCP boundary. First-run owner setup, login, server-managed session restoration, logout, and default Admin API protection are implemented and validated locally. Garmin integration and MCP protocol behavior are not implemented yet.

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
- ChatGPT as the first supported and validated client.

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

This repository contains a working infrastructure scaffold and the product direction. It does not provide usable Garmin or MCP functionality yet.

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

Cloudflare's native deployment flow forks the public repository, provisions and binds D1, runs the repository's remote migrations, configures Workers Builds, and deploys the Worker. During configuration, Cloudflare asks for `OWNER_SETUP_TOKEN`. This is the one unavoidable manual security step: use a password manager to generate and retain a URL-safe random value of at least 43 characters. Do not reuse an account password.

After deployment, Cloudflare shows the Worker URL. Open:

```text
https://<worker-host>/login#bootstrap=<OWNER_SETUP_TOKEN>
```

Create the owner account, then discard the copied bootstrap value. Cloudflare currently cannot generate a secret and securely return it as a post-deploy URL fragment, so the button flow is not yet one-click. The [deployment runbook](docs/runbooks/cloudflare-self-hosted-installation.md) describes both this browser flow and the fully automated Wrangler alternative.

The validated command-line path remains:

```sh
pnpm install
pnpm exec wrangler login
pnpm provision:cloudflare
```

The provisioner authenticates through Wrangler, creates or reuses the deterministically named D1 database, writes its non-secret ID into ignored `.wrangler.production.jsonc`, configures a per-installation rate-limit namespace, builds the application, applies pending remote migrations, generates the temporary owner bootstrap proof, uploads it with `wrangler deploy --secrets-file`, validates the HTTPS Admin API surface, and prints the authorized first-owner URL. The committed `wrangler.jsonc` intentionally retains a draft zero UUID so account-specific IDs never enter Git.

The application runtime receives only the logical `DB`, `LOGIN_RATE_LIMITER`, and `OWNER_SETUP_TOKEN` bindings. It never receives Cloudflare account-management credentials or uses a D1 resource ID directly.

Rerunning provisioning reuses a configured D1 database and applies only pending migrations. It never deletes the owner, sessions, Worker, or database. If owner setup is incomplete, it rotates the temporary proof explicitly and prints the replacement URL. If the owner exists, it prints the normal login URL. A different database name is an advanced first-install option:

```sh
pnpm provision:cloudflare -- --database-name=my-installation-db
```

Do not change the database name after an installation is bound. See the [self-hosted provisioning runbook](docs/runbooks/cloudflare-self-hosted-installation.md) for behavior, security constraints, and validation evidence.

### Current configuration

| Name | Purpose | Classification | Requirement | Local development | Production |
|---|---|---|---|---|---|
| `OWNER_SETUP_TOKEN` | Authorizes only the first owner creation | Secret | Required until the owner exists | Ignored `.dev.vars`; create with `pnpm setup:local` | Generated by `provision:cloudflare` and uploaded through a temporary `--secrets-file`; remove after setup when operationally convenient |
| `DB` | Stores the singleton owner verifier and revocable session digests | D1 binding, not a secret | Required | Declared in `wrangler.jsonc`; local state persists under ignored `.wrangler/` | Bind to the deployment's real D1 database |
| `LOGIN_RATE_LIMITER` | Limits repeated login work per Cloudflare source address | Rate Limiting binding, not a secret | Required | Declared in `wrangler.jsonc` and emulated by the local runtime | Provisioner derives a stable namespace from the installation D1 ID; Cloudflare accepted the deployed binding |

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
