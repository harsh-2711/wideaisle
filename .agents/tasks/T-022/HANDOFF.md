# Handoff: T-022 Competitor teardown

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Patrol, Adafix, TestParty's free scan and two widgets: what each fixes, misses and costs.

## Status

Blocked on you. Merged in PR #37. App installs wait on a dev store (Q-03).

## Done so far

| Step | Commit |
|---|---|
| Desk teardown from public listings | 48e11c9 |
| Fixes from the PR #37 review: AccessFix Agency tier, TestParty Pro caveat, FTC wording, UserWay single source, support-question rule, unnamed sued merchant | df0a4a0 |
| Second review round: both TestParty blog figures with years, roadmap corrections marked done | 0e24bc1 |

## Current step

Waiting for Q-03.

## Next three steps

1. With a dev store: install Patrol (free Monitor), Adafix (trial), TestParty's free scan, UserWay and Avada; record fixes, misses and onboarding.
2. Check whether AccessFix by MK-Way changes theme code, and whether its $199 Agency tier covers several stores. Confirm TestParty's Pro contents on the live listing.

## Blockers and open questions

- Q-03: a dev store for the hands-on installs. Nothing is bought (D-04); free plans and trials only.
- Q-01: listings were read through search results only.
- Q-32: the repo is public. Never name a sued store or plaintiff in this repo.

## Decisions used

D-04, D-06, D-08, D-12

## Files touched

- docs/research/competitor-teardown.md
- docs/plan/roadmap.md: overlay price range (free to $479), code-fix app count, TestParty price range, repo visibility note (Q-32)
- .agents/owner-queue.md: Q-32

## How to verify

- Open docs/research/competitor-teardown.md. Adafix (from $29, launched 2026-09-29 per a directory listing) is the closest competitor.

## Lessons and gotchas

- Adafix pitches the same "edits your code" idea with review and revert. Our difference must be the six fix types, the evidence pack and re-checks after theme changes.
- Mark every source as opened or via search, with the date checked.
