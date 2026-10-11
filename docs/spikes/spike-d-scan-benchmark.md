# Spike D: scan benchmark

| Field | Value |
|---|---|
| Task | T-033, branch `claude/feat-scan-benchmark` |
| Decisions | D-10 (PoC hosting), D-04 (buy nothing), D-06 (claims) |
| Status | Local half measured. Browser Run waits on Q-05. Live pages wait on Q-01. |
| Date | 2026-10-11 |

## Summary

- One 4 vCPU machine scanned 1,000 pages at each concurrency with no failures: 1,373 pages an hour at concurrency 1, 2,187 at 2 and 2,919 at 4. A 200-page run gave 1,366, 2,254 and 2,782.
- The scan runs through the census code: `openScanContext` with its egress proxy, then `scanPage`. The pages are seeded Shopify-like fixtures served locally, not live stores, so there is no network time in these numbers.
- axe-core takes most of each page: about 2.0 s of 2.3 s (p50) at concurrency 1. Loading takes 0.2 s locally.
- CPU is the limit: about 3.8 CPU-seconds a page at every concurrency. Memory (PSS of Node plus Chromium) peaks at about 1.1 GB at concurrency 1, 1.3 GB at 2 and 1.8 GB at 4.
- Cost per 1,000 pages on a small server busy all month: $0.0023 to $0.027, for $5 to $15 a month (D-10 estimates, not quotes). At PoC volume the server is mostly idle, so the monthly price, not the scan rate, sets the cost.
- Cost per 1,000 pages on Browser Run: $0.066 past the 10 included hours, from plan figures and local timing. Plan figure, not measured (Q-05).
- The roadmap guessed 5 to 10 s a page and 360 to 720 pages a browser-hour. Locally it is 2.6 s and 1,373. Live pages will be slower; Q-01 blocks that check.

## What was measured

`npm run bench:scan` (`scripts/bench/scan-bench.ts`):

1. Generates seeded stores (`scripts/bench/fixtures.ts`) and serves them from a local HTTP server. Each store has its own host name (`s<n>.bench.test`), resolved to 127.0.0.1 through the scanner's own lookup option.
2. For each concurrency level, launches one Chromium as the census does, scans one store untimed as a warm-up, then starts the clock.
3. Runs N workers. Each takes the next store, opens a census scan context (its own egress proxy and browser context), and scans home, collection, product and cart: `pageTurn`, the vetted `goto`, links from the home page, then `scanPage`. Then it closes the context.
4. Records per page: total, load (turn, navigation, link sampling) and axe time, DOM nodes and violation nodes. Per level: wall time, pages an hour, p50 and p95, CPU-seconds a page, peak memory, and requests that reached the store.
5. Writes JSON and a Markdown summary to `data/bench/` (gitignored).

What differs from a census run:

- No politeness delay (`minDelayMs: 0`). The benchmark measures the machine, not the 2-second gap. The census section below adds the gap back.
- Local pages: no DNS, TLS or network latency, and no third-party hosts.
- The fixture server runs in the benchmark's Node process. It streams files from disk.

### The fixtures

50 stores from seed 1 (fixture version 3), reused in turn when a level needs more. Each scan gets a fresh context, so reuse warms no browser cache.

| | Home | Collection | Product | Cart |
|---|---|---|---|---|
| HTML, CSS and JS a page, KB (p50) | 829 | 900 | 872 | 790 |
| HTML alone, KB (p50) | 170 | 214 | 115 | 75 |
| DOM nodes after scripts run (p50) | 1,769 | 2,387 | 1,017 | 832 |
| axe violation nodes (p50) | 49 | 52 | 25 | 20 |

- All pages: 420 to 1,257 KB of HTML, CSS and JS (median 851 KB); 643 to 4,111 DOM nodes (median 1,291).
- Markup follows Dawn: announcement bar, mega menu, product cards with srcsets, facets, a product gallery with variant pickers and product JSON, a cart table, a footer with payment icons.
- Each page loads a theme stylesheet, section stylesheets, theme, vendor and storefront scripts, and up to four app scripts (reviews, chat, popup, upsell). The scripts run generated code on the DOM: custom elements, layout reads, string and number work. App scripts inject widgets, as real apps do.
- Each store has a seeded mix of the six v1 failure types. Over the 1,000-page run axe found 22,585 low-contrast, 6,265 missing-alt, 5,765 empty-button, 5,610 empty-link, 970 missing-label and 20 missing-lang nodes.
- robots.txt allows `/cart`, so every store gives four pages.

### The machine

| Item | Value |
|---|---|
| CPU | 4 x Intel Xeon @ 2.80 GHz (cloud VM, no cgroup CPU limit) |
| RAM | 16 GB |
| OS | Linux 6.18 |
| Software | Node 22.22.0, Chromium 141.0.7390.37, Playwright 1.64.0, axe-core 4.13.0 |

The VM moved between sessions: on 2026-10-08 the same container reported a 2.10 GHz CPU and an older kernel. All numbers here come from the 2.80 GHz host on 2026-10-11.

## Results

### Full run: 1,000 pages at each level

| Concurrency | Wall time | Pages an hour | p50 a page | p95 a page | Load p50 | axe p50 | CPU-s a page | CPU used | Machine busy | Peak RSS | Peak PSS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2,621 s | 1,373 | 2.26 s | 4.58 s | 0.22 s | 2.03 s | 3.87 | 37% | 39% | 1,676 MB | 1,095 MB |
| 2 | 1,646 s | 2,187 | 2.91 s | 5.43 s | 0.31 s | 2.56 s | 3.95 | 60% | 62% | 2,106 MB | 1,312 MB |
| 4 | 1,233 s | 2,919 | 4.46 s | 7.38 s | 0.55 s | 3.85 s | 3.74 | 76% | 78% | 3,096 MB | 1,845 MB |

### Default run: 200 pages at each level

| Concurrency | Wall time | Pages an hour | p50 a page | p95 a page | Load p50 | axe p50 | CPU-s a page | CPU used | Machine busy | Peak RSS | Peak PSS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 527 s | 1,366 | 2.28 s | 4.54 s | 0.22 s | 2.07 s | 3.85 | 37% | 40% | 1,627 MB | 1,049 MB |
| 2 | 319 s | 2,254 | 2.83 s | 5.28 s | 0.30 s | 2.54 s | 3.81 | 60% | 62% | 2,086 MB | 1,273 MB |
| 4 | 259 s | 2,782 | 4.41 s | 7.77 s | 0.56 s | 3.87 s | 3.85 | 74% | 76% | 3,060 MB | 1,804 MB |

The two runs agree within about 5% on pages an hour.

How to read the columns:

- Pages an hour: scanned pages over wall time, including opening and closing a context per store.
- p50 and p95: time a page, from `pageTurn` to the end of `scanPage`.
- CPU-s a page and CPU used: the Node process and the Chromium processes under it, from `/proc/<pid>/stat`, including processes that exited. Machine busy counts every process. Other agents share this VM; the 1 to 3 point gap says they were mostly idle during these runs.
- Peak RSS adds up Node and Chromium, so shared memory counts more than once. Peak PSS splits shared pages and is the better guide to RAM. Memory was read once a second, so a shorter peak can be missed.

### Where the time goes

Per page type at concurrency 1, full run:

| Page | Load p50 | axe p50 | Total p50 | Total p95 |
|---|---|---|---|---|
| Home | 0.29 s | 2.88 s | 3.16 s | 4.66 s |
| Collection | 0.24 s | 3.21 s | 3.47 s | 4.90 s |
| Product | 0.20 s | 1.67 s | 1.87 s | 2.32 s |
| Cart | 0.18 s | 1.45 s | 1.65 s | 1.99 s |

- axe-core time grows with DOM size and violation count. The collection page, with the most nodes, takes longest.
- Node itself uses about 0.85 to 0.9 CPU-seconds a page, close to a quarter of the total. That covers the census path's request routing (every request passes a Playwright route handler and the egress proxy), moving axe results out of the browser, and the fixture server. This run does not split them.
- Every page sent 10.9 requests to the store: robots.txt once a store, then the HTML and every CSS and JS file again on each page. The census path routes every request through Playwright, and Playwright's docs say routing turns off the HTTP cache, so a store's assets are never reused between its four pages. On live stores this costs bandwidth and time on every page. A scanner-lane task could look at it.

### Scaling

- From 1 to 2 workers, throughput rises 59%. From 2 to 4 it rises 33%.
- CPU-seconds a page stay near 3.8, so extra workers wait for CPU. At concurrency 4 the benchmark used 76% of the four cores.
- A rough rule from these numbers: about 750 pages an hour per vCPU at 80% efficiency (3,600 x 0.8 / 3.8).
- Memory per extra worker is about 220 to 270 MB PSS, on top of about 850 MB for Node and one browser.

## Cost per 1,000 pages

The cost model is `scripts/bench/cost.ts`. Prices are inputs. No price here is a quote.

### Small server

Server prices are the D-10 planning range (about $5 to $15 a month, estimate), not quotes. Each figure assumes the server scans all month at that rate.

| Rate (full run) | Pages an hour | $5 a month | $10 a month | $15 a month |
|---|---|---|---|---|
| This machine, concurrency 1 | 1,373 | $0.0050 | $0.010 | $0.015 |
| This machine, concurrency 2 | 2,187 | $0.0031 | $0.0063 | $0.0094 |
| This machine, concurrency 4 | 2,919 | $0.0023 | $0.0047 | $0.0070 |
| 1 vCPU, estimated from CPU-s a page | 770 | $0.0089 | $0.018 | $0.027 |
| 2 vCPU, estimated from CPU-s a page | 1,540 | $0.0044 | $0.0089 | $0.013 |

- The vCPU rows use 3.74 CPU-seconds a page (concurrency 4) and 80% efficiency, and assume a vCPU as fast as this one. Shared vCPUs on small plans can be slower, so treat those rows as upper bounds on rate.
- A small server is rarely busy all month. At the PoC load (20 stores, 4 pages, daily: about 2,400 pages a month) a $5 server costs about $2.08 per 1,000 pages, because the monthly price is fixed. The scans need about 5 CPU-minutes a day.
- RAM for the scanner: about 1.1 GB for one worker and 1.3 GB for two, besides Postgres and the app on the same server (D-10).

### Browser Run (plan figures, not measured)

Plan figures from the roadmap and D-10: $5 a month on Workers Paid with 10 browser-hours, then $0.09 a browser-hour. The roadmap cites [Cloudflare's pricing page](https://developers.cloudflare.com/browser-run/pricing/), read for the plan on 2026-10-07. This task did not reopen it.

Browser time a page is taken as 2.62 s: the wall time a page at concurrency 1 here, context open and close included. A remote browser on a live page adds network time, so this is a floor.

| Item | Value |
|---|---|
| Browser-hours per 1,000 pages | 0.73 |
| Pages the 10 included hours cover each month | 13,734 |
| Each 1,000 pages past that | $0.066 |

| Pages a month | Browser-hours | Total a month | Per 1,000 pages |
|---|---|---|---|
| 10,000 | 7.3 | $5.00 | $0.50 |
| 100,000 | 72.8 | $10.65 | $0.11 |
| 1,000,000 | 728.1 | $69.63 | $0.070 |

- Past the included hours, Browser Run costs about 9 to 28 times more per 1,000 pages than a $5 to $15 server busy all month at concurrency 4 ($0.0023 to $0.0070), at these plan figures.
- Below about 13,700 pages a month, both cost a flat monthly fee.
- The pricing page may list other charges, such as for concurrent browsers. Check it when Q-05 is decided.

## Census comparison

`docs/census/README.md` estimates about 10 to 15 seconds a store per worker, and about 2 hours for 2,000 stores with 4 workers.

- **One worker.** A store is robots.txt, then four pages. The census books a page slot every 2 seconds on a store, but a page takes 2.6 s here, longer than the gap, so only the first page waits. That gives about 2 + 4 x 2.6 = 12.5 s a store, inside the estimate, before network time.
- **Four workers on a 4 vCPU server.** Pages slow to about 4.9 s of wall time each per worker, because the workers share the CPU. That gives about 22 s a store and about 3 hours for 2,000 stores (8,000 pages at 2,919 an hour, plus the first-page waits). The 2-hour estimate holds only with more CPU.
- **Four workers on Browser Run.** Each worker has its own remote browser, so pages stay near 2.6 s plus network. That gives about 12.5 s a store and about 1.7 hours for 2,000 stores. Browser time includes the politeness waits, since a session stays open: about 2,000 x 12.5 s, or 7 browser-hours. That fits the 10 included hours if the network adds less than about 1.4 s a page.

## Planning figures to replace (ADR 0005)

ADR 0005 (`docs/adr/0005-poc-hosting.md`) marks these rows "Estimate, Spike D replaces it". T-034 updates the ADR after this merges; this PR does not edit it.

| ADR row | Planning value | Measured here (local fixtures, no network) |
|---|---|---|
| Server | About $5 to $15 a month | Not a price measurement. Size: one worker needs about 1.1 GB (PSS) and 3.8 CPU-seconds a page; two workers about 1.3 GB. About 750 pages an hour per vCPU (estimate from CPU time). |
| Server and object storage, M4 to M6 | About $10 to $25 a month | Not measured. Object storage was out of scope. |
| Time per page scan | 5 to 10 seconds | 2.62 s a page at concurrency 1 (p50 2.26 s, p95 4.58 s); axe-core about 2.0 s of it. Live pages add load time. |
| Pages per browser-hour | 360 to 720 | 1,373 at concurrency 1. One 4 vCPU machine: 2,187 at concurrency 2, 2,919 at 4. |
| PoC scan load: 20 stores, 4 pages, daily | 80 pages, about 7 to 13 browser-minutes a day | 80 pages, about 3.5 browser-minutes and 5 CPU-minutes a day. |
| Census: 2,000 stores, 4 workers | About 2 hours, about 8 browser-hours | About 3 hours on one 4 vCPU server (CPU-bound). On Browser Run about 1.7 hours and 7 browser-hours, politeness waits included. Both before network time. |
| Browser Run | $5 a month with 10 browser-hours, then $0.09 an hour | Not measured (Q-05). Plan figure kept. |
| Census on Browser Run | About $5 for a census month | About $5 (7 of the 10 included hours), if the network adds under about 1.4 s a page. Plan figures and local timing. |

## Browser Run comparison (waits on Q-05)

Not measured. Browser Run needs Cloudflare Workers Paid, a paid sign-up, and agents buy nothing without your approval (D-04). Q-05 holds that decision. Every Browser Run figure in this doc is a plan figure from the roadmap, not a measurement.

What Q-05 unlocks:

- A measured browser-hours figure per 1,000 pages, in place of the floor used above.
- Whether Browser Run's limits fit a census burst: how many browsers can run at once, and how long a session may stay open.
- The real bill for a burst, from Cloudflare's usage page, to check against the plan figures.

How to run the same benchmark on Browser Run later, without changing the scan code:

1. Host the fixtures where Browser Run can reach them. Its browsers run on Cloudflare's network and cannot see this machine's local server. `writeFixtures` writes plain files under `data/bench/fixtures/v3-seed-1/`, so any static host works. Keep one host name per store, or serve each store under a path and change `storeHost`.
2. Connect the scanner to a Browser Run browser instead of `chromium.launch`. Cloudflare documents a Playwright build for Workers; whether a browser can also be driven from outside a Worker needs checking in its docs when Q-05 opens. `runLevel` in `scripts/bench/scan-bench.ts` is the one place that launches the browser.
3. Keep `scanPage` and the per-store context. The egress proxy cannot run inside Browser Run, so that run measures the scan without our proxy; record this next to its numbers.
4. Run 1,000 pages at concurrency 1, 2 and 4. Record the wall time `scan-bench` reports and the browser time Cloudflare bills.
5. Feed the measured seconds a page to `browserRunMonth` and `browserRunMarginalPer1000` in `scripts/bench/cost.ts`.

A live-page comparison, on either platform, also waits on Q-01: the cloud environment blocks storefronts, and this spike fetched none.

## Caveats

- **Fixtures are not live stores.** The markup follows Dawn, but real themes, apps and content vary. Real stores often load more third-party script than these pages. Expect live axe times to vary more than here.
- **No network.** Load takes 0.2 to 0.6 s here. On live stores, DNS, TLS, the store's server and its CDN add seconds a page. With several workers the network wait overlaps with other workers' CPU, so it lengthens each page more than it lowers pages an hour per CPU.
- **This CPU is not the target server.** It is a 4 vCPU cloud VM at 2.80 GHz. Small plans often share vCPUs and may be slower. The VM itself moved hosts between sessions.
- **Shared machine.** Other agents ran on this VM. CPU-seconds count only the benchmark's processes, and machine busy was within 3 points of them in both runs, so interference was small. Wall times could still be a little pessimistic.
- **Memory sampling.** Once a second, from `/proc`. A peak shorter than a second can be missed. Node's figure includes the fixture server.
- **Two runs.** One 200-page and one 1,000-page run, which agree within about 5%. No more repeats.
- **Images and media are blocked**, as in the census. A scanner that loads them would use more time and bandwidth.

## How to run

```bash
# Chromium: set PW_CHROMIUM_PATH to a preinstalled build, or install Playwright's.
npm run bench:scan                         # 200 pages at concurrency 1, 2 and 4, about 20 minutes here
npm run bench:scan -- --full               # 1,000 pages at each, about 90 minutes here
npm run bench:scan -- --pages 40 --concurrency 1,2 --server-price 6,12
```

Output: `data/bench/scan-bench-<time>.json` and `.md`. The fixtures are cached in `data/bench/fixtures/v3-seed-1/`.

Tests: `npx vitest run tests/unit/bench` (cost maths, summary, `/proc` parsing, fixtures) and `npx playwright test tests/a11y/bench.spec.ts` (3 pages at concurrency 1, in the CI job that has a browser).

## Sources

In this repo unless marked. No web page was opened for this spike.

| Source | What it gave |
|---|---|
| `docs/plan/roadmap.md`, "Why it stays cheap" | Browser Run plan figures ($5 with 10 hours, then $0.09 an hour), citing Cloudflare's pricing page read on 2026-10-07; the 5 to 10 s a page estimate |
| `decisions/D-10.md` | Server price range, about $5 to $15 a month (estimate) |
| `docs/census/README.md` | Census time estimate, 10 to 15 s a store per worker |
| `docs/adr/0005-poc-hosting.md` (on main) | Planning figures this spike replaces |
| `.agents/owner-queue.md` | Q-01 (outbound web access) and Q-05 (Workers Paid) |
| Playwright docs for `page.route` (from memory, not opened) | Routing turns off the HTTP cache; the 10.9 requests a page measured here agree |
