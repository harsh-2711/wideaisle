# 0001. System architecture at PoC

Status: Proposed
Date: 2026-10-09
Decisions used: D-02, D-05, D-08, D-10, D-11

## Context

- v1 fixes six failure types on four key pages (home, collection, product, cart) of stores on the top 5 census themes. The PoC passes when errors of those types fall by at least 80% on 10 live pilot stores (D-08).
- The PoC serves up to 20 stores on one small server (D-10). The stack is fixed: one TypeScript repo on Shopify's React Router template, with Postgres, Drizzle, pg-boss and Playwright (D-05).
- Spend stays under $150 a month (D-02). The budget gives server and object storage $10 to $25 a month in M4 to M6 (roadmap, "Budget and cost guardrails").
- A model is called at run time only for alt text, and only in batch (D-11).
- The M3 spikes built each risky part as a library with offline tests. No route calls any of them yet.

What exists today, by lane:

| Lane | Code | State |
|---|---|---|
| App shell | `app/shopify.server.ts`, `app/routes/`, `app/db.server.ts` | Install, auth, `app/uninstalled`, `app/scopes_update` and the three mandatory privacy webhooks. Scope: `read_themes` only |
| Data | `app/db/schema.ts`, `drizzle/` | One table: Shopify sessions |
| Jobs | `app/jobs/queue.server.ts` | pg-boss in the same Postgres, queues `scan`, `fix` and `rescan`. No workers yet |
| Shared rules | `app/lib/a11y/rules.ts` | The six failure types mapped to axe-core rules. Every lane imports it |
| Scanner and census | `app/lib/scanner/`, `app/lib/census/`, `scripts/census/` (T-020, T-021) | Polite crawler, egress guard, theme detection, axe runner, gap report. The census has not run yet (Q-01, Q-02) |
| Fixers | `app/lib/fixers/` (T-031, merged) | Six rule fixers and an engine with exact revert (ADR 0003) |
| Delivery | `app/lib/delivery/` on `claude/feat-delivery-adapters` (T-030, PR #41, not merged) | Three routes behind one adapter (ADR 0002). The owner merges PR #41 (Q-34) |
| Alt text | `app/lib/alt-text/`, `scripts/alt-text/` (T-032, merged) | Batch client with caps, a CLI and file-based run state (ADR 0004) |
| Evidence pack, embedded app UI | None | M4 lanes E and F |

## Decision

One repo, one container image, one small server (hosting in ADR 0005). The image runs as two processes that share one Postgres:

- **web**: the embedded app, auth, webhooks and the endpoints the UI calls. It never opens a browser or calls a model. It reads and writes records and enqueues jobs.
- **worker**: the pg-boss consumers. It runs Playwright and axe-core, the fix engine, the delivery adapters and the alt-text batch jobs.

Postgres holds app data, Shopify sessions and the pg-boss queues. Object storage holds reports and screenshots; Postgres keeps the records that point to them.

The flow for one store:

1. A merchant action or a webhook makes web enqueue `scan`.
2. The worker samples the four key pages, runs axe-core and stores issues by theme, template and page.
3. The worker runs the fix engine on the store's theme files (ADR 0003). Output: patches, plus items a person must look at.
4. The worker builds a preview through the store's delivery route (ADR 0002). The merchant reviews the diff and the preview, then approves or rejects.
5. On approval, the worker applies the patch and stores the receipt. Revert uses only that receipt.
6. Alt text runs as its own batch job. The merchant approves each draft, and route A writes it (ADR 0004).
7. Theme publish and update webhooks enqueue `rescan`. Every scan is dated and kept for the evidence pack.

Rules for every lane:

- Fixes are rules from the theme fix library. No model call sits between a merchant action and its result.
- Lane code stays in `app/lib/<lane>/` as libraries with offline tests. Routes and job handlers stay thin.
- Lanes meet only at the M4 contracts (Issue, Fix, Patch, Evidence) and at queue names. A lane that needs a new queue adds it to `QUEUES`.
- The scanner reaches only public addresses, through its egress guard (`app/lib/scanner/netguard.ts`, `egress.ts`). On one server this also keeps page scripts away from the Postgres port on the same host.

What the spikes mean for the M4 contracts (day 1):

- **Patch.** Fixers use `before: string`. Delivery uses `before: string | null`, where null creates a file. The schema takes the delivery shape and adds the fixer's `type`, `fixer` and `notes`.
- **Fix.** Review items are strings that start with "Needs review" today. The schema makes them typed records (ADR 0003).
- **Records.** Receipts (ADR 0002) and alt-text run state (ADR 0004) move into Postgres tables.

## Consequences

- **Cost.** About $5 to $15 a month for the server (D-10). Server and object storage within $10 to $25 a month in M4 to M6 (roadmap). Workers Paid for census bursts adds $5 a month, only after the owner approves it (Q-05). All are estimates; ADR 0005 lists them and Spike D replaces them.
- **Easier.** One deploy and one database. A job and its records commit in one transaction. Local development is `npm run db:up` plus `npm run dev`. Lanes work in parallel in separate folders.
- **Harder.** The server is a single point of failure (D-10). A heavy scan could starve the app, so scans run only in the worker process, with a concurrency limit on the `scan` queue.
- **Scale path without a rewrite** (roadmap). Move the worker to its own server when scan-queue wait grows past an agreed limit; this is a deploy change, since the worker is already a separate process. Move Postgres to a managed service at launch. Split queues by shop. Ship the fix library as its own package.
- **Risk: shared schema.** Every lane writes to one Postgres, so table changes are data model changes. The owner approves them and merges those pull requests (AGENTS.md).
- **Risk: scope not yet measured.** The census has not run, so the top 5 themes are not known. Only Dawn has been tested (ADR 0003).
- **Not yet proven live.** Every spike ran against local fixtures or hand-written responses. Nothing has run on a Shopify store (Q-03).
