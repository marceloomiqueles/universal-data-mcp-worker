# Installation Bootstrap Remediation Re-audit

- Date: 2026-08-15
- Scope: focused, independent re-audit of the Installation Bootstrap remediation
- Method: read-only source, configuration, documentation, Git/GitHub, test, clean-checkout, build-output, and deployed-state inspection
- Result: implementation remediation accepted; two deployment validations remain pending

## Scope

This re-audit verifies only the findings from the prior Installation Bootstrap Audit and checks for regressions in previously accepted installation and authentication behavior. It does not redesign provisioning, validate upgrades, or evaluate future product slices.

Evidence was taken from the implementation rather than the remediation report. The review covered the Installation Bootstrap issue, accepted architecture decisions and gaps, the original audit, public documentation, installation scripts, security checks, tests, Git state, the current public repository, a clean temporary checkout, and read-only Wrangler deployment status.

No Cloudflare resource was created, modified, or deleted. A genuinely disposable installation with an intentionally unmanaged custom domain was not available, so the remote conflict scenario was not executed.

## Previous Findings

| Finding                              | Remediation claim           | Independent result                                                             |
|--------------------------------------|-----------------------------|--------------------------------------------------------------------------------|
| P1-1 Public Deploy target            | `REQUIRES MAINTAINER MERGE` | `RESOLVED`                                                                     |
| P1-2 Safe provisioning re-run        | `RESOLVED`                  | `RESOLVED` at implementation level; remote conflict validation remains pending |
| P2-1 Non-technical Deploy UX         | `IMPROVED`                  | `IMPROVED`                                                                     |
| P2-2 Clean Deploy-button validation  | `NOT YET VALIDATED`         | `NOT YET VALIDATED`                                                            |
| P2-3 Build-output secret duplication | `MITIGATED`                 | `MITIGATED`                                                                    |

## Git and Public Default-Branch State

The repository is no longer in the stale-default-branch state identified by the original audit.

```text
HEAD:                  9ff818a658aa491f8b3a299138573d21f3fe25e4
current branch:        main
origin/main:           9ff818a658aa491f8b3a299138573d21f3fe25e4
current upstream:      9ff818a658aa491f8b3a299138573d21f3fe25e4
feature branch remote: 4a5f724d3ae58855ccb243c61eaffa9dd641b745
```

GitHub reports `main` as the default branch of `marceloomiqueles/universal-data-mcp-worker`. The public `main` branch contains the installation scripts, D1 automatic-provisioning correction, documentation, and canonical Deploy to Cloudflare button. The button targets:

```text
https://deploy.workers.cloudflare.com/?url=https://github.com/marceloomiqueles/universal-data-mcp-worker
```

The public README explicitly says the clean-account flow is not yet validated and does not call the experience one-click. P1-1 is therefore resolved: the public target contains the advertised implementation and no longer points at stale code.

## Safe Provisioning Re-run Analysis

### Configuration ownership

The implementation and runbook establish a narrow ownership boundary.

Installer-owned configuration includes:

- Worker code deployment;
- static asset configuration;
- logical D1 binding `DB` and its selected database identity;
- `LOGIN_RATE_LIMITER` binding;
- temporary `OWNER_SETUP_TOKEN` upload while setup is incomplete;
- D1 migration execution.

Custom domains, unrelated routes, dashboard-managed variables, and unrelated remote settings remain externally managed.

### Generated configuration behavior

`.wrangler.production.jsonc` remains an ignored installation-local cache, but it is no longer used wholesale as authoritative input. On every run, the provisioner:

1. reads only the previous D1 ID and database name from the ignored file;
2. rewrites the file from committed `wrangler.jsonc`;
3. verifies or deterministically reuses the D1 database;
4. regenerates only installer-owned D1 and rate-limit binding values;
5. deploys using `wrangler deploy --strict --keep-vars`.

The current Wrangler help defines `--strict` as preventing uploads when remote changes conflict and `--keep-vars` as preserving dashboard-managed variables. The generated configuration does not import custom domains or routes. An existing Worker without this installation's generated configuration is rejected before deployment rather than adopted.

D1 selection also fails closed: a configured database must remain available with the expected name, the former zero UUID is rejected, and a missing configured database is not silently replaced. Already-applied migrations remain governed by Wrangler's standard migration tracking.

These source-level controls address the original destructive route-removal path. P1-2 is resolved at implementation level.

### Regression coverage

The tests verify:

- the exact defensive deployment arguments, including `--strict` and `--keep-vars`;
- regeneration from the committed template without a stale custom-domain route;
- public configuration without a placeholder D1 UUID;
- D1 reuse by configured ID and deterministic name;
- refusal of an unavailable configured database;
- refusal of the former zero-UUID placeholder;
- stable installation-specific rate-limit namespace generation.

Removing strict mode, trusting a stale route-bearing template, or changing D1 fail-closed selection would fail existing assertions. The original class of failure is therefore regression-protected at its narrow command/configuration boundary.

The tests do not orchestrate a complete mocked Wrangler re-run, and the custom-domain fixture is compared with the regenerated result rather than passed through the full provisioner. This is recorded as P3-1 below, not as evidence that the implemented safeguard is defective.

## Remote Validation Evidence

Read-only Wrangler inspection found an active deployment at 100% for the configured Worker. Existing documentation records real D1 creation/reuse, remote migrations, binding acceptance, HTTPS behavior, and authorized-link generation from prior validation.

This re-audit did not create an intentionally conflicting remote route or custom domain. It therefore cannot demonstrate that the currently installed Wrangler version preserves or rejects that exact real-platform conflict without mutation.

```text
REMOTE SAFE RE-RUN NOT YET VALIDATED
```

This is an explicit evidence gap, not a known implementation defect. The appropriate safe-re-run conclusion is `IMPLEMENTED — REMOTE VALIDATION PENDING`.

## Public Deploy to Cloudflare Status

The Deploy to Cloudflare button is visible on the public default branch and points to the canonical repository rather than a feature branch. The complete installation implementation is now on that branch.

The actual clean-account button workflow has not been completed. No evidence demonstrates a fresh button-created repository, D1, binding, migration, secret, Worker, owner setup, logout, and login sequence. The prior failed zero-UUID attempt is not successful validation, and the corrected configuration has not yet been proven from a clean button installation.

P2-2 remains `NOT YET VALIDATED`. This is accurately disclosed in the README and runbook, so the button does not make a false validation claim.

## Non-technical User Experience

The browser-assisted path removes D1 IDs, binding edits, Wrangler commands, and manual migration commands from the normal user flow. It provides a fixed copy/paste sequence and the exact setup-link template.

The remaining interactions are approximately:

1. select **Deploy to Cloudflare**;
2. authorize source control and Cloudflare and accept resource names;
3. generate one 43-character URL-safe value in a password manager;
4. paste and temporarily retain it as `OWNER_SETUP_TOKEN`;
5. start deployment;
6. place the deployed host and retained value into the documented setup-link template;
7. choose the owner username and password.

The user still manipulates the bootstrap-token format and setup URL even though the documentation avoids requiring knowledge of D1, bindings, migrations, or Wrangler. Cloudflare's native flow does not generate a high-entropy proof and return the corresponding fragment URL securely. The repository correctly avoids weakening takeover protection or introducing a hosted installer to hide that limitation.

P2-1 remains `IMPROVED`, and the non-technical experience remains `PARTIAL` rather than ready or blocked.

## Secret and Build-output Assessment

A production build with a real ignored `.dev.vars` file still produces:

```text
dist/universal_data_mcp_worker/.dev.vars
```

This is the Cloudflare Vite plugin's Worker-side local preview output. The mitigation is effective:

- `.dev.vars`, `dist/`, `.wrangler/`, and `.wrangler.production.jsonc` are ignored;
- no active `.dev.vars` value was found in tracked files;
- the active proof was absent from `dist/client`;
- `pnpm build` runs `scripts/check-client-secrets.mjs` after Vite;
- the check reads actual non-empty values from `.dev.vars`, rather than only a fixed fixture;
- positive and negative tests prove that a real configured value under `dist/client` is rejected;
- production CLI provisioning uploads its independently generated proof through a temporary mode-`0600` secrets file, not the local build artifact;
- documentation warns against archiving or sharing the complete `dist/` directory.

The plaintext duplication has not been eliminated, so P2-3 is `MITIGATED`, not resolved. No browser, Git, or production-deployment exposure was found.

## Local Installation Regression

A clean temporary checkout of `origin/main` was used without repository-local prior state.

```text
pnpm install       PASS
pnpm setup:local   PASS — created ignored secret, applied migration, printed URL
pnpm setup:local   PASS — preserved secret, reported no pending migrations
```

The generated setup URLs used the production `/login#bootstrap=<proof>` contract. Output was redacted during evidence collection. The second invocation did not rotate the secret, duplicate the migration, or reset local owner/session state.

## Authentication and Scope Regression

The production-path Admin and Worker suites passed. They retain coverage for owner setup, login, current session, logout, HTTPS enforcement, login limiting and recovery, protected Admin APIs, and independent `/mcp/*` routing.

The remediation did not introduce Garmin, MCP protocol behavior, integration registration, sync, capabilities, upgrade machinery, another cloud provider, Terraform, Kubernetes, a hosted installer, billing, or unrelated product behavior.

## Standard Validation

The first sandboxed worker-test attempt was blocked by local log and loopback permissions; it was repeated with the required local runtime permissions. That environment restriction is not a repository failure.

```text
pnpm install        PASS
pnpm typecheck      PASS
pnpm lint           PASS
pnpm format:check   PASS
pnpm test           PASS — 20 Node, 17 Admin, 18 Worker tests
pnpm build          PASS
client secret check PASS against the active local secret
```

The build confirmed the known Worker-side `.dev.vars` copy and a separate browser bundle under `dist/client` that passed the real-value secret inspection.

## Secret and Git Hygiene

Before creating this artifact, the worktree was clean. The following remain ignored and untracked:

- `.dev.vars`;
- `.wrangler.production.jsonc`;
- `dist/`;
- `.wrangler/` and local D1 state.

No bootstrap proof, Cloudflare management credential, generated production configuration, build output, or machine-specific runtime path was found in tracked implementation/configuration files. The audit document is the only intentional repository change.

## Finding Status Table

| Finding                              | Status              | Evidence summary                                                                                                                                                                                                                                 |
|--------------------------------------|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| P1-1 Public Deploy target            | `RESOLVED`          | `main`, `origin/main`, and the GitHub default branch contain the implementation and canonical button.                                                                                                                                            |
| P1-2 Safe provisioning re-run        | `RESOLVED`          | Generated config is rebuilt from committed input; D1 identity alone is retained; Wrangler strict mode fails on remote conflicts; variables are preserved; unknown existing Workers fail closed. Real remote conflict validation remains pending. |
| P2-1 Non-technical Deploy UX         | `IMPROVED`          | Infrastructure is native and documented, but proof generation/paste and setup-link construction remain manual.                                                                                                                                   |
| P2-2 Clean Deploy-button validation  | `NOT YET VALIDATED` | The current public default-branch button has not completed a disposable clean installation.                                                                                                                                                      |
| P2-3 Build-output secret duplication | `MITIGATED`         | Worker preview output still contains `.dev.vars`; Git/browser/deployment containment and actual-value checks are effective.                                                                                                                      |

## New Findings

### P3-1 — Safe re-run tests do not exercise the complete provisioning orchestration

The regression suite protects the decisive pure configuration and Wrangler-command boundaries, but it does not execute `provisionCloudflare()` against a narrow mocked Wrangler interaction sequence. The custom-domain test constructs a stale snapshot only to prove it differs from regenerated committed configuration; it does not feed the stale file through the complete re-run path.

This does not invalidate the source-level use of Wrangler's documented strict conflict check, and it overlaps with the explicitly pending disposable remote validation. A focused orchestration test would make ordering and use of the defensive arguments more resistant to future refactoring.

No P0, P1, or new P2 finding was identified.

## Independent Conclusions

### LOCAL INSTALLATION

`ACCEPTED`

### CLI CLOUDFLARE PROVISIONING

`ACCEPTED`

### SAFE PROVISIONING RE-RUN

`IMPLEMENTED — REMOTE VALIDATION PENDING`

### PUBLIC DEPLOY TO CLOUDFLARE

`NOT YET VALIDATED`

### NON-TECHNICAL USER UX

`PARTIAL`

### NEXT PRODUCT SLICE

`READY`

No P0 or P1 implementation defect remains. The clean Deploy-button exercise and disposable remote conflict exercise are installation evidence gaps that remain honestly disclosed; they do not justify blocking the next product slice.
