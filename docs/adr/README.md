# Architecture Decision Records

This directory preserves accepted transversal decisions. `AGENTS.md` remains the primary source for principles and constraints; ADRs explain context, grouping, and consequences for hard-to-reverse decisions.

## Convention

- Sequential IDs use `ADR-XXXX`.
- Statuses are `Proposed`, `Accepted`, `Superseded`, or `Rejected`.
- Do not edit an accepted ADR to change its decision. Supersede it and preserve history.
- Do not create ADRs for local, reversible, or evidence-free choices; record those as gaps.

## Index

| ADR                                                                    | Status                                           | Decision                                                                     |
|------------------------------------------------------------------------|--------------------------------------------------|------------------------------------------------------------------------------|
| [ADR-0001](ADR-0001-core-and-integration-boundaries.md)                | Accepted                                         | Shared core, vertical slices, and compiled integrations                      |
| [ADR-0002](ADR-0002-single-worker-and-admin-surface.md)                | Accepted; frontend choice superseded by ADR-0007 | One deployment and Admin surface                                             |
| [ADR-0003](ADR-0003-integration-lifecycle-and-retention.md)            | Accepted                                         | Conceptual lifecycle, disablement, retention, and purge                      |
| [ADR-0004](ADR-0004-d1-migrations.md)                                  | Accepted                                         | Slice persistence and automatic/idempotent migrations                        |
| [ADR-0005](ADR-0005-english-canonical-repository-language.md)          | Accepted                                         | English as the canonical repository language                                 |
| [ADR-0006](ADR-0006-public-licensing-and-contribution-rights-model.md) | Accepted                                         | FSL public licensing, contributor ownership, and explicit relicensing rights |
| [ADR-0007](ADR-0007-frontend-and-single-project-scaffold.md)           | Accepted                                         | Vue/Vuetify frontend and one pnpm/Vite/Worker project                        |
