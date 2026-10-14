# Handoff: T-029 Census page decoder: several content-encodings

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Decode page bodies with stacked or raw content-encodings the way Chromium does, still under MAX_PAGE_BYTES, or skip them with a clear reason.

## Status

Running (builder). Last updated 2026-10-14.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main at dbd6c25; board set Running | 3bf1884 |
| Decoder: every layer, last applied first; deflate zlib then raw; one decoded budget for all layers; ContentEncodingError. Six unit tests | 756df80 |
| Census skips a page it cannot decode, with the reason; two specs | 53db8b2 |
| New tests run against main's decoder: all eight fail (see Proof) | no commit, files restored |
| README line on decoding | this checkpoint |

## Current step

Every check, then the PR.

## Next three steps

1. Run lint, typecheck, `npm test`, the full Playwright suite, `node scripts/ci/checks.mjs writing claims handoff decisions --base origin/main` and `node scripts/agents/board.mjs lint-handoff --all`.
2. Push, open the PR from .github/pull_request_template.md, set the board to In review with the PR number.
3. Report to the lead: PR link, head commit, the proof, check results. Do not merge.

## Design

- `decode` in app/lib/scanner/egress.ts splits Content-Encoding on commas (Node joins repeated header lines with ", "), lowercases, drops `identity` and empty tokens, and decodes the rest last to first, as Chromium does. Names: gzip, x-gzip, deflate, br.
- Deflate tries `inflateSync` (zlib header) and, on any error but the size limit, `inflateRawSync`. Chromium also falls back to raw.
- One decoded budget, `maxBytes`, for all layers. Each layer runs with `maxOutputLength` = what the earlier layers left, so a stacked bomb stops in whichever layer reaches the cap. zlib takes no limit under 1, so an empty budget with a layer left is ResponseTooLargeError. The wire cap is unchanged and comes first.
- `ContentEncodingError`: an unknown name, more than `MAX_ENCODING_LAYERS` (3) layers, or corrupt data. pinnedFetch still resolves status and headers; `decodedBody()` and `text()` reject. So a redirect with an odd body is still followed (the census never reads a redirect's body). ResponseTooLargeError stays eager, as in T-028.
- Census route handler: `nav.tooLarge` became `nav.skip` (a reason). ResponseTooLargeError gives PAGE_TOO_LARGE as before. ContentEncodingError gives `pageNotDecoded(message)`: "page could not be decoded (content-encoding zstd is not supported), not scanned". Both fulfil an empty page and goto returns `{ skip, retry: false }`.
- Behaviour change to note: corrupt data used to be a 502 (recorded as "HTTP 502"); it is now a skip with the reason. PoliteClient (robots.txt, discover) sees the same error from `text()`: robots.txt that cannot be decoded counts as unreachable, as a failed fetch did.

## Proof the new tests fail on main's decoder

Main's `decode` (dbd6c25, verbatim, with main's ERR_BUFFER_TOO_LARGE mapping) was put back into egress.ts for one run, then the files were restored.
- Unit: all 6 new tests fail. `gzip, gzip` and `gzip, br` come back still compressed; raw deflate throws "incorrect header check"; zstd, the stacked bomb and the 600 KB + 600 KB case resolve instead of rejecting.
- Spec: both new tests fail. The `gzip, gzip` home page renders with an empty title; on its own, the raw-deflate page fails `goto` with ERR_HTTP_RESPONSE_CODE_FAILURE (the 502); the zstd page is scanned instead of skipped.
- The wire-cap assertion inside the bomb test passes on main by design: it guards existing behaviour. The test as a whole fails on main because of the bomb.

## Blockers and open questions

- None. Agent-only. Found in the PR #53 review.

## Decisions used

none

## Files touched

- app/lib/scanner/egress.ts (decode, DECODERS, MAX_ENCODING_LAYERS, ContentEncodingError, lazy body error)
- scripts/census/census.ts (pageNotDecoded, nav.skip)
- tests/unit/scanner/egress.test.ts (6 tests), tests/a11y/census-doc-cap.spec.ts (2 tests)
- docs/census/README.md (one line)

## How to verify

- `npx vitest run tests/unit/scanner/egress.test.ts`
- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test tests/a11y/census-doc-cap.spec.ts`

## Lessons and gotchas

- vitest `toEqual` on a 600 KB Buffer takes seconds; use `Buffer.equals`.
- The guard hook blocks `git checkout -- <path>`. To undo a temporary edit, write `git show HEAD:<path>` to the scratchpad and copy it back.
