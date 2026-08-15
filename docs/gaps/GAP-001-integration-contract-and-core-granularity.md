# GAP-001: Integration Contract and Core Granularity

- Status: Open
- Source: `AGENTS.md`

## Unknowns

- Final integration contract shape.
- Shared primitives actually required by lifecycle.
- How much sync logic belongs in core.
- Concrete registry and shared diagnostics structure.

## Why It Does Not Block Now

Conceptual boundaries are decided: core owns mechanisms and Garmin owns its domain. Defining interfaces before the first slice would turn hypotheses into hard-to-change contracts.

## Evidence Needed to Close

- An implemented vertical Garmin flow covering connection, activation, sync, and MCP.
- Real reuse by at least two consumers.
- Tests revealing contract-level invariants.
- Concrete friction when replacing dependencies or adding a second real integration.

## Constraint While Open

Do not create universal interfaces, generic repositories, DSLs, or a fictional integration to force an abstraction.
