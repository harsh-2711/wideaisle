# T-031: Spike B: six fixers on Dawn

| Field | Value |
|---|---|
| Milestone | M3 |
| Lane | fixers |
| Branch | claude/feat-dawn-fixers |
| Issue | (link once created) |
| Decisions used | D-08, D-11 |
| Needs | none |
| Created | 2026-10-08 |

## Goal

Rule-based Liquid and CSS patches for the six failure types on Dawn, checked by axe before and after, with Theme Check passing.

## Exit criteria

Each one is a test or a check someone can run.

- [ ] Each fixer has unit tests on Dawn source
- [ ] Theme Check passes on the patched theme
- [ ] Rendered fixtures: zero axe findings of the six types after
- [ ] Live golden-store scan (needs Q-03)

## Out of scope

- (fill in)
