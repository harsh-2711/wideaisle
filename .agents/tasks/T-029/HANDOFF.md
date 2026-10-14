# Handoff: T-029 Census page decoder: several content-encodings

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Decode page bodies with stacked or raw content-encodings the way Chromium does, still under MAX_PAGE_BYTES, or skip them with a clear reason.

## Status

Queued. Last updated 2026-10-14.

## Done so far

| Step | Commit |
|---|---|

## Current step

Not started.

## Next three steps

1. Read app/lib/scanner/egress.ts `decode` and how pinnedFetch caps wire and decoded bytes.
2. Decode stacked encodings in order (as Chromium does), with the decoded cap applied across all of them; raw deflate falls back from zlib to raw inflate. Otherwise skip with a reason.
3. Build the fixtures in the tests (zlib.gzipSync twice for `gzip, gzip`; zlib.deflateRawSync for raw deflate). Spec: each page renders its decoded HTML or is skipped with a reason, then the next page of the same store loads. Unit test: a stacked `gzip, gzip` bomb raises ResponseTooLargeError.

## Blockers and open questions

- None. Agent-only. Found in the PR #53 review; main behaves the same today.

## Decisions used

none

## Files touched

- None yet.

## How to verify

- `npx vitest run tests/unit/scanner/egress.test.ts`
- `PW_CHROMIUM_PATH=... npx playwright test tests/a11y/census-doc-cap.spec.ts`

## Lessons and gotchas

- None yet.
