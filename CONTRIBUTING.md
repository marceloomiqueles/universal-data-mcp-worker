# Contributing to universal-data-mcp-worker

Thank you for considering a contribution. This is a small, maintainer-led project. We favor focused changes, real evidence, and straightforward review. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Read This Before Contributing Code

The Project uses [FSL-1.1-ALv2](LICENSE): recent versions are source-available under the FSL `Competing Use` restriction and transition to Apache-2.0 according to the license terms. They are not OSI Open Source during the restricted period. The Project Owner may separately offer commercial products, licenses, hosting, and services.

You retain copyright in your contribution and remain free to use and license your own work independently. There is no copyright assignment. Code contributions require acceptance of the applicable [Contributor License Agreement](CONTRIBUTOR_LICENSE_AGREEMENT.md). The CLA permits sublicensing and explicit relicensing, including public, source-available, commercial, proprietary, dual-license, and multi-license distributions. Accepted contributions may therefore appear in separately licensed commercial or proprietary versions.

CLA acceptance must be durable and auditable: identity, CLA version, acceptance time, and associated GitHub or contributor identity must be recorded. A PR checkbox is not enough. The mechanism is not operational yet, so external code pull requests may be discussed and reviewed but must not be merged or incorporated. Do not manually copy or trivially rewrite external PR code to bypass this gate.

Current state: **EXTERNAL MERGES BLOCKED**. See [GAP-013](docs/gaps/GAP-013-auditable-cla-acceptance.md).

## Repository Language

English is canonical for all repository-authored code, documentation, issues, pull requests, UI text, tests, logs, and errors. Discussions may use another language, but committed artifacts must be English. Preserve external and user-provided data in its original form.

## Before You Start

Read the [README](README.md), [architecture](ARCHITECTURE.md), [ADRs](docs/adr/README.md), [gaps](docs/gaps/README.md), and [Definition of Done](docs/standards-and-conventions/definition-of-done.md). Coding agents must follow `AGENTS.md`.

Open an issue before a large or hard-to-reverse architectural change. Small, obvious documentation corrections need no prior issue.

## Development Environment

There is no executable application or tooling yet. Cloning the repository and editing Markdown with Git is currently sufficient. There are no build, lint, formatting, migration, or test commands to run. Verified commands will be documented when tooling exists; do not invent them.

## Contribution Flow

1. Search existing issues and describe the real problem or use case.
2. Agree on scope for non-trivial changes.
3. Make a small, focused change without unrelated cleanup.
4. Add tests proportional to risk when behavior changes.
5. Update documentation whose truth changed.
6. Identify all third-party material, its source, license, notices, and provenance.
7. Open a focused pull request and state what was and was not verified.
8. For external code, complete auditable CLA acceptance before merge once the mechanism is enabled.

Never publish credentials, tokens, personal data, complete provider payloads, private database dumps, or unsanitized logs. Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public issue.

## Tests, Migrations, and Idempotency

Follow the [testing policy](docs/standards-and-conventions/testing-policy.md). Once D1 exists, schema changes require incremental migrations that preserve existing deployments. Changes to bootstrap, sync, reconciliation, retries, migrations, retention, or purge must verify idempotency and partial-failure behavior.

## Documentation, ADRs, and Gaps

- Update documentation when behavior, operations, or decisions change.
- Create an ADR only for transversal or hard-to-reverse decisions.
- Create or update a gap when evidence is missing.
- Do not describe plans as implemented behavior.
- Keep the [documentation index](docs/index.md) current.

Before review, apply the [Definition of Done](docs/standards-and-conventions/definition-of-done.md) and disclose anything not verified.

## Governance and Recognition

Governance is intentionally maintainer-led, with no contributor tiers or formal voting. The Project is not obligated to accept a contribution. Accepted contributions are recognized through Git history and GitHub's contributors view.
