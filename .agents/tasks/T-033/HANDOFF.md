# Handoff: T-033 Spike D: scan benchmark

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Time and cost 1,000 page scans on a small server versus Cloudflare Browser Run.

## Status

Running. Last updated 2026-10-08. Builder started; plan below, no code yet.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main 3ae8f88, deps installed, board set to Running | this commit |

## Current step

Fixture generator and benchmark script.

## Next three steps

1. `scripts/bench/fixtures.ts`: seeded Shopify-like store pages (home, collection, product, cart) with theme CSS, theme and app JS, 300 KB to 1.5 MB a page.
2. `scripts/bench/scan-bench.ts` (`npm run bench:scan`): serves fixtures locally, scans through the census path (`openScanContext` plus `scanPage`) at concurrency 1, 2 and 4, records wall time, pages an hour, p50 and p95, peak RSS of Node plus Chromium from /proc.
3. `scripts/bench/cost.ts`: cost per 1,000 pages on a small server (price as input) and on Browser Run (plan figures from the roadmap); vitest tests; smoke test; real run; `docs/spikes/spike-d-scan-benchmark.md`.

## Blockers and open questions

- Q-05: Browser Run needs Workers Paid, a paid sign-up (D-04). Only the local half can be measured now.
- Q-01: the cloud environment blocks live storefronts, so fixtures stand in for real stores.

## Decisions used

D-10

## Files touched

- `.agents/tasks/T-033/HANDOFF.md`, `.agents/tasks/T-033/status.json`

## How to verify

- (filled in when the benchmark lands)

## Lessons and gotchas

- The Bash guard hook blocks `cat .husky/*` (the glob could match a .env file). Use the Read tool.
