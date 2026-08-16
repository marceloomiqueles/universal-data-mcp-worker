# Security and Privacy

## Status

This document records implemented Admin authentication controls and requirements for future sensitive surfaces. It does not claim that Garmin, MCP authentication, or production deployment security has been implemented or validated.

`universal-data-mcp-worker` is public. Treat history, documentation, examples, fixtures, logs, and screenshots as publicly visible.

## Initial Model

The self-hosted deployment has one owner. Do not design multi-user behavior, organizations, RBAC, invitations, email verification/recovery, or enterprise identity.

The Worker implements one owner with a username and password. First setup requires a temporary high-entropy `OWNER_SETUP_TOKEN` Cloudflare secret and an atomic singleton D1 insert, preventing a public first visitor from claiming the deployment. The installation context provides the same proof in the fragment of a one-time setup URL. Fragments are not sent while loading the page; the SPA removes the fragment immediately, keeps the proof only in memory, and submits it through `X-Owner-Bootstrap-Proof`. The proof is not account form data, is never persisted, and cannot overwrite an existing owner.

Passwords are stored as versioned PBKDF2-HMAC-SHA-256 verifiers with a random 16-byte salt and 100,000 iterations through Workers Web Crypto. Cloudflare production rejects PBKDF2 iteration counts above 100,000, so this deployed profile is a documented platform constraint rather than the stronger parameter originally validated only in local workerd. Password input is bounded to 12–128 characters and 256 UTF-8 bytes, and Cloudflare rate limiting bounds online verification attempts. Plaintext passwords and setup tokens are not persisted. A stronger Workers-compatible password-hashing profile remains an explicit implementation gap.

Sessions use opaque 256-bit random tokens. Only SHA-256 token digests and timestamps are stored in D1. The raw token is returned only in an `HttpOnly`, `SameSite=Strict`, `Path=/api` cookie with a 12-hour absolute lifetime; HTTPS responses also set `Secure`. Logout deletes the session record. Expired sessions are rejected independently of cleanup. A presented expired session is deleted directly, and login deletes at most 100 other expired rows.

All non-public `/api/*` requests require a valid session. The only unauthenticated operations are setup status, first setup, and login. State-changing authentication requests require JSON and an exact same-origin `Origin` header. Credentialed cross-origin Admin API access is not enabled. A native Cloudflare binding rate-limits login attempts per source address with automatic window recovery and no account lockout record. Non-loopback Admin API requests require HTTPS. `/mcp/*` remains outside Admin-session behavior.

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

Add a complete threat model and incident runbooks before exposing a real deployment, based on implemented surfaces. Actual Cloudflare free-tier CPU behavior for the password work factor remains unvalidated; local workerd measurements are recorded in GAP-004.

GitHub Private Vulnerability Reporting is the verified private channel. Public policy and the closed decision are in [`../../SECURITY.md`](../../SECURITY.md) and [`GAP-005`](../gaps/GAP-005-public-repository-security-reporting.md).
