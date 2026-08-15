# GAP-008: Vuexy Redistribution Rights

- Status: Closed — Vuexy excluded from Project source
- Closed: 2026-08-15
- Owner: Maintainer

## Decision

The Project Owner holds a Vuexy Regular License. Review concluded that it does not provide sufficient rights for the Project to redistribute Vuexy source code or protected assets in this public source-available repository.

The inspected local distribution contains a notice stating that PHP code and integrated HTML use GPL terms, while CSS, images, design, and all other parts depend on the Envato license purchased. That notice does not establish public redistribution rights for the standalone Vue TypeScript Starter. The repository must not infer that the included `GPL.txt` covers the Vue application as a whole.

Vuexy is removed as a source dependency. The Project will build an independently authored Admin UI with Vue, TypeScript, Vuetify, and Vue Router.

Do not copy, selectively incorporate, vendor, adapt, or relicense Vuexy Starter files, layouts, `@core`, SCSS, components, icons, assets, or generated code. This exclusion closes the redistribution gap and removes it as a scaffold blocker.
