# T-034: Architecture and delivery-path ADRs

| Field | Value |
|---|---|
| Milestone | M3 |
| Lane | architect |
| Branch | claude/docs-adr-m3 |
| Issue | harsh-2711/wideaisle#30 |
| Decisions used | D-09, D-10, D-11 |
| Needs | none |
| Created | 2026-10-08 |

## Goal

Records for the architecture, fix delivery and AI use, ready for G1.

## Exit criteria

Each one is a test or a check someone can run.

- [ ] ADRs merged
- [ ] Owner approves (Q-28)

## Out of scope

- The cost per merchant estimate. That is T-035, which shares this branch.
- Writing the M4 contracts (Issue, Fix, Patch, Evidence schemas and types). The ADRs only say what the spikes mean for them.
- Code, scope or config changes, for example the `write_files` note in `shopify.app.toml`. The owning lanes make them.
- Measuring scan speed or cost. Spike D (T-033) does that; the hosting ADR uses planning figures marked as estimates.
- Owner decisions: the alt-text model (Q-33), the exemption request (Q-27), the hosting provider, Workers Paid (Q-05), merging PR #41 (Q-34).
