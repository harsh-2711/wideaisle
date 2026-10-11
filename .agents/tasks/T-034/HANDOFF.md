# Handoff: T-034 Architecture and delivery-path ADRs

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Records for the architecture, fix delivery and AI use, ready for G1.

- [ ] ADRs merged as Status Proposed after review. The agent merges them, since records are not a one-way door.
- [ ] Owner moves them to Accepted (Q-28)

## Status

In review: PR #46 (https://github.com/harsh-2711/wideaisle/pull/46). The review at b11c30c asked for changes (17 items); all are fixed on this branch and the checks pass. Waiting for re-review. Last updated 2026-10-11.

## Done so far

| Step | Commit |
|---|---|
| 1. Read inputs: AGENTS.md, D-05, D-08 to D-11, docs/adr/README.md, roadmap M3 and Architecture, Spike A at 72c6364 (PR #41), Spike B, Spike C, scanner and census code. Branch fast-forwarded to main 096a1e1 | (no commit) |
| 2. ADR 0001 system architecture at PoC; TASK.md out of scope filled in | 58eee73 |
| 3. ADR 0002 fix delivery path (D-09) | da88976 |
| 4. ADR 0003 theme fix library (Spike B) | 81a0ba7 |
| 5. ADR 0004 AI in the product (D-11) | e98d574 |
| 6. ADR 0005 PoC hosting (D-10), every number marked "Estimate, Spike D replaces it" | 18da1c0 |
| 7. Merged origin/main 8f1ee9e (Q-34 opened; the reviewer approved PR #41 at 72c6364) | 893e4ee |
| 8. Proofread: ADRs 0002 and 0004 cut to about two pages; wording fixes in 0004 and 0005. All checks pass | 460c33f |
| 9. Opened PR #46 to main; board set to In review | b11c30c |
| 10. Review fixes (items 1 to 17): 0002 states plainly that route C and merged route B do not meet D-09, adds intent rows before the first write, zips in object storage, four revert outcomes, D-12 billing, corrected Q-03 count and impacts. Owner queue gains Q-35 (revert cases) and Q-36 (pilot billing) with the lead's approval, and Q-28 is reworded. Dates set to 2026-10-11. Server-size row dropped from 0005. Citations fixed in 0001 and 0004. 0004 Context points to Spike C | 5a2bf30 |
| 11. Re-review fixes: retry recovery reads alt-text values too, so alt-text-only patches are covered; route B stores its branch suffix and a retry looks for its open pull request first | (this commit) |

## Current step

PR #46 waits for re-review. After it passes, the agent merges PR #46 with a merge commit and the ADRs stay at Status Proposed. This is not a one-way door. The owner then moves them to Accepted under Q-28; the coordinator moves Q-28 to Open after the merge.

## Next three steps

1. Answer any new review comments on PR #46. After each fix, rerun the checks under "How to verify" and push. Merge only after the coordinator's review passes.
2. When Spike D's pull request (T-033, `claude/feat-scan-benchmark`) merges, update the numbers in docs/adr/0005-poc-hosting.md: replace every row marked "Estimate, Spike D replaces it" with the measured value and its source, and recheck the cost lines in ADR 0001.
3. When PR #41 merges (Q-34), point ADR 0002's Spike A sources at main instead of the branch. When Q-33 is answered, name the chosen model in ADR 0004. When Q-35 is answered, update ADR 0002's "Revert" section.

## Blockers and open questions

- None block the review. The ADRs point to these owner items:
  - Q-03, dev store: 12 Spike A checks and the Spike B live scan wait on it.
  - Q-27, exemption request: file now, or after the Q-03 test. ADR 0002 gives the order.
  - Q-33: Haiku 5.5 or Haiku 4.5 for alt text.
  - Q-34: merge PR #41.
  - Q-35: accept a one-step merchant revert for route C and merged route B pull requests, or require more work. ADR 0002 does not change D-09 until then.
  - Q-36: how pilots pay under D-12, since custom apps may not be able to use the Billing API (one unverified community reply).
  - Q-05: Workers Paid for census bursts.
- Also raised in the ADRs:
  - A provider memo for the server and object storage is due before M4 needs a server (ADR 0005, D-04).
  - New tables (delivery intents and receipts, alt-text run state, review items) are data model changes. The owner approves them with the M4 contracts.

## Decisions used

D-09, D-10, D-11. The ADRs also cite D-02, D-04, D-05, D-06, D-08, D-12 and D-14.

## Files touched

- docs/adr/0001-system-architecture-at-poc.md
- docs/adr/0002-fix-delivery-path.md
- docs/adr/0003-theme-fix-library.md
- docs/adr/0004-ai-in-the-product.md
- docs/adr/0005-poc-hosting.md
- .agents/owner-queue.md (Q-35, Q-36 added; Q-28 reworded; approved by the lead in the PR #46 review)
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
- `gh pr create` and `gh pr edit` use GraphQL, which is blocked here. Use `gh api repos/harsh-2711/wideaisle/pulls` (REST) instead.
- An ADR must not quietly relax an owner decision. Where the build falls short of a decision, say so plainly and add an owner queue item.
- Cite the source a number comes from: the 10 pilot stores come from the roadmap M4 exit and the kickoff, and the 1,000-image allowance comes from the roadmap pricing table, not from D-08 or D-12.
