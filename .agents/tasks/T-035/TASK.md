# T-035: Cost per merchant estimate

| Field | Value |
|---|---|
| Milestone | M3 |
| Lane | architect |
| Branch | claude/docs-cost-per-merchant |
| Issue | harsh-2711/wideaisle#31 |
| Decisions used | D-10, D-12 |
| Needs | none |
| Created | 2026-10-08 |

## Goal

Infrastructure plus AI per store per month, from measured numbers.

## Exit criteria

Each one is a test or a check someone can run.

- [ ] Estimate with its inputs merged: docs/spikes/cost-per-merchant.md
- [ ] ADR 0005 rows marked "Estimate, Spike D replaces it" carry Spike D's measured values (T-034 follow-up)

## Out of scope

- Changing plan prices (D-12) or hosting (D-10). The estimate informs the owner; it changes no decision.
- Picking providers or buying anything (D-04).
- New measurements: live-store timing (Q-01), Browser Run (Q-05), a real alt-text run (Q-04, Q-33).
