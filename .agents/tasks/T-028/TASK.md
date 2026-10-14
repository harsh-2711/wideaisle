# T-028: Census main document size cap

| Field | Value |
|---|---|
| Milestone | M2 |
| Lane | data |
| Branch | claude/fix-census-doc-cap |
| Issue | (link once created) |
| Decisions used | none |
| Needs | none |
| Created | 2026-10-14 |

## Goal

Cap the main document the census fulfils, so hostile HTML cannot block the event loop; a page over the cap is skipped with a clear reason

## Exit criteria

Each one is a test or a check someone can run.

- [ ] A spec where a store serves a page over the cap shows it skipped with that reason, quickly, and the next store still scans
- [ ] docs/census/README.md states the cap

## Out of scope

- Caps on CSS, JS and fonts. The asset cache already skips entries over 5 MB, and the browser loads them, not Node.
- Changes to robots.txt handling, the egress proxy rules or the redirect vetting.
- Measuring live Shopify page sizes (Q-01). The cap's margin comes from the Spike D fixtures.
