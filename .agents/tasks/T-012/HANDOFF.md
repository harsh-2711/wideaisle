# Handoff: T-012 Learning path, VoiceOver script and quiz

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. A learning path for the owner, a VoiceOver walk-through script and a 20-question quiz with answers.

## Status

In review in the M1 research pull request. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| Learning path, VoiceOver script and quiz | 00ccfc6 |
| Reviewer fixes: Touch ID shortcut, claims policy added as step 9, quiz questions 4, 15 and 17 and answers 13, 15, 17 and 18 updated | docs(research): fix review findings in the briefs, quiz and claims policy |

## Current step

Pull request re-review after the reviewer fixes, then merge.

## Next three steps

1. After merge, set the state to Blocked on you with needs Q-21, Q-22.
2. The owner walks three stores with VoiceOver (Q-21).
3. The owner takes the quiz; the bar is 80% (Q-22).

## Blockers and open questions

- Q-22: the owner's quiz score is an exit criterion.
- The cloud environment blocks most sites (Q-01). Sources marked "via search, not opened" were read through search results only.

## Decisions used

none

## Files touched

- docs/research/learning-path.md
- docs/research/quiz.md, docs/research/quiz-answers.md

## How to verify

- Open docs/research/quiz.md and docs/research/quiz-answers.md; 20 questions, each answer cites the primer or brief.

## Lessons and gotchas

- Mark every source as opened or via search, with the date checked.
