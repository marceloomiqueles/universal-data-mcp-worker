# universal-data-mcp-worker

A public-source, privacy-first, self-hosted project whose first real use case is connecting Garmin Connect data to ChatGPT through MCP.

```text
Garmin Connect → Cloudflare Worker → D1 where appropriate → MCP → ChatGPT
```

## Current Status

The project is in its documentation and architectural design phase. There is no application, deployable Worker, Garmin integration, Admin Web, MCP endpoint, D1 schema, migration, installation command, or test command yet.

The current foundation preserves architectural decisions and explicit gaps so that component and dependency design can proceed without prematurely inventing contracts.

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

This repository documents the product direction and prepares its technical design. It does not provide usable functionality yet.

Without explicit agreement, the scope excludes multi-tenancy, enterprise RBAC, billing, fictional verticals, a plugin marketplace, dynamic code loading, a universal sports model, forecasting, ML, BI, and speculative infrastructure.

## Requirements, Installation, and Configuration

There is no installable artifact, application dependency set, or executable configuration yet. Consequently, there are no official setup or deployment commands.

Once implemented and verified, this section will link to reproducible guidance for:

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
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Legal and intellectual-property index](docs/legal/README.md)
- [Commercial information](COMMERCIAL.md)
- [Trademark policy](TRADEMARKS.md)
- [Changelog](CHANGELOG.md)
- [Operations and future runbooks](docs/runbooks/README.md)
- [Next design stage](docs/plans/next-architecture-detailing.md)
- [Agent instructions](AGENTS.md)
