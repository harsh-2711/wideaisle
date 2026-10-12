# Handoff: T-025 Census asset cache

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Cache CSS and JS per store during the census, as a visitor's browser would

## Status

Running. Last updated 2026-10-12.

## Done so far

| Step | Commit |
|---|---|
| Task created, branch cut from main at f037d8b | 2a3fd65 |
| `app/lib/scanner/asset-cache.ts` and 14 unit tests | 05de911 |
| Baseline benchmark on main's code: 10.88 requests a page (43.5 a store); 1,853, 3,052 and 3,992 pages an hour at concurrency 1, 2 and 4 | (data/bench, not committed) |
| Census wiring, `tests/a11y/census-cache.spec.ts` (3 specs), XHR reads of stored CSS, 17 unit tests | 91921db |
| After-change benchmark: 4.71 requests a page (18.8 a store); 1,899, 3,120 and 3,892 pages an hour at concurrency 1, 2 and 4 | (data/bench, not committed) |
| Census README and the dated Spike D line; exit criteria ticked | (this checkpoint) |

## Measured (200 pages a level, same machine, 2026-10-12)

| Concurrency | Pages an hour before | After | Requests a page before | After |
|---|---|---|---|---|
| 1 | 1,853 | 1,899 | 10.88 | 4.71 |
| 2 | 3,052 | 3,120 | 10.88 | 4.71 |
| 4 | 3,992 | 3,892 | 10.88 | 4.71 |

- Pages an hour moved +2.5%, +2.2% and -2.5%: within run-to-run noise. Locally there is no network time, so fewer requests do not speed up the scan here. CPU-seconds a page stayed at 2.7 to 2.8.
- This session's VM reports a 2.10 GHz Xeon and ran faster than the Spike D runs (1,458, 2,186 and 2,782). Compare before and after only with each other.
- Runs: `data/bench/scan-bench-2026-10-12T03-10-54-750Z` (before) and `data/bench/scan-bench-2026-10-12T03-31-55-863Z` (after), gitignored.

## Current step

Docs updated. Running every check before the PR.

## Next three steps

1. Run lint, typecheck, `npm test`, the census and bench Playwright specs, the writing, claims, handoff and decisions checks, and `lint-handoff --all`.
2. Push, open the PR from the template, set the board to In review.
3. Report the PR link, head commit, numbers and check results to the lead. Do not merge.

## Design

- Misses keep `route.continue()`, so they take the same path as before: browser, egress proxy, address checks, pinned lookups.
- A context `requestfinished` listener copies a finished CSS, JS or font response (headers via `allHeaders()`, body via `body()`) into the cache. It reads no body that could not be stored, and checks the encoded size first.
- A hit is answered with `route.fulfill` from memory and makes no request. Hits are kept in a WeakSet so they are not stored again.
- axe-core re-reads each cross-origin stylesheet by XHR on every page (its CSSOM preload). Found when the spec counted 5 server hits for one CDN stylesheet over 4 pages. XHR and fetch GETs may now be answered from a stored copy, but only when the copy allows their origin: fetched for the same origin, or sent with `Access-Control-Allow-Origin: *`. Otherwise they go to the network as before. XHR and fetch responses are never stored.
- Entries match on URL and the request headers Vary names. Requests with a Range header are never served from the cache.
- Image and media blocking and main-frame navigation vetting run as before; documents are never cached.
- One `AssetCache` per `openScanContext` call, so per store. It dies with the context.
- Storage rules: status 200; no `no-store` or `no-cache`; no `Set-Cookie`; no `Vary: *`; a lifetime from max-age, Expires, or Last-Modified (a tenth of its age, as browsers do). An ETag alone is not stored: a browser would revalidate it, and this cache never revalidates. `private` is stored, since the cache serves one store's scan and is never shared.

## Blockers and open questions

- None yet.

## Decisions used

none

## Files touched

- .agents/tasks/T-025/
- app/lib/scanner/asset-cache.ts (new)
- scripts/census/census.ts (`openScanContext`)
- tests/unit/scanner/asset-cache.test.ts (new)
- tests/a11y/census-cache.spec.ts (new)
- docs/census/README.md (rules line, requests a store)
- docs/spikes/spike-d-scan-benchmark.md (one dated line)

## How to verify

- `npx vitest run tests/unit/scanner/asset-cache.test.ts`: storage rules, limits, Vary and Origin matching.
- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test tests/a11y/census-cache.spec.ts tests/a11y/census.spec.ts tests/a11y/bench.spec.ts`: one request per asset per store, no-store assets every page, the 5 MB cap, no sharing across stores, and the old redirect, WebRTC and private-address specs.
- `npm run bench:scan`: requests a page in each level's summary.

## Lessons and gotchas

- Playwright 1.64 turns the browser's HTTP cache off as soon as any route is set (`Network.setCacheDisabled`). The census routes every request, so the cache has to live in the route handler.
- Do not run heavy commands while the benchmark runs: it measures this machine's CPU.
- With routing on, Chromium adds `Cache-Control: no-cache` and `Pragma: no-cache` to every request it sends. They are not in `request.headers()`, so the cache ignores request cache headers.
- `tests/a11y/census.spec.ts` (first spec) loads `https://cdn.shopify.com/x.js` through the proxy with system DNS. The host does not resolve in this cloud session, so nothing live is fetched here; in CI it may be.
- tsx scripts in the scratchpad need a `.mts` name for top-level await, and absolute imports of the worktree's `node_modules`.
