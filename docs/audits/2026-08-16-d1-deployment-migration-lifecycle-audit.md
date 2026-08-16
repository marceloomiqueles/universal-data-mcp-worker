# D1 Deployment Migration Lifecycle Audit

- Date: 2026-08-16
- Scope: read-only diagnosis of production D1 migrations across installation and deployment paths
- Repository revision: `3cd42aa255b55fbdf91cf5af2bbd035af936809e`
- Public default branch observed: `origin/main` at `8c11667da72b9a1178719e9a206e2dde3c71e2b3`

## Scope and constraints

This audit investigates the deployment in which a merge to `main` published Worker code without applying its pending D1 migration. It did not deploy code, apply a migration, execute write SQL, change a binding, or modify a Cloudflare resource. Remote inspection was limited to Worker version/deployment metadata, the D1 migration list, and read-only SQL against migration metadata.

The intended invariant is:

```text
pending schema migration succeeds
        ↓
schema-dependent Worker code is deployed
```

The current Git-triggered deployment does not enforce that invariant.

## Observed incident

Pull request #18 was merged to `main` at `2026-08-16T17:15:02Z`. Its source revision introduced `migrations/0002_shopify_connection.sql` and production code that reads and writes `shopify_connection`. Cloudflare Worker version 27 was uploaded at `2026-08-16T17:26:21Z`, with source reported as `wrangler`. The reported production behavior established that the new code became active while migration 0002 was still pending.

The database is no longer in that incident state. Read-only inspection during this audit found migrations 0001, 0002, and 0003 recorded in `d1_migrations`, and `wrangler d1 migrations list DB --remote` reported no pending migration. Later Wrangler deployments exist through version 36. This proves current convergence, not safety of the Git deployment that caused the mismatch.

The applied timestamp returned for migration 0002 was not used to infer incident ordering because it did not align reliably with the other observed clocks. The merge time, Worker version time, repository history, effective deployment behavior, and the owner's direct observation are sufficient to locate the missing lifecycle step.

## Current architecture

The application runtime receives logical binding `env.DB`. Runtime source has no Cloudflare management credential and no startup migration runner. Shopify activation and Shopify synchronization assume their committed tables already exist; neither operation applies migrations.

The repository uses Wrangler's standard D1 migration mechanism:

- `wrangler.jsonc` binds logical name `DB` and sets `migrations_dir` to `migrations`;
- ordered SQL files are `0001_owner_auth.sql`, `0002_shopify_connection.sql`, and `0003_shopify_inventory.sql`;
- Wrangler records applied files in `d1_migrations` and applies only pending migrations;
- local setup, CLI provisioning, tests, and the package deploy script consume the same migration files rather than a custom migration engine.

This is compatible with the Rails-like pending-only requirement in ADR-0004. The defect is deployment orchestration, not migration file format or D1 tracking.

## Git history

The first production migration entered the repository in `74570f4` (`Owner + session + D1`). Local automatic application was added in `9036fae` (`Implementar setup:local`). The explicit CLI provisioner followed in `fe7a5e2` (`Implementar provisioning remoto de Cloudflare`).

Commit `bfdbd37d72ecfe34dcbe3af4491f8c10a99b5a49` (`Deploy to Cloudflare / one-click experience`) added:

```text
db:migrations:apply = wrangler d1 migrations apply DB --remote
deploy             = pnpm db:migrations:apply && wrangler deploy
```

It also added a test described as the native Workers Builds migration-before-deploy flow and documentation saying Workers Builds runs `pnpm deploy`. Full-history searches found no later deletion, commenting, disabling, or replacement of either command. No disabled workflow, commented migration step, or documented temporary removal was found.

Therefore the migration step was implemented in repository scripts but was not used by the Git-triggered deployment. This is not a case where the migration mechanism was removed.

## Deployment path matrix

| Publication path                    | D1 creation/selection                                                                       | Migration execution                                                                                         | Ordering and failure behavior                                                                                                                                                 | Upgrade safety                                                                       |
|-------------------------------------|---------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| Git/default-branch Cloudflare Build | Native Cloudflare provisioning or the deployment's existing `DB` binding                    | Repository contains `pnpm deploy`, but the observed Git deployment did not execute its migration subcommand | New code was published despite a pending migration; no fail-closed ordering was effective                                                                                     | Unsafe                                                                               |
| CLI `pnpm provision:cloudflare`     | Script creates or reuses deterministic D1, verifies ID/name, and regenerates ignored config | Explicit `wrangler d1 migrations apply DB --remote --config .wrangler.production.jsonc`                     | Runs after build and before `wrangler deploy`; a nonzero child exit rejects provisioning and prevents the later deploy call                                                   | Safe in implementation and previously validated against remote D1                    |
| Deploy to Cloudflare button         | Native flow is expected to provision/bind `DB`                                              | Documentation expects Workers Builds to run `pnpm deploy`                                                   | Clean-account flow remains unvalidated; because the effective Git-build command is not repository-controlled or verified, migration-before-deploy cannot currently be claimed | Not verified and unsafe to advertise as guaranteed                                   |
| Manual `pnpm deploy`                | Uses the `DB` resolved by committed Wrangler configuration/environment                      | `pnpm db:migrations:apply`                                                                                  | Shell `&&` prevents `wrangler deploy` when migration apply fails                                                                                                              | Safe only when invoked with the intended production binding and adequate credentials |
| Manual raw `wrangler deploy`        | Uses configured binding                                                                     | None                                                                                                        | Publishes code directly                                                                                                                                                       | Unsafe for schema-changing revisions                                                 |

Local `pnpm setup:local` is not a publication path. It runs standard local migrations before printing the authorized setup URL and is safely repeatable.

## Cloudflare Builds configuration

Repository evidence defines `pnpm build`, `pnpm deploy`, and the desired root-level execution, but no tracked file controls the Cloudflare dashboard's Git build/deploy command. There is no GitHub Actions workflow. Current Cloudflare documentation describes separate build and deploy commands and gives `npx wrangler deploy` as the default deploy command; it permits replacing that command with a package script.

The read-only Wrangler interfaces available during this audit exposed deployed version source and time, but not the dashboard's build command, deploy command, or root-directory settings. Therefore their literal current values could not be independently read. The effective behavior is nevertheless conclusive: the deployed Git revision bypassed `pnpm deploy`, because that script runs migration apply first and uses `&&`; a failed migration would have prevented deployment rather than silently continuing.

The repository documentation's claim that Workers Builds runs `pnpm build` followed by `pnpm deploy` is therefore not supported by the observed deployment. This is configuration drift or missing remote wiring as a secondary contributor, but the primary root-cause category remains that the implemented migration step was not used by Git deployment.

Cloudflare's documented automatically generated Workers Builds token permissions do not explicitly establish D1 Edit access. Before enabling the repository migration command in Builds, the deployment identity must be verified to have the narrow D1 permission required by Wrangler. If it does not, the platform build token must be configured accordingly; failure must remain fatal. No credential value was inspected or recorded.

Sources consulted:

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)

## Current migration consumers

| Consumer                         |        Applies pending migrations? | Evidence                                                                             |
|----------------------------------|-----------------------------------:|--------------------------------------------------------------------------------------|
| Normal Worker startup/request    |                                 No | No runtime migration runner or management operation exists                           |
| Shopify activation               |                                 No | Activation reads/writes `shopify_connection` directly                                |
| Integration activation generally |                                 No | Registry/lifecycle composition has no migration execution                            |
| Git deployment                   |  No in the observed effective path | Code deployed while migration remained pending                                       |
| CLI provisioning                 |                                Yes | Explicit standard remote apply precedes deploy in `provisionCloudflare()`            |
| Manual `pnpm deploy`             |                                Yes | Package script chains pending migration apply before Wrangler deploy                 |
| Local setup                      |                       Yes, locally | `local-bootstrap.mjs` invokes local Wrangler migration apply before setup URL output |
| Worker tests                     |                 Yes, test database | `cloudflare:test` applies committed migrations to isolated D1 state                  |

Running migrations from Worker request/startup code would require embedding management behavior or reimplementing D1 migration orchestration in runtime code. That is neither present nor necessary. Standard Wrangler execution in the deployment control plane is the smaller and safer lifecycle.

## Remote schema evidence

The deployed Worker is bound to the D1 database selected as logical binding `DB`. Read-only remote commands reported:

```text
0001_owner_auth.sql         applied
0002_shopify_connection.sql applied
0003_shopify_inventory.sql  applied
pending migrations          none
```

Read-only SQL selected only `id`, `name`, and `applied_at` from `d1_migrations`; it wrote no rows. The currently inspected feature revision contains the same three migration files. The public `main` revision at the time of inspection contains through migration 0002; migration 0003 belongs to later feature work. Current production schema therefore is not behind this checkout, but that later state does not make the Git upgrade path safe.

## Reconstructed timeline

```text
T0  Production D1 contains migration 0001.

T1  main receives PR #18, including migration 0002 and code that requires
    shopify_connection.

T2  Cloudflare Git integration starts its build from main.

T3  Application build succeeds. The effective deploy path invokes Wrangler
    deployment without first executing the repository's db:migrations:apply.

T4  Worker version 27 is uploaded and new code becomes active.

T5  Production D1 remains at migration 0001 because the standard pending
    migration step was absent from that path.

T6  Runtime code and production schema are inconsistent until a later
    explicit Wrangler/CLI operation applies the pending migration.
```

The exact missing step is `wrangler d1 migrations apply DB --remote` against the production binding before Worker publication.

## Root cause

Primary category:

`MIGRATION_STEP_IMPLEMENTED_BUT_NOT_USED_BY_GIT_DEPLOY`

Evidence:

1. `pnpm deploy` has contained migration-before-deploy since `bfdbd37`.
2. History contains no removal or disablement.
3. CLI provisioning independently applies migrations before deployment.
4. The Git-triggered deployment succeeded while the migration remained pending, which cannot occur through the repository's `&&` chain.

Secondary contributing causes:

- Cloudflare Builds command settings live outside the tracked repository and their literal values are not checked by tests.
- Documentation and a unit test assert the intended package scripts, not the effective remote command.
- The general self-hosted upgrade flow remains explicitly open in GAP-014.

This is not `MIGRATION_COMMAND_EXECUTED_BUT_FAILED`: if the implemented command had failed, its nonzero exit would have stopped the chained deploy. It is not `WRONG_D1_DATABASE_TARGETED`: the incident was absence of the migration, and the currently bound DB later accepted the same migration set.

## Migration idempotency and failure semantics

The migration filenames are stable and ordered. Wrangler's `d1_migrations` table supplies applied-file tracking and pending-only execution. Rerunning the standard apply command with no pending files is safe; individual SQL files do not need to be manually replayed or treated as ad-hoc setup scripts.

CLI provisioning has the required control flow: migration failure rejects before deployment. `pnpm deploy` has equivalent shell failure semantics. Git deployment currently lacks that connection, so migration failure—or total omission—does not enforce the code/schema compatibility invariant.

## Existing-installation upgrades

Existing-installation upgrades are `PARTIAL`:

- an owner can use the validated CLI provisioner, which reuses D1 and applies only pending migrations before deploying;
- a direct manual `pnpm deploy` can provide the same ordering when correctly configured;
- Git/default-branch deployment does not currently guarantee migration execution;
- Deploy to Cloudflare updates and upstream-fork behavior are unvalidated;
- rollback and recovery after a migration succeeds but code deployment later fails remain open in GAP-014.

This audit does not design the complete update policy. It establishes that automatic Git publication cannot be considered an upgrade path until it enforces the standard migration step.

## Test coverage

Existing tests cover:

- applying the real migration set to an isolated Worker test D1;
- fresh local setup and migration-before-setup-URL ordering;
- preservation of local configuration on repeated setup;
- migration and deployment script declarations in `package.json`;
- CLI provisioning's D1 selection and defensive deployment arguments;
- production-path application behavior against migrated test databases.

Missing deployment-lifecycle coverage includes:

- an existing database with migration N plus a newly pending N+1 in a Git-build-equivalent flow;
- proof that the configured Cloudflare deploy command invokes `pnpm deploy` rather than raw Wrangler deploy;
- migration failure preventing Worker publication;
- a no-pending migration redeploy through the actual Git path;
- code/schema compatibility validation after a real existing-installation upgrade;
- recovery when migration succeeds but the subsequent code deployment fails.

The test named `declares the native Workers Builds migration-before-deploy flow` only reads strings from `package.json`; it cannot detect remote dashboard configuration drift and would not have prevented this incident.

## Findings

### P1-1 — Git deployment can activate code against an older schema

The effective default-branch deployment path omits pending D1 migrations. Schema-dependent code can become active before its required migration, as occurred with migration 0002. This is a deployment correctness blocker.

### P1-2 — Migration failure is not a gate in the Git deployment path

Because the Git path does not run the standard migration command, it cannot fail closed when a pending migration fails. The documented compatibility invariant is not enforced for the normal automatic publication route.

### P2-1 — Deployment paths have inconsistent migration guarantees

CLI provisioning and manual `pnpm deploy` have migration-before-deploy ordering; Git deployment and the unvalidated Deploy-to-Cloudflare path do not have verified equivalent behavior. Existing owners therefore receive different upgrade safety depending on how code is published.

### P2-2 — Regression tests validate declarations, not deployment orchestration

Current tests do not exercise a Git-build-equivalent migration gate or verify the remote deploy command. They would pass while Cloudflare uses a raw Wrangler deploy command.

### P3-1 — Documentation overstates the browser/Git migration lifecycle

The runbook says Workers Builds runs `pnpm deploy` and applies migrations before deployment. The observed incident disproves that statement for the actual configured Git path. GAP-004 and GAP-014 more accurately retain the uncertainty.

No P0 finding was identified. The inspected migrations showed no destructive statement, data corruption, or secret exposure associated with this incident.

## Recommended standard correction

Configure the Cloudflare Git deployment's deploy command to invoke the repository's migration-gated script (`pnpm deploy`) after its normal build, or an equivalent explicit `wrangler d1 migrations apply DB --remote && wrangler deploy`. Verify that the native Cloudflare build identity has the minimum D1 permission needed for the bound production database. Keep the standard Wrangler migration files and tracking; do not add a runtime migration engine. Add a Git-build-equivalent regression that proves a migration error prevents the deploy command from running.

This preserves one Worker, one D1, the free-tier objective, and the existing CLI provisioner. It also places infrastructure evolution in the deployment control plane, where the Cloudflare management identity already belongs, rather than in application request handling.

A later task must separately decide recovery semantics for the uncommon case where a backward-compatible migration succeeds and the subsequent Worker upload fails. That does not justify allowing code deployment before migrations.

## Explicit conclusions

### ROOT CAUSE

`MIGRATION_STEP_IMPLEMENTED_BUT_NOT_USED_BY_GIT_DEPLOY`

### CURRENT GIT DEPLOY MIGRATION SAFETY

`UNSAFE`

### CLI PROVISIONING MIGRATION SAFETY

`SAFE`

### EXISTING INSTALLATION UPGRADE PATH

`PARTIAL`

### MIGRATION FIX

`REQUIRED BEFORE FURTHER MVP WORK`
