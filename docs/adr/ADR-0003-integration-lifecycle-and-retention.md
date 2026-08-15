# ADR-0003: Integration Lifecycle, Disablement, and Retention

- Status: Accepted
- Date: 2026-08-15
- Source: `AGENTS.md`

## Context

Integrations need understandable operational state and reversible disablement. Deleting data on disablement would force resynchronization and conflate stopping an integration with deleting information.

## Decision

Keep a small shared lifecycle that conceptually distinguishes registered, inactive, activating, active, degraded, and disabled/error. Exact names are not yet a contract.

When disabling an integration:

- remove its MCP capabilities;
- stop background sync;
- retain data for a configurable `N`-day window;
- allow reactivation to reuse data where possible;
- purge safely and idempotently after expiration.

Reset/delete is a separate destructive operation requiring confirmation. Secrets/tokens may have stricter policy than historical data.

## Alternatives Considered

1. Delete on disablement: simple but destructive for a reversible action.
2. Retain forever: easy reactivation but conflicts with minimization and owner control.
3. Exhaustive state machine: premature before behavior is implemented.

## Consequences

- Shared lifecycle and provider details remain separate.
- UI must show state, purge date, and suggested actions.
- Purge, retry, and reactivation require idempotency tests.
- `N`, exact transitions, and token policy remain open.

## Future Verification

Verify that disablement preserves history, removes capabilities, and stops sync; that reactivation reuses valid state; and repeated purge produces the same final state.
