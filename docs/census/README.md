# Store census (T-020)

The census finds about 2,000 live Shopify stores, reads each store's public theme name and version, and scans four key pages with Playwright and axe-core. It feeds the gap report (T-021) and the choice of v1 themes (D-08).

## Rules it follows

- Public storefront pages only. No logins, no admin, no checkout.
- robots.txt first, matched by our product token `WideAisleCensus`. Disallowed pages are skipped and logged. A 5xx, a 429 or an unreachable robots.txt means stay out; a later run retries. Every redirect hop is checked against robots.txt too.
- At least 2 seconds between page loads on one store, more if robots.txt sets Crawl-delay. Redirect hops are spaced like page loads. A store that asks for more than 30 seconds is skipped. The browser loads a page's scripts and styles together, as any visitor would, but not its images or media.
- A user agent that names the project and a contact address (Q-02). The crawler refuses to run without one.
- Results stay private in `data/` (gitignored). Only summaries are committed.
- Public addresses only, on ports 80 and 443. A host is resolved once, every address is checked, and the connection goes to a checked address, so a second DNS answer cannot point at a private one. IPv6 must be global unicast (2000::/3), without the documentation, Teredo and 6to4 ranges.
- The scan browser sends every request through a local egress proxy (`app/lib/scanner/egress.ts`) that applies the same checks. Service workers, WebSockets and WebRTC are off; WebRTC is removed from every page because its UDP traffic would not go through the proxy. Main-frame navigations stay on the store's site. Hosts the proxy refused are listed in each scan record as `blockedHosts`.

## What it waits on

| Item | Why |
|---|---|
| Q-01 | The cloud environment blocks storefronts. Run it on your own machine, or widen the network policy. |
| Q-02 | The contact address for the user agent. |

## Run it

```bash
# 1. A list of candidate domains: the Tranco top list (https://tranco-list.eu), as rank,domain lines.
#    Shopify stores are a few percent of top sites, so start with the top 100,000.
# 2. Find the Shopify stores and their themes (HTTP only, fast).
CENSUS_CONTACT=you@example.com npm run census -- discover --input tranco.csv --out data/census/stores.jsonl --limit 100000 --concurrency 16
# 3. Scan up to 2,000 of them (Playwright; about 4 pages a store).
CENSUS_CONTACT=you@example.com npm run census -- scan --input data/census/stores.jsonl --out data/census/scans.jsonl --limit 2000 --concurrency 4
```

Both steps resume: stores already in the output file are skipped, so a stopped run can be restarted. Records for errors that may pass (robots.txt unreachable, a 5xx, a crash) carry `retry: true` and are tried again, up to 3 times. `--delay` cannot go below 2000 ms.

Time, from the 2-second gap and 4 to 6 requests a store: about 10 to 15 seconds a store per worker. With 4 workers, 2,000 stores take about 2 hours. This is an estimate; Spike D (T-033) measures it.

## Output

`stores.jsonl`, one line per domain: whether it is Shopify, theme name, schema name, version, Theme Store id, and the apps whose scripts load.

`scans.jsonl`, one line per store: per page, axe violations by rule with node counts, counts for the six v1 types, a guess at each node's source (theme, app or unknown), and three sample nodes per rule.
