# Handoff: T-008 Resume test from HANDOFF.md

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Prove a fresh agent can resume a task stopped mid-step from HANDOFF.md alone.

The test task is real work: a `lint-handoff` check that says whether a HANDOFF.md is enough for a fresh agent to resume. It has three steps (below). The first agent stops in the middle of step 2 on purpose. A fresh agent finishes steps 2 and 3 using only this file, TASK.md, the last events and `git log`.

## Status

In review. A fresh agent resumed it from this file and finished steps 2 and 3. No pull request is open yet. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| 1. `lintHandoff(text, state)` and `HANDOFF_SECTIONS` in scripts/agents/ledger.mjs | 74955cf |
| 2. Tests for `lintHandoff` in scripts/agents/ledger.test.mjs (redone; the first draft was never committed) | 70ab67e |
| 3. `lint-handoff` in scripts/agents/board.mjs, CLI test, .agents/README.md | 4cda5c6 |
| 3. T-001 and T-002 handoffs: How to verify and Lessons and gotchas restored | 739038f |
| Resume report in children/resume-report.md | 79430df |

## Current step

None. Waiting for review and for the lead's call on the open question below.

## Next three steps

1. The lead decides how to handle the `lint-handoff --all` findings (see Blockers; the report has options and a pick).
2. Open a pull request for this branch. A reviewer agent checks it.
3. Merge once CI is green, then set the state to Done.

## Blockers and open questions

- `node scripts/agents/board.mjs lint-handoff --all` exits 1: 30 lines on 20 tasks outside this lane. The HANDOFF template's fill-in placeholder fails every task made from it, and T-010 to T-014 are Running on main with template handoffs (their real ones are likely on claude/docs-m1-research). Not edited here. Options and a pick are in children/resume-report.md. This needs the lead, not the owner.

## Decisions used

D-18

## Files touched

- scripts/agents/ledger.mjs (step 1)
- scripts/agents/ledger.test.mjs (steps 2 and 3)
- scripts/agents/board.mjs, .agents/README.md (step 3)
- .agents/tasks/T-001/HANDOFF.md, .agents/tasks/T-002/HANDOFF.md (step 3)
- .agents/tasks/T-008/children/resume-report.md

## How to verify

- `node --test scripts/agents/ledger.test.mjs` passes.
- `node scripts/agents/board.mjs lint-handoff T-008` (and T-001, T-002) prints `1 handoff ok`.
- `node scripts/agents/board.mjs lint-handoff --all` exits 0 on this branch. It does not yet; see Blockers.
- .agents/tasks/T-008/children/resume-report.md says what the resuming agent read, what it guessed, how much of step 2 was lost, and its commits.

## Lessons and gotchas

- Commit messages need the two trailer lines the other tasks use (Co-Authored-By and Claude-Session). Use your own session's lines; `git log -1` shows the format.
- Run commands from the worktree root; the hooks read WA_TASK or the branch name to find the task.
- The commit hook rejects a subject that starts with a capital letter, so a subject that opens with "T-008" fails. Put the id in the Refs footer.
- The event log is gitignored, so a fresh worktree has no events. HANDOFF.md and `git log` must carry everything.
- `lint-handoff` with no id checks the current task, found from WA_TASK or the branch.
- The placeholder check matches the literal text anywhere, even quoted. Name the placeholder in other words in a handoff.
