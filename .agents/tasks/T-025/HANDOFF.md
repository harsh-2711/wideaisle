# Handoff: T-025 Census asset cache

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Cache CSS and JS per store during the census, as a visitor's browser would

## Status

Running. Last updated 2026-10-12.

## Done so far

| Step | Commit |
|---|---|
| Task created, branch cut from main at f037d8b | (this checkpoint) |

## Current step

Baseline `npm run bench:scan` (200 pages a level) running on unchanged code. Writing the cache module meanwhile.

## Next three steps

1. Add `app/lib/scanner/asset-cache.ts` (storage rules, limits, Vary matching) with unit tests in `tests/unit/scanner/asset-cache.test.ts`.
2. Wire it into the route handler in `scripts/census/census.ts`: hits are fulfilled from memory, misses keep `route.continue()`, and a `requestfinished` listener stores what the browser fetched.
3. Playwright specs in `tests/a11y/census.spec.ts`: one request per asset per store, no-store fetched every page, the 5 MB entry cap, and no sharing across stores. Then re-run the benchmark and update the docs.

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
