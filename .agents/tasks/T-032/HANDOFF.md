# Handoff: T-032 Spike C: alt text with Claude Haiku in batch

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Draft alt text for 200 product images through the Batch API; cost per 1,000 images.

- [x] Batch client and prompt tested with a mock
- [x] Rating sheet ready
- [ ] Real run (needs Q-04 and Q-33), owner rates 50 (Q-26)

## Status

In review (PR #39). Review findings are fixed. The real run is blocked on Q-04 (API key) and Q-33 (model approval), the ratings on Q-26. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| 1. Branch, pinned `@anthropic-ai/sdk` 0.132.1 and `tsx` 4.23.15, `/data/` ignored | 8a04b59 |
| 2. Batch client in `app/lib/alt-text/` and 48 unit tests with a mocked SDK client | d5b0906 |
| 3. CLI `scripts/alt-text/run.ts`, npm scripts `alt-text` and `alt-text:sheet`, pre-run estimate, CLI tests | b56e461 |
| 4. Rating sheet: seeded sample of 50 to CSV, `scripts/alt-text/sheet.ts`, rubric doc, tests | b640493 |
| 5. Spike doc `docs/spikes/spike-c-alt-text.md`; all checks pass | a9d9f64 |
| 6. Board state set to In review | 88ec366 |
| 7. Merged origin/main (owner queue Q-30 to Q-32, census tsx); took main's `^4.23.15` range for tsx | 855116b |
| 8. Review fixes: create with no SDK retries and unknown outcome kept, per-run caps and ceilings, run lock, custom_id clash, CSV guard, certif\w*, locale check; regression tests | e7e1749 |
| 9. Docs for the fixes, owner queue Q-33, board back to In review | (this commit) |

## Current step

Waiting for the coordinator to merge PR #39, then for Q-04 and Q-33.

## Next three steps

1. After Q-04 and Q-33: `npm run alt-text -- --input products.jsonl --dry-run`, then a one-image run
   (`--limit 1 --run spike-c-one --yes`) to confirm URL image sources work in a batch.
2. Run 200 images (`--run spike-c --yes`), check the total against the Console usage page, then
   change the price status in `app/lib/alt-text/config.ts` from "to verify" if it matches.
3. `npm run alt-text:sheet -- --results data/alt-text/spike-c/results.jsonl`, hand the CSV to the
   owner (Q-26), then report ratings and cost per 1,000 images in the spike doc.

## Blockers and open questions

- Q-04: no Anthropic API key yet. Nothing has called the real API. All tests use a mocked client.
- Q-33: the owner approves Haiku 5.5 in place of the Haiku 4.5 that D-11 names. Haiku 4.5 retires
  not sooner than October 15, 2026. `ALT_TEXT_MODEL` switches the model if the answer is no.
- Q-26: the owner rates 50 drafts after the real run.
- Source of 200 images: the Q-03 dev store (needs an Admin API export, lane C) or public images
  we may use. Not decided.
- Owner: accept or change the suggested rating bar (90% accurate, 70% rated 4 or 5).

## Decisions used

D-11 (alt text in batch; merchants approve), D-06 (no compliance claims), D-04 (buy nothing).

## Out of scope here

- Writing alt text to a store (lane C, after merchant approval through the Admin API).
- Exporting product images from a store to JSONL.
- A base64 image path. Add it only if URL fetches fail in the real run.

## Files touched

- package.json, package-lock.json (SDK pinned at 0.132.1, tsx `^4.23.15` as on main, scripts
  `alt-text`, `alt-text:sheet`)
- .gitignore (`/data/`)
- .agents/owner-queue.md (Q-33)
- app/lib/alt-text/: config, types, prompt, request, parse, cost, state, runner, sheet, index
- tests/unit/alt-text/: mock-client.ts plus request, parse, cost, runner, cli and sheet tests
- scripts/alt-text/run.ts, scripts/alt-text/sheet.ts
- docs/spikes/spike-c-alt-text.md, docs/spikes/alt-text-rating-sheet.md

## How to verify

- `npm ci --ignore-scripts && npm ls @anthropic-ai/sdk tsx`
- `npx vitest run tests/unit/alt-text`: 78 tests, no network, no API key
- `npm run lint`, `npx tsc --noEmit`, `npm test`
- `npm run alt-text -- --help` lists the three spending limits, their defaults and ceilings
- `npm run alt-text -- --input <products.jsonl> --dry-run` prints the first request and an estimate
- `npm run alt-text -- --input <products.jsonl> --yes` without a key exits 1 and names ANTHROPIC_API_KEY
- `node scripts/ci/checks.mjs handoff --base origin/main --branch claude/feat-alt-text`, plus
  `writing`, `claims` and `decisions`

## Lessons and gotchas

- shopify.dev and w3.org do not resolve from this cloud environment (Q-01). Those sources are
  "via search, not opened".
- `npm ci --ignore-scripts` skips husky, so run commitlint by hand before each commit.
- The shared scratchpad is used by other sessions. Name commit message files `T-032-*.txt`.
- The Write and Edit tools turn `\u` escapes such as U+FEFF, U+00A0 and U+3000 into literal
  characters, which ESLint rejects. After writing one, check with
  `grep -P '\xEF\xBB\xBF|\xC2\xA0|\xE3\x80\x80'` and fix with sed.
- The guard hook blocks `git checkout --theirs`. To take main's side of a file in a merge, use
  `git show origin/main:<file> > <file>`.
- Design: images go by URL with `width=512` on Shopify CDN URLs; structured outputs
  (`output_config.format`) plus a local validator; effort `low`; no temperature (Haiku 5.5 rejects it).
- Paying once: `batches.create` runs with `maxRetries: 0` (no idempotency key). Any create error
  leaves the "intent" line open, and a resume refuses to send again unless `allowResubmit` is set.
  Abandoned submissions count toward the request cap.
- Caps count the whole run folder across commands: images (250, ceiling 1,000), requests including
  retries (500, ceiling 3,000), attempts per image (2, ceiling 3). A `lock` file guards the folder.
