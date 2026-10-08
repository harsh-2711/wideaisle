# Handoff: T-030 Spike A: theme write path and delivery adapters

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Duplicate a theme and write files through the Admin API; the GitHub pull request route; the patched-theme file route; one-click revert.

## Status

In review. Last updated 2026-10-08. Agent-only part done: three adapters, 52 offline tests,
spike doc. Exit criteria 1 and 2 pass. Criteria 3 (live run) waits on Q-03 and 4 (exemption)
on Q-27.

The Admin API adapter can write to a live theme once something calls it. Under AGENTS.md
that makes this pull request one the owner merges.

## Done so far

| Step | Commit |
|---|---|
| Research: Admin API 2026-10 schema, GitHub REST description, exemption sources | d3cfb22 |
| Shared types, validation, limits, retry helpers; patched-theme zip adapter and tests | f8ced04 |
| Admin API client and adapter, 24 recorded GraphQL fixtures, 20 tests | 07b4d9e |
| GitHub pull request adapter, 24 recorded REST fixtures, 14 tests | f57148b |
| docs/spikes/spike-a-delivery.md | 86c801b |
| Final checks pass; board set to In review | this commit |

## Current step

Waiting for review and for Q-03.

## Next three steps

1. After Q-03: install a custom-distribution app (read_themes, write_themes, read_files,
   write_files) on the dev store and run preview, apply and revert on Dawn with a one-line
   patch. This answers whether the exemption is needed for custom distribution.
2. Replace the hand-written fixtures with captured responses; check the items listed under
   "What still needs a live dev store" in the spike doc.
3. Tell T-032 (Spike C) that alt text needs write_files, not write_products, and fix the
   comment in shopify.app.toml there.

## Blockers and open questions

- Q-03 (dev store): the live run waits on it. Everything else is offline.
- Q-27 (exemption request): the 2026-10 schema says every theme write mutation needs
  write_themes plus an exemption. It does not say whether custom-distribution apps are exempt.
- shopify.dev and docs.github.com are blocked here (Q-01). Sources used instead:
  the Admin schema in the Shopify Dev MCP npm package (@shopify/dev-mcp@1.16.0,
  dist/data/admin_2026-10.json) and GitHub's REST description (@octokit/openapi-types@29.0.1).

## Decisions used

D-09

## Files touched

- .agents/tasks/T-030/HANDOFF.md, status.json
- package.json, package-lock.json (fflate 0.8.2, pinned exactly)
- app/lib/delivery/: types.ts, errors.ts, limits.ts, patch.ts, http.ts, theme-file.ts,
  shopify-admin.ts, admin-api.ts, github.ts
- docs/spikes/spike-a-delivery.md
- tests/unit/delivery/: helpers.ts, theme-data.ts, patch.test.ts, theme-file.test.ts,
  admin-api.test.ts, github.test.ts
- tests/fixtures/shopify/ and tests/fixtures/github/ (hand-written responses; each README
  lists them)

## How to verify

- `npx vitest run tests/unit/delivery` (offline; no credentials; 52 tests)
- `npm run lint`, `npx tsc --noEmit`, `npm test` (62 vitest pass, 3 db tests skip without
  Postgres; 299 agent tests pass)
- `node scripts/ci/checks.mjs handoff --base origin/main --branch claude/feat-delivery-adapters`,
  then `writing` and `claims` with `--base origin/main`: all ok on 2026-10-08
- GraphQL documents were checked against the 2026-10 schema with graphql-js `validate`:
  `npm pack @shopify/dev-mcp@1.16.0`, unpack `dist/data/admin_2026-10.json.gz`, then
  `buildClientSchema` on it and `validate` each string in `ADMIN_QUERIES`. All 10 passed.

## Lessons and gotchas

- productUpdateMedia is deprecated in 2026-10. Alt text goes through fileUpdate, which needs
  write_files (or write_themes), not write_products.
- themeFilesUpsert takes at most 50 files per call and returns a Job to poll.
- GitHub revert after a merge points each file at its original blob SHA, so the bytes are
  exact without uploading anything. Before checks compare git blob IDs, no downloads.
- Test data that a script must import lives in tests/unit/delivery/theme-data.ts; helpers.ts
  imports vitest and cannot load outside a test run.
