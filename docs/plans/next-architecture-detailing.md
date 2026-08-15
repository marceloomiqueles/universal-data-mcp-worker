# Next Stage: Concrete Architecture and Dependencies

## Objective

Translate the agreed architecture into concrete components and dependencies without beginning implementation until explicitly requested and approved.

## Preconditions

- Read `AGENTS.md`, `ARCHITECTURE.md`, current ADRs, and gaps.
- Confirm the first end-to-end Garmin flow to design.
- Consult current official Cloudflare, MCP, and candidate-library documentation.
- Separate platform/provider facts from assumptions.

## Expected Work

1. Identify the minimum entry points and surfaces for one Worker.
2. Propose minimum core and Garmin-slice components, justifying each boundary.
3. Evaluate standard libraries for MCP, routing, validation, authentication, hashing, and retry.
4. Design the first vertical flow and its persistence without a universal model.
5. Define concrete migrations and idempotency verification.
6. Define success criteria and tests before scaffolding or code.
7. Update ADRs only for new transversal decisions and close gaps only with evidence.

## Excluded

- scaffolding;
- product code;
- final schemas or APIs without research;
- other integrations merely to prove extensibility;
- additional infrastructure without demonstrated need.

## Exit Criterion

A reviewable proposal mapping requirements to minimum components, justified dependencies, risks, tests, and remaining gaps, ready for a decision before implementation.
