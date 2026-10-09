# Handoff: T-013 Claims policy draft

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. A written claims policy for D-06: words we never use, what we may say, and the evidence behind each claim.

## Status

Blocked on you. Merged in PRs #36 and #40. Waits on Q-23.

## Done so far

| Step | Commit |
|---|---|
| Claims policy draft | 2f267f9 |
| Policy merged | c566b10 |
| Reviewer fixes: describes the existing CI claims check and its gaps, "audit" banned, "failures automated tools can detect" wording, items pending lawyer questions 4 and 11, D-06 scope and hype-word source corrected | docs(research): fix review findings in the briefs, quiz and claims policy |
| CI claims check widened to the policy word list, scare copy and required text | (pull request #40) |

## Current step

Waiting for the owner to approve the policy (Q-23).

## Next three steps

1. The owner approves the policy, including the "How we enforce it" changes from #40 (Q-23).
2. Add new banned phrases to scripts/ci/checks.mjs and its tests whenever the policy's word list changes.

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
