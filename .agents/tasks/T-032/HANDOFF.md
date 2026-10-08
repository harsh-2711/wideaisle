# Handoff: T-032 Spike C: alt text with Claude Haiku in batch

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Draft alt text for 200 product images through the Batch API; cost per 1,000 images.

## Status

Running. Builder agent. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| 1. Branch, pinned `@anthropic-ai/sdk` 0.132.1 and `tsx` 4.23.15, `/data/` ignored | 8a04b59 |
| 2. Batch client in `app/lib/alt-text/` and 48 unit tests with a mocked SDK client | d5b0906 |
| 3. CLI `scripts/alt-text/run.ts`, npm scripts `alt-text` and `alt-text:sheet`, pre-run estimate, CLI tests | b56e461 |
| 4. Rating sheet: seeded sample of 50 to CSV, `scripts/alt-text/sheet.ts`, rubric doc, tests | (this commit) |

## Current step

5: spike doc.

## Next three steps

1. Spike doc `docs/spikes/spike-c-alt-text.md`.
2. All checks (lint, tsc, test, handoff, writing, claims), then state "In review".
3. After Q-04: dry run, then a real run on 200 images; then the sheet for Q-26.

## Blockers and open questions

- Q-04: no Anthropic API key yet. Nothing may call the real API. All tests use a mocked SDK client.
- Q-26: the owner rates 50 drafts after the real run.

## Decisions used

D-11 (alt text in batch; merchants approve), D-06 (no compliance claims), D-04 (buy nothing).

## Files touched

- package.json, package-lock.json (two pinned dependencies)
- .gitignore (`/data/`)
- app/lib/alt-text/: config, types, prompt, request, parse, cost, state, runner, index
- tests/unit/alt-text/: mock-client.ts plus request, parse, cost, runner and cli tests
- scripts/alt-text/run.ts, scripts/alt-text/sheet.ts
- app/lib/alt-text/sheet.ts, tests/unit/alt-text/sheet.test.ts
- docs/spikes/alt-text-rating-sheet.md

## How to verify

- `npm ci --ignore-scripts && npm ls @anthropic-ai/sdk tsx`
- `npx vitest run tests/unit/alt-text` (no network, no API key)
- `npm run alt-text -- --input <products.jsonl> --dry-run` prints the first request and an estimate
- `npm run alt-text -- --input <products.jsonl> --yes` without a key exits 1 and names ANTHROPIC_API_KEY

## Lessons and gotchas

- shopify.dev does not resolve from this cloud environment (Q-01). Shopify sources are "via search, not opened".
- `npm ci --ignore-scripts` skips husky, so run commitlint by hand before each commit.
- Design: images go by URL with `width=512` on Shopify CDN URLs; structured outputs
  (`output_config.format`) plus a local validator; effort `low`; no temperature (Haiku 5.5 rejects it).
- Resume: `data/alt-text/<run>/state.jsonl` is append-only. An "intent" line is written before
  `batches.create`. If the process stops before "submitted", a resume refuses to send again unless
  `allowResubmit` is set, so a lost batch is never paid for twice by accident.
