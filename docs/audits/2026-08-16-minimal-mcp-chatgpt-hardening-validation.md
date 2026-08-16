# Minimal MCP and ChatGPT Hardening Validation

## Scope

This record captures the interoperability evidence collected on 2026-08-16 after the Minimal MCP and ChatGPT Connectivity Audit. It covers the remaining real-client scenarios for the existing read-only `list_integrations` tool. It does not add or validate Garmin data access, write actions, MCP resources, prompts, or other AI clients.

## Environment

- Client: ChatGPT Work, developer mode.
- Canonical endpoint: `https://manhattan.paperco.de/mcp`.
- Empty-registry endpoint: a disposable Cloudflare Worker deployment created only for this validation.
- Protocol: MCP `2025-11-25` over Streamable HTTP.
- Authentication: OAuth 2.1 authorization code with PKCE S256 and `integrations:read`.

No OAuth credential, authorization code, access token, refresh token, session cookie, or bootstrap proof is recorded in this document.

## Indirect Tool Selection

Prompt:

> What data sources can you currently access from my self-hosted server?

ChatGPT selected the configured MCP app without the tool name being mentioned and invoked `list_integrations`. It reported Garmin as available in the deployment but `not_configured`, and correctly concluded that Garmin data was not yet accessible. Cloudflare request evidence recorded successful authenticated MCP POST traffic from the OpenAI MCP client at the same time. The server intentionally does not log tool payloads, so the client result supplies the tool-result correlation.

## Empty Result

Prompt against the disposable empty-registry deployment:

> What data sources are currently available from this test server?

ChatGPT selected the test MCP app and invoked the same production MCP path. The tool returned `integrations = []`. ChatGPT stated that the server was reachable but had no registered data sources or integrations; it did not invent records. Contemporaneous Cloudflare evidence recorded successful authenticated MCP POST traffic to the disposable endpoint.

The disposable deployment changed only application composition to inject an empty registry for validation. It did not add a production feature for hiding integrations and did not modify the canonical deployment's registry or data.

## Revocation and Reauthorization

The canonical ChatGPT connection worked before revocation. The authenticated owner then called the existing grant-revocation operation; the API returned HTTP 200 and reported three grants revoked. The next indirect ChatGPT request could not use the previous credential and displayed a reconnect requirement.

After the owner completed a new authorization, ChatGPT invoked `list_integrations` successfully again and returned the canonical deployment state: Garmin registered with status `not_configured`. Cloudflare request evidence recorded the owner revocation request and a later successful authenticated MCP POST from the OpenAI MCP client. No token values were retained.

## Limitations

- The validation covers ChatGPT Work developer mode as observed on 2026-08-16, not every ChatGPT plan or future UI.
- The validation covers one bounded read-only tool, not write tools, resources, prompts, or Garmin data operations.
- Authorization-code and token expiry remain enforced by the standard provider's real clock and KV TTL; the project does not introduce a custom clock solely for deterministic expiry tests.
- Cloudflare request evidence confirms route, client, authentication outcome, and HTTP status but deliberately does not log tool arguments or results.

## Result

The previously outstanding real ChatGPT scenarios passed: indirect selection, empty-result interpretation, owner revocation failure, and successful reauthorization.
