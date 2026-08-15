# ADR-0007: Frontend and Single-Project Scaffold

- Status: Accepted
- Date: 2026-08-15
- Supersedes: the Vuexy-specific frontend choice in ADR-0002; ADR-0002 remains accepted for its single-deployment decision

## Context

The Admin Web is a small operational interface for non-technical owners of a self-hosted deployment. It needs a professional, accessible component foundation without turning template demo code into product architecture or requiring a custom design system.

Vuexy's Vue 3 TypeScript Starter was inspected as a possible source. The Project Owner holds a Vuexy Regular License, but the license review concluded that it does not grant sufficient rights to redistribute Vuexy source or protected assets in this public source-available repository. Selective incorporation would still create redistribution and relicensing problems.

The application also has one deployment boundary: one Cloudflare Worker serves Admin API, MCP, and SPA assets. Multiple packages, workspaces, or separately deployed frontend/backend projects would add operational and build complexity without a current consumer.

## Decision

- Build an independently authored Admin SPA with Vue 3 and TypeScript.
- Use Vuetify as the UI component framework and Vue Router for client routing.
- Use Vuetify primitives before creating project-owned equivalents; keep theme customization small.
- Do not incorporate Vuexy source, layouts, `@core`, SCSS, components, icons, assets, or generated code.
- Do not introduce Tailwind CSS, Bootstrap, React, Next.js, SSR, a custom design system, or a second CSS/component framework.
- Prefer Vue composition and local state. Pinia is excluded from the initial scaffold unless a concrete client-side state requirement justifies it.
- Use one repository and one deployable application with one root `package.json`, one pnpm lockfile, no workspaces, and no monorepo package boundaries.
- Use Vite with the official Cloudflare Vite integration and Cloudflare Workers.
- Serve Admin API, MCP, and SPA/static assets from one Worker deployment.
- Use conceptual routing `/api/*` for Admin API, `/mcp/*` for MCP, and `/*` for static SPA assets/Vue Router fallback. Exact paths may change with implementation evidence.
- Use the conceptual source boundaries documented in `ARCHITECTURE.md`, creating only paths with immediate consumers.

## Alternatives Considered

1. **Copy Vuexy Starter:** technically convenient but incompatible with the intended public redistribution model.
2. **Selectively adapt Vuexy:** smaller than copying Starter, but still incorporates protected source/design material and creates provenance ambiguity.
3. **Tailwind CSS or Bootstrap:** viable general tools, but unnecessary second choices after selecting Vuetify and contrary to a single-framework UI baseline.
4. **Custom component/design system:** increases design, accessibility, maintenance, and testing work without product evidence.
5. **Pinia by default:** common in Vue applications, but no initial cross-route client state requirement has been demonstrated.
6. **Frontend/backend packages or workspaces:** create package and build boundaries without separate deployment or publishing needs.
7. **SSR or a separate frontend host:** add runtime and operational complexity without value for the private Admin SPA.

## Consequences

### Positive

- The public repository has a clear chain of provenance and contains no Vuexy-protected material.
- Vuetify supplies standard accessible UI primitives without custom design-system work.
- One package graph and one deployment keep installation and maintenance understandable.
- Browser and Worker code retain explicit source boundaries without becoming separate products.
- Client state, custom components, and theme work are added only when real UI behavior requires them.

### Negative

- The Admin shell and product-specific presentation must be authored independently.
- Vuexy-specific layouts, polish, examples, and assets cannot accelerate implementation.
- Vuetify conventions create framework coupling that must be managed deliberately.
- Some shared client state may later justify adding Pinia, requiring a documented dependency change.
- Exact compatible versions and build/test/lint tools still require scaffold-time verification.

## Validation Required During Scaffolding

- Record actual Vue, Vuetify, Vue Router, Vite, Cloudflare, and pnpm versions and license provenance.
- Verify SPA deep-link fallback and Worker-first isolation for Admin API and MCP routes.
- Verify Worker code does not import browser-only dependencies.
- Verify the UI uses no Vuexy-derived source or protected assets.
- Verify build, type checking, lint/format checks, tests, and Worker preview with the selected versions.
