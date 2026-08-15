# Repository Language Audit

- Audit date: 2026-08-15
- Scope: project-authored public repository artifacts
- Decision: English is the canonical repository language

## Method

The audit reviewed all repository files outside `.git`, with focused inspection of Markdown, GitHub issue forms, pull request templates, configuration descriptions, and agent instructions.

Findings were classified as:

1. translate now;
2. external/user data to preserve;
3. historical artifact with no value in changing;
4. human review required because translation could alter meaning.

## Findings

### Category 1 — Translated Now

Project-authored Spanish appeared in:

- `AGENTS.md`;
- `README.md` and `ARCHITECTURE.md`;
- `CONTRIBUTING.md`;
- ADRs and their index;
- audits and their index;
- gaps and their index;
- plans and runbooks;
- security documentation;
- standards and conventions;
- license analysis and documentation index.

These files were translated contextually while preserving architectural decisions, Markdown structure, technical identifiers, links, status semantics, and open questions.

### Category 2 — Intentionally Preserved External/User Data

No external or user-provided non-English data is currently committed. Product names, protocol names, trademarks, paths, URLs, and identifiers were preserved because they are proper nouns or technical identifiers, not authored-language exceptions.

Future Garmin payload values, user text, third-party fields, protocol-defined values, and external identifiers must retain their source form.

### Category 3 — Historical Artifacts

No committed artifact was exempted merely because it was historical. Existing audits remain public active documentation, so their authored narrative was translated while their historical facts were preserved.

Git history was not rewritten.

### Category 4 — Human Review

No passage required deferral for human review. Architectural terminology and decision meaning could be preserved without changing scope.

## Existing English Content Preserved

`CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `CHANGELOG.md`, GitHub issue forms, the pull request template, and `.gitignore` were already English and were not rewritten for stylistic uniformity.

## Result

All current project-authored public repository text is English. The authoritative future rule is in `AGENTS.md`, with contributor and style guidance in `CONTRIBUTING.md` and `docs/standards-and-conventions/style-and-formatting.md`.
