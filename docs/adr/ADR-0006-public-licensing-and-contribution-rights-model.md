# ADR-0006: Public Licensing and Contribution Rights Model

- Status: Accepted
- Date: 2026-08-15

## Context

`universal-data-mcp-worker` is developed publicly and intends to accept external collaboration while preserving contributor ownership, protection against competing commercial use of recent versions, Project Owner commercial licensing, and future relicensing flexibility.

A permissive license would not protect recent versions from competing products or services. Copyright assignment would provide flexibility but would unnecessarily remove contributor ownership. A public CLA without auditable acceptance would not establish a reliable chain of title.

## Decision

- Distribute protected versions under Functional Source License 1.1 with Apache License 2.0 as the Future License (`FSL-1.1-ALv2`).
- Identify Marcelo Miqueles as the initial Licensor and copyright holder.
- Do not describe protected FSL versions as OSI Open Source. Use `source-available` or `public-source`.
- Require the applicable CLA for external code contributions, without copyright assignment.
- Preserve contributor ownership and independent use of each contributor's own work.
- Require explicit copyright rights for sublicensing, relicensing, proprietary licensing, and dual- or multi-licensing.
- Include an Apache-style patent grant limited to claims necessarily infringed by the contribution alone or combined with the Project as submitted, with conventional patent-litigation termination.
- Keep trademark rights separate from software licensing.
- Require durable evidence of contributor identity, CLA version, acceptance time, and associated GitHub or contributor identity before merge.
- Block external code merges until auditable CLA acceptance is operational. Do not copy or trivially rewrite external pull-request code to bypass the gate.
- Require compatible licensing and documented provenance for third-party code and assets.

## Consequences

### Positive

- Personal self-hosting, internal use, study, modification, and other permitted purposes have explicit terms.
- Each protected version receives an irrevocable Apache-2.0 Future License on the FSL schedule.
- Contributors retain copyright while the Project Owner can maintain public, commercial, proprietary, and future licensing models.
- Patent and provenance rules reduce uncertainty in accepted contributions.
- Commercial licensing remains available for alternative terms or uses not permitted by the public license.

### Negative

- FSL-protected versions are source-available, not OSI Open Source, during the restricted period.
- Some organizations or contributors may decline the CLA or FSL model.
- External code cannot be merged until a durable acceptance mechanism exists.
- CLA records and third-party provenance require ongoing maintenance.
- FSL version dates must remain traceable so Future License transition dates can be determined.

## Related Documents

- [LICENSE](../../LICENSE)
- [Contributor License Agreement](../../CONTRIBUTOR_LICENSE_AGREEMENT.md)
- [Commercial information](../../COMMERCIAL.md)
- [Trademark policy](../../TRADEMARKS.md)
- [Legal/IP index](../legal/README.md)
