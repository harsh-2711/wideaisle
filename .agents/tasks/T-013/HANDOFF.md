# Handoff: T-013 Claims policy draft

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. A written claims policy for D-06: words we never use, what we may say, and the evidence behind each claim.

## Status

In review in the M1 research pull request. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| Claims policy draft | 2f267f9 |
| Reviewer fixes: describes the existing CI claims check and its gaps, "audit" banned, "failures automated tools can detect" wording, items pending lawyer questions 4 and 11, D-06 scope and hype-word source corrected | docs(research): fix review findings in the briefs, quiz and claims policy |

## Current step

Pull request re-review after the reviewer fixes, then merge.

## Next three steps

1. After merge, set the state to Blocked on you with needs Q-23.
2. The owner approves the policy (Q-23).
3. Planner follow-up: widen the claims check in scripts/ci/checks.mjs to the policy's word list and folders (see "How we enforce it").

## Blockers and open questions

- Q-23: the owner's approval is an exit criterion.
- The cloud environment blocks most sites (Q-01). Sources marked "via search, not opened" were read through search results only.

## Decisions used

D-06

## Files touched

- docs/policy/claims-policy.md

## How to verify

- node scripts/ci/checks.mjs claims --base origin/main

## Lessons and gotchas

- Mark every source as opened or via search, with the date checked.
