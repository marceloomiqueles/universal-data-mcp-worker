# GAP-002: Garmin Surface, MCP, and ChatGPT Validation

- Status: Open
- Source: `AGENTS.md`

## Unknowns

- Final Garmin capabilities/tools.
- Exact schemas, filters, pagination, and limits.
- Priority datasets and real questions.
- Whether future Garmin tools expose any ChatGPT behavior that standard MCP does not satisfy.
- Actual portability to other MCP clients.

## Why It Does Not Block Now

Shared MCP runtime and slice ownership are decided. Useful tools depend on real Garmin data and validated conversations, not an anticipated taxonomy.

## Evidence Needed to Close

- Validated Garmin data inventory.
- Representative questions and measured response volume.
- End-to-end ChatGPT validation with real Garmin data tools and representative questions.
- Reproducible protocol incompatibilities.

## Evidence Collected

The minimal shared runtime implements stable MCP `2025-11-25` Streamable HTTP with the official TypeScript SDK's Web-standard transport. OAuth 2.1 authorization-code flow with PKCE is separate from the Admin cookie and is provided by Cloudflare's standard Worker OAuth package. Production-path workerd tests validate initialization, discovery, `list_integrations`, empty results, OAuth discovery/authorization/token/revocation, and route isolation.

On 2026-08-16, MCP Inspector independently completed authorization, discovery, and `list_integrations` invocation against the real Cloudflare deployment. ChatGPT Work in developer mode then connected through CIMD and PKCE, discovered the read-only tool, selected it from an indirect data-source question, and accurately reported Garmin as registered and `not_configured`. A disposable deployment with an empty compiled registry demonstrated that ChatGPT reports a successful empty result without inventing integrations. Owner grant revocation invalidated the existing ChatGPT connection, and a new authorization restored tool use. This closes the minimal connectivity, empty-result, and revocation lifecycle questions. The gap remains open for real Garmin data inventory, Garmin-specific tools, representative data conversations, and portability to other clients.

## Constraint While Open

Do not document future Garmin tools, ChatGPT adapters, or data output schemas as final contracts. `list_integrations` is the bounded connectivity tool established by the first MCP slice.
