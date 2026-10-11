# Handoff: T-033 Spike D: scan benchmark

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Time and cost 1,000 page scans on a small server versus Cloudflare Browser Run.

## Status

Running. Last updated 2026-10-11. Benchmark, cost model and tests done; main 096a1e1 (with PR #43) merged in. Real run next.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main 3ae8f88, deps installed, board set to Running | d444327 |
| Fixture generator `scripts/bench/fixtures.ts` and cost model `scripts/bench/cost.ts` | e3297d1 |
| Merged origin/main 607f7c8 (fixers, alt text), `npm ci` for the new lockfile | 429ea9d |
| `npm run bench:scan`, `/proc` sampler, summary, vitest tests (28), Playwright smoke test | 1b37877 |
| Merged origin/main 096a1e1 (PR #43 census nav fix, #42, #44); smoke test passes on it | cdeb0a9 |

## Current step

Real run: `npm run bench:scan` (200 pages at 1, 2, 4), then `--full` (1,000 pages at each).

## Next three steps

1. Real runs at default and full sizes; JSON and Markdown land in `data/bench/` (gitignored).
2. Write `docs/spikes/spike-d-scan-benchmark.md`: numbers, machine, caveats, Browser Run comparison (Q-05), census comparison.
3. Exit checks, set the board to In review, open the PR (coordinator asked for it), report to the coordinator.

## Blockers and open questions

- Q-05: Browser Run needs Workers Paid, a paid sign-up (D-04). Only the local half can be measured now.
- Q-01: the cloud environment blocks live storefronts, so fixtures stand in for real stores.

## Decisions used

D-10

## Files touched

- `.agents/tasks/T-033/HANDOFF.md`, `.agents/tasks/T-033/status.json`
- `scripts/bench/fixtures.ts`, `cost.ts`, `proc.ts`, `summary.ts`, `scan-bench.ts`
- `tests/unit/bench/*.test.ts`, `tests/a11y/bench.spec.ts`
- `package.json` (`bench:scan` script)

## How to verify

- `npx vitest run tests/unit/bench` (cost maths, summary, /proc parsing, fixtures).
- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test tests/a11y/bench.spec.ts` (3-page smoke run).
- `PW_CHROMIUM_PATH=... npm run bench:scan` (about 15 minutes here) or `-- --full` (about an hour).

## Lessons and gotchas

- The Bash guard hook blocks `cat .husky/*` (the glob could match a .env file). Use the Read tool.
- The census path works with fake per-store hosts (`s<i>.bench.test:<port>`): give `PoliteClient` `allowPrivate: true` and a `lookup` that answers 127.0.0.1. `route.fetch` for main-frame loads goes through the egress proxy too.
- `gh pr view` fails here (no GraphQL). Use `gh api repos/harsh-2711/wideaisle/pulls/<n>`.
- Other agents share this VM. Machine-wide CPU from /proc/stat was twice the benchmark's own, so CPU is counted from the Node and Chromium process tree (utime, stime, cutime, cstime). Machine busy is kept only as a noise sign.
- axe-core counts a placeholder as an input's name, so a faulty field needs no label and no placeholder for `missing-label` to fire.
- `tsc` type-checks every .ts under the repo, gitignored `data/` included. Keep probe scripts out of the repo tree.
- Playwright routing disables the HTTP cache, so the census path fetches every CSS and JS file again on each page of a store.
