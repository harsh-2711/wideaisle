# Handoff: T-033 Spike D: scan benchmark

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Time and cost 1,000 page scans on a small server versus Cloudflare Browser Run.

## Status

Running. Last updated 2026-10-09. Fixtures and cost model written; main merged in.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main 3ae8f88, deps installed, board set to Running | d444327 |
| Fixture generator `scripts/bench/fixtures.ts` and cost model `scripts/bench/cost.ts` | e3297d1 |
| Merged origin/main 607f7c8 (fixers, alt text), `npm ci` for the new lockfile | 429ea9d |

## Current step

Benchmark script `scripts/bench/scan-bench.ts` and the summary module.

## Next three steps

1. `scripts/bench/scan-bench.ts` (`npm run bench:scan`): serves fixtures locally, scans through the census path (`openScanContext` plus `scanPage`) at concurrency 1, 2 and 4, records wall time, pages an hour, p50 and p95, peak RSS of Node plus Chromium from /proc.
2. Vitest tests for cost maths and summary formatting; smoke test (3 pages, concurrency 1).
3. Before the real run, check whether PR #43 (census script navigation, detect.ts) has merged; if so, merge main again. Then run and write `docs/spikes/spike-d-scan-benchmark.md`.

## Blockers and open questions

- Q-05: Browser Run needs Workers Paid, a paid sign-up (D-04). Only the local half can be measured now.
- Q-01: the cloud environment blocks live storefronts, so fixtures stand in for real stores.

## Decisions used

D-10

## Files touched

- `.agents/tasks/T-033/HANDOFF.md`, `.agents/tasks/T-033/status.json`
- `scripts/bench/fixtures.ts`, `scripts/bench/cost.ts`

## How to verify

- (filled in when the benchmark lands)

## Lessons and gotchas

- The Bash guard hook blocks `cat .husky/*` (the glob could match a .env file). Use the Read tool.
- The census path works with fake per-store hosts (`s<i>.bench.test:<port>`): give `PoliteClient` `allowPrivate: true` and a `lookup` that answers 127.0.0.1. `route.fetch` for main-frame loads goes through the egress proxy too.
- `gh pr view` fails here (no GraphQL). Use `gh api repos/harsh-2711/wideaisle/pulls/<n>`.
