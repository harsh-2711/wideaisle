# Spike A: theme write path and delivery adapters

Task T-030, decision D-09. Written 2026-10-08. Nothing here touched a live
store, bought anything or used credentials.

## Findings first

1. All three delivery routes from D-09 are built behind one interface
   (preview, apply, revert) and pass 52 offline tests against hand-written
   recorded responses. Every route refuses a patch whose `before` differs
   from the store, and every revert restores the original bytes.
2. The Admin API 2026-10 schema marks every theme write as needing
   `write_themes` plus an exemption from Shopify: `themeDuplicate`,
   `themeCreate`, `themeFilesUpsert`, `themeFilesDelete`, `themeDelete`.
   The schema does not say whether the distribution type changes that.
3. Whether a custom-distribution app avoids the exemption is **not
   confirmed**. Shopify's docs, as seen through search, tie the exemption
   to App Store apps. Community reports are mixed. Only a live call from a
   custom-distribution app on a dev store answers it (Q-03).
4. Alt text needs no theme edit and no exemption. `productUpdateMedia` is
   deprecated in 2026-10; its replacement `fileUpdate` needs `write_files`
   (or `write_themes`), not `write_products`. The comment in
   `shopify.app.toml` that says Spike C adds `write_products` should say
   `write_files`. That is for T-032 to change.
5. Q-27 looks needed for the App Store app, whatever the pilot result. For
   pilots on a custom-distribution app, run the Q-03 check first.

## What was built

All code is in `app/lib/delivery/`. Nothing calls it from a route yet.

| File | What it does |
|---|---|
| `types.ts` | `DeliveryPatch` (theme file changes plus alt-text changes) and the `DeliveryAdapter` interface |
| `patch.ts` | Validation (paths, duplicates, no-op changes, size limits), merging chained fixer patches, byte comparison |
| `limits.ts` | Shopify's per-file size limits and batch sizes |
| `errors.ts` | `PatchConflictError`, `InvalidPatchError`, `DeliveryApiError`, `PartialApplyError` |
| `http.ts` | The fetch shape the clients take, backoff with jitter, `Retry-After` parsing |
| `shopify-admin.ts` | Admin GraphQL client: HTTP 429 and 5xx retry, THROTTLED wait from the cost block, ACCESS_DENIED mapping |
| `admin-api.ts` | Route A adapter |
| `github.ts` | Route B adapter |
| `theme-file.ts` | Route C adapter |

### The patch shape

A file change is `{ file, before, after }`: the same field names as the
fixer engine's `Patch` and `FileResult` on the open fixers branch
(`claude/feat-dawn-fixers`, PR #35), so fixer output passes in as is.
`before: null` means the patch creates the file. `patchFromFileChanges`
merges several fixer patches on one file into one change and refuses
patches that do not chain. Alt-text changes are
`{ productId, mediaId, before, after }`. The GitHub and zip routes carry
theme files only; `splitPatch` sends alt text to the Admin API route.

### Route A: Admin API

- **Preview** finds the live theme (`themes(roles: [MAIN])`), checks every
  `before`, duplicates the theme with `themeDuplicate` as an unpublished
  theme named "Wide Aisle preview <id>", waits while `processing` is true,
  checks the copy again, writes the patch with `themeFilesUpsert`, polls the
  returned `Job`, and reads the files back to compare bytes. It returns a
  preview URL (`https://<shop>/?preview_theme_id=<id>`). If any step fails it
  deletes the copy. `discardPreview` deletes a preview theme and refuses any
  theme that is live or not named as ours.
- **Apply** writes to the live theme (or a chosen theme) in batches of 50,
  polls each job, and reads every file back to compare bytes. Alt text goes
  through `fileUpdate` in batches of 25 and is checked in the response. If a
  write fails after any write was sent, it throws `PartialApplyError` with a
  receipt of everything it may have written, so revert can undo it.
- **Revert** reads each file. A file that still holds `after` is restored to
  `before` (created files are deleted with `themeFilesDelete`); a file that
  already holds `before` is skipped; anything else is a conflict, and
  nothing is written. It then reads the files back and compares bytes.
- Reads handle all three body types (text, base64, short-lived URL).
  `NOT_FOUND` in `theme.files` userErrors means the file is missing; other
  codes stop the run.
- Retries: HTTP 429 waits for `Retry-After`, 5xx backs off, a top-level
  THROTTLED error waits until the bucket holds the requested cost, and the
  `THROTTLED`, `FILE_LOCKED`, `MEDIA_CANNOT_BE_MODIFIED` and
  `NON_READY_STATE` userError codes back off and retry.

### Route B: GitHub pull request

- **Preview** reads the connected branch (ref, commit, recursive tree) and
  compares each file's git blob ID with the blob ID of `before`. No file
  content is downloaded and nothing is written.
- **Apply** uploads one blob per file and checks the ID GitHub returns
  against our own hash, then creates a tree on the base tree, a commit, a
  branch `wide-aisle/<id>` and a pull request. If the pull request fails, it
  deletes the branch.
- **Revert** closes the pull request and deletes its branch when it is still
  open; the theme never changed. After a merge, it opens a revert pull
  request whose tree points each file at its original blob ID (or deletes
  files the patch created), so the bytes are exactly the ones the scan saw.
  It refuses when the merchant edited a file after the merge.
- Retries: 429, and 403 with `x-ratelimit-remaining: 0` or `retry-after`,
  wait as the headers say; 5xx backs off. A reset further away than 30
  seconds stops with `RATE_LIMITED` instead of waiting.
- SHA-256 repositories are handled by blob ID length.

### Route C: patched theme file

- Takes the merchant's theme zip as bytes, finds the theme folder (files at
  the top, or one top folder holding `layout/theme.liquid`), checks every
  `before`, and writes a new zip with fflate 0.8.2 (pinned; Node has no
  built-in zip format). Unchanged files, binary ones included, keep their
  bytes.
- Revert returns the original zip, checked against its SHA-256.
- Refuses zips over 50 MB and archives that unpack past 300 MB.
- Works fully offline.

## What each route needs from the merchant

| | A: Admin API | B: GitHub pull request | C: Patched theme file |
|---|---|---|---|
| Who it fits (D-09) | Pilots | Agencies | Fallback |
| Merchant setup | Install our app and accept its scopes | Theme connected through Shopify's GitHub app; give us repo access | None |
| Shopify scopes | `read_themes`, `write_themes` plus exemption (per the schema); `write_files` for alt text | None for theme files | None |
| Other access | None | GitHub token or app with contents and pull request write on the repo | None |
| Preview | Unpublished copy of the live theme with a preview link | The pull request diff; the branch can be connected as an unpublished theme | Upload the zip as an unpublished theme and preview it |
| Who presses apply | Us, after the merchant approves | Whoever merges the pull request | The merchant publishes the uploaded theme |
| Revert | One call; writes the originals back | Close the pull request, or merge our revert pull request | Republish the old theme, or upload the original zip we return |
| Alt text | Same app, `fileUpdate` | Needs route A for alt text | Needs route A for alt text |

Notes on route C: uploading a zip creates a new theme, so the old theme stays
in the library and republishing it is the quickest revert. Theme editor
changes made after the merchant downloaded the zip are not in our patched
zip. The merchant should download a fresh zip right before using this route.

Notes on route B: Shopify's GitHub integration also commits changes made in
the admin back to the branch (via search, see sources). A pull request can
go stale if the merchant edits in the theme editor; our `before` check
catches that at apply time, but not between apply and merge.

## The write_themes exemption

What the sources say, newest check first. "Opened" means we read the source
itself. "Via search" means we saw only a search engine's summary of it.
shopify.dev and docs.github.com were blocked from this environment (Q-01).

| Claim | Source | How checked |
|---|---|---|
| `themeDuplicate`, `themeCreate`, `themeFilesUpsert`, `themeFilesDelete` and `themeDelete` each need "write_themes and an exemption from Shopify". The text does not mention distribution type. | Admin API 2026-10 schema, `dist/data/admin_2026-10.json` in `@shopify/dev-mcp@1.16.0` (npm, published 2026-09-25). This is the schema the Shopify Dev MCP server serves. | Opened 2026-10-08 |
| `fileUpdate` needs `write_files` or `write_themes`; no exemption mentioned. `productUpdateMedia` is deprecated: "Use `fileUpdate` instead." | Same schema | Opened 2026-10-08 |
| The exemption request form | Link inside the schema's access text: https://docs.google.com/forms/d/e/1FAIpQLSfZTB1vxFC5d1-GPdqYunWRGUoDcOheHQzfK2RoEFEHrknt5g/viewform | Link read from the schema; form not opened |
| Since API 2023-04, Asset PUT and DELETE need `write_themes`; an app "distributed in the Shopify App Store" needs an exemption to use them. Alternatives: theme app extensions, custom Liquid, custom CSS, deep links to the code editor. | https://shopify.dev/docs/apps/build/online-store/asset-legacy | Via search, not opened, 2026-10-08 |
| Public apps that change a theme or its files need an exemption on top of `write_themes`; theme app extensions are the advised path. | https://shopify.dev/docs/api/usage/access-scopes | Via search, not opened, 2026-10-08 |
| `themeDuplicate` arrived in API 2025-10. | https://shopify.dev/changelog/duplicate-themes-with-the-admin-graphql-api | Via search, not opened, 2026-10-08 |
| A developer saw theme file writes fail from a public app but work from a custom app. | https://community.shopify.com/t/access-to-the-asset-api-is-no-longer-available-to-public-apps/270154 | Via search, not opened, 2026-10-08 |
| A reply says custom apps cannot use the Billing API. | https://community.shopify.dev/t/how-to-use-write-themes-and-billing-api-together-during-development/20205 | Via search, not opened, 2026-10-08 |
| `themeFilesUpsert` and `themeFilesCopy` returned ACCESS_DENIED on a development app while staging and production apps with the approved exemption worked; the exemption may be per app ID. | https://community.shopify.dev/t/issue-themefilesupsert-returns-access-denied-despite-write-themes-scope-and-approved-exemption/35003 and https://community.shopify.dev/t/themefilescopy-access-denied-on-dev-app-despite-approved-write-themes-exemption/34703 | Via search, not opened, 2026-10-08 |
| An exemption request for single-file, per-change, merchant-approved writes was denied; the developer was pointed to app embeds and theme app extensions. | https://community.shopify.dev/t/theme-api-write-exemption-denied-is-single-file-per-change-merchant-approved-writing-ever-approvable-or-is-app-embeds-the-only-path/35406 | Via search, not opened, 2026-10-08 |

What this means:

- For the App Store app, the exemption is needed for route A. The schema
  and the docs agree on that.
- For a custom-distribution app, we do not know. The docs single out App
  Store apps, one community report says custom apps can write, and the
  schema text applies to every caller. A live call settles it in minutes.
- The exemption may be granted per app ID, so pilots on separate
  custom-distribution apps may each need it if any need it.
- The one denial we found describes almost exactly our use case. Routes B
  and C, and alt text through `fileUpdate`, do not depend on the exemption.
- If custom apps cannot use the Billing API (not verified), pilots on a
  custom-distribution app need another way to pay.

## Q-27: does the exemption request look needed?

Yes for the App Store app, if route A is to ship there. Shopify replies in
about two weeks (D-09), and a denial is possible. Suggested order for the
owner:

1. Q-03: create the dev store. An agent then installs a custom-distribution
   app with `read_themes`, `write_themes`, `read_files` and `write_files`,
   and runs preview, apply and revert on Dawn with a one-line patch.
2. If that works without an exemption, pilots run on route A while the
   request for the App Store app is pending.
3. If it fails with ACCESS_DENIED, file Q-27 at once and run pilots on
   routes B and C, with alt text through route A.

Filing Q-27 before step 1 is also reasonable, since the App Store app needs
it either way.

## What still needs a live dev store (Q-03)

1. Whether a custom-distribution app can call the theme write mutations
   without the exemption.
2. Real response bodies. Replace the hand-written fixtures with captures.
3. Whether `themeDuplicate` returns a theme still `processing`, and how long
   copying and upsert jobs take.
4. Whether TEXT bodies keep bytes exactly (CRLF, byte order mark, trailing
   newline) and whether Shopify reformats JSON templates or
   `settings_data.json` on write. The read-back check stops with
   `VERIFY_FAILED` if it does.
5. Whether `theme.files` reports a missing file as a `NOT_FOUND` userError
   or leaves it out. The adapter handles both.
6. The preview URL format and the longest theme name Shopify accepts (we cut
   names at 50 characters as a guess).
7. `fileUpdate` on product images with `write_files` only.
8. Route B with Shopify's GitHub app connected: a merged pull request syncs
   to the theme, and a revert pull request syncs back.
9. Route C: Shopify accepts the zip fflate writes, and the layout of
   Shopify's own theme export zip.

## Limits the code enforces

| Limit | Value | Source |
|---|---|---|
| Files per `themeFilesUpsert` call | 50 | 2026-10 schema, opened |
| Alt text length | 512 characters | 2026-10 schema (`ALT_VALUE_LIMIT_EXCEEDED`), opened |
| Theme zip size | 50 MB | 2026-10 schema (`ZIP_TOO_LARGE`), opened; also the theme limits page, via search |
| Liquid in `sections`, `snippets`, `layout` | 256 KB, not counting `{% schema %}` | https://shopify.dev/docs/storefronts/themes/architecture/limits, via search, not opened |
| JSON templates, section groups, `settings_schema.json` | 512 KB | Same page, via search, not opened |
| `settings_data.json`, locale files | 1.5 MB | Same page, via search, not opened |
| `fileUpdate` batch | 25 | Our own cap; the schema gives none |
| GitHub recursive tree | 100,000 entries, 7 MB | GitHub REST description in `@octokit/openapi-types@29.0.1`, opened 2026-10-08 |

Byte limits use decimal units so we refuse early rather than late.

## Other sources

- Rate limits: cost block under `extensions.cost` with `requestedQueryCost`,
  `actualQueryCost` and `throttleStatus`; leaky bucket; at most 1,000 points
  per query. https://shopify.dev/api/usage/rate-limits, via search, not
  opened, 2026-10-08. The exact shape of a THROTTLED error
  (`extensions.code: "THROTTLED"`) comes from search summaries and memory.
- GitHub integration: the connected branch syncs both ways; a branch can be
  connected as an unpublished theme.
  https://shopify.dev/docs/storefronts/themes/tools/github, via search, not
  opened, 2026-10-08.
- GitHub REST endpoints used (git refs, commits, trees, blobs; pulls): the
  REST description in `@octokit/openapi-types@29.0.1`, opened 2026-10-08.
  The rate-limit header rules (`x-ratelimit-remaining`, `x-ratelimit-reset`,
  `retry-after`) come from memory; the description only links to them.
- The shape of top-level ACCESS_DENIED errors in our fixture comes from
  memory and the schema's access text.

## How the GraphQL was checked

The Shopify Dev MCP server was not loaded in this session, and shopify.dev
was blocked. Instead, every document in `ADMIN_QUERIES` was validated with
graphql-js 16 (`buildClientSchema`, then `validate`) against the same
2026-10 schema file the Dev MCP package ships. All 10 passed; a deliberately
wrong document failed as expected. Rerun it with the Dev MCP tools once
they are available.

## How to verify

```
npx vitest run tests/unit/delivery
```

Offline, no credentials. 52 tests: 10 shared, 8 zip route, 20 Admin API,
14 GitHub. Each adapter has a test that refuses a `before` mismatch and
writes nothing.
