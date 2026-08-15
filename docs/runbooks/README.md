# Operations and Runbooks

## Status

No executable runbooks exist because there is no application, deployment, command, or verified signal. Inventing them would create false operational capability.

This document records the agreed operational contract and the threshold for creating concrete procedures.

## Target Experience

```text
Deploy → Admin Web → connect → activate → synchronize → connect MCP → use
```

A non-technical person should not need to edit code, run manual SQL/migrations, register tools individually, operate multiple services, or understand MCP internals.

## Agreed Local Diagnostics

The panel should communicate actionable states such as:

- Worker healthy/degraded;
- MCP ready/not ready;
- D1 healthy/degraded where applicable;
- integration active/degraded/disabled;
- last sync and last error;
- next purge date;
- useful counts without sensitive information;
- suggested action in understandable language.

This does not define endpoints, metrics, alerts, or log formats.

## Operational Constraints

- One deployment and owner.
- Remote telemetry disabled by default.
- Additional infrastructure close to `$0` within the free tier for reasonable personal use.
- Bounded retries with backoff for transient failures; no endless retries hiding permanent failures.
- Confirmation for destructive operations.
- Repeatable, idempotent migrations and purge.

## When to Create a Runbook

Create a runbook only when triggers, signals, and steps are verifiable. Include:

1. symptom or trigger;
2. impact and data that must not be exposed;
3. reproducible diagnosis;
4. safe mitigation/action;
5. exit condition;
6. escalation or gap when unresolved.

Evaluate the first candidates after deployment, Garmin connection, migrations, and sync exist. A real incident revealing a repeatable procedure should create or update the corresponding runbook.
