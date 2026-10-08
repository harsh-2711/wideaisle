# Handoff: T-008 Resume test from HANDOFF.md

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Prove a fresh agent can resume a task stopped mid-step from HANDOFF.md alone.

The test task is real work: a `lint-handoff` check that says whether a HANDOFF.md is enough for a fresh agent to resume. It has three steps (below). The first agent stops in the middle of step 2 on purpose. A fresh agent finishes steps 2 and 3 using only this file, TASK.md, the last events and `git log`.

## Status

Running. A fresh agent resumed it from this file and finished step 2; step 3 is next. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| 1. `lintHandoff(text, state)` and `HANDOFF_SECTIONS` in scripts/agents/ledger.mjs | 74955cf |
| 2. Tests for `lintHandoff` in scripts/agents/ledger.test.mjs (redone; the first draft was never committed) | 70ab67e |

## Current step

3. Add `lint-handoff [<id>] [--all]` to scripts/agents/board.mjs, with a CLI test and docs. Not started yet.

## Next three steps

1. Step 3: add `lint-handoff [<id>] [--all]` to scripts/agents/board.mjs. With an id, lint that task's HANDOFF.md against its state from status.json. With `--all`, lint every task that is not Done. Print `<id>: <problem>` lines and exit 1 if any. Add it to the usage text and to .agents/README.md under the board commands. Add a CLI test like the existing ones that use BOARD_CLI.
2. Run `node scripts/agents/board.mjs lint-handoff --all`. Fix what it reports in tasks that are not Done. Known: T-001 and T-002 lost their "How to verify" and "Lessons and gotchas" sections in commit 090077a; restore them with short text even though they are Done.
3. File the report (see How to verify) and set the state to In review.

## Blockers and open questions

- None. No owner input is needed.

## Decisions used

D-18

## Files touched

- scripts/agents/ledger.mjs (step 1)
- scripts/agents/ledger.test.mjs (step 2)
- scripts/agents/board.mjs, .agents/README.md (step 3)

## How to verify

- `node --test scripts/agents/ledger.test.mjs` passes.
- `node scripts/agents/board.mjs lint-handoff --all` exits 0 on this branch.
- The resuming agent files .agents/tasks/T-008/children/resume-report.md from .agents/templates/child-report.md: what it read, what it had to guess, how much of step 2 was lost, and the commits it made.

## Lessons and gotchas

- Commit messages need the two trailer lines the other tasks use (Co-Authored-By and Claude-Session); copy them from `git log -1`.
- Run commands from the worktree root; the hooks read WA_TASK or the branch name to find the task.
