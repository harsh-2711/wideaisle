# Handoff: T-033 Spike D: scan benchmark

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Time and cost 1,000 page scans on a small server versus Cloudflare Browser Run.

## Status

In review. Last updated 2026-10-11. Local benchmark done and measured; spike doc written; PR open to main. The Browser Run half waits on Q-05, live pages on Q-01.

## Results (full run, 1,000 pages a level, 4 vCPU VM, local fixtures)

| Concurrency | Pages an hour | p50 / p95 a page | CPU-s a page | Peak PSS (RSS) |
|---|---|---|---|---|
| 1 | 1,373 | 2.26 s / 4.58 s | 3.87 | 1,095 MB (1,676 MB) |
| 2 | 2,187 | 2.91 s / 5.43 s | 3.95 | 1,312 MB (2,106 MB) |
| 4 | 2,919 | 4.46 s / 7.38 s | 3.74 | 1,845 MB (3,096 MB) |

- 0 failed pages. A 200-page run agrees within about 5% (1,366, 2,254, 2,782).
- Cost per 1,000 pages, small server busy all month at $5 to $15 (D-10 estimate): $0.0023 to $0.0070 at concurrency 4; $0.0050 to $0.015 at 1.
- Browser Run (plan figures, not measured): 0.73 browser-hours per 1,000 pages, 13,734 pages in the 10 included hours, $0.066 per 1,000 past them.
- Details, census comparison and the ADR 0005 replacement values: `docs/spikes/spike-d-scan-benchmark.md`.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main 3ae8f88, deps installed, board set to Running | d444327 |
| Fixture generator `scripts/bench/fixtures.ts` and cost model `scripts/bench/cost.ts` | e3297d1 |
| Merged origin/main 607f7c8 (fixers, alt text), `npm ci` for the new lockfile | 429ea9d |
| `npm run bench:scan`, `/proc` sampler, summary, vitest tests, Playwright smoke test | 1b37877 |
| Merged origin/main 096a1e1 (PR #43 census nav fix, #42, #44); smoke test passes on it | cdeb0a9 |
| Requests per page in the summary (shows CSS and JS refetched on every page) | 1a33719 |
| First default run (fixture v2) lost one page a level to a home page with no product link; fixed in fixture v3 | 5a06376 |
| Real runs on v3: default (200 pages) and full (1,000 pages) at concurrency 1, 2 and 4 | results in `data/bench/` (gitignored) |
| Dollar and seconds formats in the summary | 0217f17 |
| `docs/spikes/spike-d-scan-benchmark.md` | 1012f5c |
| Merged origin/main ad387c5 (ADRs, PR #46) | b115c90 |

## Current step

PR #47 (https://github.com/harsh-2711/wideaisle/pull/47) open to main; waiting for review. Do not merge from this task's builder.

## Next three steps

1. Reviewer checks the PR; fix what it finds.
2. T-034 replaces the "Estimate, Spike D replaces it" rows in `docs/adr/0005-poc-hosting.md` with the values in the spike doc's "Planning figures to replace" table. This PR does not edit the ADR.
3. When Q-05 is decided, run the Browser Run half as the spike doc's "Browser Run comparison" section describes. When Q-01 is done, repeat on live pages.

## Blockers and open questions

- Q-05: Browser Run needs Workers Paid, a paid sign-up (D-04). Only plan figures are used for Browser Run.
- Q-01: the cloud environment blocks live storefronts, so fixtures stand in for real stores. No live page was fetched.

## Decisions used

D-10

## Files touched

- `.agents/tasks/T-033/HANDOFF.md`, `TASK.md`, `status.json`
- `scripts/bench/fixtures.ts`, `cost.ts`, `proc.ts`, `summary.ts`, `scan-bench.ts`
- `tests/unit/bench/*.test.ts`, `tests/a11y/bench.spec.ts`
- `package.json` (`bench:scan` script)
- `docs/spikes/spike-d-scan-benchmark.md`

## How to verify

- `npm run lint`, `npm run typecheck`, `npm test` (vitest 216 tests, agent tests 313).
- `npx vitest run tests/unit/bench` (cost maths, summary, /proc parsing, fixtures).
- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:a11y` (13 tests, including the 3-page bench smoke test).
- `PW_CHROMIUM_PATH=... npm run bench:scan` (about 20 minutes here) or `-- --full` (about 90 minutes).
- `node scripts/ci/checks.mjs handoff --base origin/main --branch claude/feat-scan-benchmark`, and the `writing` and `claims` checks with `--base origin/main`.

## Lessons and gotchas

- The Bash guard hook blocks `cat .husky/*` (the glob could match a .env file). Use the Read tool.
- The census path works with fake per-store hosts (`s<i>.bench.test:<port>`): give `PoliteClient` `allowPrivate: true` and a `lookup` that answers 127.0.0.1. `route.fetch` for main-frame loads goes through the egress proxy too.
- `gh pr view` fails here (no GraphQL). Use `gh api repos/harsh-2711/wideaisle/pulls/<n>`.
- Other agents share this VM. Machine-wide CPU from /proc/stat was twice the benchmark's own in an early trial, so CPU is counted from the Node and Chromium process tree (utime, stime, cutime, cstime). Machine busy is kept only as a noise sign; in the reported runs it was within 3 points.
- The VM moved hosts between sessions (2.10 GHz on 2026-10-08, 2.80 GHz on 2026-10-11). Compare runs only from the same host.
- axe-core counts a placeholder as an input's name, so a faulty field needs no label and no placeholder for `missing-label` to fire.
- `tsc` type-checks every .ts under the repo, gitignored `data/` included. Keep probe scripts out of the tree, or name them `.mts`.
- Prettier rewrote the escaped em dash in test strings into the literal character, which the writing check bans. Use `String.fromCharCode(0x2014)`.
- The census path fetches every CSS and JS file again on each page of a store (10.9 requests a page); Playwright routing turns off the HTTP cache.
