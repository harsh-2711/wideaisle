# Handoff: T-028 Census main document size cap

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Cap the main document the census fulfils, so hostile HTML cannot block the event loop; a page over the cap is skipped with a clear reason

## Status

Running. Last updated 2026-10-14.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main at 0aeb6ab (PR #51 merged); T-027 set Done | b23e1ff |
| Task created | (this checkpoint) |

## Current step

Fetch the main document with pinnedFetch (capped on the wire and after decompression) instead of route.fetch.

## Next three steps

1. pinnedFetch: a typed ResponseTooLargeError for both caps, and the decoded body and header list for callers that pass the response on.
2. openScanContext: main document through pinnedFetch at MAX_PAGE_BYTES, with the context's cookies; a page over the cap becomes a skip in goto.
3. Specs (over-cap page, compressed bomb, next store scans, cookies still round-trip), README line, checks, PR.

## Finding: where the cap must go

Playwright 1.64's route.fetch (APIRequestContext) reads the whole body into memory and decompresses it in Node, with no size limit, before it returns (`coreBundle.js` around line 28000: chunks pushed until "end", gunzip/brotli/inflate streams). A cap after route.fetch protects the filter and the fulfil, but not the memory or time of the fetch itself, and not a compression bomb (a small gzip body that expands to gigabytes). So the cap goes on both the wire bytes and the decompressed bytes, while reading. pinnedFetch already does both.

## Blockers and open questions

- None yet.

## Decisions used

none

## Files touched

- .agents/tasks/T-028/, .agents/tasks/T-027/ (set Done)

## How to verify

- (filled in as the work lands)

## Lessons and gotchas

- route.fetch has no body size option; its timeout bounds time, not memory.
