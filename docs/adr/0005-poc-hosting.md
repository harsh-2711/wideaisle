# 0005. PoC hosting

Status: Proposed
Date: 2026-10-11
Decisions used: D-02, D-04, D-10

## Context

- D-10 picks option A: one small server for the app, Postgres, the queue and the scanner, with Cloudflare Browser Run for census bursts. One server is a single point of failure, which D-10 accepts for up to 20 PoC stores. Postgres moves to a managed service at launch.
- The cap is $150 a month (D-02). Workers Paid, which Browser Run needs, is a paid sign-up, so the owner approves it first (D-04, Q-05). Nothing has been bought.
- Spike D (T-033, merged in PR #47) timed 1,000 page scans at concurrency 1, 2 and 4 on one 4 vCPU machine, through the census scan path. The pages were seeded local fixtures, so there is no network time (Q-01). Its Browser Run half waits on Q-05. Report: `docs/spikes/spike-d-scan-benchmark.md`.
- **The repo today.** `Dockerfile` builds on `node:22-alpine` and runs one process: migrations, then `react-router-serve`. `docker-compose.yml` runs Postgres 16 for local development.
- **Playwright on Alpine.** The installed Playwright has Chromium builds for Debian 11 to 13 and Ubuntu, and none for Alpine (host platforms listed in `node_modules/playwright-core`). A scanner on the current base image is not expected to run.

### Figures

Spike D measured time, CPU and memory on local fixtures. It did not measure prices, object storage or Browser Run. Every measured value comes from the reported full run: `docs/spikes/spike-d-results/scan-bench-2026-10-11T17-39-22-575Z.md`, summarised in `docs/spikes/spike-d-scan-benchmark.md` ("Planning figures to replace"). The planning value is kept for comparison.

| Figure | Planning value | Value now | Source | Status |
|---|---|---|---|---|
| Server | About $5 to $15 a month | Price unchanged. Size: one scan worker needs about 1.1 GB (PSS) and 3.8 CPU-seconds a page; two workers about 1.3 GB. About 750 pages an hour per vCPU at most (estimate from CPU time) | Price: D-10. Size: Spike D full run | Price: estimate, not measured. Size: measured, local fixtures |
| Server and object storage, M4 to M6 | About $10 to $25 a month | Unchanged | Roadmap budget | Estimate. Spike D did not measure object storage |
| Time per page scan | 5 to 10 seconds | 2.57 s a page at concurrency 1 (p50 2.22 s, p95 4.56 s); axe-core about 2.0 s of it | Spike D full run | Measured, local fixtures, no network |
| Pages per browser-hour | 360 to 720 | 1,399 at concurrency 1. One 4 vCPU machine: 2,303 at concurrency 2, 2,837 at 4 | Spike D full run | Measured, local fixtures, no network |
| PoC scan load: 20 stores, 4 key pages, daily rescans | 80 pages, about 7 to 13 browser-minutes a day | 80 pages, about 3.4 browser-minutes and 5 CPU-minutes a day | Spike D full run | Measured rate, local fixtures, no network |
| Census: 2,000 stores, 4 workers | About 2 hours, so about 8 browser-hours | About 3 hours on one 4 vCPU server. On Browser Run, about 1.7 hours and 6.8 browser-hours, politeness waits included | Spike D, "Census comparison" | Derived from measured times, before network time |
| Browser Run | $5 a month with 10 browser-hours, then $0.09 an hour | Unchanged | D-10, roadmap (Cloudflare price page, read 2026-10-07) | Plan figure, not measured. Q-05 measures it |
| Census on Browser Run | About $5 for a census month | About $5: 6.8 of the 10 included hours, if the network adds under about 1.4 s a page | Spike D, "Census comparison" | Plan prices and local timing |

## Decision

- **One server, one image, three containers.** Postgres 16 with a data volume, plus the web and worker processes from ADR 0001. Both processes run the same image.
- **Base image.** The image moves from `node:22-alpine` to a Debian-based Node 22 image with Playwright's Chromium and its system libraries. Versions are pinned. M4 makes the change and confirms the scanner runs in the image. Spike D ran Chromium on a Linux VM, not in the image.
- **Scanning.** The worker runs one Chromium. Concurrency starts at 1: one worker needs about 1.1 GB and scans the PoC's 80 pages a day in about 3.4 minutes (Spike D). One worker already used about 1.5 of the test machine's 4 cores. There, 2 workers added about 220 MB and 65% more pages an hour; 4 added 23% more. Raise it only on a server with the cores and RAM to spare. Product scans stay on the server at PoC; Browser Run is for census bursts only.
- **Backups.** A nightly `pg_dump` goes to object storage and is kept for 14 days. We test a restore once before the first pilot. Delivery records live in Postgres and route C zips in object storage (ADR 0002), so backups keep revert possible after a lost server.
- **Census bursts.** These go to Browser Run once the owner approves Workers Paid (Q-05). Until then the census runs on the owner's machine, or here once outbound web access is allowed (Q-01).
- **Providers.** This ADR does not pick them. Before M4 needs a server, a decision memo goes to the owner covering both the server and object storage, with options, monthly cost, risk and a pick. Both are paid sign-ups, and backups need object storage from day one (AGENTS.md, D-04).
- **When to move.**
  - The worker moves to its own server when scan jobs wait more than an agreed limit. We propose 15 minutes, to be checked against pilot data.
  - Postgres moves to a managed service at launch (D-10). The launch stage is up to 200 stores at about $40 to $100 a month (roadmap, estimate).

## Consequences

- **Cost.** About $5 to $15 a month for the server, within $10 to $25 a month for server and object storage in M4 to M6. If the owner approves Workers Paid, add $5 a month. These prices are still estimates: Spike D measured time, not prices. It shows the PoC scan load uses under 1% of one vCPU, so the monthly price, not the scan rate, sets the cost. Spread over 20 stores, that is $0.50 to $1.50 a store a month before alt text (`docs/spikes/cost-per-merchant.md`). All of it sits well under the $150 cap (D-02).
- **Easier.** One machine to run and watch. The PoC scan load is about 3.4 browser-minutes a day (Spike D, before network time), so the server has room for rescans after theme publishes and for before-and-after scans around each fix.
- **Harder.** We run Postgres, updates and backups ourselves until launch.
- **Risk: an outage.** It delays scans, previews and the reverts we run. It does not break storefronts, because fixes live in the theme. On routes B and C the merchant or agency can revert without us: close or revert the pull request in GitHub, or republish the old theme.
- **Risk: one host.** Postgres shares the host with the scanner. The scanner's egress guard must stay on for every scan, so a page cannot reach the database port (ADR 0001).
- **Server size.** RAM, not CPU, sizes the PoC server. One scan worker needs about 1.1 GB besides Postgres and the app (Spike D). The provider memo checks that against the low end of D-10's range. The design does not depend on these numbers.
- **Follow-up.** Spike D's measured values are in the table above. Still open: Browser Run measured on its own platform (Q-05), live-page timing (Q-01), and real prices from the provider memo. T-035 (`docs/spikes/cost-per-merchant.md`) uses the same inputs for the cost per store.
