# Handoff: T-034 Architecture and delivery-path ADRs

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Records for the architecture, fix delivery and AI use, ready for G1.

- [ ] ADRs merged
- [ ] Owner approves (Q-28)

## Status

Running. ADRs 0001 and 0002 written; 0003 to 0005 next. Last updated 2026-10-11.

## Done so far

| Step | Commit |
|---|---|
| 1. Read inputs: AGENTS.md, D-05, D-08 to D-11, docs/adr/README.md, roadmap M3 and Architecture, Spike A at 72c6364 (PR #41), Spike B, Spike C, scanner and census code. Branch fast-forwarded to main 096a1e1 | (no commit) |
| 2. ADR 0001 system architecture at PoC; TASK.md out of scope filled in | 58eee73 |
| 3. ADR 0002 fix delivery path (D-09) | (this commit) |

## Current step

Writing ADR 0003, the theme fix library (Spike B).

## Next three steps

1. ADR 0003 theme fix library, from docs/spikes/spike-b-fixers.md and app/lib/fixers/.
2. ADR 0004 AI in the product (D-11), from docs/spikes/spike-c-alt-text.md; model pending Q-33.
3. ADR 0005 PoC hosting (D-10) from planning figures, each marked "estimate, Spike D replaces it". Then run the checks, push, open the PR and set the board to In review.

## Blockers and open questions

- None block writing. Owner items the ADRs point to: Q-03 (dev store), Q-27 (exemption request), Q-33 (alt-text model), Q-34 (merge PR #41), Q-05 (Workers Paid).

## Decisions used

D-09, D-10, D-11. The ADRs also cite D-02, D-04, D-05, D-06 and D-08.

## Files touched

- docs/adr/0001-system-architecture-at-poc.md
- docs/adr/0002-fix-delivery-path.md
- .agents/tasks/T-034/TASK.md, HANDOFF.md, status.json

## How to verify

```bash
node scripts/ci/checks.mjs writing --base origin/main
node scripts/ci/checks.mjs claims --base origin/main
node scripts/ci/checks.mjs handoff --base origin/main
node scripts/ci/checks.mjs decisions
node scripts/agents/board.mjs lint-handoff T-034
```

## Lessons and gotchas

- The guard hook blocks `git checkout -- <path>`. To move onto a newer main with only the board's status.json changed, use `git merge --ff-only origin/main`.
- `git checkout -B <branch> origin/main` sets origin/main as upstream. Unset it and push with `-u origin claude/docs-adr-m3`.
- Spike A is not on main. Read it with `git show origin/claude/feat-delivery-adapters:<path>`.
