# T-025: Census asset cache

| Field | Value |
|---|---|
| Milestone | M2 |
| Lane | data |
| Branch | claude/fix-census-asset-cache |
| Issue | (link once created) |
| Decisions used | none |
| Needs | none |
| Created | 2026-10-12 |

## Goal

Cache CSS and JS per store during the census, as a visitor's browser would

## Exit criteria

Each one is a test or a check someone can run.

- [x] A store's second page reuses its cached CSS and JS: a test shows the server gets one request per asset per store (`tests/a11y/census-cache.spec.ts`)
- [x] docs/census/README.md request counts match a measured run (18.8 a store, `npm run bench:scan` on 2026-10-12)

## Out of scope

- Caching HTML pages, images or media. Pages are fetched fresh each time; images and media stay blocked.
- Revalidation (conditional requests with If-None-Match or If-Modified-Since). A response that needs one is not cached.
- Sharing cached files across stores or across runs. No disk cache.
- Changes to PoliteClient, robots.txt handling, the egress proxy or the navigation and redirect vetting.
- Runs against live stores (Q-01).
