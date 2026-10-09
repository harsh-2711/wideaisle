# Handoff: T-024 Interview kit

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Script, recruiting messages, scheduling and a per-call summary template for 15 merchants and 5 agencies.

## Status

Blocked on you. Merged in PR #37. Waits on the five kit choices (Q-31) and the calls (Q-24).

## Done so far

| Step | Commit |
|---|---|
| Interview kit | 9a40513 |
| Fixes from the PR #37 review: notes and lists live outside this public repo, consent script says what is kept and where, US-only cold email, full CAN-SPAM list, opt-in pilot ask, Shopify billing, transcription approach | df0a4a0 |
| Second review round: raw interview data stays out of every git repo, deletion steps include a ledger history purge, quote consent, training setting off, pause before the demand-letter question | 0e24bc1 |

## Current step

Waiting for Q-31.

## Next three steps

1. The owner settles the five choices in section 14 (Q-31).
2. The owner builds the first recruiting batch in their private folder, with an agent opened there, not in the repo clone (kit section 8), and approves it (Q-25).

## Blockers and open questions

- Q-31: five choices before the first batch.
- Q-24: the owner runs the calls.
- Q-32 blocks no step. The kit already works with a public repo. The choice only settles whether ID-coded summaries could ever live in this repo.
- Q-07 blocks no step. It is needed only to move ID-coded per-call summaries into the ledger repo (kit section 11). Until then they stay in the owner's private folder.
- Recordings, transcripts, contact lists, batch files and the ID key never go in any git repo, the ledger included (kit section 8).
- A lawyer (D-14, booked for G3) must answer the CASL, PECR and EU questions before any cold message leaves the US.

## Decisions used

D-01, D-04, D-06, D-07, D-08, D-12, D-14, D-16, D-18

## Files touched

- docs/research/interview-kit.md
- .agents/owner-queue.md: Q-31 (retention wording), Q-32

## How to verify

- Open docs/research/interview-kit.md; sections 1 to 16 cover recruiting, consent, script, pricing questions, summary template and lawyer questions.
- Section 8 says where every file lives. Search the kit for "docs/research/interviews": there should be no hits.

## Lessons and gotchas

- Keep outreach plain: no scare wording, a plain sender name, an easy opt-out.
- The repo is public (Q-32). Anything that names or points to a participant, or names a sued store, lives in the private folder. Only the anonymous synthesis goes in the repo.
- Git keeps deleted files, and the ledger hook copies session transcripts into the ledger repo and child reports into this repo. Keep raw interview data out of any Claude Code session inside the repo clone.
- Do not promise "no pitch" and then ask for a pilot. Make the pilot an opt-in offer, billed through Shopify (D-12).
- Mark every source as opened or via search, with the date checked.
