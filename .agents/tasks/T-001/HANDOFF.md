# Handoff: T-001 Scaffold the Shopify app on Drizzle, Postgres and pg-boss

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. One TypeScript repo on Shopify's React Router template with Postgres, Drizzle, pg-boss and Playwright.

## Status

Done. Merged to main in harsh-2711/wideaisle#7 (merge commit 7257800).

## Done so far

| Step | Commit |
|---|---|
| Template copied, Prisma swapped for Drizzle | 4cdf5d8 |
| Schema, tests, configs | 053d087 |
| Postgres integration test | 18eba2a |
| Webhooks verified by HMAC; migrations without drizzle-kit | ab301e2 |
| Webhooks bound to topics, replays rejected | f143212 |
| Webhook remembered only after its handler succeeds | bc7d34a |
| Merged | 7257800 |

## Current step

None. The task is done.

## Next three steps

1. Nothing left on this task.
2. Follow-ups live in their own tasks (T-030 delivery, T-033 scan).
3. The app needs Q-03 and Q-04 before it can run against a dev store.

## Blockers and open questions

- None yet.

## Decisions used

D-05

## Files touched

- app/, drizzle/, scripts/migrate.mjs, tests/, Dockerfile, docker-compose.yml, shopify.app.toml, package.json

## How to verify

- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass.
- With Postgres up (`npm run db:up`) and DATABASE_URL set, `REQUIRE_DATABASE=1 npx vitest run tests/integration` stores a session in Postgres. CI runs the same job.
- `npm run test:a11y` passes after `npx playwright install chromium`.

## Lessons and gotchas

- The integration test skips when DATABASE_URL is unset. Set REQUIRE_DATABASE=1 to make a missing database fail instead, as CI does.
- These two sections were dropped in 090077a and restored by T-008.
