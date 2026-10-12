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
| 2. docs/spikes/cost-per-merchant.md: inputs with sources, PoC and Launch per plan, share of plan price, drivers, owner questions, caveats | (this commit) |

## Current step

Updating ADR 0005 with Spike D's measured values.

## Next three steps

1. Update docs/adr/0005-poc-hosting.md with Spike D's measured values (commit with `Refs: T-034`), recheck the cost lines in ADR 0001, and mark next step 1 done in .agents/tasks/T-034/HANDOFF.md.
2. Run the checks, push, open the PR to main, set the board to In review.
3. Report to the parent: PR link, cost per plan against the 10% bar, drivers, owner questions, check results. Do not merge.

## Blockers and open questions

- None block the estimate. It uses estimates where nothing is measured: server and object storage prices (provider memo, ADR 0005), Browser Run (Q-05), alt-text tokens and prices (Q-04), the model (Q-33), live pages (Q-01).
- Result: on Haiku 5.5 every paid plan is under 10% at stage capacity. On Haiku 4.5, Agency a store is over at the high end at both stages, and Starter at the PoC high end. Four questions for the owner are in the doc's "Questions for the owner"; the planner decides which reach the owner queue.

## Decisions used

D-10, D-12. Also cites D-02, D-04, D-06 and D-11.

## Files touched

- docs/spikes/cost-per-merchant.md (new)
- .agents/tasks/T-035/TASK.md, HANDOFF.md, status.json

## How to verify

```bash
node scripts/ci/checks.mjs writing --base origin/main
node scripts/ci/checks.mjs claims --base origin/main
node scripts/ci/checks.mjs handoff --base origin/main
node scripts/ci/checks.mjs decisions
node scripts/agents/board.mjs lint-handoff --all
```

## Lessons and gotchas

- `git checkout -B <branch> origin/main` sets origin/main as upstream. Unset it and push with `-u origin claude/docs-cost-per-merchant`.
- `gh pr create` uses GraphQL, which is blocked here. Use `gh api repos/harsh-2711/wideaisle/pulls` (REST), as T-034 did.
- The arithmetic is plain: cost a store = fixed pool / stores + images x price per 1,000. Low pool and Spike C's guess for low; high pool and twice the guess for high. Round half up to cents.
- Scan CPU never moves the result. Spend review time on the store count, the model and the image count.
