# ADR-0001: Shared Core and Integration Vertical Slices

- Status: Accepted
- Date: 2026-08-15
- Source: `AGENTS.md`

## Context

Garmin is the first real integration, but using its domain as the shared model would obstruct other sources. Building a universal framework before evidence would create speculative complexity.

## Decision

Separate shared mechanisms from vertical slices:

- shared behavior lives in core;
- Garmin-aware behavior lives in its slice;
- reuse mechanisms, not models;
- a deployment may contain N compiled and registered integrations;
- there is no dynamic discovery or plugin framework;
- MCP has a shared runtime and integration-specific capabilities;
- sync has shared orchestration and slice-specific decisions;
- D1 provides shared infrastructure while schemas and queries belong to slices.

Final granularity and concrete contracts are not part of this decision.

## Alternatives Considered

1. Garmin-shaped core: initially direct, but contaminates shared mechanisms.
2. Generic integration framework: promises extensibility without real cases to justify its contract.
3. Fully isolated integrations: minimizes abstraction but duplicates transversal mechanisms.

## Consequences

- Garmin can be solved vertically without becoming a universal contract.
- Shared abstractions require evidence and must remain small.
- Registered integrations are known at build/deploy time.
- No fictional source will be implemented to prove extensibility.
- TypeScript contracts, schemas, and specific tools remain open until detailed design.

## Future Verification

Verify that core imports no Garmin knowledge, inactive integrations expose no capabilities, and bootstrap/sync/reconciliation reuse mechanisms while preserving idempotency.
