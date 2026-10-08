# Kickoff summary

Written on 2026-10-07 after reading all of docs/plan/roadmap.md.

## The plan in 10 lines

1. Wide Aisle is a Shopify app that fixes six accessibility failure types in theme code and proves each fix.
2. The six: low-contrast text, missing alt text, missing form labels, empty links, empty buttons, missing page language.
3. Fixes are rules written once per theme into a shared library. AI writes them offline. Only alt text calls a model at run time, in batch.
4. Every store gets a dated evidence pack: scans, a remediation log, an accessibility statement and known limits.
5. The stack is one TypeScript repo on Shopify's React Router template with Postgres, Drizzle, pg-boss and Playwright.
6. M0 to M7 run over about 10 weeks, and M8 follows in months 3 to 6. Five gates (G0 to G4) are where the owner decides.
7. M1, M2 and M3 run side by side, and so do M4 and M5.
8. The PoC passes when the six error types fall by 80% or more on key pages of 10 live pilot stores.
9. Agents do the work in parallel lanes and log to a run ledger through hooks. The planner is the only agent that writes to the owner.
10. Spend stays near $40 to $90 a month through M6, under a $150 cap, and nothing is bought without asking.

## Decisions treated as final

Approved and Changed decisions are final. For Changed ones, the owner's note is the decision.

| ID | Decision | Final pick |
|---|---|---|
| D-01 | AI agent plans | A: Claude Pro at $20. Move to B only if usage limits stall parallel lanes |
| D-02 | Cash cap for M0 to M6 | $150 a month, one-offs excluded |
| D-03 | Name and domain | Wide Aisle, "Make room for every shopper". Check domains and trademarks before buying |
| D-04 | Buying without asking | A: nothing |
| D-05 | Stack | A: TypeScript, React Router template, Postgres, Drizzle, pg-boss, Playwright |
| D-06 | Claims policy | A: never compliant, certified, lawsuit-proof or 100% accessible |
| D-07 | Interviews | 15 merchants and 5 agencies |
| D-08 | v1 scope and bar | Six types plus alt text on the top 5 census themes; 80% fewer errors on key pages |
| D-09 | Fix delivery | A for pilots, C as fallback, B for agencies |
| D-10 | PoC hosting | A: one small server, plus Browser Run for census bursts |
| D-11 | AI in the product | A to start (AI offline, Haiku in batch for alt text). Keep the design open for B |
| D-12 | Pricing | Free scan, Starter $29, Pro $79, Agency $199, pilots at a founding price |
| D-13 | Human checks | First test whether AI can do them at low cost. If not, a freelancer per release |
| D-14 | Legal review | A lawyer reviews terms, privacy policy and claims |
| D-15 | Entity | Individual Partner for pilots; decide before G3 |
| D-16 | Outreach | Exclude stores recently named in lawsuits from cold outreach |
| D-17 | First expansion | Decide with launch data |
| D-18 | Raw agent logs | B: ledger repo harsh-2711/wideaisle-ledger; a gitignored .agents/ledger/ until it exists; C once the PoC server exists |
| D-19 | Status board | A: GitHub Projects, mirrored from the task folders in .agents/tasks/ |

D-18 and D-19 were Pending when the kickoff started. The owner approved both on 2026-10-07, and the live doc now shows them Approved.

## Changes from the plan text

- Branches are `claude/<type>-<name>`, not `task/<id>-<short-name>`. The task id goes in the commit footer. The owner set this on 2026-10-07 and the live doc now says so.
- Every feature branch reaches main through a pull request. Agents merge their own pull requests after green CI and a reviewer agent's check, using a merge commit.
- Task state lives in `.agents/tasks/<id>/status.json`, one file per task, so parallel branches never conflict. `.agents/board.json` is a generated view (`npm run board -- build`), and heartbeats come from the event log.
- main got one direct root commit so pull requests have a base. Every later change goes through a pull request.

## Unclear, with the working assumption

- D-01, D-02 and D-04 are marked Changed, but the pick text matches the original picks. The budget section confirms them, so we use A, $150 and A.
- The heartbeat cron job needs the project server from D-10, which does not exist yet. Until then the SessionStart hook flags tasks with no heartbeat for 20 minutes.
- The GitHub Project board, branch protection, the ledger repo and dev stores need the owner's accounts. The agents prepare everything else and list these in the kickoff report.
- D-13 needs a research task: can an AI screen-reader pass replace a human check per release, and at what cost? It is planned as an M1 task.
