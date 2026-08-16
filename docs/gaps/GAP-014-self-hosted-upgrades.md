# GAP-014: Self-hosted Upgrade Flow

- Status: Open
- Source: Installation Bootstrap issue #6

## Unknowns

- How an installed fork receives upstream repository changes.
- Whether updates are owner-triggered or automated.
- Whether every self-hosted owner's remote Workers Builds trigger retains the required migration-gated deploy command and D1 permission.
- How preview/staging databases remain isolated from production.
- How failed deployments and migrations are diagnosed or rolled back.
- Which compatibility window future releases guarantee.

## Why It Does Not Block First Installation

Initial provisioning creates one new installation from a known source revision. It can apply the complete current migration set before first use. Upgrade policy requires evidence from an existing deployed installation and at least one real schema/application change.

## Evidence Needed to Close

- A validated first Cloudflare installation.
- At least one backward-compatible application and D1 migration upgrade.
- Observed Workers Builds or owner-triggered update behavior on a user fork.
- Evidence about how Deploy-to-Cloudflare-created forks receive and reconcile upstream changes without overwriting owner-specific resource configuration.
- Preview/production binding validation.
- A tested recovery path for build, deploy, and migration failure.

## Established Forward-Migration Path

The repository-defined forward path is now explicit:

```text
pnpm build
      ↓
pnpm deploy
      ↓
pending Wrangler D1 migrations
      ↓ success only
one Worker deployment
```

The orchestration is tested against isolated D1 state for pending, already-applied, and failing migrations. CLI provisioning already enforces equivalent migration-before-deploy ordering. Cloudflare Workers Builds stores its effective command and token outside the repository. A real build on 2026-08-16 confirmed `pnpm deploy`, sufficient D1 permission, successful no-pending behavior, and one subsequent Worker deployment. Forward migration ordering is therefore defined and the effective Git gate is verified; a real remote pending migration will be observed on the next legitimate schema change rather than manufactured in production.

Still open: upstream/fork update policy, automatic versus owner-triggered updates, preview/production isolation, backward-compatible migration policy, and recovery when a migration succeeds but the subsequent Worker upload fails.

Do not turn first-install provisioning into a generic deployment or update framework while this evidence is absent.
