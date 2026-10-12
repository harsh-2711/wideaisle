# T-026: Census test egress

| Field | Value |
|---|---|
| Milestone | M2 |
| Lane | data |
| Branch | claude/fix-census-test-egress |
| Issue | (link once created) |
| Decisions used | none |
| Needs | none |
| Created | 2026-10-12 |

## Goal

Census tests and scans reach no host but the store and its assets: no real DNS in tests, no Chromium background traffic

## Exit criteria

Each one is a test or a check someone can run.

- [ ] tests/a11y/census.spec.ts makes no real DNS lookup: its clients resolve nothing, and cdn.shopify.com is in blockedHosts
- [ ] A scan with the census launch flags reaches no host except the store and its asset hosts, with the full chrome binary and the headless shell
- [ ] The PR shows whether a second --disable-features replaces Playwright's list on Chromium 141

## Out of scope

- Changes to the egress proxy, netguard or PoliteClient rules.
- Other Playwright specs that use the config's `browser` fixture (fixtures, fixers, themes); they load local files only.
- The benchmark's fixtures and timing method. Only its browser launch moves to the shared census launcher.
- Runs against live stores (Q-01).
