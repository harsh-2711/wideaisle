# Owner queue

Everything that waits on the owner, in suggested order. Agents keep working on everything else. Each task that waits on an item lists it in its `needs` field on the board as `owner:Q-xx`.

Status: Open, Done or Dropped. Times are estimates.

| ID | What you do | Time | Unblocks | Status |
|---|---|---|---|---|
| Q-01 | Allow outbound web access for this cloud environment: the environment menu in the session title bar, Edit, Network access. Broad access, or at least the domains in "Domains the agents need" below. Leave "Allow package managers" ticked. The alternative is running the census on your own machine (see the M2 tasks). | 5 min | M2 census and analysis, M2 review mining, M1 source checks, M3 Spike D benchmark against live pages | Open |
| Q-02 | Give the census a contact address for its user agent, as the plan's crawl rules ask. An email or a URL you are happy to publish. | 2 min | M2 census run | Open |
| Q-03 | Create a Shopify Partner account. Create two development stores with Dawn installed: `wideaisle-dev` (write tests) and `wideaisle-golden-dawn` (golden store). | 30 min | M0 ops lane, M2 teardown installs, M3 Spike A, M3 Spike B "after" scans, M3 exit | Open |
| Q-04 | Create an Anthropic API key with a monthly spend limit (for example $20) and share it as the `ANTHROPIC_API_KEY` secret in the repo and in the cloud environment. | 10 min | M0 exit (spend limit), M3 Spike C alt text, CI review agents | Open |
| Q-05 | Approve and buy Cloudflare Workers Paid at $5 a month for Browser Run (D-04, D-10), then share an API token. Optional before G1. | 10 min | M3 Spike D comparison, census bursts | Open |
| Q-06 | Create the GitHub Project "Wide Aisle board" with a single-select Status field (Queued, Running, Blocked on you, In review, Done, Stalled) and text fields Step, Agent and Heartbeat. Share its number, and add a classic token with the `project` scope as the `WA_PROJECT_TOKEN` secret. | 15 min | M0 exit (status board), board sync | Open |
| Q-07 | Create the private repo `harsh-2711/wideaisle-ledger` (D-18). | 2 min | Raw logs leave the machine that wrote them | Open |
| Q-08 | Turn on branch protection for main: require a pull request, require the CI status check once the CI pull request merges, block force pushes. Leave "Do not allow bypassing the above settings" off so agent merges through the API still work. | 5 min | M0 repo lane done | Open |
| Q-09 | Check the domains (wideaisle.com, wideaisle.app, getwideaisle.com) and run a trademark search, or let agents do it once Q-01 is done. Buy nothing yet. | 15 min | D-03 follow-up | Open |
| Q-10 | Approve the weekly brief routine: a scheduled Claude Code run every Monday that writes the brief. It uses plan usage, so it waits for your yes. | 2 min | M0 ops lane, M0 exit (spend in the weekly brief) | Open |
| Q-11 | On your machine, open Claude Code in the repo and accept the project's plugins and MCP servers when asked. Run `/plugin` to confirm Shopify AI Toolkit, code-review and security-guidance are on. | 10 min | Toolkit lane checked on a real machine | Open |
| Q-32 | The GitHub repo harsh-2711/wideaisle is public, but the plan assumed private. Choose one. (a) Keep it public. This works if sensitive material stays out of it: interview recordings, transcripts, contact and outreach lists, and anything about sued stores live outside it (docs/research/interview-kit.md, section 8). (b) Make it private (GitHub Settings, General, Danger Zone, Change visibility). This is not free. On GitHub Free, branch protection works only on public repos, so you would lose Q-08's protection or need GitHub Pro, a paid plan that needs your approval (D-04). Private repos on Free also get about 2,000 Actions minutes a month, and CI runs four jobs on every pull request update. Until you decide, agents treat the repo as public. | 5 min to choose | Nothing waits on it today. It settles whether ID-coded interview summaries could ever live in this repo (kit section 8) | Open |
| Q-20 | Read the WCAG primer and the legal brief: docs/research/wcag-primer.md and docs/research/legal-brief.md. | 2 to 3 h | M1 | Open |
| Q-21 | Walk three stores with VoiceOver using the agent-written script in docs/research/learning-path.md. | 1 h | M1 | Open |
| Q-22 | Take the 20-question quiz in docs/research/quiz.md (bar: 80%). Answers are in quiz-answers.md; read them after. | 30 min | M1 exit | Open |
| Q-23 | Approve the written claims policy in docs/policy/claims-policy.md (D-06). | 15 min | M1 exit | Open |
| Q-31 | Before the first recruiting batch, settle the five choices in section 14 of docs/research/interview-kit.md: what "recently" means for D-16 (proposal: 24 months), the founding price to quote, how long to keep recordings, transcripts and notes (proposal: 30 days for recordings and transcripts, 12 months for the ID key that links summaries to people), the willingness-to-pay bar, and any paid thank-you (needs D-04 approval) | 15 min | Q-24, Q-25 | Open |
| Q-24 | Run 15 merchant and 5 agency calls (D-07), using the interview kit in docs/research/interview-kit.md. Settle Q-31 first. | 8 to 10 h over weeks 1 to 4 | M2 exit | Open |
| Q-30 | Pick for D-13: B (expert every release) or D (AI checks every release, expert at G2, G3, then quarterly). Agents recommend D. D costs about the same as B or more for the first 12 releases ($1,650 to $6,150 against $1,200 to $3,600) but covers all five themes; see decisions/D-13.md | 10 min | M4 test harness lane, G2 | Open |
| Q-33 | Approve the alt-text model for Spike C: the latest Haiku (claude-haiku-5-5, batch about a tenth of Haiku 4.5's price) in place of the Haiku 4.5 that D-11 names. No API key is needed to decide, so this is open before Q-04. Haiku 4.5 (claude-haiku-4-5-20251001) retires not sooner than October 15, 2026; Haiku 5.5 not sooner than October 7, 2027 (Anthropic deprecations page, read 2026-10-08). | 5 min | M3 Spike C real run | Open |

## Queued for later milestones

These need you once agents finish their part. Agents will move each one to Open with a link when it is ready.

| ID | What you do | Time | Unblocks | Ready when |
|---|---|---|---|---|
| Q-25 | Approve each outreach and recruiting batch (D-16) | 15 min a batch | Interview recruiting | Drafts ready |
| Q-26 | Rate 50 AI alt texts in the rating sheet | 30 min | M3 Spike C | After Q-04 |
| Q-27 | File the theme exemption request if Spike A shows it is needed (D-09) | 20 min | M3 Spike A | After Q-03 |
| Q-28 | Approve the architecture and delivery-path ADRs (D-09, D-10, D-11) | 30 min | M3 exit, G1 | ADRs merged |
| Q-29 | Gate G1 review | 30 min | M4 and M5 | M1 to M3 exits |
| Q-34 | Merge pull request harsh-2711/wideaisle#41 (Spike A delivery adapters). Under AGENTS.md the owner merges anything that writes to a live store. The adapters are not called from the app yet. | 15 min | M3 Spike A, T-034 ADRs | Reviewer approves #41 and CI is green |

## Domains the agents need (for Q-01)

Research and census: `webaim.org`, `w3.org`, `shopify.dev`, `apps.shopify.com`, `community.shopify.com`, `www.reddit.com`, `tranco-list.eu`, `themes.shopify.com`, and the storefront domains the census finds. Store scanning needs general web access, so a domain list is not enough for the census.
