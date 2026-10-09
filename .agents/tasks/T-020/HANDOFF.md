# Handoff: T-020 Store census crawler

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Find about 2,000 live Shopify stores from public top-site lists, read theme name and version, scan home, collection, product and cart pages with Playwright and axe-core. Crawl politely.

## Status

Blocked on you. Merged in PR #34. Fix PR #43 (script navigation race, linear tag reading) is in review. The run waits on Q-01 and Q-02.

## Done so far

| Step | Commit |
|---|---|
| robots.txt parser, PoliteClient, theme detection, axe scan, resumable JSONL | be3d59b |
| Public addresses only, checked on every redirect hop | 31b59a5 |
| Connections pinned to vetted addresses; egress proxy for the browser | 46f2e52 |
| Review fixes: WebRTC off, robots and spacing on every hop, Crawl-delay on scans, retries | fdcc80d |

## Current step

Merge PR #43, then wait for Q-01 and Q-02.

## Next three steps

1. When Q-01 and Q-02 clear: build the domain list (docs/census/README.md, "Run it"), run `discover`, then `scan`.
2. Hand the scans file to T-021 for the gap report.

## Blockers and open questions

- Q-01: the cloud environment blocks storefronts. Run on the owner's machine or widen the network policy.
- Q-02: a contact address for the user agent. The crawler refuses to run without CENSUS_CONTACT.

## Decisions used

D-08, D-10, D-16

## Files touched

- app/lib/scanner/: robots.ts, polite.ts, netguard.ts, egress.ts, detect.ts, axe.ts
- scripts/census/census.ts, docs/census/README.md
- tests/unit/scanner/, tests/a11y/census.spec.ts

## How to verify

```bash
npx vitest run tests/unit/scanner
PW_CHROMIUM_PATH=/path/to/chrome npx playwright test tests/a11y/census.spec.ts
```

## Lessons and gotchas

- Node skips the `lookup` option for IP literals. Vet literals with resolvePublic before connecting.
- Playwright sends loopback through a context proxy by default (`<-loopback>`), so the egress proxy also covers localhost.
- The a11y test uses `allowPrivate: true` to reach its local server. Never set it for a real run.
- WebRTC UDP does not go through a browser proxy, and the Chromium policy flag did not stop STUN to a private address. The scan removes RTCPeerConnection with an init script; the strict browser test proves it.
- Playwright does not call route handlers for redirect hops. The scan fetches each main-frame navigation with route.fetch({ maxRedirects: 0 }) and follows redirects itself through ScanContext.goto, so every hop is checked against robots.txt and spaced before the browser requests it. Unexpected main-frame navigations get an empty 204; an abort would leave an error page that breaks the next goto.
- Crawl-delay belongs to a group: a User-agent line after it starts a new group. Only Sitemap lines sit outside groups.
- robots.txt patterns are matched without regular expressions to avoid ReDoS from hostile patterns.
