# Handoff: T-032 Spike C: alt text with Claude Haiku in batch

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Draft alt text for 200 product images through the Batch API; cost per 1,000 images.

- [x] Batch client and prompt tested with a mock
- [x] Rating sheet ready
- [ ] Real run (needs Q-04), owner rates 50 (Q-26)

## Status

In review. The agent-only part is done. The real run is blocked on Q-04 and the ratings on Q-26. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| 1. Branch, pinned `@anthropic-ai/sdk` 0.132.1 and `tsx` 4.23.15, `/data/` ignored | 8a04b59 |
| 2. Batch client in `app/lib/alt-text/` and 48 unit tests with a mocked SDK client | d5b0906 |
| 3. CLI `scripts/alt-text/run.ts`, npm scripts `alt-text` and `alt-text:sheet`, pre-run estimate, CLI tests | b56e461 |
| 4. Rating sheet: seeded sample of 50 to CSV, `scripts/alt-text/sheet.ts`, rubric doc, tests | b640493 |
| 5. Spike doc `docs/spikes/spike-c-alt-text.md`; all checks pass | (this commit) |

## Current step

Waiting for review, then for Q-04.

## Next three steps

1. After Q-04: `npm run alt-text -- --input products.jsonl --dry-run`, then a one-image run
   (`--limit 1 --run spike-c-one --yes`) to confirm URL image sources work in a batch.
2. Run 200 images (`--run spike-c --yes`), check the total against the Console usage page, then
   change the price status in `app/lib/alt-text/config.ts` from "to verify" if it matches.
3. `npm run alt-text:sheet -- --results data/alt-text/spike-c/results.jsonl`, hand the CSV to the
   owner (Q-26), then report ratings and cost per 1,000 images in the spike doc.

## Blockers and open questions

- Q-04: no Anthropic API key yet. Nothing has called the real API. All tests use a mocked client.
- Q-26: the owner rates 50 drafts after the real run.
- Source of 200 images: the Q-03 dev store (needs an Admin API export, lane C) or public images
  we may use. Not decided.
- Owner: confirm Haiku 5.5 in place of the plan's Haiku 4.5 (D-11 text). `ALT_TEXT_MODEL` switches.
- Owner: accept or change the suggested rating bar (90% accurate, 70% rated 4 or 5).

## Decisions used

D-11 (alt text in batch; merchants approve), D-06 (no compliance claims), D-04 (buy nothing).

## Out of scope here

- Writing alt text to a store (lane C, after merchant approval through the Admin API).
- Exporting product images from a store to JSONL.
- A base64 image path. Add it only if URL fetches fail in the real run.

## Files touched

- package.json, package-lock.json (two pinned dependencies, scripts `alt-text`, `alt-text:sheet`)
- .gitignore (`/data/`)
- app/lib/alt-text/: config, types, prompt, request, parse, cost, state, runner, sheet, index
- tests/unit/alt-text/: mock-client.ts plus request, parse, cost, runner, cli and sheet tests
- scripts/alt-text/run.ts, scripts/alt-text/sheet.ts
- docs/spikes/spike-c-alt-text.md, docs/spikes/alt-text-rating-sheet.md

## How to verify

- `npm ci --ignore-scripts && npm ls @anthropic-ai/sdk tsx`
- `npx vitest run tests/unit/alt-text`: 62 tests, no network, no API key
- `npm run lint`, `npx tsc --noEmit`, `npm test`
- `npm run alt-text -- --input <products.jsonl> --dry-run` prints the first request and an estimate
- `npm run alt-text -- --input <products.jsonl> --yes` without a key exits 1 and names ANTHROPIC_API_KEY
- `node scripts/ci/checks.mjs handoff --base origin/main --branch claude/feat-alt-text`, plus
  `writing` and `claims` with `--base origin/main`

## Lessons and gotchas

- shopify.dev and w3.org do not resolve from this cloud environment (Q-01). Those sources are
  "via search, not opened".
- `npm ci --ignore-scripts` skips husky, so run commitlint by hand before each commit.
- The shared scratchpad is used by other sessions. Name commit message files `T-032-*.txt`.
- The Write tool turned a `﻿` escape into a literal byte order mark, which ESLint rejects.
  Check with `grep -P '\xEF\xBB\xBF'` after writing such escapes.
- Design: images go by URL with `width=512` on Shopify CDN URLs; structured outputs
  (`output_config.format`) plus a local validator; effort `low`; no temperature (Haiku 5.5 rejects it).
- Resume: `data/alt-text/<run>/state.jsonl` is append-only. An "intent" line is written before
  `batches.create`. If the process stops before "submitted", a resume refuses to send again unless
  `allowResubmit` is set, so a lost batch is never paid for twice by accident.
