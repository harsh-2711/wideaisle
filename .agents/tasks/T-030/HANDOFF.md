# Handoff: T-030 Spike A: theme write path and delivery adapters

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Duplicate a theme and write files through the Admin API; the GitHub pull request route; the patched-theme file route; one-click revert.

Exit criteria today:

1. Adapters tested against recorded API responses: partly met until real responses are
   captured (Q-03). The fixtures are hand-written to the 2026-10 schema and GitHub's REST
   description; failure paths also run against a fake store.
2. Patched-theme route works end to end offline: met.
3. Live run on a dev store: waits on Q-03.
4. Exemption filed if needed: waits on Q-27 (the spike doc says it looks needed for the App
   Store app).

## Status

In review. Last updated 2026-10-09. All blocking, should-fix and nit items from the review of
PR #41 are fixed, each with a regression test that failed before its fix, plus the security
finding on storedMd5. Optional item 14 (inline tree content) was left out on purpose: separate
blob calls let us check each blob ID against our own hash.

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
| Board set to In review | c129280 |
| Merged main twice (no conflicts) | 3adcf89, 53e51ee |
| Review items 3, 9, 11: strict zip reader | c8f4474 |
| Review items 1, 2, 5, 6, 7, 12 (admin), 13, 17: Admin API failure paths | 324dcdb |
| Security finding: storedMd5 only from our own write, never from read-back | 4758659 |
| Review items 4, 8, 12 (GitHub): revert bound to its own repo and branches | f32dcb6 |
| Items 10, 11 (patch paths), 15, 16: tests, spike doc, fixture READMEs, this file | this commit |

## Review of PR #41: where each item is

| Item | Fix | Test |
|---|---|---|
| 1 job still running | Receipt lists pending jobs; revert waits or stops with JOB_PENDING | admin-api-failures "does not report a revert as done..." |
| 2 Shopify rewrites bytes | Receipt keeps the checksum our write returned; revert treats it as ours | admin-api-failures "reverts a file Shopify changed on write..." |
| Security: read-back checksum | storedMd5 comes only from upsertedThemeFiles of our write | admin-api-failures "never records someone else's edit as ours..." |
| 3, 9 zip bomb, sizes, CRC, duplicates | zip.ts reads the central directory itself | theme-file "refuses hostile or broken zips" (7 tests) |
| 4 GitHub revert on wrong repo | Receipt and pull request checked before any write | github "refuses a receipt from another repository..." and two more |
| 5 checksum never compared | Every read checks md5 against checksumMd5 (CHECKSUM_MISMATCH) | admin-api-failures item 5 |
| 6 deleted image blocks revert | Skipped, listed in skippedMedia | admin-api-failures item 6 |
| 7 themeDuplicate resent on 5xx | Mutations not resent after 5xx unless idempotent; copy found by name; PREVIEW_EXISTS | admin-api "does not resend themeDuplicate..." and two more |
| 8 branch names collide | Random suffix in receipt; open revert PR reused; stale revert branch moved | github items 8 (3 tests) |
| 11 unsafe paths | Zip names and patch paths refused | theme-file traversal test, patch "checks theme paths" |
| 12 tokens, apiUrl | #private fields; apiUrl must be https://api.github.com | admin-api and github item 12 tests |
| 13 MEDIA_CANNOT_BE_MODIFIED | No longer retried | admin-api-failures item 13 |
| 14 inline tree content | Not done on purpose (keeps the blob ID check) | none |
| 15, 16 doc notes | Zip metadata and symlinks; no compare-and-swap | spike doc |
| 17 preview ignores themeId | Preview copies the themeId theme | admin-api-failures item 17 |
| Extra: GitHub PR resent on 5xx | Branch and PR creation not resent; PR found by head | github "does not resend a pull request after a 5xx" |

## Current step

Waiting for review and for Q-03.

## Next three steps

1. After Q-03: install a custom-distribution app (read_themes, write_themes, read_files,
   write_files) on the dev store and run preview, apply and revert on Dawn with a one-line
   patch. This answers whether the exemption is needed for custom distribution.
2. Replace the hand-written fixtures with captured responses; check the 11 items listed
   under "What still needs a live dev store" in the spike doc (checksumMd5 meaning and
   non-UTF-8 files are new there).
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
- app/lib/delivery/: types.ts, errors.ts, limits.ts, patch.ts, http.ts, theme-file.ts, zip.ts,
  shopify-admin.ts, admin-api.ts, github.ts
- docs/spikes/spike-a-delivery.md
- tests/unit/delivery/: helpers.ts, theme-data.ts, fake-shopify.ts, zip-builder.ts,
  patch.test.ts, theme-file.test.ts, admin-api.test.ts, admin-api-failures.test.ts,
  github.test.ts
- tests/fixtures/shopify/ and tests/fixtures/github/ (hand-written responses; each README
  lists them)

## How to verify

- `npx vitest run tests/unit/delivery` (offline; no credentials; 80 tests)
- `npm run lint`, `npx tsc --noEmit`, `npm test`
- `node scripts/ci/checks.mjs handoff --base origin/main --branch claude/feat-delivery-adapters`,
  then `writing`, `claims` and `decisions`
- GraphQL documents were checked against the 2026-10 schema with graphql-js `validate`:
  `npm pack @shopify/dev-mcp@1.16.0`, unpack `dist/data/admin_2026-10.json.gz`, then
  `buildClientSchema` on it and `validate` each string in `ADMIN_QUERIES`. All 11 passed
  on 2026-10-09.
- The reviewer's probes (scratch, not in the repo) now refuse every case they reported.

## Lessons and gotchas

- productUpdateMedia is deprecated in 2026-10. Alt text goes through fileUpdate, which needs
  write_files (or write_themes), not write_products.
- themeFilesUpsert takes at most 50 files per call and returns a Job to poll.
- GitHub revert after a merge points each file at its original blob SHA, so the bytes are
  exact without uploading anything. Before checks compare git blob IDs, no downloads.
- Test data that a script must import lives in tests/unit/delivery/theme-data.ts; helpers.ts
  imports vitest and cannot load outside a test run.
- Anything read back after our write may be someone else's: never record it as ours.
- A 5xx can come after the call ran. Resend only calls that set a fixed value.
- `git merge -F -` does not read stdin; write the message to a file. Commitlint reads a body
  line that starts with "word:" as a footer.
