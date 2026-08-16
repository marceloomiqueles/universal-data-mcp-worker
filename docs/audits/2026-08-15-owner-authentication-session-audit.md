# Owner Authentication and Session Audit

- Date: 2026-08-15
- Scope: completed single-owner setup, authentication, Admin session, and Admin Web slice
- Method: independent read-only implementation, migration, test, configuration, and documentation review
- Result: accepted with two P2 and two P3 findings

## Executive Summary

The slice establishes the intended single-owner security boundary without coupling it to Garmin or MCP. First-owner creation requires a high-entropy deployment secret delivered to the SPA through a URL fragment and then sent in a dedicated header. D1 enforces a singleton owner, and owner creation plus the initial session occur in one transactional batch. Once an owner exists, the setup endpoint refuses all replacement attempts before evaluating the bootstrap proof.

Passwords are not stored in plaintext. They are represented by versioned PBKDF2-HMAC-SHA-256 verifiers with a unique 128-bit salt and 600,000 iterations. Sessions use 256-bit opaque random tokens; D1 stores only SHA-256 token digests. The browser receives the raw token only through an `HttpOnly`, host-only, `SameSite=Strict`, `/api`-scoped cookie with a 12-hour lifetime and `Secure` on HTTPS requests. Expiration is checked server-side, and logout deletes the persisted digest before expiring the cookie.

The Admin API protects non-public `/api/*` paths by default. Actual cookie-authenticated state changes validate an exact same-origin `Origin` and require JSON. `/mcp/*` remains an independent boundary. The SPA uses the production session controller and router, never reads the session cookie, does not persist credentials or bootstrap proof in browser storage, and does not render authenticated content while session state is unresolved.

No P0 or P1 findings were identified. Before public production use, the project should add a standard abuse-control mechanism for login attempts and make HTTPS enforcement an explicit deployment invariant. Neither finding demonstrates a current authorization bypass.

## Evidence Reviewed

- `src/worker/admin-api/auth.ts`
- `src/worker/admin-api/crypto.ts`
- `src/worker/index.ts`
- `migrations/0001_owner_auth.sql`
- `wrangler.jsonc`
- `src/admin/session.ts`
- `src/admin/router.ts`
- `src/admin/App.vue`
- `src/admin/views/LoginView.vue`
- `tests/worker/auth.test.ts`
- `tests/admin-spa.test.ts`
- `vitest.worker.config.ts`
- `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, and `TESTING.md`
- `docs/gaps/GAP-004-implementation-and-cloudflare-behavior.md`

External checks used only to validate platform/security claims:

- [Cloudflare D1 `batch()` documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) states that a batch is a SQL transaction and that failure aborts or rolls back the sequence.
- [Cloudflare Workers Web Crypto documentation](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) documents `crypto.getRandomValues()` as producing cryptographically sound random values.
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) lists PBKDF2-HMAC-SHA-256 with 600,000 iterations as its PBKDF2 configuration and prefers memory-hard alternatives where available.
- [Cloudflare HTTPS enforcement documentation](https://developers.cloudflare.com/ssl/edge-certificates/encrypt-visitor-traffic/) confirms that an active edge certificate alone does not prevent HTTP access and that HTTPS must be explicitly enforced.

## Findings

### P2-1 — Login attempts have no abuse control

`POST /api/auth/login` performs a 600,000-iteration password derivation for every structurally valid request. This deliberately keeps unknown-user and wrong-password behavior similar, but no rate limit, bounded delay, or other abuse control limits repeated guesses or computational denial of service.

The generic response prevents account enumeration, the password work factor slows guesses, and this is a single-owner self-hosted deployment. Those properties reduce impact but do not replace request-level abuse protection on a public endpoint.

Before public production guidance is declared complete, select the smallest standard Cloudflare-compatible control, verify its free-tier behavior, and test both ordinary failures and recovery from limiting. Do not introduce account lockout that lets an attacker permanently deny owner access.

### P2-2 — HTTPS is assumed rather than enforced

The session cookie adds `Secure` when `new URL(request.url).protocol` is `https:`. This supports local HTTP development, and HTTPS responses have the correct production attribute. The repository does not, however, reject or redirect non-local HTTP authentication requests, and no verified deployment procedure requires Cloudflare's HTTPS enforcement setting.

Consequently, a deployment reachable over HTTP could accept credentials and issue a cookie without `Secure`. The current production deployment remains explicitly unvalidated, so this is a deployment hardening gap rather than evidence of a bypass in the tested HTTPS path.

Before public production deployment, make HTTPS an explicit, tested invariant through the smallest supported platform or Worker mechanism. Retain HTTP only for clearly identified local development.

### P3-1 — Expired session rows are removed only during login

Server-side validation rejects expired sessions correctly. Persisted expired rows are deleted on a subsequent successful login, but validation itself does not delete them and no periodic cleanup exists. A deployment with no later login can retain obsolete token digests and timestamps indefinitely.

This does not revive sessions or expose raw tokens. Add bounded cleanup when a real operational mechanism justifies it; no new scheduled infrastructure is warranted solely for this scaffold-stage concern.

### P3-2 — `SECURITY.md` understates the implemented UI state

`SECURITY.md` describes the repository as containing an initial Admin authentication backend. The Admin setup, login, restoration, logout, and route-guard UI are now implemented. The reporting policy itself remains correct, but the status sentence is stale.

## Critical Check Matrix

|  # | Check                                  | Result                | Evidence and assessment                                                                                                                                                                                                                                                                                                                                        |
|---:|----------------------------------------|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|  1 | Setup claim after owner creation       | Pass                  | `setupOwner()` reads the singleton owner first and returns `409 ALREADY_CONFIGURED`; the old-proof test confirms no replacement.                                                                                                                                                                                                                               |
|  2 | Concurrent setup safety                | Pass                  | D1's `id = 1` constraint and transactional `DB.batch()` allow one winner; the production-path concurrency test observes one owner, one session, and statuses `201/409`.                                                                                                                                                                                        |
|  3 | Plaintext password persistence/logging | Pass                  | Only the versioned verifier is bound to D1. No application logging calls exist in the auth paths, and errors do not echo request bodies. Passwords necessarily exist transiently in request/UI memory and are cleared from form state after submission.                                                                                                        |
|  4 | Password hashing suitability           | Pass                  | PBKDF2-HMAC-SHA-256, 600,000 iterations, a random 16-byte per-password salt, a 32-byte derived key, versioned serialization, strict parser, and non-short-circuit byte comparison are implemented. This is an acceptable Workers-native PBKDF2 baseline, though memory-hard algorithms remain preferable where a suitable Workers implementation is justified. |
|  5 | Session-token entropy                  | Pass                  | `crypto.getRandomValues(new Uint8Array(32))` produces a 256-bit token encoded as 43 base64url characters.                                                                                                                                                                                                                                                      |
|  6 | Raw-token persistence                  | Pass                  | Only the SHA-256 base64url digest is stored. Tests compare the cookie token with the D1 value.                                                                                                                                                                                                                                                                 |
|  7 | `HttpOnly` cookie                      | Pass                  | Setup and login share `sessionCookie()`, which always adds `HttpOnly`; the Worker test verifies it.                                                                                                                                                                                                                                                            |
|  8 | `Secure` production cookie             | Pass with P2-2        | HTTPS requests add `Secure`, and the HTTPS Worker test verifies it. Repository-level HTTPS enforcement is not established.                                                                                                                                                                                                                                     |
|  9 | `SameSite` policy                      | Pass                  | `SameSite=Strict` is appropriate for a same-origin self-hosted Admin SPA/API. The cookie is also host-only and scoped to `/api`.                                                                                                                                                                                                                               |
| 10 | Server-side expiration                 | Pass                  | D1 stores `expires_at`; every protected/session validation rejects `expires_at <= now`. The test deterministically expires a row.                                                                                                                                                                                                                              |
| 11 | Logout revocation                      | Pass                  | Logout hashes the presented token, deletes its row, expires the cookie, and the old cookie subsequently receives `401`.                                                                                                                                                                                                                                        |
| 12 | Missing/invalid session rejection      | Pass                  | Current-session and default-protected Admin API paths return `401`; tests cover missing, malformed, expired, and logged-out tokens.                                                                                                                                                                                                                            |
| 13 | MCP coupling                           | Pass                  | `src/worker/index.ts` dispatches `/mcp/*` before any Admin auth behavior; Worker tests confirm unchanged neutral `501` responses.                                                                                                                                                                                                                              |
| 14 | CSRF protection                        | Pass                  | Setup, login, and logout require exact same-origin `Origin`; POST bodies must be JSON. `SameSite=Strict` adds browser-level defense. No other state-changing Admin operation exists yet. Future operations must preserve this invariant.                                                                                                                       |
| 15 | SPA token exposure                     | Pass                  | The session token is never returned in JSON or read by JavaScript. Requests use same-origin cookies. Bootstrap proof is intentionally captured from the fragment, removed synchronously before network I/O, kept in a non-reactive closure, sent only in the setup header, and cleared after success or terminal setup rejection.                              |
| 16 | Minimal D1 state                       | Pass with P3-1        | D1 contains one owner row and revocable session rows with only verifier, digest, identity, and timestamps. No raw tokens, bootstrap proof, or unrelated schema exists. Expired-row cleanup is opportunistic.                                                                                                                                                   |
| 17 | Sensitive logs/errors                  | Pass                  | No auth/session logging is implemented. Stable responses omit secrets, hashes, cookies, and internal exceptions. Invalid credentials use one generic response.                                                                                                                                                                                                 |
| 18 | Migration validity                     | Pass                  | The incremental migration creates two strict, narrowly scoped tables plus the expiration index. The official Worker test pool applies it and records one migration after repeated application.                                                                                                                                                                 |
| 19 | Production-path tests                  | Pass with limitations | Worker tests invoke the actual Worker entrypoint, auth handlers, D1 migration, and `workerd` runtime. Admin tests import the production session controller, router, and App. Browser-to-live-Worker end-to-end automation and production Cloudflare deployment are not claimed.                                                                                |
| 20 | Documentation accuracy                 | Pass with P3-2        | Architecture, README, testing instructions, setup-link handling, cookie/session design, and production gaps match code. `SECURITY.md` retains one stale backend-only status phrase.                                                                                                                                                                            |

## Additional Security Assessment

### Setup takeover resistance

Before owner creation, the attacker needs both the deployment URL and the independently configured high-entropy proof. The proof is absent from the initial HTTP request because it is in the URL fragment, removed from history immediately by the SPA, absent from D1 and responses, and compared through fixed-size digests. Exact-origin validation prevents a normal cross-site form or script from completing setup. After creation, the D1 singleton and early owner check permanently close setup regardless of proof possession.

This design still depends on the deployment owner keeping the setup link secret until use and removing the configured secret afterward as documented. Automated secure link generation remains an acknowledged deployment gap.

### Authentication behavior

Username comparison is case-insensitive after normalization. Login performs password verification before checking the normalized username, and wrong-username and wrong-password responses are identical. This avoids the obvious response-body enumeration distinction and substantially aligns computation across those cases. Setup status intentionally reveals only whether initial configuration is required.

### Session behavior

Each setup/login creates a fresh opaque token. Multiple active sessions are allowed, which is consistent with current requirements. There is no idle timeout or rotation; the documented model is a 12-hour absolute lifetime. These are policy choices rather than contradictions in this slice.

### Browser behavior

The router awaits session initialization before allowing navigation and treats guards as UX only. The App renders a dedicated loading state until the session resolves. Setup/login responses update only owner name and expiration in reactive state. Passwords remain component-local, are never stored in Web Storage, and are cleared after an authentication attempt.

## Validation Executed

The audit ran the repository's existing commands without modifying implementation:

```text
pnpm typecheck     PASS
pnpm lint          PASS
pnpm format:check  PASS
pnpm test          PASS — 15 Admin tests, 14 Worker tests
pnpm build         PASS
```

Production Cloudflare deployment, HTTPS routing configuration, abuse-control behavior, and free-tier CPU accounting were not validated and must not be inferred from the local results.

## Independent Conclusions

### OWNER SETUP

`ACCEPTED`

### SESSION SECURITY

`ACCEPTED`

### ADMIN API PROTECTION

`ACCEPTED`

### NEXT PRODUCT SLICE

`READY`
