# Minimal MCP and ChatGPT Connectivity Audit

- Date: 2026-08-16
- Repository: `marceloomiqueles/universal-data-mcp-worker`
- Audited revision: `9ea5af2001d32c4c4d0ca7ab2fc24c50c2611f6d`
- Branch: `13-implement-minimal-read-only-mcp-and-chatgpt-connectivity`
- Method: independent read-only source, test, build, deployment, and recorded-evidence review

## Scope

This audit evaluates the completed Minimal Read-Only MCP and ChatGPT Connectivity slice. It verifies the MCP protocol and transport, OAuth boundary, tool design, Cloudflare runtime behavior, real ChatGPT evidence, regressions, and scope discipline. It does not evaluate future Garmin data access or implement fixes.

The protocol assessment used the current official [MCP 2025-11-25 transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), and [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) specifications. The ChatGPT assessment used the current official [OpenAI connection guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt/) and the validation evidence recorded during this slice.

## Executive Summary

The project now has a minimal, standards-based remote MCP surface at `/mcp`. It uses MCP `2025-11-25`, the official TypeScript SDK's Web-standard Streamable HTTP transport, and a separate OAuth 2.1 authorization-code flow with PKCE. The implementation exposes exactly one read-only tool, `list_integrations`, and maps the real compiled registry without calling the Admin API or embedding Garmin data in the MCP adapter.

The deployed endpoint at `https://manhattan.paperco.de/mcp` was validated with MCP Inspector and with ChatGPT Work developer mode. Recorded interactive evidence shows successful owner authorization, tool discovery, natural selection of `list_integrations`, and a truthful interpretation of Garmin as registered and not configured. A fresh external smoke check during this audit confirmed the deployed Bearer challenge, protected-resource metadata, authorization-server metadata, HTTPS endpoint, and unaffected SPA route.

No P0 or P1 finding was identified. Two P2 validation/coverage gaps and one P3 documentation inconsistency remain. They do not block the next MVP slice.

## Implementation Evidence

### Protocol and transport

- `src/worker/mcp/server.ts` creates `McpServer` from `@modelcontextprotocol/sdk` 1.30.0 and uses `WebStandardStreamableHTTPServerTransport`.
- The transport is stateless (`sessionIdGenerator: undefined`) and returns JSON for the current synchronous request/response workload.
- `/mcp` remains the single protocol endpoint. Worker-first routing covers `/mcp` and `/mcp/*`; OAuth discovery and authorization routes are explicit and do not turn the Admin API into the MCP endpoint.
- Initialization negotiates `2025-11-25` and advertises only the tools capability.
- The request layer enforces non-loopback HTTPS, validates every present Origin against the endpoint origin, bounds bodies to 64 KiB before parsing, and sanitizes internal failures.
- The official SDK handles JSON-RPC parsing, unsupported protocol versions, tool dispatch, and standard tool errors.
- The production Worker build completed without `nodejs_compat` or authored `node:` runtime imports. The built Worker was approximately 886.59 kB uncompressed and 189.53 kB gzip. Workerd emitted only missing upstream source-map warnings.

### Authentication and security

- MCP authentication is separate from Admin authentication. An Admin cookie alone receives `401` at `/mcp`, and an MCP bearer token does not authorize `/api/integrations`.
- `@cloudflare/workers-oauth-provider` 0.10.3 supplies OAuth 2.1 authorization code, PKCE `S256`, discovery, client registration, token validation, refresh, and revocation storage in `OAUTH_KV`.
- The only granted scope is `integrations:read`; token props are checked again before MCP dispatch.
- The singleton owner authenticates and gives explicit consent at `/api/mcp/oauth/authorize`. Approval preserves the existing `HttpOnly`, `SameSite=Strict`, `/api`-scoped Admin session boundary.
- Present cross-origin MCP requests and present external approval origins are rejected. The consent response uses `no-store`, `Referrer-Policy: no-referrer`, a restrictive CSP, `frame-ancestors 'none'`, and a provider-validated callback origin.
- The owner can revoke MCP grants through the authenticated Admin API. Automated tests show an access token works before revocation and is rejected afterward.
- Source logging records only error class, method, and pathname for an unexpected MCP failure. It does not log authorization headers, cookies, tokens, PKCE values, or request bodies.
- OAuth state is provider-owned KV data, not D1 or browser application state. No OAuth or MCP credential is bundled into the Admin SPA.

The authorization form accepts `Origin: null` only after successful owner-session authentication. This is justified by observed browser behavior in the real OAuth callback flow and remains bounded by the host-only `SameSite=Strict` cookie, CSP frame restriction, validated OAuth request, and provider-validated redirect URI. Tests reject a present external origin.

### Tool design and project boundaries

Exactly one tool is registered:

```text
list_integrations
```

Its name and description clearly identify the current question it answers. Its input is a strict empty object. Its bounded output includes only `id`, `name`, `description`, and `status`, with read-only, non-destructive, closed-world annotations. Empty registries return an empty array and a truthful text fallback rather than an MCP error.

The tool receives the shared `IntegrationRegistry` directly. Garmin metadata remains in `src/integrations/garmin/descriptor.ts`; the MCP adapter contains no Garmin constants and does not call `/api/integrations`. No resource, prompt, write tool, source provider, synchronization behavior, generic domain model, plugin system, or additional MCP framework was introduced.

## ChatGPT and Deployment Evidence

The evidence categories are distinct:

| Evidence                     | Result                                                                                                                                                                                                                                                                |
|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Local/workerd protocol tests | Passed initialization, discovery, invocation, real and empty registries, OAuth isolation/revocation, malformed input, version, Origin, HTTPS, and size checks.                                                                                                        |
| Deployed MCP Inspector       | OAuth completed against the real HTTPS Worker; Inspector discovered exactly `list_integrations` and invoked it successfully.                                                                                                                                          |
| Real ChatGPT tool discovery  | ChatGPT Work developer mode completed CIMD/PKCE authorization against the deployment and connected the MCP app. The recorded validation states the tool scan discovered the same read-only tool.                                                                      |
| Real ChatGPT invocation      | A fresh natural-language request, “What integrations are available in my self-hosted data server?”, selected the MCP app and produced the exact project truth: Garmin is available and `not_configured`. Contemporaneous Cloudflare traffic showed MCP POST activity. |

The ChatGPT evidence is stronger than an Inspector-only result: it includes a real client authorization flow and a natural-language invocation whose answer matches the tool's unique structured output. The server correctly avoids logging full tool payloads, so the Cloudflare log alone does not name the tool; the recorded ChatGPT UI result supplies the client-side correlation.

The deployed composition had no legitimate empty registry, so empty-output interpretation was not exercised in ChatGPT. It is covered by the production MCP server path with an injected empty registry. Owner revocation is covered under workerd but was not exercised through a connected ChatGPT session followed by reauthorization.

An external audit smoke check returned:

- `401` for an unauthenticated deployed `POST /mcp` initialization request;
- a Bearer challenge pointing to the correct protected-resource metadata and `integrations:read` scope;
- correct HTTPS resource and authorization-server metadata at the canonical custom-domain origin;
- `200 text/html` for `/status`, confirming the SPA remains independently available.

## Regression Validation

The complete repository validation was executed at the audited revision:

| Command                          | Result                                                                      |
|----------------------------------|-----------------------------------------------------------------------------|
| `pnpm install --frozen-lockfile` | Passed; lockfile already current.                                           |
| `pnpm typecheck`                 | Passed.                                                                     |
| `pnpm lint`                      | Passed.                                                                     |
| `pnpm format:check`              | Passed.                                                                     |
| `pnpm test`                      | Passed: 21 Node tooling tests, 23 Admin tests, and 34 workerd Worker tests. |
| `pnpm build`                     | Passed, including the browser secret inspection.                            |

The production-path suites retain owner setup, login, session restoration, logout, Admin API authorization, integration listing, HTTPS, login rate limiting, SPA routing, and MCP/Admin credential isolation. Source and diff inspection found no Shopify behavior, Garmin provider or data access, source synchronization, generic MCP/domain framework, or unrelated product functionality.

## Findings

### P0

None.

### P1

None.

### P2-1 — The accepted protocol and OAuth regression matrix is incomplete

The current tests cover the primary production lifecycle and important failure paths, but they do not explicitly exercise every behavior required by issue #13. Missing explicit regression cases include authenticated GET/unsupported transport methods, `Accept` and content-type negotiation, JSON-RPC notifications/unknown methods, invalid OAuth redirect/resource/scope and PKCE verifier, code replay/expiry, refresh rotation, and client-initiated protocol revocation.

These behaviors are delegated to maintained standard libraries and the core flow passed workerd, MCP Inspector, and ChatGPT. This is therefore a P2 coverage gap rather than evidence of a protocol defect.

### P2-2 — Some real ChatGPT Definition of Done scenarios remain unvalidated

Real ChatGPT connectivity, discovery, natural tool selection, and non-empty result interpretation are validated. The accepted issue additionally required a real empty-registry ChatGPT result, an indirect selection prompt, and owner revocation followed by failed ChatGPT use and successful reauthorization. The recorded evidence does not establish those scenarios.

The missing cases do not invalidate the demonstrated connection, but they should be completed before broader compatibility claims are made.

### P3-1 — Architecture status text contradicts validated evidence

`ARCHITECTURE.md` correctly describes the implemented MCP protocol and OAuth boundary but still says that real ChatGPT behavior “remains unvalidated.” README, TESTING, GAP-002, the deployed evidence, and this audit establish otherwise. The architecture status sentence should be corrected in a later non-audit change.

## Critical Check Results

| Check                                | Result                                                            |
|--------------------------------------|-------------------------------------------------------------------|
| Standard MCP version/protocol        | Pass — stable `2025-11-25`.                                       |
| Streamable HTTP                      | Pass — official Web-standard transport.                           |
| Coherent `/mcp` boundary             | Pass.                                                             |
| Initialization                       | Pass in workerd and deployed Inspector.                           |
| Tool discovery                       | Pass in workerd, Inspector, and ChatGPT.                          |
| Only justified tools                 | Pass — exactly `list_integrations`.                               |
| Real project state                   | Pass — shared compiled registry.                                  |
| No Garmin hard-coding in MCP adapter | Pass.                                                             |
| Empty result valid                   | Pass in production-path automated test; not exercised in ChatGPT. |
| ChatGPT-compatible authentication    | Pass — OAuth 2.1 authorization code with PKCE, CIMD/DCR.          |
| Admin cookie not reused              | Pass.                                                             |
| HTTPS/security                       | Pass.                                                             |
| Sanitized protocol errors            | Pass for exercised malformed/internal paths.                      |
| No secret logging                    | Pass by source inspection and test behavior.                      |
| Cloudflare-compatible bundle         | Pass under build, workerd, and real deployment.                   |
| Admin API/SPA regressions            | Pass.                                                             |
| No source implementation introduced  | Pass.                                                             |
| No generic MCP/domain framework      | Pass.                                                             |

## Independent Conclusions

### MCP PROTOCOL

`ACCEPTED`

### MCP SECURITY

`ACCEPTED`

### TOOL DESIGN

`ACCEPTED`

### CLOUDFLARE MCP

`VALIDATED`

### CHATGPT CONNECTIVITY

`VALIDATED`

### NEXT MVP SLICE

`READY`
