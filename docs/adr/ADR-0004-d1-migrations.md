# ADR-0004: Slice-Specific D1 Persistence and Automatic Idempotent Migrations

- Status: Accepted
- Date: 2026-08-15
- Source: `AGENTS.md`

## Context

Integrations may need local persistence and must evolve without recreating D1 or requiring manual SQL from non-technical owners. A universal schema would couple unrelated domains.

## Decision

Use D1 where appropriate, separating shared binding/execution/migration mechanisms from slice-specific schemas, indexes, mappings, and queries.

Migrations are incremental, versioned, safe, compatible with existing deployments, and recorded so only pending migrations run. Re-running after completion does not change state.

They may run during startup/deploy and integration activation where appropriate, with a Rails-like operational experience.

## Alternatives Considered

1. Recreate D1 on change: destructive and operationally unacceptable.
2. Manual migrations: hidden steps unsuitable for the target user.
3. Universal schema or JSON table: superficial simplicity that mixes integration semantics.

## Consequences

- Every schema change requires a migration and upgrade/repetition validation.
- Integration migrations stay in the slice while using the shared runner.
- Data-loss risk must be disclosed before implementation.
- Tooling, format, atomicity, and Worker/D1 sequencing remain open until tested.

## Future Verification

Verify clean database setup, upgrades, repeated execution, activation with pending migrations, and consistent recovery after partial failure.
