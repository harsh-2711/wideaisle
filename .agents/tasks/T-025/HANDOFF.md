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

## Current step

Baseline `npm run bench:scan` (200 pages a level) running on unchanged code. Census wiring and `tests/a11y/census-cache.spec.ts` are written, not yet run or committed.

## Next three steps

1. When the baseline ends: run `tests/a11y/census-cache.spec.ts`, `census.spec.ts` and `bench.spec.ts`; commit the wiring in `scripts/census/census.ts` with the spec.
2. Re-run `npm run bench:scan` with the cache; record requests a page and pages an hour, before and after.
3. Update `docs/census/README.md` (request counts, "as any visitor would") and add one dated line to `docs/spikes/spike-d-scan-benchmark.md`. Then all checks, push, PR, board to In review.

## Design

- Misses keep `route.continue()`, so they take the same path as before: browser, egress proxy, address checks, pinned lookups.
- A context `requestfinished` listener copies a finished CSS, JS or font response (headers via `allHeaders()`, body via `body()`) into the cache. It reads no body that could not be stored, and checks the encoded size first.
- A hit is answered with `route.fulfill` from memory and makes no request. Hits are kept in a WeakSet so they are not stored again.
- Image and media blocking and main-frame navigation vetting run as before; documents are never cached.
- One `AssetCache` per `openScanContext` call, so per store. It dies with the context.
- Storage rules: status 200; no `no-store` or `no-cache`; no `Set-Cookie`; no `Vary: *`; a lifetime from max-age, Expires, or Last-Modified (a tenth of its age, as browsers do). An ETag alone is not stored: a browser would revalidate it, and this cache never revalidates. `private` is stored, since the cache serves one store's scan and is never shared.

## Blockers and open questions

- None yet.

## Decisions used

none

## Files touched

- .agents/tasks/T-025/

## How to verify

- (filled in once the cache lands)

## Lessons and gotchas

- Playwright 1.64 turns the browser's HTTP cache off as soon as any route is set (`Network.setCacheDisabled`). The census routes every request, so the cache has to live in the route handler.
- Do not run heavy commands while the benchmark runs: it measures this machine's CPU.
