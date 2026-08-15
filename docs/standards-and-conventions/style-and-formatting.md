# Style and Formatting

## Canonical Language

English is the canonical language for every project-authored repository artifact: code, identifiers, comments, documentation, UI copy, errors, logs, diagnostics, tests, examples, issues, and pull requests.

Private discussions may use another language, but committed material must be normalized into clear technical English. Do not maintain parallel translations without an explicit decision and maintenance strategy.

Preserve external and user-provided data exactly where required. Do not translate Garmin payload values, third-party fields, protocol-defined values, external identifiers, names, or proper nouns merely to satisfy this convention.

## Documentation Rules

- README provides orientation; detail belongs in focused documents.
- Maintain one source of truth per topic and link instead of duplicating.
- ADRs record accepted transversal decisions; gaps record deliberate uncertainty; audits record dated evidence; plans record future work, not implemented promises.
- Use explicit states such as `decided`, `provisional`, `gap`, `out of scope`, and `not implemented`.
- Never include secrets, tokens, personal payloads, or examples containing real data.
- Do not document commands, routes, APIs, or schemas that do not exist.
