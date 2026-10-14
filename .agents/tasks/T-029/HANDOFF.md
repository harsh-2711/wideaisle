# Handoff: T-029 Census page decoder: several content-encodings

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Decode page bodies with stacked or raw content-encodings the way Chromium does, still under MAX_PAGE_BYTES, or skip them with a clear reason.

## Status

Running (builder). Last updated 2026-10-14.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main at dbd6c25; board set Running | this checkpoint |

## Current step

Unit tests first (tests/unit/scanner/egress.test.ts), then the decoder in app/lib/scanner/egress.ts.

## Next three steps

1. Unit tests: `gzip, gzip`, raw deflate, br alone and stacked, unknown encoding and too many layers refused, a stacked bomb and a page over the cap on the wire raise ResponseTooLargeError, the cap holds across layers together.
2. Decoder: every listed layer, last applied first; deflate falls back from zlib to raw; one decoded budget for all layers (`maxOutputLength` per layer = what is left). Unknown encoding, more than 3 layers or corrupt data: ContentEncodingError, and the census skips the page with a reason.
3. Spec in tests/a11y/census-doc-cap.spec.ts: a `gzip, gzip` page and a raw-deflate page render their decoded HTML and the next page loads; an unknown encoding is skipped with the reason and the next page loads.

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
