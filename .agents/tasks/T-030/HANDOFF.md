# Handoff: T-030 Spike A: theme write path and delivery adapters

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Duplicate a theme and write files through the Admin API; the GitHub pull request route; the patched-theme file route; one-click revert.

## Status

Running. Last updated 2026-10-08. Research done; writing the shared types next.

## Done so far

| Step | Commit |
|---|---|
| Research: Admin API 2026-10 schema, GitHub REST description, exemption sources | this checkpoint |

## Current step

Shared patch types and validation under app/lib/delivery/.

## Next three steps

1. Shared types, patch validation, size limits, HTTP retry helper.
2. Patched-theme zip adapter (offline) with tests.
3. Admin API adapter and GitHub adapter with recorded fixtures and tests.

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

## How to verify

- (filled in as tests land)

## Lessons and gotchas

- productUpdateMedia is deprecated in 2026-10. Alt text goes through fileUpdate, which needs
  write_files (or write_themes), not write_products.
- themeFilesUpsert takes at most 50 files per call and returns a Job to poll.
