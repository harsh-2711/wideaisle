# Handoff: T-034 Architecture and delivery-path ADRs

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Records for the architecture, fix delivery and AI use, ready for G1.

- [ ] ADRs merged
- [ ] Owner approves (Q-28)

## Status

Running. All five ADRs written (0001 to 0005). Checks, pull request and board next. Last updated 2026-10-11.

## Done so far

| Step | Commit |
|---|---|
| 1. Read inputs: AGENTS.md, D-05, D-08 to D-11, docs/adr/README.md, roadmap M3 and Architecture, Spike A at 72c6364 (PR #41), Spike B, Spike C, scanner and census code. Branch fast-forwarded to main 096a1e1 | (no commit) |
| 2. ADR 0001 system architecture at PoC; TASK.md out of scope filled in | 58eee73 |
| 3. ADR 0002 fix delivery path (D-09) | da88976 |
| 4. ADR 0003 theme fix library (Spike B) | 81a0ba7 |
| 5. ADR 0004 AI in the product (D-11) | e98d574 |
| 6. ADR 0005 PoC hosting (D-10), every number marked "Estimate, Spike D replaces it" | (this commit) |

## Current step

Running the CI checks and the handoff lint, then opening the pull request.

## Next three steps

1. Run the checks under "How to verify", push, and open the pull request to main with .github/pull_request_template.md. Set the board to In review and report to the coordinator. Do not merge: the owner approves the ADRs (Q-28).
2. When Spike D's pull request (T-033, `claude/feat-scan-benchmark`) merges, update the numbers in docs/adr/0005-poc-hosting.md: replace every row marked "Estimate, Spike D replaces it" with the measured value and its source, and recheck the cost lines in ADR 0001.
3. When PR #41 merges (Q-34), point ADR 0002's Spike A sources at main instead of the branch. When Q-33 is answered, name the chosen model in ADR 0004.

## Blockers and open questions

- None block writing. The ADRs point to these owner items:
  - Q-03, dev store: 12 Spike A checks and the Spike B live scan wait on it.
  - Q-27, exemption request: file now, or after the Q-03 test. ADR 0002 gives the order.
  - Q-33: Haiku 5.5 or Haiku 4.5 for alt text.
  - Q-34: merge PR #41.
  - Q-05: Workers Paid for census bursts.
- New for the owner, raised in the ADRs:
  - D-09 asks for one-click revert on every route. Route A, and route B before a merge, revert in one call. A merged route B pull request and route C each need one merchant step (ADR 0002).
  - Custom-distribution pilots may not be able to use the Billing API (not verified; ADR 0002).
  - A hosting provider memo is due before M4 needs a server (ADR 0005).
  - New tables (receipts, alt-text run state, review items) are data model changes. The owner approves them with the M4 contracts.

## Decisions used

D-09, D-10, D-11. The ADRs also cite D-02, D-04, D-05, D-06, D-08, D-12 and D-14.

## Files touched

- docs/adr/0001-system-architecture-at-poc.md
- docs/adr/0002-fix-delivery-path.md
- docs/adr/0003-theme-fix-library.md
- docs/adr/0004-ai-in-the-product.md
- docs/adr/0005-poc-hosting.md
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
- T-035 (cost per merchant) shares this branch. Leave its files alone. The handoff check passes when either task's HANDOFF.md changes.
- The claims check scans only merchant-facing paths, not docs/adr. Keep to the D-06 wording by hand anyway.
