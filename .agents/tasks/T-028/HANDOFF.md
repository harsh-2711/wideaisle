# Handoff: T-028 Census main document size cap

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Cap the main document the census fulfils, so hostile HTML cannot block the event loop; a page over the cap is skipped with a clear reason

## Status

In review. PR #53 (https://github.com/harsh-2711/wideaisle/pull/53). Last updated 2026-10-14.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main at 0aeb6ab (PR #51 merged); T-027 set Done | b23e1ff |
| Task created | 88157a8 |
| Page HTML through pinnedFetch at MAX_PAGE_BYTES (10 MB, wire and decoded); skip reason; ResponseTooLargeError, decodedBody, headerList; unit tests; census-doc-cap.spec.ts | 34a558b |
| README line; context comment | b30b05c, 3955c99 |
| All checks green; PR #53 opened | ab55bb6 |

## Current step

PR #53 open, waiting for a reviewer agent. Not merged: the lead merges or asks for it.

## Next three steps

1. Answer review comments on PR #53.
2. Once the lead says it merged, set the board to Done.
3. None further.

## Checks run before the PR (all passed)

- lint, typecheck, `npm test` (249 unit, 313 agent tests)
- full Playwright suite: 22 passed with the full binary, 22 with the headless shell 1194
- census, census-prefetch and census-doc-cap specs with `--repeat-each 5`: 30 of 30 on each build
- writing, claims, decisions and handoff checks; `lint-handoff --all`; commitlint from 0aeb6ab

## Design

- `MAX_PAGE_BYTES = 10_000_000` in `scripts/census/census.ts`. Margin: the Spike D fixtures (Dawn-like) have 75 to 214 KB of HTML at the median and at most 1.3 MB with CSS and JS; large live collection pages are said to reach a few MB (not measured here, Q-01).
- The main-frame branch of the route handler calls `pinnedFetch({ ...client.guard, maxBytes: MAX_PAGE_BYTES })` instead of `route.fetch({ maxRedirects: 0 })`. Same rules: vetted, pinned addresses; no redirects followed, so goto still vets each hop; 30 s timeout. It sends the browser's request headers, `accept-encoding: gzip, deflate, br`, and the context's cookies (`context.cookies(url)`), as route.fetch did. Repeated response headers are joined for route.fulfill: set-cookie with newlines (Playwright splits them), others with commas. The body is decoded, so its transfer headers are dropped.
- Over the cap (wire or decoded): `ResponseTooLargeError`, the route fulfils an empty page, and goto returns `{ skip: "page over 10 MB, not scanned", retry: false }`. scan() records it in `skipped` like other skips.
- Page HTML now leaves the egress proxy's path: Node fetches it directly with the same checks, as robots.txt already was. The README and the context comment say so.

## Finding: where the cap must go

Playwright 1.64's route.fetch (APIRequestContext) reads the whole body into memory and decompresses it in Node, with no size limit, before it returns (`coreBundle.js` around line 28000: chunks pushed until "end", gunzip/brotli/inflate streams). A cap after route.fetch protects the filter and the fulfil, but not the memory or time of the fetch itself, and not a compression bomb (a small gzip body that expands to gigabytes). So the cap goes on both the wire bytes and the decompressed bytes, while reading. pinnedFetch already does both.

## Blockers and open questions

- None yet.

## Decisions used

none

## Files touched

- .agents/tasks/T-028/, .agents/tasks/T-027/ (set Done)
- app/lib/scanner/egress.ts (ResponseTooLargeError, decodedBody, headerList)
- scripts/census/census.ts (MAX_PAGE_BYTES, PAGE_TOO_LARGE, page fetch, goto skip)
- tests/unit/scanner/egress.test.ts, tests/a11y/census-doc-cap.spec.ts (new)
- docs/census/README.md

## How to verify

- `npx vitest run tests/unit/scanner/egress.test.ts`: both caps raise ResponseTooLargeError; the decoded body and repeated headers come back.
- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test tests/a11y/census-doc-cap.spec.ts`, and the same with the headless shell: a 12 MB page and a gzip bomb are skipped with the reason within seconds, the next store scans, and cookies still go from one page to the next.

## Lessons and gotchas

- route.fetch has no body size option; its timeout bounds time, not memory.
