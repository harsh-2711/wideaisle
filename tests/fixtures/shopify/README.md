# Recorded Admin API responses

Hand-written, not captured from a store. Each file is one GraphQL response
body, shaped to the Admin API 2026-10 schema (the `admin_2026-10.json`
schema in `@shopify/dev-mcp@1.16.0`, read 2026-10-08). The shapes of the
top-level `errors` entries (THROTTLED, ACCESS_DENIED) and of
`extensions.cost` follow Shopify's rate-limit docs as summarized by search;
we could not open shopify.dev from here. Replace these with real captures
once a dev store exists (Q-03).

File contents match `tests/unit/delivery/theme-data.ts`. Checksums are the
MD5 of those strings; the adapter checks every body against its checksum.

Failure paths that a fixed list of responses cannot show (a job that lands
later, a file someone edits right after our write) run against the fake
store in `tests/unit/delivery/fake-shopify.ts` instead.

| File | Operation | What it shows |
|---|---|---|
| themes-main.json | WaMainTheme | The live theme |
| themes-by-name-none.json, themes-by-name-found.json | WaThemesByName | No preview theme yet; the copy found after a 5xx on themeDuplicate |
| theme-files-live.json | WaThemeFiles | Live files: a text body, a base64 body, one file NOT_FOUND |
| theme-files-merchant-edited.json | WaThemeFiles | The merchant changed the header after the scan |
| theme-files-applied.json | WaThemeFiles | Files after the patch |
| theme-files-url-body.json | WaThemeFiles | A body served as a short-lived URL |
| theme-duplicate.json | WaThemeDuplicate | A new unpublished copy, still processing |
| theme-duplicate-not-found.json | WaThemeDuplicate | userErrors with code NOT_FOUND |
| theme-info-processing.json, theme-info-ready.json | WaThemeInfo | The copy before and after processing |
| theme-info-main.json | WaThemeInfo | The live theme, which discardPreview must refuse |
| files-upsert-job.json, files-upsert-done.json | WaThemeFilesUpsert | A job still running, and one already done |
| files-upsert-throttled.json | WaThemeFilesUpsert | userErrors with code THROTTLED |
| files-upsert-invalid.json | WaThemeFilesUpsert | userErrors with code FILE_VALIDATION_ERROR |
| job-running.json, job-done.json | WaJob | Job polling |
| files-delete.json | WaThemeFilesDelete | A created file removed on revert |
| theme-delete.json | WaThemeDelete | A preview theme removed |
| throttled.json | any | Top-level THROTTLED error with the cost block |
| access-denied.json | WaThemeFilesUpsert | Top-level ACCESS_DENIED: no write_themes exemption |
| media-alt-before.json, media-alt-after.json | WaMediaAlt | Alt text before and after |
| file-update.json, file-update-revert.json | WaFileUpdate | Alt text written and restored |
