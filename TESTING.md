# Testing and Validation

The scaffold uses Vitest for focused Worker-boundary and Vue-rendering tests. It does not enforce a coverage percentage.

## Requirements

- Node.js 22.13 or newer;
- pnpm 11.22.0 or a compatible pnpm 11 release;
- dependencies installed with `pnpm install`.

## Commands

Run the complete current validation set from the repository root:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Use `pnpm format` to format project source and configuration. Existing policy and historical Markdown are excluded to prevent unrelated formatting churn.

Start the Vite-native Cloudflare development environment with:

```sh
pnpm dev
```

Build and preview the production output under the local Workers runtime with:

```sh
pnpm preview
```

The current tests verify that the Admin SPA renders, a client-side deep route resolves, the login and not-found placeholders render, and the `/api/*` and `/mcp/*` boundaries return JSON rather than SPA HTML. Local preview validation must also confirm that `/` and `/status` return the SPA while `/api/*` and `/mcp/*` reach the Worker.

Cloudflare deployment is not part of the scaffold validation and no deployment script is documented yet.
