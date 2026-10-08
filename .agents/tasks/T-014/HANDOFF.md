# Handoff: T-014 D-13 research: AI accessibility checks per release

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Find out whether AI-driven checks can replace a human check per release, at what cost, and bring back a memo with a pick.

## Status

In review in the M1 research pull request. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| D-13 research brief | 30fdb34 |

## Current step

Pull request review, then merge.

## Next three steps

1. After merge, set the state to Done. The memo carries the agents' pick (D).
2. The owner picks B or D (Q-30).
3. If D: the M4 test harness lane builds Guidepup flows on the golden stores.

## Blockers and open questions

- None for agents. Q-30 is the owner's pick.
- The cloud environment blocks most sites (Q-01). Sources marked "via search, not opened" were read through search results only.

## Decisions used

D-13

## Files touched

- docs/research/d13-ai-accessibility-checks.md
- decisions/D-13.md: research result and agents' pick
- .agents/owner-queue.md: Q-30

## How to verify

- Read decisions/D-13.md, section "Research result (T-014, 2026-10-08)".

## Lessons and gotchas

- Mark every source as opened or via search, with the date checked.
