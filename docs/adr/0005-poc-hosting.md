# 0005. PoC hosting

Status: Proposed
Date: 2026-10-11
Decisions used: D-02, D-04, D-10

## Context

- D-10 picks option A: one small server for the app, Postgres, the queue and the scanner, with Cloudflare Browser Run for census bursts. One server is a single point of failure, which D-10 accepts for up to 20 PoC stores. Postgres moves to a managed service at launch.
- The cap is $150 a month (D-02). Workers Paid, which Browser Run needs, is a paid sign-up, so the owner approves it first (D-04, Q-05). Nothing has been bought.
- Spike D (T-033) times and costs 1,000 page scans on a small server against Browser Run. It is in progress on `claude/feat-scan-benchmark` and has no results yet. Its Browser Run half needs Q-05.
- **The repo today.** `Dockerfile` builds on `node:22-alpine` and runs one process: migrations, then `react-router-serve`. `docker-compose.yml` runs Postgres 16 for local development.
- **Playwright on Alpine.** The installed Playwright has Chromium builds for Debian 11 to 13 and Ubuntu, and none for Alpine (host platforms listed in `node_modules/playwright-core`). A scanner on the current base image is not expected to run.

### Planning figures

Spike D has not reported. Every number below is a planning figure from D-10, the roadmap or the census README, not a measurement.

| Figure | Planning value | Source | Status |
|---|---|---|---|
| Server | About $5 to $15 a month | D-10 | Estimate, Spike D replaces it |
| Server and object storage, M4 to M6 | About $10 to $25 a month | Roadmap budget | Estimate, Spike D replaces it |
| Time per page scan | 5 to 10 seconds | Roadmap | Estimate, Spike D replaces it |
| Pages per browser-hour | 360 to 720 | Roadmap | Estimate, Spike D replaces it |
| PoC scan load: 20 stores, 4 key pages, daily rescans | 80 pages, about 7 to 13 browser-minutes a day | Derived from the rows above | Estimate, Spike D replaces it |
| Census: 2,000 stores, 4 workers | About 2 hours, so about 8 browser-hours | `docs/census/README.md`; browser-hours derived | Estimate, Spike D replaces it |
| Browser Run | $5 a month with 10 browser-hours, then $0.09 an hour | D-10, roadmap (Cloudflare price page, read 2026-10-07) | Estimate, Spike D replaces it |
| Census on Browser Run | Within the 10 included hours: about $5 for a census month | Derived from the two rows above | Estimate, Spike D replaces it |

## Decision

- **One server, one image, three containers.** Postgres 16 with a data volume, plus the web and worker processes from ADR 0001. Both processes run the same image.
- **Base image.** The image moves from `node:22-alpine` to a Debian-based Node 22 image with Playwright's Chromium and its system libraries. Versions are pinned. M4 makes the change, and Spike D's server run confirms it.
- **Scanning.** The worker runs one Chromium and scans a few pages at a time. Spike D sets the number from measured memory per page. Product scans stay on the server at PoC; Browser Run is for census bursts only.
- **Backups.** A nightly `pg_dump` goes to object storage and is kept for 14 days. We test a restore once before the first pilot. Delivery records live in Postgres and route C zips in object storage (ADR 0002), so backups keep revert possible after a lost server.
- **Census bursts.** These go to Browser Run once the owner approves Workers Paid (Q-05). Until then the census runs on the owner's machine, or here once outbound web access is allowed (Q-01).
- **Providers.** This ADR does not pick them. Before M4 needs a server, a decision memo goes to the owner covering both the server and object storage, with options, monthly cost, risk and a pick. Both are paid sign-ups, and backups need object storage from day one (AGENTS.md, D-04).
- **When to move.**
  - The worker moves to its own server when scan jobs wait more than an agreed limit. We propose 15 minutes, to be checked against pilot data.
  - Postgres moves to a managed service at launch (D-10). The launch stage is up to 200 stores at about $40 to $100 a month (roadmap, estimate).

## Consequences

- **Cost.** About $5 to $15 a month for the server, within $10 to $25 a month for server and object storage in M4 to M6. If the owner approves Workers Paid, add $5 a month. Every figure is an estimate that Spike D replaces. All of it sits well under the $150 cap (D-02).
- **Easier.** One machine to run and watch. The PoC scan load is a small fraction of one browser's day (estimate), so the server has room for rescans after theme publishes and for before-and-after scans around each fix.
- **Harder.** We run Postgres, updates and backups ourselves until launch.
- **Risk: an outage.** It delays scans, previews and the reverts we run. It does not break storefronts, because fixes live in the theme. On routes B and C the merchant or agency can revert without us: close or revert the pull request in GitHub, or republish the old theme.
- **Risk: one host.** Postgres shares the host with the scanner. The scanner's egress guard must stay on for every scan, so a page cannot reach the database port (ADR 0001).
- **Server size.** Spike D's measured memory and CPU per page set the server size and the scan concurrency. The design does not depend on them.
- **Follow-up.** When Spike D's pull request (T-033) merges, replace every row marked "Estimate, Spike D replaces it" with the measured value, and note where it came from. T-035, the cost per merchant estimate, uses the same inputs.
