# GAP-013: Auditable CLA Acceptance

- Status: Open — external code merge blocker
- Owner: Maintainer

## Unknown

Which standard, lightweight mechanism will record CLA acceptance durably and enforce the merge gate without custom automation.

## Required Record

The record must establish who accepted, the CLA version accepted, when acceptance occurred, and the GitHub or contributor identity to which it applies. A pull-request checkbox or unauditable statement is insufficient.

## Why Discussion Can Continue

Issues, discussions, design proposals, forks, and external pull requests for review may continue. Only incorporation or merge of external code is blocked.

## Evidence Needed to Close

Configure and test a maintained CLA service or equivalent auditable workflow; preserve acceptance records; connect its verified status to the merge process; document administration and export/retention; and verify a test contribution end to end.

Until then: **EXTERNAL MERGES BLOCKED**. Do not manually copy or trivially rewrite external pull-request code as a workaround.
