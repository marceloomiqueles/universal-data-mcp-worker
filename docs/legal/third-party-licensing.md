# Third-Party Licensing and Service Terms

The Project license covers only rights that the Project Owner and contributors are authorized to grant. It does not make third-party code, assets, APIs, services, data, or trademarks compatible automatically.

## Vuexy

Vuexy was evaluated as a possible Admin UI foundation. The Project Owner holds a Regular License. The license review concluded that it does not provide sufficient rights to redistribute Vuexy source code or protected assets in this public source-available repository.

Vuexy is therefore not incorporated and is excluded from Project source. Do not copy, selectively incorporate, vendor, adapt, or relicense its Starter files, layouts, `@core`, SCSS, components, icons, assets, or generated code under the Project license. [GAP-008](../gaps/GAP-008-vuexy-redistribution.md) records the closed decision.

## Vue

Vue 3.5.41 is incorporated from the npm package `vue` under the MIT License. Its resolved provenance is recorded in `pnpm-lock.yaml`.

## Vuetify

Vuetify 4.1.9 is incorporated from the npm package `vuetify` under the MIT License. Its resolved provenance is recorded in `pnpm-lock.yaml`. The project uses the package directly and does not incorporate Vuexy source or assets.

## Scaffold Dependency Provenance

The direct scaffold dependencies were installed from the npm registry and are locked in `pnpm-lock.yaml`. Package metadata reports:

- Vue Router 4.6.4, Vite 8.2.1, the Cloudflare Vite plugin 1.52.1, Wrangler 4.123.0, the Vue Vite plugin 6.0.8, vite-plugin-vuetify 2.1.3, Vitest 4.1.10, ESLint and its selected plugins, Prettier 3.9.6, Happy DOM 20.11.2, and pnpm 11.22.0 under MIT terms;
- TypeScript 6.0.3 under Apache-2.0;
- Cloudflare Workers types 5.20260814.1 under MIT or Apache-2.0 terms.

The owner-session backend adds `@cloudflare/vitest-pool-workers` 0.21.3 as a development-only dependency under MIT terms. It is used to test D1 and Worker behavior under workerd; authentication runtime code uses platform Web Crypto and adds no runtime package.

The minimal MCP runtime adds `@modelcontextprotocol/sdk` 1.30.0 under the MIT License and uses its Web-standard Streamable HTTP transport. OAuth uses `@cloudflare/workers-oauth-provider` 0.10.3 under the MIT License. Zod 4.1.12, also MIT licensed, supplies the strict tool input and output schemas required by the SDK. Resolved provenance is recorded in `pnpm-lock.yaml`; the packages' bundled license files remain authoritative.

This inventory records package provenance; the packages' own license files and metadata remain authoritative. Recheck licenses and notices when dependency versions change.

## Garmin

Garmin and Garmin Connect are third-party trademarks and services. The first Garmin provider may be unofficial and temporary. The provider's software license and Garmin's service, API, data-use, and contractual terms remain separate from the Project's software license.

The unofficial provider must remain architecturally replaceable. Official Garmin access should be evaluated as the preferred long-term path. Stable commercial reliance on an unofficial provider requires separate evidence and review; see [GAP-009](../gaps/GAP-009-garmin-unofficial-provider.md).

## Future Integrations

Every proposed integration must independently review and document:

- provider and library licenses;
- API and service terms;
- trademark and branding requirements;
- source and asset redistribution rights;
- data-use, storage, transfer, and retention restrictions;
- provenance for incorporated third-party code.

An integration may be technically compatible while remaining legally unsuitable. Third-party code may be incorporated only under compatible terms with documented provenance.
