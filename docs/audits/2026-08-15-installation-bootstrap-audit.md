# Installation Bootstrap Audit

- Date: 2026-08-15
- Scope: local-development bootstrap, Wrangler self-hosted provisioning, and Deploy to Cloudflare entry path
- Method: independent read-only source, configuration, documentation, Git-state, clean-room, test, build, and deployed-state review
- Result: local installation accepted; Cloudflare provisioning implementation proven, but public deployment and safe re-run require fixes

## Executive Summary

The local-development path satisfies the documented target. In a clean temporary checkout, `pnpm install` succeeded, `pnpm setup:local` generated a 256-bit Base64URL proof in a mode-`0600` ignored file, applied the real D1 migration, and printed the authorized URL. A second setup preserved the proof and database and reported no pending migrations. After starting `pnpm dev`, first-owner creation, session access, logout, and login all succeeded against that clean local D1. The production Admin and Worker suites also passed from the clean checkout.

The Wrangler provisioning implementation has real Cloudflare evidence. The audited account has an active Worker version, a bound and migrated D1 database, a configured owner, HTTPS setup-status behavior, HTTP rejection on the Admin API, and the accepted login rate-limit binding. Runtime code depends on `env.DB`, not a D1 UUID or Cloudflare management credentials. The provisioner reuses D1 by ID/name, applies only pending migrations, generates a temporary proof cryptographically, uploads it through a mode-`0600` temporary secrets file, and deletes that file.

The public Deploy to Cloudflare claim is not currently operational. The checked-out branch is three commits ahead of `origin/main`; Cloudflare's button clones the repository's default branch, while `origin/main` lacks the deploy button, `provision:cloudflare`, the migration-before-deploy script, and the completed installation documentation. The button URL itself redirects correctly to Cloudflare's authenticated creation flow, but no clean-account button deployment was executed. Until the implementation is published on the default branch and that exact workflow succeeds, the button is not evidence of a usable installation path.

One additional safe-retry defect affects the Wrangler route. `.wrangler.production.jsonc` is an ignored local snapshot and `wrangler deploy` treats it as authoritative. When that file exists, the provisioner checks Worker existence but does not compare remote routes/settings before deployment. Actual provisioning validation previously removed an existing custom domain because it was absent from the generated configuration; the route had to be restored before the successful deployment. A stale generated file can therefore disrupt an existing installation even though D1 and owner data remain intact.

No P0 findings were identified. Two P1 findings block declaring Cloudflare installation ready for non-technical users or proceeding while the installation slice is treated as complete.

## Evidence Reviewed

- `README.md`, `ARCHITECTURE.md`, `TESTING.md`, and `SECURITY.md`
- `docs/runbooks/cloudflare-self-hosted-installation.md`
- `docs/gaps/GAP-004-implementation-and-cloudflare-behavior.md`
- `docs/gaps/GAP-014-self-hosted-upgrades.md`
- `scripts/local-bootstrap.mjs`
- `scripts/cloudflare-provision.mjs`
- `.dev.vars.example`, `.gitignore`, `package.json`, and `wrangler.jsonc`
- `migrations/0001_owner_auth.sql`
- `src/worker/index.ts` and `src/worker/admin-api/*`
- `src/admin/session.ts`, router, shell, and setup/login view
- local/provisioning, Admin SPA, and Worker tests
- local Git branch and `origin/main`
- active Cloudflare deployment and remote D1 migration state
- [Cloudflare Deploy to Cloudflare documentation](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Worker deployment/secrets-file behavior](https://developers.cloudflare.com/workers/wrangler/commands/workers/)

## Findings

### P1-1 — The public Deploy to Cloudflare target does not contain the installation implementation

The README in the checked-out branch contains the official button targeting `https://github.com/marceloomiqueles/universal-data-mcp-worker`. Cloudflare redirects that URL to its authenticated Workers creation flow and clones the repository's default branch. At audit time:

- `HEAD` is `bfdbd37` on `6-implement-first-installation-bootstrap-for-local-and-cloudflare-deployment`;
- the branch is three commits ahead of its remote tracking branch;
- `origin/main` and the remote feature branch both point to `2b0aa2b`;
- `origin/main/package.json` has neither `provision:cloudflare` nor the migration-before-deploy `deploy` script;
- `origin/main/README.md` explicitly says production deployment is unvalidated and contains no Deploy to Cloudflare button.

Therefore, clicking the canonical repository button after only publishing the current README would clone an incomplete default branch, and the current local button cannot be independently exercised from the public repository. Publish the complete installation commits to the default branch, then execute the button from the public README in a clean account before calling it supported.

### P1-2 — A stale generated Wrangler configuration can overwrite existing Worker routes/settings

The CLI provisioner correctly refuses to adopt an existing Worker when `.wrangler.production.jsonc` is absent. Once the ignored file exists, however, `workerExists()` only confirms that a deployment exists. `deploy()` then runs Wrangler with the generated file without comparing it to current remote routes or other dashboard-managed settings.

This is not hypothetical: during real provisioning validation, Wrangler warned that the local configuration differed from the remote Worker and removed the existing `manhattan.paperco.de` custom domain. The route was restored in the ignored generated configuration before the final successful deployment. Because that recovery state is neither portable nor tracked, a stale checkout can repeat the disruption.

D1 selection itself fails closed and no owner/data deletion was observed. The finding concerns availability and configuration ownership. Safe re-running must either preserve/verify relevant remote configuration or stop before applying a destructive configuration diff.

### P2-1 — Deploy-button bootstrap handoff remains a six-step, technical flow

Cloudflare natively provisions D1 and can request `OWNER_SETUP_TOKEN` from `.dev.vars.example`, but it cannot generate the proof and return it securely as a post-deploy URL fragment. The documented button path requires the user to:

1. select the button;
2. authorize source control and Cloudflare;
3. generate, paste, and retain a 43-character URL-safe secret;
4. start deployment;
5. manually combine the reported host and proof as `/login#bootstrap=<proof>`;
6. create the owner.

The documentation is honest and does not weaken takeover protection, but this is partial rather than one-click and remains demanding for the stated non-technical user. No custom hosted installer should be introduced merely to remove these steps.

### P2-2 — The actual Deploy to Cloudflare workflow has not been validated end to end

The button endpoint returned the expected redirect to Cloudflare's dashboard. The audit did not create a second repository, D1 database, Worker, or owner in a disposable account. Tests assert only the declared package scripts and binding description; they cannot prove Cloudflare's form handling, D1 substitution, secret configuration, Workers Builds commands, resulting hostname, or setup handoff.

The CLI installation has real deployed evidence, so this is not a general Cloudflare uncertainty. It is specifically a button/Workers Builds validation gap.

### P2-3 — Local Vite builds duplicate `.dev.vars` into ignored Worker build output

A clean build with a real local proof copied `.dev.vars` verbatim to `dist/universal_data_mcp_worker/.dev.vars`. The proof was not present anywhere under `dist/client`, and both `dist/` and `.dev.vars` are ignored, so no SPA or Git exposure was found. The CLI deployment also supplies the production proof through a temporary `--secrets-file`, not this local artifact.

Nevertheless, a plaintext copy in build output increases exposure if CI or support tooling archives the complete `dist/` tree. Document or eliminate that artifact before adopting build-output retention. This is hardening, not evidence that the current SPA or deployed Worker exposes the proof.

## Verification Matrix

| Area                          | Result               | Evidence                                                                                                                                                                              |
|-------------------------------|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Clean dependency installation | Pass                 | `pnpm install` completed from the committed lockfile in a temporary checkout.                                                                                                         |
| Local configuration           | Pass                 | `pnpm setup:local` created `.dev.vars` with mode `0600`; `.gitignore` excludes actual files and retains only the empty example.                                                       |
| Bootstrap entropy             | Pass                 | Node `randomBytes(32)` produces a 256-bit, 43-character Base64URL proof; distinct-value and format tests pass.                                                                        |
| Local D1 initialization       | Pass                 | Wrangler created local state through logical binding `DB` and applied `0001_owner_auth.sql`.                                                                                          |
| Local migration repeatability | Pass                 | A second setup reported no pending migrations and preserved the original proof.                                                                                                       |
| Authorized local URL          | Pass                 | Setup printed the exact `/login#bootstrap=<proof>` contract after migrations succeeded.                                                                                               |
| Local owner/session journey   | Pass                 | Clean D1 returned `201` for setup, `200` for current session, `200` for logout, and `200` for subsequent login. Production UI/session tests cover the corresponding browser behavior. |
| Runtime D1 boundary           | Pass                 | Runtime source references `env.DB`; `database_id` appears only in Wrangler/provisioning configuration code.                                                                           |
| Deterministic production D1   | Pass                 | CLI selects the configured UUID or deterministic account-scoped name and refuses an unavailable/mismatched configured database. Real D1 was created once and reused.                  |
| Remote migrations             | Pass                 | Live Wrangler query reported no pending migrations. Deployment scripts reference binding `DB`.                                                                                        |
| Existing data preservation    | Pass with P1-2       | No D1/owner reset exists in provisioning; setup status now reports an owner. Worker route/settings preservation is not safe against stale generated config.                           |
| Secret in Git                 | Pass                 | No real bootstrap proof or Cloudflare credential is tracked. `.dev.vars`, `.wrangler.production.jsonc`, Wrangler state, and build output are ignored.                                 |
| Secret in SPA                 | Pass                 | The clean build contained no proof under `dist/client`; see P2-3 for the separate Worker build artifact.                                                                              |
| Proof persistence             | Pass                 | Schema contains only owner verifier and session digests; setup proof remains a Worker secret and is absent from D1.                                                                   |
| Setup-link handling           | Pass                 | Fragment is absent from HTTP loading, removed immediately by the SPA, held in memory, and sent only in the setup header. Owner existence permanently closes setup.                    |
| Cloudflare credentials        | Pass                 | Wrangler owns interactive authentication; runtime bindings contain no management token or account-management API access.                                                              |
| Worker deployed               | Pass                 | Active version `9e07a4a3-1d15-4296-a22a-94216ac6b004` was observed at 100%.                                                                                                           |
| Production setup state        | Pass                 | HTTPS setup status returned `setupRequired: false`; the real owner setup completed.                                                                                                   |
| HTTPS invariant               | Pass                 | HTTPS Admin status returned `200`; HTTP returned `426 HTTPS_REQUIRED`.                                                                                                                |
| Abuse control                 | Pass with limitation | The deployed Worker accepted `LOGIN_RATE_LIMITER`; tests cover threshold/recovery. Location-local permissive behavior remains a documented platform limitation.                       |
| Deploy button                 | Fail                 | Correct redirect observed, but target default branch is stale and no clean-account workflow was completed.                                                                            |
| Scope discipline              | Pass                 | No Garmin, MCP protocol, integration framework, additional provider, Terraform, Kubernetes, or hosted installer was introduced.                                                       |

## Security Assessment

### Bootstrap takeover resistance

Both installation paths retain the high-entropy proof outside account data. The server requires the proof only while the singleton owner is absent, compares it without plaintext persistence, atomically creates the owner/session, and refuses replacement once an owner exists. The URL fragment avoids sending the proof in the initial request and is removed by the SPA. The browser-assisted Cloudflare flow remains operationally awkward, but it does not weaken this model.

### Authentication and logging

Wrangler uses its standard OAuth/token storage; no Cloudflare credential enters repository configuration or Worker bindings. The provisioner prints the setup URL once because the installer must receive it, and documentation correctly treats that terminal as sensitive. Application logs record only sanitized technical error categories and never request bodies, passwords, cookies, hashes, or proof values.

### HTTPS and abuse control

The live Admin API demonstrated HTTPS operation and explicit rejection of non-local HTTP. The login endpoint uses the one accepted Cloudflare rate-limit binding before password verification and does not create permanent account lockout. The MCP boundary remains independent.

## Validation Executed

### Clean local checkout

```text
pnpm install       PASS
pnpm setup:local   PASS — secret created, migration applied, URL printed
pnpm setup:local   PASS — secret preserved, no pending migrations
pnpm dev           PASS after the existing process on fixed port 5173 was released
owner setup        PASS — HTTP 201
current session    PASS — HTTP 200
logout             PASS — HTTP 200
login again        PASS — HTTP 200
pnpm test          PASS — 13 Node, 17 Admin, 18 Worker tests
pnpm build         PASS
```

The initial `pnpm dev` attempt correctly failed because another user process occupied fixed port `5173`; no process was stopped by the audit. After the user released the port, the documented URL and journey succeeded without configuration changes.

### Real Cloudflare evidence

```text
active Worker version       PASS
remote pending migrations   PASS — none pending
HTTPS setup status          PASS — HTTP 200, owner configured
insecure Admin HTTP         PASS — HTTP 426
button redirect             PASS — Cloudflare dashboard target
clean-account button flow   NOT VALIDATED
```

No production resource, owner, session, secret, or configuration was modified by this audit.

## Independent Conclusions

### LOCAL INSTALLATION

`ACCEPTED`

### D1 PROVISIONING

`ACCEPTED`

### SECRET BOOTSTRAP

`ACCEPTED`

### CLOUDFLARE SELF-HOSTING

`REQUIRES FIXES`

### NON-TECHNICAL USER UX

`PARTIAL`

### NEXT PRODUCT SLICE

`BLOCKED`

The next slice should not begin while the public button targets a stale default branch and CLI re-runs can overwrite remote Worker routes/settings from a stale ignored configuration. P2 findings may follow immediately after those P1 blockers without redesigning the installation architecture.
