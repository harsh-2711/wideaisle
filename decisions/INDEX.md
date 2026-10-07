# Decision log

Every owner decision has a memo here. Approved and Changed decisions are final; for Changed ones, the owner's note is the decision. No agent starts work that depends on a Pending decision, and CI fails any task that links a Pending one.

To add a decision, copy `.agents/templates/decision-memo.md` to `decisions/D-xx.md`, fill it in, and add a row below with status Pending.

| ID | Decision | Final pick | Needed by | Status |
|---|---|---|---|---|
| [D-01](D-01.md) | AI agent plans | A: Claude Pro at $20 a month | M0 | Changed |
| [D-02](D-02.md) | Cash cap for M0 to M6, excluding one-offs | $150 a month for M0 to M6 | M0 | Changed |
| [D-03](D-03.md) | Product name and domain | Wide Aisle (WideAisle), tagline "Make room for every shopper" | M0 | Approved |
| [D-04](D-04.md) | What agents may buy without asking | A: agents buy nothing without asking | M0 | Changed |
| [D-05](D-05.md) | Stack | A: one TypeScript repo on Shopify's React Router app template, with Postgres, Drizzle, pg-boss and Playwright | M0 | Approved |
| [D-06](D-06.md) | Claims policy | A: never claim compliant, certified, lawsuit-proof or 100% accessible | M1 | Approved |
| [D-07](D-07.md) | Interview target | 15 merchant and 5 agency calls of 20 to 30 minutes | M2 | Approved |
| [D-08](D-08.md) | v1 scope and success bar | Six failure types plus alt text on the top 5 themes from the census | G1 | Approved |
| [D-09](D-09.md) | How fixes reach a store | A for pilots, C as the fallback, B for agencies | G1 | Approved |
| [D-10](D-10.md) | PoC hosting | A: one small server for app, Postgres, queue and scanner | G1 | Approved |
| [D-11](D-11.md) | AI inside the product | A to start (AI offline, alt text in batch); keep the design open for B | G1 | Changed |
| [D-12](D-12.md) | Pricing | Free scan, Starter $29 a month, Pro $79 a month, Agency $199 a month for up to 10 stores | G2 | Approved |
| [D-13](D-13.md) | Human accessibility checks | Test a low-cost AI check first; else a freelancer per release | G2 | Changed |
| [D-14](D-14.md) | Legal review before launch | A lawyer reviews the terms, privacy policy and claims before launch | G3 | Approved |
| [D-15](D-15.md) | Business entity and payouts | Individual Shopify Partner for pilots | G3 | Approved |
| [D-16](D-16.md) | Outreach rules | Free personalised reports to stores on supported themes | G1 | Approved |
| [D-17](D-17.md) | First expansion after launch | Deferred: the owner picks at G4 using launch data | G4 | Approved |
| [D-18](D-18.md) | Where raw agent logs live | B now: the private repo harsh-2711/wideaisle-ledger holds event logs and transcripts | M0 | Approved |
| [D-19](D-19.md) | Status board for agents | A: a GitHub Project with columns Queued, Running, Blocked on you, In review and Done | M0 | Approved |

Statuses: Pending, Approved, Changed, Rejected. Only the owner sets them.
