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
| 1. Read inputs: AGENTS.md, D-04, D-10, D-11, D-12, roadmap (Architecture, Go-to-market, Budget), Spike C, Spike D and its results, ADRs 0001 to 0005, owner queue. Board set to Running; TASK.md branch fixed (was claude/docs-adr-m3, merged) and out of scope filled in | (this commit) |

## Current step

Drafting docs/spikes/cost-per-merchant.md.

## Next three steps

1. Write docs/spikes/cost-per-merchant.md: inputs with sources, PoC and Launch per plan, share of plan price against the 10% bar, the inputs that move it most, caveats.
2. Update docs/adr/0005-poc-hosting.md with Spike D's measured values (commit with `Refs: T-034`), recheck the cost lines in ADR 0001, and mark next step 1 done in .agents/tasks/T-034/HANDOFF.md.
3. Run the checks, push, open the PR to main, set the board to In review, report to the parent. Do not merge.

## Blockers and open questions

- None block the estimate. It uses estimates where nothing is measured: server and object storage prices (provider memo, ADR 0005), Browser Run (Q-05), alt-text tokens and prices (Q-04), the model (Q-33), live pages (Q-01).

## Decisions used

D-10, D-12. Also cites D-02, D-04, D-06 and D-11.

## Files touched

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
