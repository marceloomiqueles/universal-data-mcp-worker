# Pre-Scaffolding Technical Audit

- Date: 2026-08-15
- Canonical project: `universal-data-mcp-worker`
- Local project directory: `/Users/marcelomiqueles/Development/garmin-mcp-worker`
- Vuexy source inspected: `/Users/marcelomiqueles/Development/vuexy-admin`
- Scope: repository and template inspection only; no scaffold, dependency installation, build, or product code

## Decision Addendum — 2026-08-15

ADR-0007 supersedes this audit's recommendation to use Vuexy Starter selectively. The technical inventory and comparison below remain historical evidence, but no instruction to copy, preserve, adapt, or derive from Vuexy should be followed.

The Project Owner confirmed a Vuexy Regular License. Legal review concluded that it does not provide sufficient rights to redistribute Vuexy source or protected assets under the intended public repository model. Vuexy is therefore excluded from Project source, GAP-008 is closed by exclusion, and the Admin UI will be independently authored using Vue 3, TypeScript, Vuetify, and Vue Router. Pinia is not part of the initial scaffold without a demonstrated state requirement.

The audit's one-root-project, pnpm, Vite, official Cloudflare integration, single-Worker deployment, conceptual routing, and repository-boundary analysis is accepted. The historical “Exact Scope of the Next Scaffolding Prompt” is superseded where it refers to Vuexy; the authoritative scaffold baseline is ADR-0007 and `ARCHITECTURE.md`.

## Executive Conclusion

Use Vuexy's standalone Vue 3 TypeScript `starter-kit` as a **selective donor and compatibility reference**, not as an application to copy wholesale. After redistribution rights are verified, retain only the starter's visual foundation and the files proven necessary for a vertical-navigation SPA. Replace its demo pages, fake authentication assumptions, generic application components, unused assets, and broad dependency manifest with project-owned entrypoints and a dependency set derived from actual imports.

Keep one root `package.json` and one deployable Cloudflare Worker project. Put Worker code, Admin API, MCP, core mechanisms, Garmin, and Admin SPA under clear directories in the same repository without workspaces or separately deployable applications. Use Vite for the Vue build and the official Cloudflare Vite plugin/Workers static assets support for one integrated development and deployment path.

This recommendation is technically ready but **not legally executable yet**. The local Vuexy notice delegates CSS, images, design, and other non-PHP material to the purchased Envato license; it does not establish public redistribution rights. No Vuexy source or protected asset may be copied into this public repository until GAP-008 closes.

## Success Criteria for a Later Scaffold

A later scaffold is successful when it:

- produces one Worker deployment containing the SPA assets, Admin API, and MCP endpoint;
- starts from the Vuexy TypeScript starter's proven foundation without importing its demo product surface;
- has one package manager, one lockfile, and one root dependency graph;
- preserves core versus integration-slice boundaries without speculative interfaces;
- routes Admin API and MCP requests to Worker code while preserving Vue Router deep-link fallback;
- contains no fake API, fake auth, demo data, commercial examples, unused protected assets, or unnecessary infrastructure;
- verifies type checking, linting, frontend build, Worker build, local routing, and a minimal test path;
- records exact Vuexy provenance and redistributable files before they enter Git history.

## Current Project State

The repository contains documentation and GitHub collaboration metadata only. It has no `package.json`, lockfile, package-manager declaration, TypeScript/Vite/Wrangler configuration, `src` directory, application entrypoint, Worker, Admin API, MCP runtime, integration, D1 implementation, schema, migration, build command, lint command, formatter, tests, deployment command, or generated scaffold.

The worktree was already non-clean because `docs/audits/2026-08-15-legal-baseline-audit.md` was untracked before this task. It was not modified.

The scaffold must preserve the decisions in `AGENTS.md`, `ARCHITECTURE.md`, and ADR-0001 through ADR-0004: one deployment, HTTP/JSON Admin API, standard MCP, common mechanisms in core, Garmin-specific behavior in its vertical slice, slice-owned schemas and queries, incremental migrations, idempotent sync, no dynamic plugin system, no SSR, and no speculative infrastructure.

## Vuexy Package Inventory

The local package is a multi-framework commercial distribution. It contains standalone Vue, Vue with Laravel, HTML, Laravel, Django, ASP.NET, React, and deprecated Angular variants. Only this path matches the agreed stack:

```text
vue-version/typescript-version/
├── starter-kit/
└── full-version/
```

Both are Vue 3.5, TypeScript, Vite, Vuetify 3, Vue Router, and Pinia applications. Both include `pnpm-lock.yaml`. Their README says `npm`, while `.npmrc` contains pnpm-oriented hoisting settings; the lockfile is stronger evidence of the distributed dependency resolution.

### Starter Kit

- Version in `package.json`: Vuexy 9.4.0.
- Approximate source package size: 5.6 MB.
- Files: 427.
- `src/@core`: 140 files.
- `src/@layouts`: 29 files.
- `src/assets`: 162 files.
- Product-facing routes: index, login, second page, and catch-all error.
- Tooling: Vite, file-based Vue Router generation, meta layouts, Vuetify plugin, auto-imports, component auto-registration, SVG loading, generated Iconify CSS, ESLint, Stylelint, Sass, and `vue-tsc`.
- State: Pinia is installed and used by Vuexy theme/layout stores.
- API helpers: both `ofetch` and VueUse `createFetch`, each injecting a JavaScript-readable bearer token from cookies.
- Auth page: visual demo only; submit is a no-op and the page includes registration, password recovery, remember-me, and social-provider affordances not required by this project.
- Postinstall: builds icons and initializes MSW even though the starter has no `src/plugins/fake-api` directory.

The starter is an official minimal starting variant, but “starter” means fewer example pages, not a minimal dependency or asset graph.

### Full Version

- Approximate source package size: 19 MB.
- Files: 1,411.
- Contains analytics/CRM/ecommerce dashboards, academy, calendar, chat, email, invoices, kanban, logistics, users, roles/permissions, charts, forms, tables, landing pages, help center, fake API handlers, i18n, and many demonstrations.
- Its `package.json` is effectively the same as Starter's; the only observed script difference adds internal lint rules.

Full is unsuitable as a base. Removing its product examples would be a large deletion project with weak provenance and high risk of retaining dead assumptions.

### Other Bases

The JavaScript starter contradicts the TypeScript end-to-end decision. Laravel, HTML, Django, ASP.NET, React, and Angular variants introduce unrelated runtimes or frameworks. A fresh Vue application plus manually recreated Vuexy internals would discard the supported starter structure and risk rebuilding the theme/layout coupling unnecessarily.

## Starter Versus Alternatives

| Option                                   | Useful foundation                                       | Inherited burden                                                                                        | Assessment                            |
|------------------------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------------------------|---------------------------------------|
| TypeScript Starter copied wholesale      | Correct Vue/Vite/Vuetify shell and conventions          | 427 files, broad Full-like dependencies, demo assets/components, fake auth assumptions, MSW postinstall | Too broad                             |
| TypeScript Starter used selectively      | Same proven visual foundation, with explicit provenance | Requires dependency tracing and careful file selection                                                  | **Recommended** after legal clearance |
| Fresh Vue app plus hand-integrated Vuexy | Small initial app                                       | Reconstructs coupled `@core`, `@layouts`, theme, styles, icons, and auto-import behavior                | Unnecessary reinvention               |
| Full version                             | Every example is available                              | 1,411 files, fake API, business demos, maximum cleanup and maintenance                                  | Reject                                |
| Laravel or another packaged runtime      | None relevant to the agreed runtime                     | Additional server/framework and separate deployment assumptions                                         | Reject                                |

## Vuexy Selection

### Preserve

- Vuetify setup, theme tokens, typography, global SCSS, and the project-specific subset of Vuexy variables.
- `VApp` root initialization and required theme/layout stores.
- Responsive vertical app shell and navigation primitives.
- Blank layout for login and error states.
- Vue Router integration and route metadata needed for layouts.
- Pinia where required by retained Vuexy configuration and later real UI state.
- Icon pipeline limited to icons actually referenced by retained UI.
- Core form wrappers actually used by login/configuration forms.
- Standard Vuetify buttons, cards, badges/chips, alerts, progress/loading, skeletons, empty states, and dialogs.
- Generic confirmation-dialog pattern, adapted for destructive operations.
- Responsive and accessible behavior provided by retained Vuetify/Vuexy primitives.

### Adapt

- Rename theme title/logo and navigation to project-owned content.
- Keep the login composition as visual reference, but reduce it to the real single-owner credential flow.
- Adapt `ConfirmDialog` to explicit reset/delete confirmation rather than importing unrelated dialogs.
- Replace template home/second-page content with the first real operational shell only when product work begins.
- Replace demo profile and notification content with owner session actions and real diagnostics only when consumers exist.
- Reduce vertical navigation to real routes; do not retain horizontal navigation without a requirement.
- Replace bearer-token helpers with a same-origin Admin API client compatible with `HttpOnly` cookie sessions.
- Retain loading/error/empty-state patterns only when wired to actual application states.

### Do Not Import

- Full-version pages, views, fake API, mock payloads, and business-domain examples.
- Ecommerce, CRM, analytics dashboards, academy, calendar, chat, email, invoices, kanban, logistics, user administration, roles, permissions, billing, and pricing.
- Registration, email recovery, social providers, JWT demo behavior, fake bearer tokens, or auth-provider components.
- Demo cards, example dialogs, tours, search suggestions, shortcuts, notifications, sample avatars, payment assets, QR codes, and promotional `BuyNow` UI.
- Charts, maps, rich-text editor, video, carousel, calendar, drag/drop, syntax-highlighting, and wizard code without a real consumer.
- Docker, nginx, SSR, or framework-specific deployment files.
- Generated declarations or lockfiles copied without regenerating them from the selected source set.
- Any Vuexy source or protected asset before redistribution rights are documented.

## Dependency Classification

The classification describes the later scaffold target, not an instruction to edit Vuexy in place.

### Necessary

- `vue`, `vuetify`, `vue-router`, and `pinia` for retained application/layout behavior.
- `vite`, `typescript`, `vue-tsc`, `@vitejs/plugin-vue`, `vite-plugin-vuetify`, and `sass`.
- The official Cloudflare Vite plugin and Wrangler, which Vuexy does not provide.
- Cloudflare Worker types/configuration appropriate to the selected current tool versions.

### Probably Necessary

- `@vueuse/core`, used broadly by Vuexy theme, breakpoint, persistence, and layout behavior.
- `unplugin-vue-router` and `vite-plugin-vue-meta-layouts` if retaining the starter's file-based route/layout convention.
- `unplugin-auto-import` and `unplugin-vue-components` because retained Vuexy files assume their generated imports.
- `vite-svg-loader` for the raw logo/theme pattern.
- Minimal Iconify/Tabler build dependencies required by actual navigation and status icons.
- One small same-origin HTTP client, potentially native `fetch` rather than retaining both `ofetch` and `createFetch`.

### Demo-Only or Presumptively Remove

- CASL, because the initial product has one owner and no RBAC.
- MSW and fake API initialization until a test actually needs request mocking.
- FullCalendar, ApexCharts, Chart.js, Mapbox, Tiptap, Video.js, Swiper, Shepherd, Prism/Shiki, drag-and-drop, and related adapters/types.
- `jwt-decode`, because the real design uses an `HttpOnly` server session rather than browser-managed JWT demo state.
- Vue i18n, because English is canonical and no localization requirement exists.
- Webfont loader if fonts can be handled as build assets without runtime loading.
- Flatpickr until a real date/time control requires it.

### Requires Import-Graph and Build Validation

- `vue3-perfect-scrollbar` and `@floating-ui/dom`, used by Vuexy layout components but potentially removable with a vertical-only subset.
- `cookie-es`, `destr`, `ufo`, and `type-fest`, which support internal helpers and should be removed only after retained imports are known.
- Vue JSX support, Vue DevTools plugin, customizer support, horizontal-layout support, and associated dependencies.
- The exact ESLint/Stylelint stack, because the distributed versions are large and partly legacy but encode Vuexy conventions.

Do not perform aggressive manifest cleanup first. Select the required files, trace their transitive imports, construct the smallest plausible manifest, then build/type-check and restore only proven missing dependencies.

## Auth: Visual Composition Versus Real Security

The starter login page is reusable only as a composition reference. Its form does not authenticate, uses email-oriented text, exposes registration/recovery/social actions, and has JavaScript-readable bearer-token helpers.

The real application requires a single-owner credential and Worker-managed session with an `HttpOnly`, `Secure`, appropriately `SameSite` cookie. The SPA should call same-origin `/api/*` endpoints and must not read or persist the session token. Route guards improve navigation experience but are not security boundaries; every Admin API operation must enforce the server session. CSRF behavior, session storage, password hashing, and credential bootstrap remain separate security implementation decisions.

## Recommended Repository Shape

Do not create these paths until the scaffolding task is approved. The tree shows ownership, not final interfaces:

```text
/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── wrangler.jsonc
├── index.html
├── src/
│   ├── worker/
│   │   ├── index.ts                 # single fetch entrypoint
│   │   ├── admin-api/               # HTTP/JSON inbound surface
│   │   └── mcp/                     # shared MCP runtime surface
│   ├── core/                         # shared mechanisms only
│   ├── integrations/
│   │   └── garmin/                   # first vertical slice
│   └── admin/                        # Vue SPA
│       ├── main.ts
│       ├── App.vue
│       ├── pages/
│       ├── layouts/
│       ├── navigation/
│       ├── components/
│       ├── theme/
│       └── assets/
├── migrations/                       # create with first real migration
└── test/                              # create with first configured tests
```

This is one project, not a monorepo. `src/admin` makes the browser/runtime boundary explicit without creating a second package. `src/worker/admin-api` and `src/worker/mcp` separate inbound protocol surfaces; they call core/slice behavior rather than becoming domain layers. Exact internal subdirectories should appear only with a real consumer.

Migration ownership remains semantic: common migration machinery belongs to core and Garmin schema changes belong to the Garmin slice. The physical D1 migration layout should use Wrangler's supported `migrations_dir`/`migrations_pattern` once the first schema exists; do not create placeholder SQL or a custom runner during scaffolding.

## Package and Build Strategy

Use pnpm with one root `package.json` and one lockfile. The Vuexy variants ship `pnpm-lock.yaml`, and a single dependency graph is adequate for one Worker plus one SPA. Do not introduce workspaces, package publishing boundaries, or separate frontend/backend installs.

The root scripts should eventually cover development, type checking, linting, testing, build, and deployment, but their exact names and tools belong to the scaffolding task and must be verified rather than copied blindly. Avoid Vuexy's current `postinstall`: icon generation should be an explicit build prerequisite if retained, and MSW initialization should not run without an actual mocking requirement.

Conceptual build:

```text
src/admin + index.html
        ↓ Vite
static SPA assets
        ┐
        ├─ Cloudflare Vite plugin / Workers build
        │
src/worker/index.ts
        ↓
one Cloudflare Worker deployment
```

Cloudflare's current official Vite plugin runs Worker code in `workerd`, exposes bindings, builds frontend assets, supports HMR, and previews the production-style Worker runtime. Prefer it over unrelated adapters or a second hosting product.

## Routing and Deployment

Use Workers static assets with SPA fallback and explicit Worker-first route patterns conceptually equivalent to:

```text
/api/*  → Worker Admin API router
/mcp/*  → Worker MCP router
other matching files → static assets
other browser navigation → index.html → Vue Router
```

Cloudflare currently supports `assets.not_found_handling = "single-page-application"` and array-based `assets.run_worker_first` routing. Explicit `/api/*` and `/mcp/*` patterns prevent browser navigation to an API path from being mistaken for SPA fallback. Exact paths remain provisional as already documented.

Static SPA files may remain publicly fetchable; they must contain no secrets or private data. Security is enforced by Worker API/MCP sessions, not by hiding JavaScript assets. If later evidence requires the Worker to authorize every HTML navigation, `run_worker_first` can be broadened, but that should not be the scaffold default because it adds invocations without protecting API data by itself.

## Cloudflare Compatibility Risks

- Vuexy browser code must never be imported into the Worker bundle.
- Vuexy's `node:fs`/`node:path` icon builder and Vite's `node:url` use are build-time only.
- The starter's empty `process.env` shim must not normalize Node assumptions in Worker runtime code; use bindings.
- Fake bearer-token cookie logic conflicts with the required `HttpOnly` session model.
- The 5,000 KB chunk warning suppresses useful feedback; measure output instead.
- Broad auto-imports and generated declarations obscure dependencies unless generation is deterministic.
- File-based routes can expose retained demo pages unless the selected page set is explicit.
- SPA fallback can swallow API, MCP, or provider callbacks unless Worker-first routing is configured and tested.
- MCP streaming/transport behavior needs Workers-runtime validation; scaffolding must not invent the protocol implementation.
- Wrangler supports D1 migration files, tracking, and nested patterns, but startup/activation migration behavior remains beyond scaffolding.
- Vuexy redistribution is a legal blocker independent of technical compatibility.

## Remaining Gaps

1. **Vuexy redistribution (GAP-008):** authoritative Envato/Pixinvent terms or permission must identify which source, CSS, design, fonts, images, and generated assets may be committed publicly.
2. **Exact retained Vuexy graph:** after legal clearance, a disposable selection/build exercise must trace vertical-shell files and dependencies.
3. **Current tool versions:** verify mutually compatible Node, pnpm, Vite, Cloudflare Vite plugin, Wrangler, TypeScript, Vue, Vuetify, and Vuexy assumptions before pinning versions.
4. **Test runner and formatting stack:** select the smallest Worker/Vue-compatible tools during scaffolding; Vuexy provides lint/style conventions but no application tests.
5. **Migration execution beyond deploy tooling:** Wrangler supplies standard migration files and tracking, while automatic startup/activation behavior still requires a later bounded design/spike under GAP-004.

No additional architecture ADR is warranted yet. This audit recommends a scaffold for approval; it does not establish new product architecture or override existing ADRs.

## Exact Scope of the Next Scaffolding Prompt

The next prompt should proceed only after GAP-008 has evidence sufficient to copy the selected Vuexy material. It should instruct the coding agent to:

1. verify and record permitted Vuexy provenance and the precise Starter files selected;
2. create one pnpm-based root project, with no workspaces;
3. configure TypeScript, Vite, the official Cloudflare Vite plugin, Wrangler, static assets, SPA fallback, and Worker-first `/api/*` and `/mcp/*` routing;
4. create only the minimal Worker entrypoint and route boundaries, without MCP, auth, Garmin, sync, schema, or business behavior;
5. create the minimal Admin SPA shell from the legally permitted Starter subset: vertical layout, blank layout, theme, one neutral placeholder page, one visual login placeholder, and error/loading states;
6. remove demo navigation/content, fake auth, fake APIs, MSW postinstall, promotional UI, unused assets, and unneeded dependencies by traced evidence rather than blind deletion;
7. add the smallest justified test/lint/type-check setup and document exact commands;
8. verify local SPA deep links, API/MCP routing isolation, production build, Worker preview, bundle composition, and absence of Node-only imports in Worker runtime code;
9. update documentation with actual commands and evidence-backed gaps;
10. make no product functionality, schema, generic integration contract, or deployment infrastructure beyond the single Worker scaffold.

## Sources

- Repository: `AGENTS.md`, `ARCHITECTURE.md`, ADR-0001 through ADR-0006, and GAP-001 through GAP-013.
- Local Vuexy distribution: root README and licensing notices; standalone Vue TypeScript Starter and Full source/configuration.
- [Cloudflare Workers SPA documentation](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Cloudflare Vite plugin documentation](https://developers.cloudflare.com/workers/vite-plugin/)
- [Cloudflare D1 migrations documentation](https://developers.cloudflare.com/d1/reference/migrations/)
