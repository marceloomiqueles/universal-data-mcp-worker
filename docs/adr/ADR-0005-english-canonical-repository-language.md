# ADR-0005: English as the Canonical Repository Language

- Status: Accepted
- Date: 2026-08-15
- Source: explicit maintainer decision

## Context

`universal-data-mcp-worker` is a public project intended for international collaboration. Repository material in multiple canonical languages would increase contribution friction, duplicate maintenance, and create documentation drift.

Design discussions and task prompts may still occur in Spanish or another language. External and user-provided data may also contain any language and must preserve source meaning.

## Decision

English is the single canonical language for all project-authored artifacts committed to the public repository, including code, identifiers, comments, documentation, UI copy, errors, logs, diagnostics, tests, examples, issues, pull requests, and agent-produced commit messages.

Anything materialized from a non-English discussion must be translated and normalized into clear technical English before commit.

External/user data, protocol-defined fields and values, external identifiers, names, and proper nouns are not translated merely to satisfy this convention.

Parallel translated documentation will not be maintained unless demonstrated demand and a sustainable maintenance strategy justify a later decision.

## Alternatives Considered

1. Keep Spanish as the documentation language: limits international participation.
2. Maintain English and Spanish in parallel: increases drift and maintenance without demonstrated demand.
3. Allow each artifact to use the author's language: creates an inconsistent public interface.

## Consequences

- Contributors and coding agents have one clear language contract.
- Existing project-authored Spanish documentation is translated to English.
- Private discussions retain language flexibility.
- External data is preserved rather than rewritten.
- Future translations require an explicit, evidence-based maintenance decision.

## Verification

- `AGENTS.md` contains the authoritative repository-language rule.
- `CONTRIBUTING.md` communicates the rule to external contributors.
- `docs/standards-and-conventions/style-and-formatting.md` defines authored-content and external-data boundaries.
- Existing public project-authored documentation is in English.
