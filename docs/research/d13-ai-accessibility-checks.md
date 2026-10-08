# D-13 research: can AI-driven checks replace a human check per release?

Task T-014 · M1 research lane · Checked 2026-10-08

## The answer first

- **Not fully.** AI-driven checks can take over most of the repeatable part of a release check: keyboard paths, focus moving into and out of drawers, what a real screen reader says for each control, whether "added to cart" is announced, and a first read of alt text. They cannot judge whether a store is usable for a disabled shopper, they do not cover JAWS or phone screen readers, and LLM output is not stable enough to be the only check.
- **The AI part is cheap; the expert checks it keeps are not.** API costs are about $2 to $4 per release for an LLM review of each page state, plus $6 to $25 per keyboard-only agent run, monthly. Scripted screen-reader runs use GitHub Actions minutes: free while this repo is public, about $2 to $4 a release at list prices if it turns private and runs past the free allowance (all estimates; a spike measures them). A full expert check of five themes costs about $800 to $3,000. The plan's per-release human check is $100 to $300 (estimate in D-13), which buys about one theme's check, often less.
- **Proposal: option D, pending the owner's pick (Q-30).** AI checks on every release, the owner's 30-minute VoiceOver check on every release (already in the plan), and a paid expert check of all five themes only at milestones: before pilots go live (G2), before App Store submission (G3), then quarterly or when a new theme joins the library. Over the first 12 releases D costs about $1,650 to $6,150 and B at the plan's estimate $1,200 to $3,600, so D is not cheaper at first. It buys more coverage: every theme on every release by machine, plus two full expert checks. Test it first: before G2, run the AI checks and an expert on the same golden store and compare.

## What a release check must cover

A "release" here is a change to the fix library or the app that reaches pilot stores. The check confirms that fixes are read correctly and nothing broke. Scope per supported theme (D-08 says five at PoC), on its golden store:

- Key pages: home, one collection, one product, cart.
- Five flows: open and close the menu drawer; search; choose a variant and add to cart; change a quantity in the cart drawer; sign up to the newsletter.

Per theme that is 12 page states: the 4 key pages on load, plus 8 states the flows reach (menu drawer open, search results, variant changed, added to cart, cart drawer open, quantity changed, newsletter error, newsletter success). Across five themes: about 60 page states and 25 flows per release.

## Three kinds of AI-driven check

| Approach | How it works | Strong at | Weak at |
|---|---|---|---|
| **1. Scripted screen-reader runs** | Guidepup drives real VoiceOver (macOS) and NVDA (Windows) through each flow from Playwright tests, records the spoken phrases and compares them with an approved baseline. No LLM needed to pass or fail; an LLM can summarise the diff | Names, roles, states, announcements and focus moves, as a real screen reader speaks them. Same steps every run, so regressions stand out | Only VoiceOver and NVDA; desktop only; timing can make runs flaky; checks only the paths we script |
| **2. Keyboard-only agent** | An LLM drives a browser through Playwright MCP using only Tab, Enter, Space, arrows and Escape, given a task such as "add a medium blue shirt to the cart and set quantity to 2", and reports where it got stuck | Keyboard traps, unreachable controls, focus lost after a dialog, unnamed controls it cannot identify. Finds paths we did not script | Agents fail tasks for their own reasons: on VisualWebArena (2024), tree-only agents completed 7.25% of tasks [G5] (via search, not opened). That benchmark's tasks are built to need vision, so the figure does not predict keyboard tasks on a store, but agent failures still need a person to confirm. Non-deterministic |
| **3. LLM review of the accessibility tree** | For each page state, capture Playwright's accessibility snapshot (YAML of roles, names and states) and a screenshot, and ask a model to flag vague or duplicate names, alt text that does not match the image, missing group names, odd reading order and visible text missing from the name | Judgement calls that rules miss: "link: click here", alt text that says "IMG_2041", a swatch group with no "Size" | Sees one state at a time; misses behaviour; can invent problems. Published studies report high recall on planted errors but false positives and unstable output [G4] (via search, not opened) |

Tool status, opened on 2026-10-08: Guidepup 0.35.0 was published on 2026-10-01 under the MIT licence and supports VoiceOver on macOS and NVDA on Windows; its Playwright adapter 0.19.1 was published on 2026-08-16 [G1] (opened). Automated NVDA output is visible only in NVDA's speech viewer, and Guidepup has a GitHub Actions setup action [G2] (via search, not opened). Playwright produces accessibility snapshots as YAML and Playwright MCP gives agents the same tree [G6] (via search, not opened).

## What each check catches

| Check | Scripted SR (1) | Keyboard agent (2) | LLM tree review (3) | Owner, 30 min | Paid expert |
|---|---|---|---|---|---|
| Control names, roles, states (4.1.2) | Yes | Partly | Yes | Yes | Yes |
| Focus into and out of drawers (2.4.3) | Yes, scripted paths | Yes | No | Yes | Yes |
| Keyboard traps (2.1.2) | Scripted paths only | Yes | No | Yes | Yes |
| Announcements such as "added to cart" (4.1.3) | Yes | No | No | Yes | Yes |
| Alt text matches the image (1.1.1) | No | No | Partly | Yes | Yes |
| Visible focus, focus hidden by sticky bars (2.4.7, 2.4.11) | No | Partly, with screenshots | Partly | Yes | Yes |
| Zoom and reflow at 400% (1.4.10) | No | Partly, with screenshots | Partly | Spot check | Yes |
| JAWS behaviour | No | No | No | No | Yes, if asked |
| iPhone VoiceOver and Android TalkBack | No | No | No | Optional | Yes, if asked |
| Is it actually usable: effort, clarity, confusion | No | No | Weak | Partly | Yes |
| Regression against the last release | Strong | Weak | Medium | Weak | Weak |

## What AI checks miss

1. **Real use.** Agents and models simulate a user; they do not experience the page. A CHI 2026 dataset of blind, low-vision and sighted users found computer-use agents are built around sighted interaction [G5] (via search, not opened).
2. **JAWS.** JAWS was the primary desktop screen reader for 40.5% of respondents to WebAIM's tenth survey; NVDA 37.7%; VoiceOver 9.7% [G10] (via search, not opened). Guidepup does not drive JAWS [G1] (opened).
3. **Phones.** VoiceOver on iOS was by far the most used mobile screen reader in the same survey (70.6%, scope unclear) [G10] (via search, not opened). Our scripted runs are desktop only.
4. **Meaning.** Whether alt text, error messages and labels make sense in context. AI drafts can be wrong, which is why merchants approve alt text (D-11).
5. **Things outside our release.** Shopify checkout and third-party apps change on their own schedule.
6. **Stability.** Studies report LLM checkers with good recall on seeded errors but also false positives; one 2026 paper judged a fine-tuned model's output too unstable to support human auditing [G4] (via search, not opened).
7. **Weight as evidence.** A dated review by a named expert may count for more with a merchant's lawyer than an AI log. Unverified; worth adding to the D-14 lawyer questions.

## Cost per release

All figures are estimates. Assumptions: five golden stores, about 60 page states and 25 flows per release (see "What a release check must cover"). Model prices are from the Claude API price table cached on 2026-10-06 [G7] (opened): Haiku 5.5 $0.10 in and $0.50 out per million tokens, Sonnet 5.5 $2 and $10, Opus 5.5 $4 and $20; the Batch API halves these. GitHub-hosted runners at list prices: macOS $0.062 a minute, Windows $0.010, Linux $0.006 [G8] (opened). Expert time, one basis throughout: 2 to 3 hours per theme at $80 to $200 an hour [G9] (via search, not opened; vendor sources), so $160 to $600 per theme and $800 to $3,000 for all five.

| Item | Basis | Per release |
|---|---|---|
| LLM tree review (API) | 60 states at about 15,000 tokens in and 1,000 to 3,000 out | Haiku 5.5 about $0.10 to $0.30; Sonnet 5.5 about $2 to $4; Opus 5.5 about $5 to $8 |
| Keyboard-only agent (API) | 25 tasks; one vendor measured about 114,000 tokens a task with Playwright MCP [G6]; our own estimate runs higher | Sonnet 5.5 about $6 to $25 a run; Haiku 5.5 about $0.50 to $1.50, quality unknown. Monthly, not every release |
| Scripted SR runs (CI minutes) | 25 flows at 1 to 2 minutes on macOS and on Windows: 25 to 50 minutes on each | Public repo: $0. Private repo: drawn from the free allowance first; at list prices about $2 to $4 (see below) |
| Owner check | 30 minutes, already in the plan | Owner time |
| Paid expert, plan's estimate (B) | D-13 estimate | $100 to $300, about one theme's check at the low end of market rates, less at the high end |
| Paid expert, one theme | 2 to 3 hours | $160 to $600 |
| Paid expert, all five themes | 10 to 15 hours | $800 to $3,000 |

**CI minutes depend on repo visibility.** Standard GitHub-hosted runners are free for public repositories, and this repo is public today. If the owner makes it private (Q-32), the runs draw on the plan's included minutes: 2,000 a month on GitHub Free [G8] (opened). GitHub's billing pages, as seen through search, say macOS minutes count 10 times and Windows minutes 2 times against that allowance [G8] (via search, not opened). At weekly releases the screen-reader runs alone would use about 1,200 to 2,400 of those 2,000 minutes a month, before lint, tests and scans. Past the allowance GitHub blocks runs unless a payment method is on file [G8] (opened). Paying for minutes, about $7 to $15 a month at list prices if all were billed, is a purchase that needs owner approval under D-04.

Running the agent from a Claude Code session on the Claude Pro plan (D-01) costs nothing extra in money but uses plan limits that builder lanes also need.

**Over the first 12 releases** (assumes weekly releases from M4 to M7, about three months; unverified):

| Option | What | Cost (est.) |
|---|---|---|
| A | Owner check only | $0 and 6 hours of owner time |
| B | Expert every release (the D-13 fallback) | $1,200 to $3,600 at the plan's estimate, which buys about one theme a release. All five themes every release on the same basis as D: $9,600 to $36,000 |
| C | Monthly expert retainer | Not priced; no quote found |
| D | AI checks every release, keyboard agent monthly, owner check every release, expert at G2 and G3 | API about $40 to $125 (12 tree reviews at $2 to $4, 3 agent runs at $6 to $25). CI minutes $0 while public, up to about $45 at list prices if private. Two expert checks of all five themes, $1,600 to $6,000. Total about $1,650 to $6,150, or up to about $6,200 if private |

**How D compares with B.** Over the first 12 releases D costs about as much as B at the plan's estimate, or more, because two full expert checks dominate its cost. What D buys is coverage: all five themes on every release by machine, plus two expert checks that cover every theme, JAWS and iPhone VoiceOver. B at $100 to $300 buys about one theme's check a release. A cheaper D checks two themes per milestone (4 to 6 hours, $320 to $1,200 each) and leaves the other three to the AI checks and the owner.

After launch, D costs about $850 to $3,150 a quarter (one full expert check plus about $14 to $41 a month in API), and B at the plan's estimate about $1,200 to $3,600 a quarter at 12 releases. The ranges overlap. D stays cheaper only while releases are frequent; with fewer releases, B costs less. Each new theme adds an expert check of $160 to $600. Expert checks are one-offs outside the D-02 cap, and each needs owner approval under D-04. The API costs fall in the API line of the budget ($20 to $40 a month in M4 to M6). To stay inside it, run the tree review on Haiku 5.5 or through the Batch API, review only themes that changed, and run the keyboard agent monthly rather than every release.

## Recommendation

**Propose D to the owner (Q-30)**, and prove it before relying on it.

1. **Build in M4 (lane G, test harness).** Guidepup and Playwright flows for VoiceOver on a macOS runner and NVDA on a Windows runner, one golden store per theme, with an approved baseline of spoken output. A change in names, announcements or focus fails CI. Add the LLM tree review as warnings, not a gate.
2. **Keep the owner's check.** Each release, the owner spends 30 minutes with VoiceOver on what the AI flagged plus one random flow, using the script in docs/research/learning-path.md.
3. **Calibrate before G2.** Run the AI checks and a paid expert on the same golden store. If the AI checks miss any serious barrier in a covered flow, keep an expert check every release until a new run closes the gap.
4. **Expert checks at milestones.** Before pilots go live (G2), before App Store submission (G3), then quarterly or when a new theme joins the library. Ask for JAWS and iPhone VoiceOver, which our automation does not cover.
5. **Claims.** Reports call these "automated and AI-assisted checks" and list what they did not cover. Never "audit" or "certified" (D-06, docs/policy/claims-policy.md).

**Needs from the owner:** the pick between B and D (Q-30), an API key with a spend limit (Q-04) for the LLM review, golden dev stores (Q-03), approval of the first expert check as a one-off purchase (D-04), and D-04 approval before paying for any CI minutes, which applies only if the repo turns private.

## Memo section in decisions/D-13.md

The research result, the options with costs and the proposal pending the owner's pick are in decisions/D-13.md, section "Research result (T-014, 2026-10-08)". Keep the two files in step.

## Sources

Checked 2026-10-08. "Opened" means we fetched and read it.

- G1. npm registry metadata and README for `@guidepup/guidepup` (0.35.0, published 2026-10-01, MIT, "VoiceOver on MacOS and NVDA on Windows with a single API") and `@guidepup/playwright` (0.19.1, published 2026-08-16): https://registry.npmjs.org/@guidepup/guidepup , https://registry.npmjs.org/@guidepup/playwright (opened). Also `@axe-core/playwright` 4.13.0, published 2026-08-11, https://registry.npmjs.org/@axe-core/playwright (opened).
- G2. Guidepup setup and CI notes: https://unpkg.com/@guidepup/setup@0.19.2/README.md , https://dev.to/craigmorten/a11y-unlocked-screen-reader-automation-tests-3mc8 , https://assistivlabs.com/articles/automating-screen-readers-for-accessibility-testing (via search, not opened).
- G3. axe-core 4.13.0 (the version the scanner runs) and 4.14.0 rule lists, https://github.com/dequelabs/axe-core (opened); coverage figures in docs/research/wcag-primer.md.
- G4. LLM accessibility evaluation studies: https://arxiv.org/pdf/2511.03471 (MLLMs as audit copilots), https://press.um.si/index.php/ump/en/catalog/book/1128/chapter/1235 (LLM automation of manual WCAG testing, 2026), https://arxiv.org/pdf/2504.02110 (ScreenAudit), https://arxiv.org/pdf/2501.03572 (ChatGPT case study), https://arxiv.org/pdf/2605.13873 (literature review) (via search, not opened).
- G5. A11y-CUA dataset summary, https://a11y-paradise.onrender.com/reviews/69e44b8d1f05966ee4971623 ; tree-only agents on VisualWebArena, https://current.tinyfish.ai/issue/31/foundations/article/18062/what-browser-agents-see-before-they-think (via search, not opened).
- G6. Playwright ARIA snapshots, https://playwright.dev/docs/aria-snapshots ; Playwright MCP snapshots, https://playwright.dev/mcp/snapshots ; token use per task, https://morphllm.com/playwright-mcp (via search, not opened; the last is a vendor figure).
- G7. Claude API model price table in Claude Code's bundled claude-api skill, cached 2026-10-06 (opened). Official page: https://docs.claude.com/en/docs/about-claude/pricing (not opened). Batch API at 50% of standard prices, per the same skill.
- G8. GitHub Actions billing. Opened 2026-10-08 in GitHub's docs source (github/docs repo, read through raw.githubusercontent.com): `content/billing/concepts/product-billing/github-actions.md` (free for public repos on standard runners; private repos get a plan quota; usage past it is blocked without a payment method), `data/reusables/billing/actions-included-quotas.md` (GitHub Free: 2,000 minutes a month) and `data/reusables/billing/actions-standard-runner-prices.md` (macOS $0.062, Windows $0.010, Linux $0.006 a minute). Published at https://docs.github.com/en/billing/concepts/product-billing/github-actions (not opened; the proxy refused it). The 10 times macOS and 2 times Windows minute multipliers: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions (via search, not opened, 2026-10-08); the current source folds that page into runner pricing, so check how included minutes are counted before relying on it. Also https://docs.github.com/en/enterprise-server@3.17/billing/reference/actions-runner-pricing ; 2026 price cut, https://itbrief.news/story/github-cuts-actions-runner-prices-adds-new-usage-fee (via search, not opened).
- G9. Freelance and audit rates: https://www.jobbers.io/qa-testing-automation-freelancing-guide-2026/ , https://dynomapper.com/?p=5363 , https://accessible.org/pricing/ (via search, not opened; vendor sources).
- G10. WebAIM Screen Reader User Survey #10, https://webaim.org/projects/screenreadersurvey10/ ; mobile figure via https://webaxe.org/category/screenreader (via search, not opened).
- G11. Assistiv Labs, cloud access to NVDA and JAWS; third-party listings show $19 to $99 a month tiers, https://www.preqin.com/data/profile/asset/assistiv-labs/490996 (via search, not opened). A possible way to add JAWS later; it would need D-04 approval.
