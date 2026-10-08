# Milestones and gates

Exit criteria from docs/plan/roadmap.md. Tick a box only with evidence: a merged pull request, a report in the repo, or the owner's word. Items marked **(owner)** need the owner; see [owner-queue.md](owner-queue.md).

| Milestone | When | Runs with | Gate after it |
|---|---|---|---|
| M0 Foundations | Days 1 to 3 | | G0 |
| M1 Understand the problem | Week 1 | M2, M3 | G1 |
| M2 Measure the market and the gap | Weeks 1 and 2 | M1, M3 | G1 |
| M3 Technical spikes | Weeks 1 and 2 | M1, M2 | G1 |
| M4 Proof of concept | Weeks 3 to 5 | M5 | G2 |
| M5 Design partners | Weeks 3 to 7 | M4 | G2 |
| M6 MVP and App Store readiness | Weeks 6 to 8 | | G3 |
| M7 Launch | Weeks 9 and 10, plus review time | | G4 |
| M8 Expand | Months 3 to 6 | | |

## Gates

| Gate | The owner decides |
|---|---|
| G0 | Plans, budget cap, buying rule, stack and name (D-01 to D-05) |
| G1 | The niche, v1 scope, fix-delivery route and outreach rules (D-08, D-09, D-10, D-11, D-16) |
| G2 | The PoC passes on 10 live stores; pricing confirmed (D-12, D-13) |
| G3 | The App Store submission (D-14, D-15) |
| G4 | What to expand next, using launch data (D-17) |

## M0 Foundations

- [ ] An agent-opened pull request passes CI and a reviewer agent's check
- [x] Decision log live with D-01 to D-05 approved (decisions/INDEX.md, PR 3)
- [ ] Spend limit set and shown in the weekly brief **(owner)**
- [ ] The status board shows every running agent with its current step and heartbeat **(owner creates the GitHub Project)**
- [ ] A test task stopped mid-step is resumed by a fresh agent from HANDOFF.md, losing at most one step

## M1 Understand the problem

- [ ] Quiz score of 80% or more **(owner)**
- [ ] Claims policy approved (D-06) **(owner approves the written policy)**

## M2 Measure the market and the gap

- [ ] Gap report: the top themes and their share of stores, the 10 most common failure patterns, the 10 apps that cause the most failures
- [ ] Interview synthesis with evidence of willingness to pay **(owner runs the calls)**
- [x] D-08 and D-16 approved

## M3 Technical spikes

- [ ] Architecture and delivery-path records approved (D-09, D-10, D-11) **(owner approves the ADRs)**
- [ ] Cost per merchant per month estimated
- [ ] All six fixers pass on Dawn: zero axe-core findings of those types and no visual change beyond the agreed threshold

## M4 Proof of concept

- [ ] On 10 live pilot stores, errors of the six types fall by at least 80% on key pages (D-08)
- [ ] No merchant-reported visual breakage, and revert works in one click
- [ ] Under 30 minutes from install to the first published fix
- [ ] An evidence pack exists for every pilot store

## M5 Design partners

- [ ] 10 paying pilot stores, or 5 agencies with at least 3 stores each
- [ ] At least 3 testimonials or case studies

## M6 MVP and App Store readiness

- [ ] Pre-submission checklist fully green
- [ ] The owner approves the submission (G3)

## M7 Launch

- [ ] Approved and live on the Shopify App Store
- [ ] 50 installs, 15 paying stores, and at least 60% of installs publish a first fix

## M8 Expand

Options chosen at G4 (D-17).
