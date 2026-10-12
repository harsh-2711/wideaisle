# Handoff: T-035 Cost per merchant estimate

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Infrastructure plus AI per store per month, from measured numbers.

- [ ] Estimate with its inputs merged: docs/spikes/cost-per-merchant.md
- [ ] ADR 0005 rows marked "Estimate, Spike D replaces it" carry Spike D's measured values (T-034 follow-up)

## Status

Running on `claude/docs-cost-per-merchant`, cut from main f037d8b. Last updated 2026-10-12.

## Done so far

| Step | Commit |
|---|---|
| 1. Read inputs: AGENTS.md, D-04, D-10, D-11, D-12, roadmap (Architecture, Go-to-market, Budget), Spike C, Spike D and its results, ADRs 0001 to 0005, owner queue. Board set to Running; TASK.md branch fixed (was claude/docs-adr-m3, merged) and out of scope filled in | 4887ab1 |
| 2. docs/spikes/cost-per-merchant.md: inputs with sources, PoC and Launch per plan, share of plan price, drivers, owner questions, caveats | ec5794a |
| 3. ADR 0005: Spike D's measured values and sources in place of the "Estimate, Spike D replaces it" rows; scanning, base image, cost, server size and follow-up lines updated. ADR 0001 cost line rechecked. Both stay Proposed. T-034 HANDOFF next step 1 marked done (`Refs: T-034`) | 91eaded |
| 4. Checks: writing, claims, handoff, decisions, lint-handoff --all and commitlint all pass | (this commit) |

## Current step

Opening the pull request to main.

## Next three steps

1. Open the PR to main from the template; set the board to In review.
2. Report to the parent: PR link and head commit, cost per plan against the 10% bar, drivers, owner questions, check results. Do not merge.
3. After review, fix what the reviewer asks. Do not merge until the parent says so.

## Blockers and open questions

- None block the estimate. It uses estimates where nothing is measured: server and object storage prices (provider memo, ADR 0005), Browser Run (Q-05), alt-text tokens and prices (Q-04), the model (Q-33), live pages (Q-01).
- Result: on Haiku 5.5 every paid plan is under 10% at stage capacity. On Haiku 4.5, Agency a store is over at the high end at both stages, and Starter at the PoC high end. Four questions for the owner are in the doc's "Questions for the owner"; the planner decides which reach the owner queue.

## Decisions used

D-10, D-12. Also cites D-02, D-04, D-06 and D-11.

## Files touched

- docs/spikes/cost-per-merchant.md (new)
- docs/adr/0005-poc-hosting.md, docs/adr/0001-system-architecture-at-poc.md (T-034 follow-up)
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

Recompute the result table by hand from the doc's Inputs and Method: fixed pool / stores + images / 1,000 x price.

## Lessons and gotchas

- `git checkout -B <branch> origin/main` sets origin/main as upstream. Unset it and push with `-u origin claude/docs-cost-per-merchant`.
- `gh pr create` uses GraphQL, which is blocked here. Use `gh api repos/harsh-2711/wideaisle/pulls` (REST), as T-034 did.
- The arithmetic is plain: cost a store = fixed pool / stores + images x price per 1,000. Low pool and Spike C's guess for low; high pool and twice the guess for high. Round half up to cents.
- Scan CPU never moves the result. Spend review time on the store count, the model and the image count.
