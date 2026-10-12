# Handoff: T-027 Census prefetch

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Store pages cannot make the census browser fetch store URLs outside robots.txt and the 2 s gap: link prefetch, link prerender and speculation rules

## Status

Running. Last updated 2026-10-12.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main at deb55fa (PR #50 merged); T-026 set Done | fafd5e1 |
| Task created | (this checkpoint) |

## Current step

Probing each vector on both Chromium 141 builds, in a scratch folder of my own (the reviewer's probe folder links to another checkout's `node_modules`, so nothing is run from it).

## Next three steps

1. Measure each vector and each candidate fix on the full binary and the headless shell build 1194.
2. Implement: abort `Sec-Purpose: prefetch` in the route handler; merged `--enable-features` with NoStatePrefetchHoldback; strip speculation rules from main documents; an init script for rules added later, if it measurably works.
3. Specs: robots.txt disallows /secret, one page per vector, the server never sees /secret; census specs launch through `launchCensusBrowser`; README line 8.

## Reviewer findings (PR #50 review)

- (a) `<link rel="prefetch">`, both builds: resourceType "other" with `Sec-Purpose: prefetch`, goes through `route.continue()`.
- (b) `<link rel="prerender">`, full binary only: NoState prefetch, invisible to Playwright. `--enable-features=NoStatePrefetchHoldback` stopped it.
- (c) Speculation rules (list and document rules, eager and immediate), both builds, HTTPS on a unique host: skip the route handler. Not stopped by `--disable-blink-features=SpeculationRules`, disabling NoStatePrefetch, or a PreloadingConfig holdback.

## Blockers and open questions

- None yet.

## Decisions used

none

## Files touched

- .agents/tasks/T-027/, .agents/tasks/T-026/ (set Done)

## How to verify

- (filled in as the work lands)

## Lessons and gotchas

- The last `--disable-features` and, per the reviewer, the last `--enable-features` switch wins in Chromium 141. Playwright puts its own first.
