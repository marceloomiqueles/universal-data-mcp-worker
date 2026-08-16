# Operations and Runbooks

## Status

No production deployment runbooks exist because deployment has not been verified. The locally validated owner/session slice now supports the narrow development procedure below; broader operational instructions remain intentionally absent.

## Prepare Local Development

From an installed checkout, run:

```sh
pnpm setup:local
pnpm dev
```

Setup creates or preserves the ignored bootstrap secret, applies pending migrations to the local `DB` binding, and prints the authorized first-owner URL. Repeating it does not replace the proof, owner, or sessions. An existing invalid `.dev.vars` is left unchanged and must be reviewed deliberately.

## Reset Local Owner Authentication

Use this only when a disposable local development owner must be recreated:

```sh
pnpm auth:reset:local
pnpm setup:url
```

The reset deletes every owner/session row from the local D1 database while preserving its schema and migration history. It cannot target remote D1 because the command includes `--local`. It is destructive: the former local credentials and sessions stop working immediately. The second command prints the authorized first-run URL from the ignored `.dev.vars`; run `pnpm setup:local` instead if no local secret file exists or new migrations may be pending.

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
