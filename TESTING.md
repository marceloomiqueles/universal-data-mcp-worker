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

The current tests use the production Vue Router definitions and verify that the Admin SPA renders its home, status, login, loading, and not-found states. They also verify the narrow-screen navigation interaction, persistent wide-screen navigation, exact and nested `/api` and `/mcp` boundaries, query strings, trailing slashes, near-prefix negatives, and SPA asset delegation.

`pnpm typecheck` uses separate Admin-test and Worker-test TypeScript projects. Each project includes its runtime source and related tests without mixing DOM types into Worker code or Worker types into Admin code.

Local preview validation must confirm that SPA routes return HTML, `/api` and `/mcp` boundaries return Worker JSON, and `/apiary` and `/mcproxy` remain SPA routes.

Cloudflare deployment is not part of the scaffold validation and no deployment script is documented yet.
