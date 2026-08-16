# GAP-003: Sync, Freshness, Bootstrap, and Retention

- Status: Open
- Source: `AGENTS.md`

## Unknowns

- Initial historical bootstrap window.
- Concrete TTL/freshness rules for `HOT`, `DAILY`, and `HISTORICAL`.
- Background and on-demand sync frequency/scope.
- When and how far reconciliation should run.
- Default retention value `N`.
- Exact token retention/revocation policy on disablement.

## Why It Does Not Block Now

Shared mechanisms, slice responsibility, idempotency, and disable/reactivate/purge semantics are decided. Values depend on real Garmin behavior, cost, and mutability.

The first Shopify ingestion consumer now proves a bounded manual cursor scan, resumable partial coverage, deterministic upserts, and complete-scan-only reconciliation. It deliberately does not select a background cadence, freshness policy, retention period, or generic sync abstraction.

The Shopify order consumer adds a separate bounded manual scan of the standard recent 60-day order window. It rereads the full accessible window to capture edits, refunds, returns, and cancellations, checkpoints nested line-item pagination in D1, and keeps its coverage separate from inventory. This still provides no evidence for a scheduler, webhook policy, generic sync framework, or stale-running recovery beyond the existing single-owner manual guard.

## Evidence Needed to Close

- Dataset mutability and historical availability measurements.
- Observed provider limits, errors, and rate limiting.
- Request and D1 cost within the free tier.
- Real bootstrap/reactivation duration.
- User feedback on recovery and data minimization.

## Constraint While Open

Do not choose TTLs, frequencies, ranges, or `N` arbitrarily. Back initial choices with measurement and make them configurable where appropriate.
