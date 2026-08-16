# Historical License Options

## Status

This document records the shortlist considered before a decision. It is retained as decision history and does not describe the current license.

The Project Owner subsequently selected FSL-1.1-ALv2, recorded in [ADR-0006](../adr/ADR-0006-public-licensing-and-contribution-rights-model.md). The controlling terms are in [LICENSE](../../LICENSE). Protected FSL versions are source-available, not OSI Open Source.

## Comparison

| Criterion               | Apache-2.0                                           | MPL-2.0                                                                             | AGPL-3.0                                                                                                 |
|-------------------------|------------------------------------------------------|-------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Model                   | Permissive                                           | Weak file-level copyleft                                                            | Strong copyleft with network clause                                                                      |
| Forks and modifications | Allowed; normally no publication requirement         | Allowed; distributed changes to covered files remain under MPL                      | Allowed; distributed derivative work must offer corresponding source under AGPL                          |
| Redistribution          | Allowed with license, notices, and conditions        | Allowed with covered-file obligations                                               | Allowed under AGPL copyleft conditions                                                                   |
| Commercial use          | Allowed                                              | Allowed                                                                             | Allowed                                                                                                  |
| Service use             | Does not itself require publishing changes           | Operation without distribution normally does not trigger source distribution        | Users interacting over a network with a modified version must be offered corresponding source            |
| Private software        | Easy incorporation while preserving required notices | May be combined into a proprietary larger work while covered files remain under MPL | Incorporation into a proprietary derivative generally requires licensing the applicable whole under AGPL |
| Public/private R&D      | Maximum private reuse, lower reciprocity             | Balance between open file improvements and private surrounding modules              | Maximum reciprocity, greater friction for private reuse                                                  |

Apache-2.0 favors broad adoption and private reuse and includes an express patent grant. MPL-2.0 seeks to return improvements to covered files without applying copyleft to an entire larger work. AGPL-3.0 seeks to make modified service versions available to their users.

## Historical Outcome

The selected FSL model was not part of this initial comparison. This table must not be used to interpret FSL. See the [legal/IP index](README.md) and closed [GAP-006](../gaps/GAP-006-open-source-license.md).

## Official References

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/)
- [GNU Affero General Public License 3.0](https://www.gnu.org/licenses/agpl-3.0.html)
- [GitHub: Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
