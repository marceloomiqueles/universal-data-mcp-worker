# Cloudflare Self-hosted Installation

## Status

Installation status is tracked by path:

- **Local installation:** validated from a clean checkout through owner creation, logout, and login.
- **Wrangler CLI provisioning:** implemented and validated against real Cloudflare for D1 creation/reuse, migrations, deployment, bindings, HTTPS, setup status, and authorized-link generation.
- **Safe CLI re-run:** defensive regeneration and fail-closed deployment are regression-tested; a disposable remote custom-domain conflict has not been exercised.
- **Deploy to Cloudflare:** the public button targets the default branch; clean-account deployment remains unvalidated.

The installing owner must still complete account creation in their browser; the provisioner never chooses owner credentials.

## Purpose

Provision one self-hosted installation without manually editing D1 IDs, running SQL, generating a bootstrap proof, or constructing its setup URL.

Provisioning owns Cloudflare management operations. The deployed Worker consumes logical `DB`, `OAUTH_KV`, `LOGIN_RATE_LIMITER`, `MCP_OAUTH_RATE_LIMITER`, `OWNER_SETUP_TOKEN`, and `INTEGRATION_SECRETS_KEY` bindings.

## Normal path

### Browser-assisted deployment

Use the **Deploy to Cloudflare** button in the public README. Cloudflare's native flow is expected to:

1. asks the user to authorize GitHub/GitLab and Cloudflare;
2. creates a user-owned fork;
3. reads `wrangler.jsonc` and provisions D1 for binding `DB`; the public template deliberately omits `database_id`, which is Cloudflare's automatic-provisioning signal;
4. asks for the `OWNER_SETUP_TOKEN` secret declared by `.dev.vars.example`;
5. requires the owner to verify the Workers Builds settings described below;
6. runs `pnpm build`, then the migration-gated `pnpm deploy` command.

Cloudflare stores Workers Builds commands in dashboard/API trigger state and currently does not honor Wrangler Custom Builds configuration. Configure the production trigger under **Settings > Build** with:

```text
Production branch: main
Root directory: /
Build command: pnpm build
Deploy command: pnpm deploy
```

The build system executes the build command and then exactly one deploy command. `pnpm deploy` first runs standard pending D1 migrations and invokes the single `wrangler deploy` only after they succeed. The default `npx wrangler deploy` is unsafe for this repository because it bypasses that gate.

The automatically generated Workers Builds token documented by Cloudflare does not include D1 in its default permission list. Edit or select the narrowest user token that retains the required Worker deployment permissions and adds account-level **D1 Edit**. This credential belongs to Cloudflare's build control plane; never add it to Git, Worker variables, application secrets, or the application runtime. If D1 permission is missing, migration apply must fail the build and prevent publication.

The repository cannot declare these trigger fields in `wrangler.jsonc`, so the effective dashboard values must be checked after initial installation and whenever the Git connection or build token changes. The repository orchestration is regression-tested, but this production trigger is not marked safe until a real Git build confirms the configured command and migration ordering.

The remaining native-platform limitation is bootstrap handoff. Cloudflare can request a secret but cannot generate it and securely return the matching post-deploy setup URL. The planned copy/paste sequence is:

1. in a password manager, generate one 43-character value using only letters, numbers, `-`, and `_`;
2. paste it once into Cloudflare's `OWNER_SETUP_TOKEN` field and retain it temporarily;
3. after Cloudflare reports the deployed host, replace the two labeled placeholders below and open the resulting link;
4. create the owner, then discard the retained value.

```text
https://<worker-host>/login#bootstrap=<OWNER_SETUP_TOKEN>
```

Do not put the value in repository files, ordinary Worker variables, issues, or analytics. The application never exposes it through an endpoint. The owner need not run D1, binding, migration, or Wrangler commands in this browser-assisted path.

An earlier button URL was verified only to redirect to Cloudflare's authenticated Workers creation flow. That is not installation validation. Based on Cloudflare's documented native flow, the expected user interactions are:

1. select **Deploy to Cloudflare**;
2. authorize repository and Cloudflare access and accept the generated resource names;
3. generate, paste, and retain `OWNER_SETUP_TOKEN`;
4. start deployment;
5. combine the reported Worker host and retained value using the exact URL above;
6. choose the owner username and password.

The first four infrastructure operations are platform-managed, but steps 3 and 5 prevent this from being accurately described as one-click. Keep the flow marked unvalidated until the default-branch clean-account check passes.

### Wrangler deployment

Requirements:

- Node.js and pnpm versions listed in the root README;
- a Cloudflare account with Workers and D1 available;
- an interactive terminal trusted not to persist or publish the final setup link.

Run from the repository root:

```sh
pnpm install
pnpm exec wrangler login
pnpm provision:cloudflare
```

Wrangler owns authentication. The project neither reads nor stores Cloudflare API tokens.

The implementation follows Cloudflare's documented [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), and [`wrangler deploy --secrets-file`](https://developers.cloudflare.com/workers/wrangler/commands/workers/) mechanisms rather than calling management APIs from application code.

The command:

1. verifies Wrangler authentication;
2. creates or reuses D1 database `universal-data-mcp-worker`;
3. regenerates ignored `.wrangler.production.jsonc` from committed configuration with the non-secret database ID and stable, installation-specific login and OAuth rate-limit namespaces, leaving the committed template account-neutral; Wrangler provisions the `OAUTH_KV` namespace from its logical binding;
4. builds the application;
5. applies pending migrations through binding `DB` with `--remote`;
6. generates a 256-bit bootstrap proof when setup requires one;
7. writes that proof only to a mode-`0600` temporary file outside the repository;
8. uploads the proof and code together with Wrangler's `--strict`, `--keep-vars`, and `--secrets-file` mechanisms;
9. deletes the temporary file;
10. verifies setup status over HTTPS and rejects unexpected insecure HTTP behavior;
11. prints the authorized setup URL.

Expected final output:

```text
Deployment complete.

Open this link to create the administrator account:
https://<worker>.<account>.workers.dev/login#bootstrap=<proof>
```

The link grants first-owner setup authorization. Treat it like a temporary password: open it only in the intended browser and do not paste it into issues, chat, analytics, or persistent logs. The proof is not embedded in the SPA or returned by an application endpoint.

## Database naming

The normal database name is deterministic and scoped to the installing Cloudflare account:

```text
universal-data-mcp-worker
```

Only installations that genuinely require another name should use:

```sh
pnpm provision:cloudflare -- --database-name=my-installation-db
```

Do not change the name after `.wrangler.production.jsonc` contains a real database ID. Provisioning fails instead of silently rebinding an existing installation.

## Re-running safely

### Configuration ownership

The installer owns the Worker code version, static-assets configuration, logical D1 `DB` binding, OAuth `OAUTH_KV` binding, the two project rate-limit bindings, `OWNER_SETUP_TOKEN` upload when setup is incomplete, and migration execution. It does not own unrelated custom domains/routes, dashboard-managed variables, or other remote settings introduced outside the installer.

The ignored deployment file is a cache of installer-owned D1 identity, not authoritative Worker configuration. Each run reads only that D1 identity, regenerates the file from committed `wrangler.jsonc`, and uses Wrangler strict mode. If the regenerated installer configuration conflicts with remote settings, Wrangler stops rather than silently changing them. `--keep-vars` separately preserves dashboard-managed variables. Resolve the reported ownership/configuration conflict explicitly; do not bypass strict mode.

- Existing configured D1: verified by ID and name, then reused.
- Draft D1 configuration with an existing deterministic database: reused and bound automatically.
- Missing D1: created once through Wrangler.
- Applied migrations: Wrangler applies only pending files.
- Existing Worker: deployment uses Wrangler strict mode and stops on conflicting remote settings.
- Existing Worker without this installation's generated configuration: provisioning refuses to overwrite unknown routes or settings.
- Existing owner: owner, sessions, database, and bootstrap secret remain untouched; the normal login URL is printed.
- Setup incomplete: a new proof is generated explicitly, deployed, and printed; the previous setup link stops working.
- Missing/mismatched configured D1: provisioning stops without creating a replacement.

Provisioning is never a reset operation. It does not delete resources or owner data.

Cloudflare's Vite plugin intentionally places the local `.dev.vars` file in ignored Worker build output for local preview. That file is not deployed, and `pnpm build` verifies that its values are absent from `dist/client`. Never archive or share the complete `dist/` directory.

## Secrets

| Name                      | Source                                                       | Lifetime                                                  | Storage                                                                           |
|---------------------------|--------------------------------------------------------------|-----------------------------------------------------------|-----------------------------------------------------------------------------------|
| `OWNER_SETUP_TOKEN`       | Generated with Node cryptographic randomness                 | Required only until the singleton owner exists            | Cloudflare Worker secret; temporary upload file is deleted                        |
| `INTEGRATION_SECRETS_KEY` | Generated as 32 random bytes encoded with unpadded Base64URL | Required while encrypted integration configuration exists | Cloudflare Worker secret; provisioned only when absent and never silently rotated |

Shopify client credentials are supplied later through the authenticated Admin API, not through provisioning. The client secret is encrypted before D1 persistence using `INTEGRATION_SECRETS_KEY`. The key cannot be recovered from D1: losing or changing it makes existing encrypted credentials unreadable, so the owner must re-enter the affected configuration or disconnect it. Disconnect remains available because it does not decrypt the row. Provisioning detects the existing secret name and never silently replaces it; full key rotation is not implemented. Cloudflare authentication remains in Wrangler's standard credential storage and is never passed to the Worker.

After owner creation, the backend permanently refuses replacement even if the proof remains configured. Removing the now-unused secret with Wrangler may be added to a validated operational flow later; it is not automated before real deployment behavior is observed.

## HTTPS and login abuse control

The provisioning configuration explicitly enables the HTTPS-capable `workers.dev` route. The provisioner emits only an `https://` setup URL, verifies the HTTPS setup-status request, and requires insecure HTTP to redirect to HTTPS or return the application's `426 HTTPS_REQUIRED` response.

`LOGIN_RATE_LIMITER` bounds password verification, while `MCP_OAUTH_RATE_LIMITER` separately bounds public OAuth registration, token, and authorization traffic. Provisioning derives distinct positive integer namespaces from the D1 installation ID so different installations and concerns do not intentionally share counters. Threshold behavior remains covered by Worker tests rather than deliberate production lockout tests; the new OAuth binding and KV still require deployed validation.

## Failure behavior

- Authentication failure: run `pnpm exec wrangler login`; no project resource is changed.
- D1 mismatch: inspect the authenticated account and checkout; do not delete or replace the database automatically.
- Build failure: no migration or deployment follows.
- Migration failure: deployment stops; the installation is not reported successful.
- Deployment failure: the database and completed migrations remain for safe reuse; rerun after correcting the reported error.
- Setup/HTTPS validation failure: provisioning reports failure and does not claim a usable installation.

Never delete a production D1 database as routine recovery.

For Git deployment, inspect the Cloudflare build log before treating a schema-changing revision as successful. It must show the `pnpm deploy` entry point, the Wrangler pending-migration result, and only then the Worker upload. A raw `wrangler deploy` without the preceding migration step indicates configuration drift; stop Git publication and restore the exact deploy command above.

## Validation evidence and remaining owner action

The authenticated validation established:

1. D1 creation and binding without manual UUID editing;
2. repeated provisioning without duplicate D1 databases;
3. remote migration state;
4. Worker and SPA availability over HTTPS;
5. insecure HTTP redirect/rejection;
6. setup status and authorized setup URL generation;
7. rate-limit binding acceptance;
8. absence of production proof values from Git and client assets.

The public Deploy to Cloudflare path and a disposable remote conflict/re-run remain unvalidated. Test the button from the public default-branch README; do not infer success from local configuration or a dashboard redirect.

The installing owner completes username/password creation, session restoration, logout, and subsequent login through the generated link. These behaviors are already covered by the production-path Worker and Admin tests; the provisioner deliberately does not create credentials on the owner's behalf.
