# Cloudflare Self-hosted Installation

## Status

**Implemented and infrastructure-validated.** On 2026-08-15, an authenticated Cloudflare installation verified D1 creation and reuse, remote migration application and repeatability, Worker deployment, binding acceptance, HTTPS Admin API behavior, setup status, and authorized-link generation. The installing owner must still complete account creation in their browser; the provisioner never chooses owner credentials.

## Purpose

Provision one self-hosted installation without manually editing D1 IDs, running SQL, generating a bootstrap proof, or constructing its setup URL.

Provisioning owns Cloudflare management operations. The deployed Worker consumes only the logical `DB`, `LOGIN_RATE_LIMITER`, and `OWNER_SETUP_TOKEN` bindings.

## Normal path

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
3. creates ignored `.wrangler.production.jsonc` with the non-secret database ID and a stable, installation-specific rate-limit namespace, leaving the committed template account-neutral;
4. builds the application;
5. applies pending migrations through binding `DB` with `--remote`;
6. generates a 256-bit bootstrap proof when setup requires one;
7. writes that proof only to a mode-`0600` temporary file outside the repository;
8. uploads the proof and code together with Wrangler's `--secrets-file` mechanism;
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

- Existing configured D1: verified by ID and name, then reused.
- Draft D1 configuration with an existing deterministic database: reused and bound automatically.
- Missing D1: created once through Wrangler.
- Applied migrations: Wrangler applies only pending files.
- Existing Worker: deployed without replacing its secret before setup status is checked.
- Existing Worker without this installation's generated configuration: provisioning refuses to overwrite unknown routes or settings.
- Existing owner: owner, sessions, database, and bootstrap secret remain untouched; the normal login URL is printed.
- Setup incomplete: a new proof is generated explicitly, deployed, and printed; the previous setup link stops working.
- Missing/mismatched configured D1: provisioning stops without creating a replacement.

Provisioning is never a reset operation. It does not delete resources or owner data.

## Secrets

| Name | Source | Lifetime | Storage |
|---|---|---|---|
| `OWNER_SETUP_TOKEN` | Generated with Node cryptographic randomness | Required only until the singleton owner exists | Cloudflare Worker secret; temporary upload file is deleted |

No user-supplied runtime secret currently exists. Cloudflare authentication remains in Wrangler's standard credential storage and is never passed to the Worker.

After owner creation, the backend permanently refuses replacement even if the proof remains configured. Removing the now-unused secret with Wrangler may be added to a validated operational flow later; it is not automated before real deployment behavior is observed.

## HTTPS and login abuse control

The provisioning configuration explicitly enables the HTTPS-capable `workers.dev` route. The provisioner emits only an `https://` setup URL, verifies the HTTPS setup-status request, and requires insecure HTTP to redirect to HTTPS or return the application's `426 HTTPS_REQUIRED` response.

`LOGIN_RATE_LIMITER` remains the single accepted abuse-control mechanism. Provisioning derives its positive integer namespace from the D1 installation ID so different installations in one account do not intentionally share counters. A successful Wrangler deploy validated that Cloudflare accepts the binding configuration; threshold behavior remains covered by Worker tests rather than a deliberate production lockout test.

## Failure behavior

- Authentication failure: run `pnpm exec wrangler login`; no project resource is changed.
- D1 mismatch: inspect the authenticated account and checkout; do not delete or replace the database automatically.
- Build failure: no migration or deployment follows.
- Migration failure: deployment stops; the installation is not reported successful.
- Deployment failure: the database and completed migrations remain for safe reuse; rerun after correcting the reported error.
- Setup/HTTPS validation failure: provisioning reports failure and does not claim a usable installation.

Never delete a production D1 database as routine recovery.

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

The installing owner completes username/password creation, session restoration, logout, and subsequent login through the generated link. These behaviors are already covered by the production-path Worker and Admin tests; the provisioner deliberately does not create credentials on the owner's behalf.
