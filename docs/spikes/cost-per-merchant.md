# Cost per merchant: infrastructure plus AI per store a month

| Field | Value |
|---|---|
| Task | T-035, branch `claude/docs-cost-per-merchant` |
| Decisions | D-10 (hosting), D-12 (prices; the 10% bar). Also D-04, D-08, D-11 |
| Status | Estimate. Scan time and CPU are measured, on local fixtures (Spike D). Every price is an estimate or a plan figure |
| Date | 2026-10-12 |

## Summary

- **The 10% bar holds only at scale.** With few paying stores, each one's share of the fixed monthly cost puts Starter and Agency over on either model. Pro stays under, except on Haiku 4.5 in the smallest cases.
- **M5 and M7 go over.** M5, 10 pilots: Starter costs up to $3.21 on Haiku 5.5, which is 11% of $29 and 22% at a 50% founding price. On Haiku 4.5 it is up to $5.10: 18% and 35%. M7, 15 paying stores of 50 installs on the budget's Launch setup: the shared cost alone is $3.00 to $7.00 a paying store, and Starter reaches 25% on Haiku 5.5.
- **Launch at capacity:** 200 stores, 30% of them paying. On Haiku 5.5 every plan is under 10%, with Agency at 9.8%. On Haiku 4.5, Starter (13%) and Agency (19%) go over at the high end.
- **Scanning costs almost nothing:** under $0.01 a store a month. The number of paying stores sets the result, then the model (Q-33).

## Inputs

| Input | Value used | Source | Status |
|---|---|---|---|
| Pages a scan | 4: home, collection, product, cart | D-08, ADR 0001 | Plan |
| Scans a store a month | Free 1. Starter about 8: weekly, plus 4 for theme publishes and before-and-after scans around fixes. Pro and Agency about 34: daily, plus 4 | Roadmap pricing table: Starter weekly, Pro daily. The rest is not set | Assumption |
| Pages a store a month | Free 4, Starter 33, Pro 138, Agency 138 | The two rows above | Derived |
| CPU-seconds a page | 3.86, the highest of 3.76 to 3.86. About 746 pages an hour per vCPU at 80% efficiency | [Spike D](spike-d-scan-benchmark.md) full run ([summary](spike-d-results/scan-bench-2026-10-11T17-39-22-575Z.md)) | Measured, local fixtures. The rate is an estimate from CPU time |
| Scanner memory | About 1.1 GB (PSS) for one worker | Spike D full run | Measured, local fixtures |
| Server | $5 to $15 a month | D-10 | Estimate, not a quote |
| Object storage, Postgres and backups | PoC: $5 to $10 for storage. Postgres runs on the server, $0 extra (D-10); nightly `pg_dump` backups, kept 14 days, go to storage (ADR 0005). Launch: managed Postgres, inside the Launch range | Roadmap's $10 to $25 for server and storage, less D-10's $5 to $15 for the server | Estimate, not measured |
| Launch infrastructure | $40 to $100 a month: managed Postgres, a separate scan worker, object storage, error monitoring | Roadmap stage table and budget (M7 onward) | Estimate |
| Browser Run, census bursts | $5 a month with 10 browser-hours, then $0.09 an hour. A census fits the 10 hours if the network adds under about 1.4 s a page | Roadmap, D-10; Spike D for the hours | Plan figure, not measured (Q-05) |
| Images a store a month | Starter 1,000. Pro 1,000 ("Everything in Starter"). Agency 1,000 a store. Free 0 | Roadmap pricing table. Agency's is not set | Assumption: full allowance every month |
| Alt text per 1,000 images, batch | Haiku 5.5 $0.105. Haiku 4.5 $1.05 | [Spike C](spike-c-alt-text.md): about 1,100 input and 200 output tokens an image, at batch prices in `app/lib/alt-text/config.ts` (read 2026-10-08) | Estimate. Q-04 measures it; Q-33 picks the model |
| Share of stores that pay | PoC: all, since every store is a pilot. Launch: 30%, the M7 target of 15 paying of 50 installs | Roadmap M5 and M7 exits | Assumption |
| 10% bar | List price: Starter $2.90, Pro $7.90, Agency $1.99 a store ($199 over 10 stores; fewer stores raise it). At a 50% founding price: $1.45, $3.95, $1.00 | D-12 ("for example 50% off for 12 months"), roadmap budget guardrails | Owner rule. The founding price is an example |

## Method

- **Cost a paying store = fixed monthly infrastructure / paying stores + alt text.** Free stores use the infrastructure but pay nothing, so paying stores carry it.
- **Fixed pool.** PoC low: $10 ($5 server, $5 storage). PoC high: $30 ($15 server, $10 storage, $5 Workers Paid if Q-05 is approved). Launch and M7: $45 to $105 ($40 to $100, plus $5 Workers Paid).
- **Low** uses the low pool and Spike C's token guess. **High** uses the high pool and twice the guess, to cover billed retries (up to 2 attempts by default) and token counts above the guess.
- Starter, Pro and Agency cost the same a store: same image allowance, and scans cost almost nothing. Only the bar differs.

## Result

Cost a paying store a month, low to high.

| Case | Paying stores | Shared cost | Haiku 5.5 | Haiku 4.5 |
|---|---|---|---|---|
| PoC at capacity | 20 pilots | $0.50 to $1.50 | $0.61 to $1.71 | $1.55 to $3.60 |
| M4 and M5 bar | 10 pilots | $1.00 to $3.00 | $1.11 to $3.21 | $2.05 to $5.10 |
| M7 target, Launch setup | 15 of 50 | $3.00 to $7.00 | $3.11 to $7.21 | $4.05 to $9.10 |
| Launch at capacity, 30% pay | 60 of 200 | $0.75 to $1.75 | $0.86 to $1.96 | $1.80 to $3.85 |
| Launch, every store paying (reference) | 200 of 200 | $0.23 to $0.53 | $0.33 to $0.74 | $1.28 to $2.63 |

The high end as a share of price. For pilots: list price, then the 50% founding price. Bold is 10% or more.

| Case | Model | Starter | Pro | Agency, a store |
|---|---|---|---|---|
| 20 pilots | Haiku 5.5 | 5.9%; **11.8%** | 2.2%; 4.3% | 8.6%; **17.2%** |
| 20 pilots | Haiku 4.5 | **12.4%**; **24.8%** | 4.6%; 9.1% | **18.1%**; **36.2%** |
| 10 pilots | Haiku 5.5 | **11.1%**; **22.1%** | 4.1%; 8.1% | **16.1%**; **32.3%** |
| 10 pilots | Haiku 4.5 | **17.6%**; **35.2%** | 6.5%; **12.9%** | **25.6%**; **51.3%** |
| M7, 15 of 50 | Haiku 5.5 | **24.9%** | 9.1% | **36.2%** |
| M7, 15 of 50 | Haiku 4.5 | **31.4%** | **11.5%** | **45.7%** |
| Launch, 60 of 200 | Haiku 5.5 | 6.8% | 2.5% | 9.8% |
| Launch, 60 of 200 | Haiku 4.5 | **13.3%** | 4.9% | **19.3%** |

- **Over even at the low end:** Starter and Agency at M7. At founding prices: Agency pilots at 10 stores, and Starter and Agency pilots on Haiku 4.5. Agency at 10 pilots on Haiku 4.5, even at list price.
- **Free** adds under $0.01 a store beyond its share of the pool, which paying stores carry.

## What moves the result most

1. **Paying stores sharing the fixed cost.** The scan load barely uses the server, so its price is a fixed fee. Fewer installs or more Free stores raise every figure. At M7, keeping the PoC setup ($10 to $30) cuts the shared cost to $0.67 to $2.00 a paying store; Starter on Haiku 5.5 then tops out at 7.6% and Agency at 11.1%. That is 50 installs on one server, past the 20 PoC stores D-10 accepts, so it needs the owner's call.
2. **The model (Q-33).** Haiku 4.5 costs ten times Haiku 5.5: $1.05 to $2.10 a store at the full allowance, against $0.11 to $0.21. At twice the token guess, an Agency store's alt text alone ($2.10) is over its $1.99 bar.
3. **The price the bar is judged against.** A 50% founding price halves every pilot's bar.
4. **Images and tokens.** Every store is assumed to use all 1,000 images every month. After a first catalogue pass, most likely send far fewer. Tokens an image are a guess until the real run (Q-04).

**Not a driver: scan CPU.** A Pro store's 138 pages use about 0.03% of a 1 vCPU server's month, $0.001 to $0.004 of its price. Three times Spike D's CPU a page still stays under $0.02. At Launch, 200 stores at Pro cadence use about 5% of one vCPU.

## Questions for the owner

This estimate changes no decision. Owner queue Q-37 holds these questions.

1. **What image allowance should an Agency store get?** Agency a store is over its 10% bar at the high end on Haiku 4.5 in every case, and on either model at M5 and M7. The roadmap sets no Agency allowance. Picking Haiku 5.5 (Q-33) brings Agency under at Launch.
2. **Does the 10% bar apply to founding prices?** If it does, Starter and Agency pilots at 10 stores go over on either model: up to 22% and 32% on Haiku 5.5.
3. **What scan cadence should Free and Agency get?** This estimate assumes one Free scan a month and Pro cadence for Agency.
4. **Should the move to the Launch setup follow paying store count rather than the launch date?** D-10 moves Postgres to a managed service at launch. At M7 the Launch setup puts Starter at up to 25% on Haiku 5.5; the PoC setup, at up to 7.6%. D-10 accepts one server for up to 20 PoC stores, so the second option goes past it.

## Caveats

- **No network time (Q-01).** Spike D scanned local fixtures. Network waits hold a browser longer but use little CPU, so they matter for capacity and Browser Run hours, not for a server billed by the month.
- **No live-store data.** Images, theme publishes and page weight are assumptions. Real stores often load more third-party script than the fixtures.
- **Every price is an estimate or a plan figure.** No quote, invoice or provider pick exists, and no web page was opened for this estimate. The provider memo for the server and storage is due before M4 (ADR 0005, D-04).
- **RAM.** One scanner needs about 1.1 GB besides Postgres and the app. The low end of D-10's range may be too small; if so, use the high end.
- **Haiku 4.5** may be withdrawn from 2026-10-15 (Spike C). The Haiku 4.5 figures then no longer apply.
- **Not counted:** agent plans, CI agents' API use, domain and email, support time. Shopify takes 0% of the first $1M (roadmap).
