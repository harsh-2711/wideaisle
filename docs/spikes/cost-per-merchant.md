# Cost per merchant: infrastructure plus AI per store a month

| Field | Value |
|---|---|
| Task | T-035, branch `claude/docs-cost-per-merchant` |
| Decisions | D-10 (hosting), D-12 (prices; the 10% bar). Also D-04, D-08, D-11 |
| Status | Estimate. Scan time and CPU are measured, on local fixtures (Spike D). Every price is an estimate or a plan figure |
| Date | 2026-10-12 |

## Summary

- **At stage capacity, on Haiku 5.5, every paid plan is under 10% of its price.** That is 20 stores at PoC and 200 at Launch. The cost is $0.61 to $1.71 a store at PoC and $0.33 to $0.74 at Launch.
- **On Haiku 4.5, two plans go over at the high end.** Agency, against a $1.99 bar a store, reaches $3.60 at PoC (18% of price) and $2.63 at Launch (13%). Starter, against $2.90, reaches $3.60 at PoC (12%). Pro stays under. Q-33 picks the model.
- **Scanning costs almost nothing.** A Pro store is about 138 pages and 9 CPU-minutes a month. That is under $0.01 of a $5 to $15 server. Twenty stores at Pro cadence use about 0.5% of one vCPU's month, so fixed monthly prices, shared across stores, set the cost.
- **Below capacity the share grows.** At 10 pilot stores, Starter on Haiku 5.5 reaches $3.21 (11%) at the high end.

## Inputs

| Input | Value used | Source | Status |
|---|---|---|---|
| Pages a scan | 4: home, collection, product, cart | D-08, ADR 0001 | Plan |
| Scans a store a month | Free 1. Starter about 8: weekly, plus 4 for theme publishes and before-and-after scans around fixes. Pro and Agency about 34: daily, plus 4 | Roadmap pricing table: Starter weekly, Pro daily. Free and Agency cadence and the 4 extra scans are assumptions; the roadmap sets none | Assumption |
| Pages a store a month | Free 4, Starter 33, Pro 138, Agency 138 | The two rows above | Derived |
| CPU-seconds a page | 3.86, the highest of 3.78 to 3.86 | Spike D full run ([summary](spike-d-results/scan-bench-2026-10-11T17-39-22-575Z.md)) | Measured, local fixtures |
| Pages an hour per vCPU | About 746, at 80% efficiency | Spike D, from CPU time | Estimate |
| Scanner memory | About 1.1 GB (PSS) for one worker | Spike D full run | Measured |
| Server | $5 to $15 a month | D-10 | Estimate, not a quote |
| Object storage, backups included | $5 to $10 a month at PoC | Roadmap budget gives $10 to $25 for server and storage; D-10 gives $5 to $15 for the server. The rest is storage | Estimate, not measured |
| Postgres and backups | PoC: on the server, $0 extra (D-10). A nightly `pg_dump` kept 14 days goes to object storage (ADR 0005), inside the row above. Launch: managed Postgres, inside the Launch range | D-10, ADR 0005, roadmap | Estimate. Not priced separately anywhere |
| Launch infrastructure | $40 to $100 a month: managed Postgres, a separate scan worker, object storage, error monitoring | Roadmap stage table and budget (M7 onward) | Estimate |
| Browser Run, census bursts | $5 a month with 10 browser-hours, then $0.09 an hour. A census fits the 10 hours | Roadmap, D-10; Spike D for the hours | Plan figure, not measured (Q-05) |
| Images a store a month | Starter 1,000. Pro 1,000. Agency 1,000 a store. Free 0 | Roadmap pricing table: Starter's allowance. Pro and Agency figures are assumptions; the roadmap sets none | Allowance used in full |
| Alt text per 1,000 images, batch | Haiku 5.5 $0.105. Haiku 4.5 $1.05 | Spike C: about 1,100 input and 200 output tokens an image, at batch prices in `app/lib/alt-text/config.ts` (read 2026-10-08) | Estimate. Q-04 measures it; Q-33 picks the model |
| 10% bar | Starter $2.90, Pro $7.90, Agency $1.99 a store ($199 over 10 stores) | D-12, roadmap budget guardrails | Owner rule |

## Method

- **Cost a store = fixed monthly infrastructure / stores + alt text.**
- **Fixed pool.** PoC low: $10 ($5 server, $5 storage). PoC high: $30 ($15 server, $10 storage, $5 Workers Paid if Q-05 is approved). Launch: $45 to $105 ($40 to $100, plus $5 Workers Paid). Split evenly: $0.50 to $1.50 a store at 20 stores, $0.23 to $0.53 at 200.
- **Scans** sit inside the server price. A Pro store's 138 pages use about 0.03% of a 1 vCPU server's month: $0.001 to $0.004.
- **Low** uses the low pool and Spike C's token guess. **High** uses the high pool and twice the guess, to cover billed retries (up to 2 attempts by default) and token counts above the guess.
- Agency revenue a store assumes all 10 stores are in use. Fewer stores raise it.

## Result

Cost a store a month, low to high, and its share of plan price. The bar is 10%.

| Plan | Price a store | PoC, Haiku 5.5 | PoC, Haiku 4.5 | Launch, Haiku 5.5 | Launch, Haiku 4.5 |
|---|---|---|---|---|---|
| Free | $0 | $0.50 to $1.50 | $0.50 to $1.50 | $0.23 to $0.53 | $0.23 to $0.53 |
| Starter | $29 | $0.61 to $1.71 (2.1% to 5.9%) | $1.55 to $3.60 (5.3% to **12.4%**) | $0.33 to $0.74 (1.1% to 2.5%) | $1.28 to $2.63 (4.4% to 9.1%) |
| Pro | $79 | $0.61 to $1.71 (0.8% to 2.2%) | $1.55 to $3.60 (2.0% to 4.6%) | $0.33 to $0.74 (0.4% to 0.9%) | $1.28 to $2.63 (1.6% to 3.3%) |
| Agency, a store | $19.90 | $0.61 to $1.71 (3.0% to 8.6%) | $1.55 to $3.60 (7.8% to **18.1%**) | $0.33 to $0.74 (1.7% to 3.7%) | $1.28 to $2.63 (6.4% to **13.2%**) |

- **Under 10% across the range:** every paid plan on Haiku 5.5; Pro on Haiku 4.5; Starter on Haiku 4.5 at Launch.
- **Over at the high end:** Starter on Haiku 4.5 at PoC; Agency on Haiku 4.5 at both stages. On Haiku 4.5 at twice the token guess, an Agency store's alt text alone is $2.10, over its $1.99 bar before any infrastructure.
- **Free has no revenue.** Paid plans carry its $0.23 to $1.50 a store.
- Starter and Pro cost the same, because they have the same image allowance and scans cost almost nothing.

## What moves the result most

1. **Stores sharing the fixed cost.** At 10 pilot stores (the M4 bar) the share doubles to $1.00 to $3.00. Starter then costs $1.11 to $3.21 on Haiku 5.5 (up to 11.1%) and $2.05 to $5.10 on Haiku 4.5 (up to 17.6%). At the M7 target, 15 paying stores, the Launch setup's $45 to $105 is $3.00 to $7.00 a paying store if only they carry it. That is over Starter's $2.90 bar before alt text.
2. **The model (Q-33).** Haiku 4.5 costs ten times Haiku 5.5: $1.05 to $2.10 a store at the full allowance, against $0.11 to $0.21.
3. **Images and tokens.** The estimate assumes every store uses all 1,000 images every month. After a first catalogue pass, most stores likely send far fewer. Tokens an image are a guess until the real run (Q-04).
4. **Founding prices.** At the 50% example in D-12 the bars halve: Starter $1.45, Pro $3.95, Agency $1.00 a store. Starter and Agency pilots then go over at the PoC high end on Haiku 5.5 ($1.71), and across the range on Haiku 4.5 (from $1.55).

**Not a driver: scan CPU.** Three times Spike D's CPU a page still keeps scans under $0.02 a store a month. At Launch, 200 stores at Pro cadence are about 27,500 pages a month: about 37 hours of one vCPU (5% of its month), or about 20 browser-hours on Browser Run, about $5.90 at plan figures.

## Questions for the owner

This estimate changes no decision. The planner decides which of these go to the owner queue.

1. **Agency on Haiku 4.5 is over its 10% bar** at the high end at both stages. Picking Haiku 5.5 (Q-33) brings it under. If Haiku 4.5 stays, should Agency stores get their own image allowance? The roadmap sets none.
2. **Does the 10% bar apply to founding prices?** If it does, Starter and Agency pilots are over at the PoC high end even on Haiku 5.5.
3. **Scan cadence for Free and Agency** is not set. This estimate assumes one Free scan a month and Pro cadence for Agency.
4. **When to move to the Launch setup.** D-10 moves Postgres to a managed service at launch. At the M7 target of 15 paying stores, if only they carry it, the Launch setup alone puts each over Starter's bar. Should the move follow store count rather than the launch date?

## Caveats

- **No network time (Q-01).** Spike D scanned local fixtures. Network waits on live pages hold a browser longer but use little CPU. That matters for capacity and Browser Run hours, not for a server billed by the month.
- **No live-store data.** Images a store, theme publishes and page weight are assumptions. Real stores often load more third-party script than the fixtures.
- **Every price is an estimate or a plan figure.** No quote, invoice or provider pick exists. The provider memo for the server and object storage is due before M4 (ADR 0005, D-04).
- **RAM.** One scanner needs about 1.1 GB besides Postgres and the app. The low end of D-10's $5 to $15 may be too small. If so, use the high end.
- **Haiku 4.5** retires not sooner than 2026-10-15 (Spike C). Its price may stop applying.
- **Not counted:** agent plans, CI agents' API use, domain and email, support time. Shopify's revenue share is 0% of the first $1M (roadmap).

## Sources

All in this repo. No web page was opened for this estimate.

| Source | What it gave |
|---|---|
| [spike-d-scan-benchmark.md](spike-d-scan-benchmark.md), [full run summary](spike-d-results/scan-bench-2026-10-11T17-39-22-575Z.md) | CPU-seconds a page, pages an hour per vCPU, scanner memory, Browser Run hours |
| [spike-c-alt-text.md](spike-c-alt-text.md), `app/lib/alt-text/config.ts` | Token guess, batch prices, retry rules, Haiku 4.5 retirement date |
| `docs/plan/roadmap.md`: "Architecture" stage table, "Go-to-market" pricing table, "Budget and cost guardrails" | Stage ranges, scan cadence, 1,000-image allowance, the 10% rule |
| `decisions/D-10.md`, `decisions/D-12.md` | Server range; plan prices, founding price |
| `docs/adr/0001` to `0005` | Four key pages, backups to object storage, the provider memo |
