# Handoff: T-032 Spike C: alt text with Claude Haiku in batch

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Draft alt text for 200 product images through the Batch API; cost per 1,000 images.

## Status

Running. Builder agent. Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| 1. Branch, pinned `@anthropic-ai/sdk` 0.132.1 and `tsx` 4.23.15, `/data/` ignored | (this commit) |

## Current step

2: the batch client in `app/lib/alt-text/` with unit tests.

## Next three steps

1. Client, prompt, parser, cost and resume state in `app/lib/alt-text/`, tests in `tests/unit/alt-text/`.
2. `scripts/alt-text/run.ts` CLI and the `alt-text` npm script.
3. Rating sheet script and doc, then the spike doc `docs/spikes/spike-c-alt-text.md`.

## Blockers and open questions

- Q-04: no Anthropic API key yet. Nothing may call the real API. All tests use a mocked SDK client.
- Q-26: the owner rates 50 drafts after the real run.

## Decisions used

D-11 (alt text in batch; merchants approve), D-06 (no compliance claims), D-04 (buy nothing).

## Files touched

- package.json, package-lock.json (two pinned dependencies)
- .gitignore (`/data/`)

## How to verify

- `npm ci --ignore-scripts && npm ls @anthropic-ai/sdk tsx`

## Lessons and gotchas

- shopify.dev does not resolve from this cloud environment (Q-01). Shopify sources are "via search, not opened".
- `npm ci --ignore-scripts` skips husky, so run commitlint by hand before each commit.
