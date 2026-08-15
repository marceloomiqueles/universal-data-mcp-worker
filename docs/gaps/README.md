# Open Gaps

This register contains decisions deliberately left open until evidence exists. A gap does not contradict the architecture; it marks where decided knowledge ends.

Each gap states what is unknown, why it can wait, and what evidence can close it. When closed, update this index and create or supersede an ADR if the decision is transversal or hard to reverse.

## Index

| Gap | Topic | Status |
|---|---|---|
| [GAP-001](GAP-001-integration-contract-and-core-granularity.md) | Integration contract and core granularity | Open |
| [GAP-002](GAP-002-garmin-mcp-and-chatgpt-validation.md) | Garmin surface, MCP, and real ChatGPT behavior | Open |
| [GAP-003](GAP-003-sync-freshness-retention.md) | Sync, freshness, bootstrap, and retention | Open |
| [GAP-004](GAP-004-implementation-and-cloudflare-behavior.md) | Libraries, locking, and real Cloudflare/Garmin limits | Open |
| [GAP-005](GAP-005-public-repository-security-reporting.md) | Private vulnerability reporting channel | Closed — GitHub PVR enabled |
| [GAP-006](GAP-006-open-source-license.md) | Public software license selection | Closed by ADR-0006 |
| [GAP-007](GAP-007-community-channels-and-release-process.md) | Community, sponsorship, installation, and releases | Open |
| [GAP-008](GAP-008-vuexy-redistribution.md) | Vuexy redistribution rights | Closed — Vuexy excluded |
| [GAP-009](GAP-009-garmin-unofficial-provider.md) | Garmin unofficial provider terms | Open — commercial provider blocker |
| [GAP-010](GAP-010-corporate-contributors.md) | Corporate contributor authorization | Open when first applicable |
| [GAP-011](GAP-011-trademark-strategy.md) | Project trademark strategy | Open — non-blocking |
| [GAP-012](GAP-012-copyright-provenance.md) | Historical copyright and provenance evidence | Open before external merges |
| [GAP-013](GAP-013-auditable-cla-acceptance.md) | Auditable CLA acceptance and enforcement | Open — external merge blocker |

## Out of Scope, Not a Gap

Multi-tenancy, enterprise RBAC, billing, fictional verticals, plugin marketplace, dynamic loading, a universal sports model, forecasting, ML, BI, and speculative services are not unanswered MVP questions. They require an explicit scope change and new evidence.
