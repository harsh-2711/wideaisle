# T-027: Census prefetch

| Field | Value |
|---|---|
| Milestone | M2 |
| Lane | data |
| Branch | claude/fix-census-prefetch |
| Issue | (link once created) |
| Decisions used | none |
| Needs | none |
| Created | 2026-10-12 |

## Goal

Store pages cannot make the census browser fetch store URLs outside robots.txt and the 2 s gap: link prefetch, link prerender and speculation rules

## Exit criteria

Each one is a test or a check someone can run.

- [ ] A spec with robots.txt disallowing /secret and one page per vector shows the server never sees a /secret request, with the full binary and the headless shell
- [ ] The census specs launch through launchCensusBrowser
- [ ] docs/census/README.md line 8 says what is blocked, with a dated line

## Out of scope

- Robots.txt checks for a page's own subresources (CSS, JS, fonts, fetch and XHR). They load as part of the page, as before.
- Changes to the egress proxy, netguard or PoliteClient rules.
- Runs against live stores (Q-01).
