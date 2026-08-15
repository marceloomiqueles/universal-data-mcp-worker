# Definition of Done

Apply only criteria relevant to the change, but explicitly disclose anything not verified.

A change is done when it:

- achieves the agreed objective and scope;
- implements the minimum necessary without speculation;
- respects core vs. vertical slice boundaries;
- keeps lifecycle and errors coherent where relevant;
- preserves idempotency in ingestion, sync, migrations, retry, and purge;
- protects secrets and sensitive data;
- considers retention and destructive operations;
- preserves the free-tier target and non-technical user experience;
- includes tests proportional to risk;
- updates architecture, ADRs, gaps, runbooks, or README when their truth changes;
- contains no unrelated changes or cleanup of others' work;
- records verification limits and remaining gaps;
- uses English for all project-authored repository content.

For documentation-only changes:

- claims are backed by repository sources;
- decisions, provisional choices, assumptions, and gaps remain distinct;
- future capabilities are not presented as implemented;
- internal links resolve;
- no empty or duplicate documents are created.

For public/community changes:

- README, SECURITY, CONTRIBUTING, SUPPORT, and templates remain aligned;
- no nonexistent support, compatibility, or installation is promised;
- distributable changes verify licensing and attribution;
- external code has auditable acceptance of the applicable CLA before merge;
- third-party code and assets have compatible terms and documented provenance;
- the changelog is updated for significant public impact.
