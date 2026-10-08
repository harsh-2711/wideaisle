# Handoff: T-024 Interview kit

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Script, recruiting messages, scheduling and a per-call summary template for 15 merchants and 5 agencies.

## Status

In review in the M2 market research pull request. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| Interview kit | 9a40513 |
| Fixes from the PR #37 review: notes and lists live outside this public repo, consent script says what is kept and where, US-only cold email, full CAN-SPAM list, opt-in pilot ask, Shopify billing, transcription approach | df0a4a0 |

## Current step

Pull request re-review after the fixes, then merge.

## Next three steps

1. After merge, set the state to Blocked on you with needs Q-24, Q-31, Q-32 and Q-07.
2. The owner settles the five choices in section 14 (Q-31) and decides repo visibility (Q-32).
3. Once private storage exists (Q-07, or a folder on the owner's machine), the growth agent drafts the first recruiting batch there for approval (Q-25). Never in this repo.

## Blockers and open questions

- Q-31: five choices before the first batch.
- Q-24: the owner runs the calls.
- Q-32: the repo is public. Recordings, transcripts, per-call summaries, batch files and suppression lists must live outside it.
- Q-07: the private ledger repo that holds them. Until it exists, they stay on the owner's machine only.
- A lawyer (D-14, booked for G3) must answer the CASL, PECR and EU questions before any cold message leaves the US.

## Decisions used

D-04, D-06, D-07, D-08, D-12, D-14, D-16, D-18

## Files touched

- docs/research/interview-kit.md
- .agents/owner-queue.md: Q-31 (retention wording), Q-32

## How to verify

- Open docs/research/interview-kit.md; sections 1 to 16 cover recruiting, consent, script, pricing questions, summary template and lawyer questions.
- Section 8 says where every file lives. Search the kit for "docs/research/interviews": there should be no hits.

## Lessons and gotchas

- Keep outreach plain: no scare wording, a plain sender name, an easy opt-out.
- The repo is public (Q-32). Anything that names or points to a participant, or names a sued store, lives in private storage. Only the anonymous synthesis goes in the repo.
- Do not promise "no pitch" and then ask for a pilot. Make the pilot an opt-in offer, billed through Shopify (D-12).
- Mark every source as opened or via search, with the date checked.
