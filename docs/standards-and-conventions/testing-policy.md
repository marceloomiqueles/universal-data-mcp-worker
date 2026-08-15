# Testing Policy

## Status

No test framework or commands exist because there is no application. This policy defines priorities, not tooling or coverage thresholds.

## Criterion

Tests must be proportional to risk and protect meaningful behavior. Do not pursue coverage percentage for its own sake.

Priority:

1. integration lifecycle;
2. sync and idempotency;
3. persistence and migrations;
4. retention, reactivation, and purge;
5. error classification and propagation;
6. freshness and data quality;
7. MCP contracts;
8. Admin API;
9. authentication/session and encryption;
10. real edge cases.

## Requirements by Change Type

- Reproducible bug: regression test where reasonable.
- Sync: repetition, retry, partial failure, consistency, and relevant concurrency.
- D1/migrations: clean setup, upgrade, repeated execution, and data preservation.
- MCP: schemas, limits, pagination, and response minimization.
- Auth/encryption: success, rejection, expiration/failure, and no leaks.
- Retention: disable without deletion, reactivation, expiration, repeated purge, and confirmed reset.

Document concrete commands in `TESTING.md` once tooling is selected. Do not invent executable instructions before then.
