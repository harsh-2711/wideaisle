# Handoff: T-015 M1 source checks once the web is open

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Open the sources the primer and legal brief cite through search only, and fix anything that does not match. Includes the FTC final order and the NFB case docket (D. Md., 1:26-cv-02007).

## Status

Blocked on you. Waits on web access (Q-01). Last updated 2026-10-09.

## Done so far

| Step | Commit |
|---|---|

## Current step

Waiting for Q-01.

## Next three steps

1. When Q-01 opens the web, open each source marked "via search, not opened" in docs/research/wcag-primer.md and docs/research/legal-brief.md.
2. Open the FTC's final order and the NFB case docket (D. Md., 1:26-cv-02007), which the legal brief cites through search.
3. Mark each source opened with the date, or replace it, and fix any claim it does not support. Open one pull request.

## Blockers and open questions

- Q-01: the cloud environment blocks most sites.

## Decisions used

D-06

## Files touched

- None yet.

## How to verify

- `grep -n "not opened" docs/research/wcag-primer.md docs/research/legal-brief.md` prints nothing.
- `node scripts/ci/checks.mjs claims --base origin/main` and `writing` print ok.

## Lessons and gotchas

- None yet.
