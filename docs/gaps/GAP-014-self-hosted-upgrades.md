# GAP-014: Self-hosted Upgrade Flow

- Status: Open
- Source: Installation Bootstrap issue #6

## Unknowns

- How an installed fork receives upstream repository changes.
- Whether updates are owner-triggered or automated.
- When remote migrations run during an upgrade.
- How preview/staging databases remain isolated from production.
- How failed deployments and migrations are diagnosed or rolled back.
- Which compatibility window future releases guarantee.

## Why It Does Not Block First Installation

Initial provisioning creates one new installation from a known source revision. It can apply the complete current migration set before first use. Upgrade policy requires evidence from an existing deployed installation and at least one real schema/application change.

## Evidence Needed to Close

- A validated first Cloudflare installation.
- At least one backward-compatible application and D1 migration upgrade.
- Observed Workers Builds or owner-triggered update behavior on a user fork.
- Preview/production binding validation.
- A tested recovery path for build, deploy, and migration failure.

Do not turn first-install provisioning into a generic deployment or update framework while this evidence is absent.
