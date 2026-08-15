# Security and Privacy

## Status

This document records agreed requirements. It does not claim controls are implemented; the repository contains no product yet.

`universal-data-mcp-worker` is public. Treat history, documentation, examples, fixtures, logs, and screenshots as publicly visible.

## Initial Model

The self-hosted deployment has one owner. Do not design multi-user behavior, organizations, RBAC, invitations, email verification/recovery, or enterprise identity.

Admin Web must eventually use a standard Worker-compatible mechanism with an admin credential, secure password hashing, session, `HttpOnly`/`Secure`/appropriate `SameSite` cookie, logout, and credential rotation when implemented.

Select the library, compatible algorithm, and session semantics during technical design based on maintenance and security evidence. Do not invent cryptography.

## Secrets and Sensitive State

- Fixed sensitive configuration uses Cloudflare secrets/environment configuration.
- Persisted sensitive state is encrypted in D1 where appropriate.
- Encryption keys never live in D1 or logs.
- Design must allow future key versioning/rotation without anticipating a custom KMS.
- Never commit credentials, tokens, keys, personal payloads, or real debugging data.
- Future examples use clearly fictional, non-reusable values.
- Do not publish private endpoints or operational details that enable abuse of a real deployment.

## Minimization and Telemetry

Remote telemetry is disabled by default, and the system must work fully that way. Future support telemetry must be explicit, temporary, minimal, and disableable.

Normally exclude personal data, detailed sports metrics, complete payloads, credentials, and tokens from logs. Diagnostics should prefer error codes, counts, durations, timestamps, and minimal technical state.

## Destructive Operations

Reset/delete requires explicit confirmation. Disablement does not immediately delete history; it follows the retention policy in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md). Recreating D1 is not normal maintenance.

## Implementation Validation

- authentication/session failures, invalid credentials, and expiration;
- secure cookie attributes;
- no secrets or sensitive data in logs/errors;
- encryption and decryption failure once sensitive state exists;
- destructive-operation confirmation;
- provider credential revocation behavior;
- secure behavior when sensitive configuration is missing or invalid.

Add a complete threat model and incident runbooks before exposing a real deployment, based on implemented surfaces.

GitHub Private Vulnerability Reporting is confirmed disabled and no verified fallback exists. Public policy and the blocker are in [`../../SECURITY.md`](../../SECURITY.md) and [`GAP-005`](../gaps/GAP-005-public-repository-security-reporting.md).
