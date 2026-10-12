# Handoff: T-033 Spike D: scan benchmark

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Time and cost 1,000 page scans on a small server versus Cloudflare Browser Run.

## Status

Blocked on you (needs owner:Q-05). Last updated 2026-10-12. The local benchmark is measured and PR #47 fixes the review findings. The one open exit criterion, the Browser Run comparison, waits on Q-05. Live pages wait on Q-01.

## Results (reported full run, 1,000 pages a level, fixture server in a child process)

| Concurrency | Pages an hour | p50 / p95 a page | CPU-s a page | Node event loop busy | Peak PSS (RSS) |
|---|---|---|---|---|---|
| 1 | 1,399 | 2.22 s / 4.56 s | 3.78 | 30% | 1,083 MB (1,667 MB) |
| 2 | 2,303 | 2.73 s / 5.12 s | 3.76 | 49% | 1,304 MB (2,125 MB) |
| 4 | 2,837 | 4.50 s / 7.80 s | 3.86 | 64% | 1,836 MB (3,042 MB) |

- 0 failed pages. The 200-page run agrees within about 5% (1,458, 2,186, 2,782).
- Cost per 1,000 pages, small server busy all month at $5 to $15 (D-10 estimate): $0.0024 to $0.0072 at concurrency 4; $0.0049 to $0.015 at 1.
- Browser Run (plan figures, not measured): 0.71 browser-hours per 1,000 pages, 13,990 pages in the 10 included hours, $0.064 per 1,000 past them.
- Committed results: `docs/spikes/spike-d-results/` (four runs: two reported, two earlier with the server in-process).
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
| Review fixes: fixture server in a child process, event-loop and per-page-type stats, cgroup v1 fallback, Browser Run label, warmup option, smoke test checks /proc, census-mirror comment, 1.5 MB bound | d731546 |
| Re-runs with the child-process server (200 and 1,000 pages); results committed in `docs/spikes/spike-d-results/`; doc numbers updated; board set to Blocked on you (owner:Q-05) | this commit |

## Current step

PR #47 (https://github.com/harsh-2711/wideaisle/pull/47) open to main, review fixes pushed; waiting for re-review. Do not merge from this task's builder. After it merges, the task stays Blocked on you until Q-05.

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
- `scripts/bench/fixtures.ts`, `fixture-server.ts`, `cost.ts`, `proc.ts`, `summary.ts`, `scan-bench.ts`
- `tests/unit/bench/*.test.ts`, `tests/a11y/bench.spec.ts`
- `package.json` (`bench:scan` script)
- `docs/spikes/spike-d-scan-benchmark.md`, `docs/spikes/spike-d-results/`

## How to verify

- `npm run lint`, `npm run typecheck`, `npm test` (vitest 216 tests, agent tests 313).
- `npx vitest run tests/unit/bench` (cost maths, summary, /proc and cgroup parsing, fixtures, the child-process fixture server).
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
- The census path fetches every CSS and JS file again on each page of a store (10.9 requests a page); Playwright routing turns off the HTTP cache. The coordinator is opening a scanner task for it.
- This host uses cgroup v1 (`/sys/fs/cgroup/cpu/cpu.cfs_quota_us` is -1). `cgroupCpuMax` reads v2 first, then v1.
- Moving the fixture server out of Node's process changed Node's CPU a page by 0.06 s or less and pages an hour by -3% to +7%, within run-to-run spread.
- `startFixtureProcess` forks `fixture-server.ts` with `--import <tsx loader>`, so it works under tsx, vitest and the Playwright runner alike.
