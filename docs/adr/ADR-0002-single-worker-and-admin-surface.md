# ADR-0002: One Deployment for Admin Web, Admin API, and MCP

- Status: Accepted
- Date: 2026-08-15
- Source: `AGENTS.md`

## Context

The project prioritizes elementary self-hosting and near-zero cost for reasonable personal use. Independent services would increase deployment, configuration, and operation.

## Decision

Use one Cloudflare Worker/deployment to serve Admin Web, Admin HTTP/JSON API, MCP runtime, core and compiled integrations, and D1 access where appropriate.

Admin Web is a Vue 3 and TypeScript SPA. It consumes Admin API and never accesses D1 or providers directly. The initial access model has one owner/admin with simple authentication and session handling.

ADR-0007 supersedes the original Vuexy UI-foundation choice recorded when this ADR was accepted: the current UI foundation is Vuetify, and Vuexy source and assets are excluded. This amendment does not change the single-deployment or Admin API decisions in this ADR.

## Alternatives Considered

1. Separate backend and frontend: more deployment independence with unjustified MVP cost.
2. SSR: no demonstrated need for a self-hosted admin panel.
3. RPC/tRPC: another layer without proven benefit over HTTP/JSON.

## Consequences

- Fewer services and installation steps.
- The three surfaces retain logical separation in one runtime.
- Additional Workers, Queues, Durable Objects, KV, R2, and external services remain unjustified.
- Router, paths, bundling, authentication libraries, and internal structure remain implementation gaps.

## Future Verification

Demonstrate Workers/free-tier compatibility, serve the SPA and both inbound surfaces without mixing responsibilities, and preserve operability for non-technical users.
