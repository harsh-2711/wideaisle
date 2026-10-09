# Handoff: T-023 Review mining

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. App Store reviews of accessibility apps, r/shopify and Shopify Community threads: jobs, objections, price sensitivity.

## Status

Blocked on you. Merged in PR #37. Direct reading waits on web access (Q-01).

## Done so far

| Step | Commit |
|---|---|
| Partial review-mining pass | 369f30e |
| Fixes from the PR #37 review: source keys per quote, summary counts match the tables, neutral label for a lawsuit thread, sued stores go to a private suppression list, TestParty Pro caveat | df0a4a0 |
| Second review round: one counting rule (each review once, each thread once), every count matches its table, TestParty figures with years | 0e24bc1 |

## Current step

Waiting for Q-01.

## Next three steps

1. When Q-01 opens the web: read the App Store reviews and Community threads directly and add Reddit.
2. Update the synthesis with direct quotes and links that were opened. Record the exact page for each quote. Any sued store found goes to the suppression list in private storage, never into this repo (Q-32, Q-07).

## Blockers and open questions

- Q-01: the App Store, Shopify Community and Reddit are blocked. No Reddit thread came up in search.
- Q-32: the repo is public. Label lawsuit links by topic, never by store or plaintiff name.
- The TestParty quote "We did not have to become experts..." did not show up again on a second search (2026-10-08). Check it in the full pass.

## Decisions used

D-06, D-12, D-16

## Files touched

- docs/research/review-mining.md

## How to verify

- Open docs/research/review-mining.md. Every quote is marked "via search, not opened" and carries a source key such as (R1) or (C2). The counts in "The answer" match the tables.

## Lessons and gotchas

- Merchants already complain about lawsuit mills and fake "make your store compliant" emails. Outreach must not look like them.
- Mark every source as opened or via search, with the date checked.
