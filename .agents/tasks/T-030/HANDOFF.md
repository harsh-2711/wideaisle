# Handoff: T-030 Spike A: theme write path and delivery adapters

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Duplicate a theme and write files through the Admin API; the GitHub pull request route; the patched-theme file route; one-click revert.

## Status

Running. Last updated 2026-10-08. Shared types and the zip route are done; Admin API next.

## Done so far

| Step | Commit |
|---|---|
| Research: Admin API 2026-10 schema, GitHub REST description, exemption sources | d3cfb22 |
| Shared types, validation, limits, retry helpers; patched-theme zip adapter and tests | this commit |

## Current step

Admin API adapter with recorded GraphQL fixtures.

## Next three steps

1. Admin API client (throttling, retries) and adapter (duplicate, upsert, job polling, revert).
2. GitHub pull request adapter with recorded REST fixtures.
3. docs/spikes/spike-a-delivery.md, then final checks.

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
- app/lib/delivery/: types.ts, errors.ts, limits.ts, patch.ts, http.ts, theme-file.ts
- tests/unit/delivery/: helpers.ts, patch.test.ts, theme-file.test.ts

## How to verify

- `npx vitest run tests/unit/delivery` (offline; no credentials)

## Lessons and gotchas

- productUpdateMedia is deprecated in 2026-10. Alt text goes through fileUpdate, which needs
  write_files (or write_themes), not write_products.
- themeFilesUpsert takes at most 50 files per call and returns a Job to poll.
