# Handoff: T-035 Cost per merchant estimate

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Infrastructure plus AI per store per month, from measured numbers.

- [ ] Estimate with its inputs merged: docs/spikes/cost-per-merchant.md
- [ ] ADR 0005 rows marked "Estimate, Spike D replaces it" carry Spike D's measured values (T-034 follow-up)

## Status

Done. PR #48 merges the estimate after two review rounds; the reviewer approved ec9d711. The owner's questions are Q-37. Last updated 2026-10-12.

## Done so far

| Step | Commit |
|---|---|
| 1. Read inputs: AGENTS.md, D-04, D-10, D-11, D-12, roadmap (Architecture, Go-to-market, Budget), Spike C, Spike D and its results, ADRs 0001 to 0005, owner queue. Board set to Running; TASK.md branch fixed (was claude/docs-adr-m3, merged) and out of scope filled in | 4887ab1 |
| 2. docs/spikes/cost-per-merchant.md: inputs with sources, PoC and Launch per plan, share of plan price, drivers, owner questions, caveats | ec5794a |
| 3. ADR 0005: Spike D's measured values and sources in place of the "Estimate, Spike D replaces it" rows; scanning, base image, cost, server size and follow-up lines updated. ADR 0001 cost line rechecked. Both stay Proposed. T-034 HANDOFF next step 1 marked done (`Refs: T-034`) | 91eaded |
| 4. Checks: writing, claims, handoff, decisions, lint-handoff --all and commitlint all pass | 646527b |
| 5. Opened PR #48 to main (https://github.com/harsh-2711/wideaisle/pull/48); board set to In review | 28ed421 |
| 6. Review round 1 (CHANGES NEEDED at 28ed421). The fixed pool is now split over paying stores, with a share-that-pays input (M7: 15 of 50). Pilots are judged at list and at a 50% founding price. New cases: 10 pilots (M4, M5), M7 on the Launch setup, Launch at 30% paying. Summary leads with the point and the M5 and M7 cases. Smaller fixes: CPU range 3.76 to 3.86, the census condition, question 3 as a question, the Haiku 4.5 withdrawal line, the Sources table dropped, the Postgres row folded into storage, the images status, local fixtures on memory. ADR 0005 worker figures (220 MB, 23%) and ADR 0004's cost line (`Refs: T-034`). Owner queue Q-37 added with the coordinator's approval | (this commit) |

## Current step

None. The task is done.

## Next three steps

1. When Q-33 (model) or Q-37 (cost questions) is answered, update docs/spikes/cost-per-merchant.md.
2. When Q-04 allows a real Spike C run, replace the token guess with the measured tokens and recompute.

## Blockers and open questions

- None block the estimate. It uses estimates where nothing is measured: server and object storage prices (provider memo, ADR 0005), Browser Run (Q-05), alt-text tokens and prices (Q-04), the model (Q-33), live pages (Q-01).
- Result: the 10% bar holds only at scale. At M5 (10 pilots, 50% founding price) Starter reaches 22% of price on Haiku 5.5 and 35% on Haiku 4.5. At M7 (15 paying of 50, Launch setup) Starter reaches 25% on Haiku 5.5. At Launch capacity with 30% paying, Haiku 5.5 keeps every plan under (Agency 9.8%); Haiku 4.5 puts Starter (13.3%) and Agency (19.3%) over at the high end. Owner queue Q-37 holds the four questions.

## Decisions used

D-10, D-12. Also cites D-04, D-08 and D-11.

## Files touched

- docs/spikes/cost-per-merchant.md (new)
- docs/adr/0005-poc-hosting.md, docs/adr/0001-system-architecture-at-poc.md, docs/adr/0004-ai-in-the-product.md (T-034 follow-ups)
- .agents/owner-queue.md (Q-37, approved by the coordinator in the PR #48 review)
- .agents/tasks/T-034/HANDOFF.md
- .agents/tasks/T-035/TASK.md, HANDOFF.md, status.json

## How to verify

```bash
node scripts/ci/checks.mjs writing --base origin/main
node scripts/ci/checks.mjs claims --base origin/main
node scripts/ci/checks.mjs handoff --base origin/main
node scripts/ci/checks.mjs decisions
node scripts/agents/board.mjs lint-handoff --all
npx commitlint --from origin/main --to HEAD
```

Recompute the result tables by hand from the doc's Inputs and Method: fixed pool / paying stores + images / 1,000 x price.

## Lessons and gotchas

- `git checkout -B <branch> origin/main` sets origin/main as upstream. Unset it and push with `-u origin claude/docs-cost-per-merchant`.
- `gh pr create` uses GraphQL, which is blocked here. Use `gh api repos/harsh-2711/wideaisle/pulls` (REST), as T-034 did.
- The arithmetic is plain: cost a paying store = fixed pool / paying stores + images x price per 1,000. Low pool and Spike C's guess for low; high pool and twice the guess for high. Round costs half up to cents; take percentages from the unrounded cost.
- Scan CPU never moves the result. Spend review time on the paying store count, the model and the image count.
- Judge pilots against the price they pay: the founding price, as well as list. Free stores pay nothing, so split shared costs over paying stores only.
- commitlint reads a body line that starts with "Word:" as a footer and warns. Avoid that shape in commit bodies.
