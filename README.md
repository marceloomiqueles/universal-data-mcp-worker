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

Install dependencies, create an ignored local bootstrap secret, apply the local D1 migration, and start the Cloudflare/Vite development environment:

```sh
pnpm install
pnpm setup:local
pnpm exec wrangler d1 migrations apply DB --local
pnpm dev
```

`pnpm setup:local` uses Node's cryptographically secure random generator to create `.dev.vars` with mode `0600`. It refuses to overwrite an existing file and prints the authorized first-run URL:

```text
http://localhost:5173/login#bootstrap=<generated-proof>
```

If the development server is already running or the URL is needed again, print it deterministically from the configured secret:

```sh
pnpm setup:url
```

Open that URL, choose the owner username and a password of at least 12 characters, confirm it, and select **Create account**. The URL fragment is not sent while loading the SPA. The SPA removes it immediately, keeps the proof only in memory, and submits it separately from account data. The browser receives an `HttpOnly` session cookie and opens the authenticated Admin shell.

The committed [`.dev.vars.example`](.dev.vars.example) lists the required local secret without providing a usable value. Actual `.dev.vars` files are ignored. The backend accepts the proof only while no owner exists. After setup, the proof can and should be removed from local or production secret configuration; use `pnpm setup:url` before removing it if the authorized URL is still needed.

After setup, open the Admin Web normally and sign in with the owner username and password. Use **Sign out** in the application bar to invalidate the current session. See [TESTING.md](TESTING.md) for the validated API and UI behavior.

There is no end-user deployment guide because production deployment and the complete product flow have not been validated. A real Cloudflare deployment must replace the placeholder D1 identifier, apply migrations, generate one high-entropy proof, configure it with `pnpm exec wrangler secret put OWNER_SETUP_TOKEN`, and provide the owner with `https://<deployment>/login#bootstrap=<proof>`. Generate a suitable value with the tested command below; do not invent one manually or put it in a query string, `VITE_*` variable, or ordinary Wrangler variable.

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64url'))"
```

Non-loopback Admin API traffic is rejected unless it uses HTTPS. Cloudflare's edge must also be configured to redirect visitor HTTP traffic to HTTPS before production use. This configuration has not been validated on a deployed instance. Automated generation and presentation of the production setup link remain deployment gaps.

### Current configuration

| Name | Purpose | Classification | Requirement | Local development | Production |
|---|---|---|---|---|---|
| `OWNER_SETUP_TOKEN` | Authorizes only the first owner creation | Secret | Required until the owner exists | Ignored `.dev.vars`; create with `pnpm setup:local` | Cloudflare secret via `wrangler secret put`; remove after setup |
| `DB` | Stores the singleton owner verifier and revocable session digests | D1 binding, not a secret | Required | Declared in `wrangler.jsonc`; local state persists under ignored `.wrangler/` | Bind to the deployment's real D1 database |
| `LOGIN_RATE_LIMITER` | Limits repeated login work per Cloudflare source address | Rate Limiting binding, not a secret | Required | Declared in `wrangler.jsonc` and emulated by the local runtime | Declared in `wrangler.jsonc`; verify on the deployed Worker |

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
