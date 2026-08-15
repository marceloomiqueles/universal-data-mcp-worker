# Security Policy

## Supported versions

There are no released or supported versions yet. The repository contains an unreleased scaffold and an initial Admin authentication backend. This section will be updated when the first release exists.

## What to report privately

Treat a problem as a potential vulnerability when it could expose or compromise Garmin credentials or sessions, administrative access, encryption keys, sensitive configuration, personal/sports data, authorization boundaries, destructive operations, sync/migration integrity or a deployed Worker through practical abuse.

Ordinary bugs without security impact belong in GitHub Issues.

## Never disclose sensitive data publicly

Never put passwords, Garmin credentials, API credentials, access tokens, refresh tokens, encryption keys, Cloudflare secrets, personal data, sports or health data, private database dumps, full provider payloads containing personal information, session cookies, private endpoints, or unredacted logs in a public issue, pull request, or commit. If a secret may have been exposed, revoke or rotate it rather than relying only on deleting public content.

## Private reporting channel

Use [GitHub Private Vulnerability Reporting](https://github.com/marceloomiqueles/universal-data-mcp-worker/security/advisories/new). It is the Project's verified private channel. Do not open a public issue containing vulnerability details and do not send sensitive data through unrelated or unverified contacts.

No security email address is published. The reporting-channel decision is recorded in [GAP-005](docs/gaps/GAP-005-public-repository-security-reporting.md).

## Expected report and response

When private reporting is available, include the affected version/commit, realistic impact, minimal sanitized reproduction, affected components and possible mitigation. Avoid real user data.

The project is maintainer-led and offers no response-time SLA. The intended process is to acknowledge, assess impact, coordinate a fix with minimal disclosure, publish an advisory when appropriate and credit the reporter if they consent.

Runtime requirements are documented in [docs/security/README.md](docs/security/README.md). This policy does not claim protections that are not implemented.
