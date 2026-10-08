# T-020: Store census crawler

| Field | Value |
|---|---|
| Milestone | M2 |
| Lane | data |
| Branch | claude/feat-census-crawler |
| Issue | (link once created) |
| Decisions used | D-08, D-10, D-16 |
| Needs | none |
| Created | 2026-10-08 |

## Goal

Find about 2,000 live Shopify stores from public top-site lists, read theme name and version, scan home, collection, product and cart pages with Playwright and axe-core. Crawl politely.

## Exit criteria

Each one is a test or a check someone can run.

- [ ] Crawler respects robots.txt, rate limits and a contact user agent (tests)
- [ ] Theme detection tested on fixtures
- [ ] Full run done (needs Q-01, Q-02)

## Out of scope

- (fill in)
