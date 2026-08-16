# GAP-002: Garmin Surface, MCP, and ChatGPT Validation

- Status: Open
- Source: `AGENTS.md`

## Unknowns

- Final Garmin capabilities/tools.
- Exact schemas, filters, pagination, and limits.
- Priority datasets and real questions.
- Whether ChatGPT needs behavior beyond standard MCP.
- Actual portability to other MCP clients.

## Why It Does Not Block Now

Shared MCP runtime and slice ownership are decided. Useful tools depend on real Garmin data and validated conversations, not an anticipated taxonomy.

## Evidence Needed to Close

- Validated Garmin data inventory.
- Representative questions and measured response volume.
- End-to-end ChatGPT MCP validation.
- Reproducible protocol incompatibilities.

## Evidence Collected

The minimal shared runtime now implements stable MCP `2025-11-25` Streamable HTTP with the official TypeScript SDK's Web-standard transport. OAuth 2.1 authorization-code flow with PKCE is separate from the Admin cookie and is provided by Cloudflare's standard Worker OAuth package. Production-path workerd tests validate initialization, discovery, `list_integrations`, empty results, OAuth discovery/authorization/token/revocation, and route isolation. This evidence selects the initial runtime mechanism but does not validate ChatGPT itself or define future Garmin data tools.

## Constraint While Open

Do not document future Garmin tools, ChatGPT adapters, or data output schemas as final contracts. `list_integrations` is the bounded connectivity tool established by the first MCP slice.
