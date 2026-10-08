<!--
Exported from the live plan doc on 2026-10-07:
https://claude.ai/code/artifact/be18d370-b34f-4d7d-8812-aa31692a23e5
Diagrams are written out as text. M4 to M8 are moved under "Milestones in detail".
When the doc changes, re-export it here in a docs(plan) commit.
-->

# Wide Aisle: Launch Roadmap and Agent Plan

2026-10-07 · @Harsh

## At a glance

Ship a Shopify app that fixes the six most common accessibility failures directly in theme code, prove it on 10 paying stores, and launch on the App Store in about 10 weeks for roughly $40 to $90 a month during the build. Agents do the work; you approve 19 decisions and 5 gates.

| Item | Plan |
|---|---|
| Proof of concept (the niche) | Stores on the most-used themes found by our own census; six failure types plus AI alt text; a dated evidence pack; proven on 10 paying design-partner stores |
| Why these six | 96% of all errors detected on the top million home pages fall into six types: low-contrast text, missing alt text, missing form labels, empty links, empty buttons, missing page language ([WebAIM Million 2026](https://webaim.org/projects/million/)) |
| Timeline | About 8 weeks to App Store submission, then Shopify's review (typically 5 to 10 business days, sometimes longer) |
| Your time | About 6 to 10 hours a week: decisions, gates, merchant calls and a short screen-reader check per release (estimate) |
| Cash | About $40 to $90 a month during the build on Claude Pro, about $90 to $190 after launch, plus optional one-offs such as a lawyer review (estimates) |
| Biggest risk | App Store apps need a Shopify exemption to edit theme files; the plan pilots through a route that avoids it while the request is reviewed |

The exemption rule: theme-editing mutations need the write_themes scope plus a Shopify exemption ([Shopify docs](https://shopify.dev/docs/api/admin-graphql/2025-04/mutations/themeFilesUpsert)), and Shopify says it replies to exemption requests within about two weeks ([Shopify docs](https://Shopify.dev/docs/apps/online-store/other-integration-methods/asset)).

## Start here: kickoff and working rules

Any agent that picks up this plan reads this section first. When you say "start implementing", it runs the kickoff steps below in order, commits after each one, and stops at gate G0 with a short report.

### Working rules for every agent

**Git.**

- Work on a feature branch named `claude/<type>-<name>`, never on main. The type is a Conventional Commit type, for example `claude/feat-scanner-sampler` or `claude/fix-contrast-tokens`.
- Parallel work gets one feature branch per lane or task, each cut from the latest main, so two lanes never share a branch.
- Every feature branch reaches main through a pull request. It merges once CI is green and a reviewer agent has checked it. Agents merge their own pull requests; you merge one-way-door changes.
- Use Conventional Commits: `type(scope): summary`, for example `feat(scanner): sample collection pages`. Types are feat, fix, docs, test, refactor, perf, build, ci, chore and revert; the scope is the lane.
- Put the task id in the commit footer: `Refs: T-042`.
- Commit a checkpoint at the end of every step and at least every 30 minutes, then push. If tests do not pass yet, use `chore(checkpoint): ...` and say what is done and what comes next.
- Merge pull requests with a merge commit, not a squash, so the checkpoint history stays.

**Merge conflicts and rebases.**

- Never delete existing code to settle a conflict or a rebase. Keep both sides, get the build and tests green, and explain the result in the commit message.
- Before any rebase, create a backup branch named backup/<branch>-<date>.
- If both sides cannot be kept safely, stop, leave the branch as it is, and move the task to Blocked on you.
- Hooks block `git reset --hard`, `git clean -fd`, force pushes to shared branches, and checking out files over someone else's changes.

**Writing: code comments, commits, docs, UI copy and messages to you.**

- Write like a person: short sentences, plain words, the point first.
- No em dashes. Use a period, a comma or a colon.
- Say it once. No filler, no recap, no hype words such as seamless, robust, leverage or delve.
- Explain only what the reader needs to act.

### Before you say start (you, about 15 minutes)

1. Create an empty folder and a private GitHub repo named wideaisle (done: harsh-2711/wideaisle).
2. Export this doc as Markdown and save it in the folder as docs/plan/roadmap.md.
3. Open Claude Code in the folder and say: "Start implementing. Follow docs/plan/roadmap.md."

### What the agent does on "start implementing"

1. Reads the whole roadmap, then writes docs/plan/kickoff.md: a 10-line summary, the decisions it treats as final, and anything unclear. Commit: `docs: add kickoff summary`.
2. Runs `git init` on main and adds .gitignore, .editorconfig, README.md, AGENTS.md (from the starter below) and a CLAUDE.md that imports AGENTS.md. Commit: `chore: initialize repository`.
3. Adds commitlint with the conventional config and a commit-msg hook, so a badly named commit is rejected. Commit: `build: enforce conventional commits`.
4. Creates the decision log: decisions/INDEX.md plus one memo per decision, D-01 to D-19, copying each status and your note from the queue. Approved and Changed decisions are final; for Changed ones, your note is the decision. Commit: `docs(decisions): import decision queue`.
5. Creates the ledger: .agents/board.json, .agents/milestones.md with the M0 to M8 exit criteria, and templates for TASK.md, HANDOFF.md, decision memos and child reports. Commit: `chore(ledger): add ledger and templates`.
6. Adds the Claude Code setup: .claude/settings.json with hooks and deny rules, hook scripts in .claude/hooks/, and one subagent definition per role in .claude/agents/. Commit: `chore(agents): add hooks, rules and subagents`.
7. Adds the GitHub files: pull request and issue templates, CODEOWNERS with you as owner, and a CI workflow. Commit: `ci: add templates and checks`.
8. Plans M0 as tasks T-001 onward, each with its own TASK.md and HANDOFF.md, and matching GitHub issues. Commit: `chore(tasks): plan M0`.
9. Pushes and sends you a short kickoff report: what exists, which tasks are queued, and which Pending decisions block work (none today: D-18 and D-19 were approved on 7 October 2026). Then it waits at gate G0.

### Project files the kickoff creates

```
wideaisle/
  AGENTS.md                rules every agent reads first
  CLAUDE.md                imports AGENTS.md for Claude Code
  README.md                what Wide Aisle is and how to run it
  commitlint.config.js     conventional commit rules
  docs/
    plan/roadmap.md        this doc, exported
    plan/kickoff.md        the agent's kickoff summary
    adr/                   architecture decision records
  decisions/
    INDEX.md               one row per decision with status
    D-01.md to D-19.md     one memo per decision
  .agents/
    board.json             one line per active task
    milestones.md          M0 to M8 with exit criteria
    templates/             TASK, HANDOFF, decision memo, child report
    tasks/T-001/           TASK.md, HANDOFF.md, children/
  .claude/
    settings.json          hooks, permissions, deny rules
    hooks/                 logging and checkpoint scripts
    agents/                planner, lane lead, builder, reviewer, QA, growth, ops
    skills/                our own skills, added later
  .github/
    pull_request_template.md
    ISSUE_TEMPLATE/        task and decision templates
    workflows/ci.yml
    CODEOWNERS
```

### AGENTS.md starter

The kickoff agent copies this into AGENTS.md and fills in the commands during M0.

```markdown
# Wide Aisle: agent guide

Wide Aisle is a Shopify app that fixes common accessibility failures
in theme code and proves each fix. The plan is in docs/plan/roadmap.md.
Read it before your first task.

## Before any task
1. Read .agents/board.json and your folder in .agents/tasks/<id>/.
2. Read TASK.md, HANDOFF.md and the last 50 events of the task.
3. Check decisions/INDEX.md. Do not start work that needs a Pending decision.

## Git
- Branch: claude/<type>-<name>, one per lane or task, cut from main.
  Never commit to main. Every branch reaches main by pull request
  after green CI and a reviewer agent's check.
- Conventional Commits: type(scope): summary. Footer: Refs: <task id>.
- Commit and push a checkpoint after every step and at least every 30 minutes.
- Unfinished work: chore(checkpoint): what is done, what is next.
- Merge with a merge commit. Do not squash.
- Never delete existing code to settle a conflict or rebase. Keep both sides.
- Back up before a rebase: backup/<branch>-<date>.
- If you cannot keep both sides safely, stop and mark the task Blocked.

## Writing
- Short sentences, plain words, point first.
- No em dashes. No filler, no recap, no hype words.
- Explain only what the reader needs to act.

## Ledger and handoffs
- Update HANDOFF.md after every step, before compaction, before stopping
  and before handing over.
- Hooks write the event log. Never edit past events.
- Child agents report only to their parent. Only the planner writes to the owner.

## Decisions and money
- New choices go in a memo in decisions/: options, monthly cost, risk, pick.
- Never buy or sign up for anything without approval (D-04).
- Never claim compliant, certified, lawsuit-proof or 100% accessible (D-06).

## Commands
Filled in during M0: install, dev, test, lint, scan.
```

## Your decision queue

Every decision below is yours. Agents draft a memo with options and costs, you set the status, and no agent starts work that depends on a decision still marked Pending. Costs are monthly unless noted; figures marked est. are estimates the agents verify before you approve.

| ID | Decision | Options (cost) | Agents' pick | Needed by | Status |
|---|---|---|---|---|---|
| D-01 | AI agent plans | A: Claude Pro $20. B: Claude Max 5x $100 plus ChatGPT Plus $20 for Codex. C: Claude Max 20x $200 plus ChatGPT Plus $20 | A; move to B only if usage limits stall parallel lanes | M0 | Changed |
| D-02 | Cash cap for M0 to M6, excluding one-offs | $150, $300 or $500 | $150 | M0 | Changed |
| D-03 | Product name and domain | Agents shortlist 10 names with domain and trademark checks; the name cannot contain "Shopify" | Pick for now a short catchy name related to the problem that we are fixing or the solution that we are providing. It should sound friendly. Picked: **Wide Aisle** (WideAisle), tagline "Make room for every shopper". Check wideaisle.com, wideaisle.app and getwideaisle.com and run a trademark search before buying anything. | M0 | Approved |
| D-04 | What agents may buy without asking | A: nothing. B: up to $20 per item inside the cap. C: up to $100 | A | M0 | Changed |
| D-05 | Stack | A: one TypeScript repo on Shopify's React Router template with Postgres, Drizzle, pg-boss and Playwright, the stack you already use. B: Python backend. C: serverless-first on Cloudflare | A | M0 | Approved |
| D-06 | Claims policy | A: never say compliant, certified or lawsuit-proof; describe fixed issues and evidence only. B: softer marketing wording | A | M1 | Approved |
| D-07 | Interview target | 15 merchants and 5 agencies, or 30 and 10 | 15 and 5 | M2 | Approved |
| D-08 | v1 scope and success bar | Six failure types plus alt text on the top 5 themes from the census; PoC passes at 80% fewer of those errors on key pages | As written | G1 | Approved |
| D-09 | How fixes reach a store | A: a custom-distribution app per pilot store, plus the exemption request. B: pull requests on a GitHub-connected theme. C: a patched theme file the merchant uploads | A for pilots, C as fallback, B for agencies | G1 | Approved |
| D-10 | PoC hosting | A: one small server for app, database, queue and scanner (about $5 to $15, est.). B: managed app host plus managed Postgres (about $20 to $50, est.). C: Cloudflare Workers plus Browser Run ($5 plan, then $0.09 per browser-hour after 10 hours) | A, with Browser Run for census bursts | G1 | Approved |
| D-11 | AI inside the product | A: AI only offline to author fixes per theme, plus Claude Haiku 4.5 in batch for alt text. B: AI generates every fix live | A to start with, solution should be open for B | G1 | Changed |
| D-12 | Pricing | Free scan; Starter $29; Pro $79; Agency $199 for 10 stores; pilots at a founding price | As written | G2 | Approved |
| D-13 | Human accessibility checks | None; a certified freelancer per release (about $100 to $300, est.); or a monthly retainer | Check if this can automated with AI in a cost effective way, else Per release | G2 | Changed |
| D-14 | Legal review before launch | Templates only, or a lawyer reviews terms, privacy policy and claims (about $300 to $1,500, est.) | Lawyer | G3 | Approved |
| D-15 | Business entity and payouts | Individual Shopify Partner; Indian private limited company; US LLC. Ask a chartered accountant first | Individual for pilots; decide before G3 | G3 | Approved |
| D-16 | Outreach rules | Personalised free reports to stores on supported themes; you approve each batch; include or exclude stores recently named in lawsuits | Exclude sued stores from cold outreach | G1 | Approved |
| D-17 | First expansion after launch | More themes, app fix packs, agency dashboard, PrestaShop, WordPress or documents | Decide with launch data | G4 | Approved |
| D-18 | Where raw agent logs live | A: everything in the main repo (simplest, bloats it). B: checkpoints in the main repo; event logs and transcripts in a separate private ledger repo (free). C: event logs in Postgres, transcripts in object storage (cents a month, est.) | B now: ledger repo harsh-2711/wideaisle-ledger, and a gitignored .agents/ledger/ until it exists; C once the PoC server exists | M0 | Approved |
| D-19 | Status board for agents | A: GitHub Projects, built into GitHub. B: Linear. C: a small custom dashboard page on our server | A; it also works on your phone. You create the Project; a script mirrors .agents/board.json to it | M0 | Approved |

## Roadmap

Roadmap as text (the live doc has the drawing). Weeks are targets.

| When | Build lane | Market lane |
|---|---|---|
| Days 1 to 3 | M0 Foundations: accounts, repo, AGENTS.md, plugins and MCP servers, hooks, spend limit, weekly brief | |
| Gate | **G0**: you approve plans, budget cap, buying rule, stack and name (D-01 to D-05) | |
| Weeks 1 to 2 | M3 Technical spikes: theme write routes, six fixers on Dawn, alt-text quality and cost, hosting test | M1 + M2 Learn and measure: primer, legal brief, census of 2,000 stores, competitor teardown, 20 interviews |
| Gate | **G1**: you choose the niche, v1 scope, fix-delivery route and outreach rules | |
| Weeks 3 to 5 | M4 Proof of concept: scanner, six fixers, preview and revert, evidence pack, embedded app | M5 Design partners (to week 7): free risk reports, calls, onboarding, 10 paying pilots at a founding price |
| Gate | **G2**: the PoC passes on 10 live stores and you confirm pricing | |
| Weeks 6 to 8 | M6 MVP and App Store readiness: billing, privacy webhooks, onboarding, security review, listing | Launch prep (part of M6): landing page, theme guides, agency kit, support macros |
| Gate | **G3**: you approve the App Store submission | |
| Weeks 9 to 10 | M7 Launch: Shopify review (about 5 to 10 business days), then 50 installs and 15 paying stores | |
| Gate | **G4**: you pick what to expand next, using launch data | |
| Months 3 to 6 | M8 Expand: top 20 themes, app fix packs, agency dashboard, PrestaShop, documents for public bodies | |

M1 to M3 run side by side, and so do M4 and M5. Each gate is one short weekly session where you approve the memos the agents prepared.

## How the agents work

Nine agent roles run in parallel lanes; you appear at exactly two points in every loop: approving a decision and reviewing a gate. Once you approve, agents work independently until the milestone's exit criteria pass or they hit a blocker they must escalate.

Agent loop as text (the live doc has the drawing).

1. Draft decision memo: an agent writes options, costs, risks and a pick.
2. **You approve** or change the pick in the decision log.
3. Plan into issues: the planner adds tests as acceptance criteria.
4. Parallel builders: Claude Code worktrees (and Codex cloud tasks once D-01 moves to B), one feature branch each.
5. CI and reviewers: tests, axe re-scans, code and security checks.
6. Exit criteria met? No: back to the builders. Yes: next step.
7. **Gate review**: demo and metrics; you open the next gate, then the loop starts again for the next milestone.

The planner drafts, you approve, builders and reviewers loop until the exit criteria pass, and then you review the gate.

| Agent | Runs on | Owns | Hands to you |
|---|---|---|---|
| Planner (chief of staff) | A Claude Code cloud Project or desktop session | Roadmap, decision memos, issues with acceptance tests, weekly brief on a schedule | Memos and a weekly brief |
| Research | Claude Code subagents and dynamic workflows | Primer, legal brief, competitor teardown, review mining | Briefs with sources |
| Data | Claude Code with Playwright and Postgres | Store census, theme statistics, before-and-after metrics | The gap report |
| Architect | Claude Code on the strongest model | Architecture decision records, interface contracts, spikes | Records that need your approval |
| Builders (1 to 2 at once on Pro, 3 to 6 on Max) | Claude Code in git worktrees, plus Codex cloud tasks | One lane each: scanner, fixers, delivery, app UI, evidence pack | Pull requests |
| Reviewers | Claude /code-review, security-guidance plugin, Codex review | A second opinion on every pull request | Flags only |
| QA | webapp-testing skill, Playwright, an axe-core MCP server | Golden-store tests, visual diffs, accessibility re-scans | Test reports |
| Growth | Claude with the frontend-design skill | Listing copy, landing page, guides, outreach drafts, agency kit | Drafts to approve |
| Ops | Claude Code routines | Deploys, backups, cost watch, uptime checks | Alerts |

**Operating rules the agents follow.**

1. One shared AGENTS.md holds conventions, commands and never-do rules; Claude Code and Codex both read it.
2. Every decision is a memo in decisions/ with options, monthly cost, risk, reversibility and a pick. Issues linked to a Pending decision fail a CI check, so nothing starts early.
3. Contract first: the architect publishes JSON schemas for Issue, Fix, Patch and Evidence before builders fan out, and each lane owns its own folder, so parallel work never collides.
4. Each lane runs with /goal set to its exit criteria as tests, and stops when they pass or when it is blocked.
5. Pull requests need green CI and one reviewer agent. You merge only one-way-door changes: data model, billing, anything that writes to a live store.
6. Hooks block destructive commands, secret access and production deploys without an approved label.
7. The API key has a monthly spend limit, every memo carries a cost estimate, and no paid service is added outside rule D-04.

**What only you do.**

- Create accounts and pay for them (GitHub, Shopify Partner, Anthropic, OpenAI, Cloudflare, domain).
- Approve decisions and gates.
- Talk to merchants and agencies; agents prepare scripts and write the summaries.
- Send outreach; agents draft every message and you approve each batch.
- Spend about 30 minutes per release checking key pages with a screen reader.
- Sign off on legal text and press Submit on the App Store listing.

## Agent visibility, logging and handoffs

Every agent writes to one run ledger through hooks rather than its own memory, so you can see what each agent is doing right now, and any agent can resume a failed task from its last checkpoint. It costs close to nothing: files in git, a GitHub Project board and shell-script hooks.

Ledger as text (the live doc has the drawing).

- You: see the board and unblock what waits on you.
- Planner: assigns tasks and relaunches stalled ones.
- Lane leads: file their children's reports.
- Child subagents: narrow jobs; report only to their lead.
- Run ledger, written by hooks: the status board (GitHub Project: queued, running, blocked, done), checkpoints (HANDOFF.md per task: done, next step, blockers) and the event log (every prompt, tool call, edit and error, appended).

Agents never report sideways: each one writes to the ledger through hooks and to its parent, and the planner is the only one that reaches you.

**Where you see what is happening.**

| You want to know | Where | How fresh |
|---|---|---|
| What every agent is doing now | A GitHub Project board with columns Queued, Running, Blocked on you, In review and Done; each card is one task showing its agent, current step and last heartbeat | Updated by hooks at every step |
| Which sessions are live and which need you | Claude Code's agent view (`claude agents`) and cloud Projects ([Claude Code docs](https://code.claude.com/docs/en/agents.md)), plus a phone push when an agent needs input ([Claude Code docs](https://code.claude.com/docs/llms.txt)) | Live |
| What happened today | The planner's daily digest: done, running, blocked, spend | Daily |
| Every detail of one task | That task's ledger: checkpoint, event log, children's reports, archived transcripts | Every tool call |
| Cost and tokens per session (optional) | Claude Code's OpenTelemetry export of cost, tokens, sessions, prompts and tool results ([Claude Code docs](https://docs.claude.com/en/docs/claude-code/monitoring-usage)) | About every minute |

**The run ledger.** Small human-readable files live in the main repo; the bulky raw logs go wherever D-18 decides.

```
.agents/                         main repo
  board.json                     one line per active task: owner, state, step, heartbeat
  tasks/T-042/
    TASK.md                      goal, exit criteria, issue link, decisions used
    HANDOFF.md                   the living checkpoint
    children/                    each child's report, filed by its parent
ledger (per D-18)
  T-042/events.jsonl             append-only, one line per event, written by hooks
  T-042/transcripts/             archived session transcripts
```

| Event field | Example |
|---|---|
| ts | 2026-10-21T09:14:03Z |
| task, agent, parent | T-042, fixer-contrast-2, lead-fixers |
| session | The Claude Code session id |
| event | start, step, tool, edit, test, commit, error, compact, child-report, handoff, stop |
| summary | Contrast fixer passes on the Dawn product page |
| refs | Files touched, commit SHA, test result, decision IDs |

**What the hooks do on their own.** Claude Code fires hooks at session start (including right after compaction), before compaction, after each tool call, when a subagent starts or stops, when the agent stops, on notifications and at session end ([hooks guide](https://smartscope.blog/en/generative-ai/claude/claude-code-hooks-guide)).

| Hook | What it does |
|---|---|
| SessionStart, on start or resume | Loads TASK.md, HANDOFF.md and the last 50 events into context; moves the card to Running |
| SessionStart, after compaction | Re-injects a short checkpoint: goal, current step, next steps, blockers |
| PreCompact | Archives the transcript so far and logs a compact event |
| PostToolUse and PostToolUseFailure | Appends one event per tool call (command, files, result or error) and refreshes the heartbeat |
| SubagentStart and SubagentStop | Logs each child; the parent cannot continue until the child's report is filed |
| Stop | Blocks the agent from ending its turn until HANDOFF.md is updated and the work is in a checkpoint commit |
| Notification | Moves the card to Blocked on you and pushes to your phone |
| SessionEnd | Archives the final transcript and records the end state |

Compaction is covered twice: the project-root CLAUDE.md is re-read from disk after compaction, and SessionStart hooks matched to compaction add their output to the new context ([dev.to, summarising the docs](https://dev.to/rulestack/2-of-8-claude-code-compactions-dropped-the-skill-body-the-docs-say-is-re-injected-both-through-57lf)). So rules live in CLAUDE.md and AGENTS.md, task state lives in HANDOFF.md, and the re-injected checkpoint stays short so it does not refill the window ([dev.to](https://dev.to/rulestack/what-survives-compaction-in-claude-code-and-how-to-keep-your-rules-alive-564p)).

**The handoff checkpoint.** HANDOFF.md always has the same sections: goal and exit criteria, status, done so far with commit SHAs, current step, next three steps, blockers and open questions, decisions used, files touched, how to verify, lessons and gotchas.

1. Tasks are sized to finish in one session, so a handoff is the exception rather than the norm.
2. HANDOFF.md is updated after every step, before compaction, before stopping and before handing over; hooks enforce the last three.
3. Every step ends in a checkpoint commit on the task branch, so a broken worktree loses at most one step.
4. A new agent never needs the old conversation: TASK.md, HANDOFF.md, the last events and the branch's git log are enough.

**Who talks to whom.**

- Child subagents get no cross-session messaging tool; they report only to the parent that spawned them, and the parent files the report in children/.
- Lane leads report to the planner, and the planner is the only agent that writes to you.
- Escalation runs child, lead, planner, you, and lands as a card in Blocked on you.
- Codex tasks (once D-01 moves to option B) use the same files through AGENTS.md. Claude Code hooks do not run there, so a CI check rejects any pull request that does not update HANDOFF.md and the event log.

**When something fails.**

1. Every event refreshes the task's heartbeat; a cron job on the project server, with no AI involved, marks a task Stalled after 20 silent minutes.
2. The planner reads HANDOFF.md, checks the branch and starts a fresh session on the task; the SessionStart hook loads the checkpoint and work resumes at the recorded next step.
3. A broken worktree is recreated from the last checkpoint commit.
4. After three failed restarts on the same step, the task moves to Blocked on you with a short summary.
5. Once a week the planner rebuilds one finished task from its ledger alone, to prove the ledger is complete.

Extra cost is close to zero: hooks are scripts, the board uses GitHub's built-in Projects, and compressed transcripts in object storage cost cents (estimate). The optional OpenTelemetry export can wait until spend needs closer tracking.

## Milestones in detail

Each milestone lists its goal, the lanes agents run in parallel, what you do, and exit criteria you can tick. M1, M2 and M3 run at the same time; so do M4 and M5.

### M0 · Foundations (days 1 to 3)

**Goal:** agents can ship safely inside the budget.

**You (about 2 hours):** open the accounts, set the API spend limit, decide D-01 to D-05.

**Agents, in parallel:**

- Repo lane: scaffold one repo from Shopify's React Router app template; write AGENTS.md; add a decisions/ folder with a memo template; CI for types, lint, tests and an accessibility check on fixtures; branch protection.
- Toolkit lane: install the Shopify AI Toolkit plugin, code-review, security-guidance and the TypeScript language-server plugin; add anthropics/skills (webapp-testing, frontend-design, skill-creator); add Playwright and axe-core MCP servers; write the safety hooks.
- Ops lane: create development stores in the Partner account with Dawn installed; a cost dashboard; a weekly brief that runs on a schedule.
- Ledger lane: the .agents/ folder and HANDOFF.md template, the logging and checkpoint hooks, the GitHub Project status board, the heartbeat cron job and the daily digest, as described in Agent visibility, logging and handoffs.

**Exit:**

- [ ] An agent-opened pull request passes CI and a reviewer agent's check
- [ ] Decision log live with D-01 to D-05 approved
- [ ] Spend limit set and shown in the weekly brief
- [ ] The status board shows every running agent with its current step and heartbeat
- [ ] A test task stopped mid-step is resumed by a fresh agent from HANDOFF.md, losing at most one step

### M1 · Understand the problem (week 1)

**Goal:** you know enough about WCAG, the law and overlays to make product calls with confidence.

**Agents, in parallel:**

- Primer: "WCAG 2.2 AA for Shopify builders", mapping each success criterion to real store parts (header, menu drawer, product form, variant picker, cart drawer, footer).
- Legal brief: US website suits and demand letters, the EU Accessibility Act and accessibility statements, overlays and the FTC order, the US Title II rule for public bodies. Not legal advice; it ends with questions for a lawyer.
- Learning path: free W3C and WebAIM material, screen-reader basics for VoiceOver and NVDA, and a 20-question quiz an agent grades.
- A draft claims policy for D-06.

**You (about 6 hours):** read the primer and the brief, walk three stores with VoiceOver using an agent-written script, take the quiz.

**Exit:**

- [ ] Quiz score of 80% or more
- [ ] Claims policy approved (D-06)

### M2 · Measure the market and the gap (weeks 1 and 2)

**Goal:** hard numbers on which themes, failures and third-party apps matter.

**Agents, in parallel:**

- Census lane: find about 2,000 live Shopify stores from public top-site lists, read each storefront's public theme name and version, scan home, collection, product and cart pages with Playwright and axe-core, and store the results. Crawl politely: respect robots.txt and rate limits.
- Analysis lane: failures by theme and by app; the share inside the six types; what a theme patch, a content edit or an app change would fix.
- Teardown lane: install Patrol, Adafix, TestParty's free scan and two widgets on a dev store; record what each fixes, misses and costs, and how onboarding feels.
- Review-mining lane: Shopify App Store reviews of accessibility apps, r/shopify and Shopify Community threads, for jobs, objections and price sensitivity.
- Interview kit: script, recruiting messages, scheduling, and a summary after every call.

**You:** 15 merchant and 5 agency calls of 20 to 30 minutes (per D-07); these can run into weeks 3 and 4.

**Exit:**

- [ ] Gap report: the top themes and their share of stores, the 10 most common failure patterns, the 10 apps that cause the most failures
- [ ] Interview synthesis with evidence of willingness to pay
- [ ] D-08 and D-16 approved

### M3 · Technical spikes (weeks 1 and 2)

**Goal:** prove the risky parts before building anything big.

**Agents, in parallel:**

- Spike A, write path: a custom-distribution app on a dev store that duplicates a theme and writes files; the GitHub pull-request route on a connected theme; the patched-theme file route. Confirm whether custom-distribution apps need the exemption, and file the exemption request if D-09 says so.
- Spike B, six fixers on Dawn: rule-based Liquid and CSS patches; axe-core before and after; Playwright screenshots for visual diffs; Theme Check passing through the Shopify Dev MCP.
- Spike C, alt text: Claude Haiku 4.5 through the Batch API on 200 product images; you rate a sample of 50; cost per 1,000 images.
- Spike D, hosting: 1,000 page scans on a small server versus Cloudflare Browser Run, timed and costed.

**Exit:**

- [ ] Architecture and delivery-path records approved (D-09, D-10, D-11)
- [ ] Cost per merchant per month estimated
- [ ] All six fixers pass on Dawn: zero axe-core findings of those types and no visual change beyond the agreed threshold

### M4 · Proof of concept (weeks 3 to 5)

**Goal:** a solid niche product that fixes the six failure types on the top themes and documents every fix.

**Day 1, contract first:** the architect publishes the Issue, Fix, Patch and Evidence schemas and assigns each lane its folder. You approve them in about 30 minutes.

**Agents, seven lanes in parallel, each with /goal set to its tests:**

- A, scanner: page sampler, axe-core runner, de-duplication by theme template, scoring.
- B, fixers 1 to 3: low contrast, missing form labels, empty buttons.
- C, fixers 4 to 6: empty links, missing page language, alt text through the Admin API with a merchant review queue.
- D, delivery: preview theme, pull request or patched file per D-09, with one-click revert.
- E, evidence pack: dated scan history, a remediation log, an accessibility statement, known limitations (for example, Shopify checkout cannot be edited).
- F, embedded app: install, scan, review fixes, publish, report, built with Polaris web components.
- G, test harness: a golden dev store per supported theme, visual regression, and re-scan gates in CI.

**You:** approve the contract, watch one demo a week, spot-check fixes with a screen reader.

**Exit (the PoC passes):**

- [ ] On 10 live pilot stores, errors of the six types fall by at least 80% on key pages (the bar set in D-08)
- [ ] No merchant-reported visual breakage, and revert works in one click
- [ ] Under 30 minutes from install to the first published fix
- [ ] An evidence pack exists for every pilot store

### M5 · Design partners (weeks 3 to 7)

**Goal:** 10 paying pilots, which proves people pay before you build the rest.

**Agents:** pick stores on supported themes from the census; generate a free personalised risk report for each; draft emails for you to approve in batches; book calls; write onboarding docs, a weekly pilot report and case-study drafts.

**You:** take the calls, close pilots at the founding price, ask for testimonials.

**Exit:**

- [ ] 10 paying pilot stores, or 5 agencies with at least 3 stores each
- [ ] At least 3 testimonials or case studies

### M6 · MVP and App Store readiness (weeks 6 to 8)

**Goal:** pass Shopify's review on the first try.

**Agents, in parallel:**

- Billing lane: Shopify Billing API plans per D-12, plus the free tier. Charging outside the Billing API is a common rejection reason ([Taylor Sicard](https://taylorsicard.com/blog/shopify-app-store-review-rejected)).
- Compliance lane: the three mandatory privacy webhooks (customer data request, customer redact, shop redact) and a clean uninstall that asks whether to keep or revert fixes.
- Onboarding lane: first fix in under 30 minutes, empty states, help docs.
- Security lane: security-guidance plugin, a Claude Security scan, a dependency audit, the fewest scopes possible.
- Listing lane: a name without "Shopify", copy that follows the claims policy, screenshots without myshopify.com URLs or Shopify logos, a demo-video script ([eSEOspace](https://eseospace.com/blog/shopify-app-store-approval/), [Growave](https://www.growave.io/blog/how-long-does-shopify-app-review-take)).
- Launch-prep lane: landing page, five theme-specific guides, support macros, an agency kit.

**You:** lawyer review (D-14), entity decision (D-15), final read of the listing.

**Exit:**

- [ ] Pre-submission checklist fully green
- [ ] You approve the submission (gate G3)

### M7 · Launch (weeks 9 and 10, plus review time)

**Goal:** the first 50 installs and 15 paying stores.

**Agents:** answer review feedback within 24 hours; publish the guides; run agency outreach; tune App Store keywords; run a small ads test if you approve it; send a daily metrics digest.

**You:** approve outreach batches, answer the top merchant questions, decide on ads.

**Exit:**

- [ ] Approved and live on the Shopify App Store
- [ ] 50 installs, 15 paying stores, and at least 60% of installs publish a first fix

### M8 · Expand (months 3 to 6)

**Goal:** widen the moat once paying stores prove the core.

**Options you choose between at gate G4 (D-17):** the theme fix library grows to the top 20 themes; fix packs for the 10 most problematic third-party apps; an agency dashboard; statements in more EU languages; a PrestaShop module; document fixes for US public bodies, whose WCAG 2.1 AA deadlines are 26 April 2027 and 26 April 2028 ([Siteimprove](https://www.siteimprove.com/blog/ada-title-ii-document-accessibility/)); the Built for Shopify badge.

## The problem and the gaps

The pain is settled; what we still need are our own numbers on themes, fixability and willingness to pay. M1 to M3 exist to answer the open questions below before any big build.

**What we already know.**

- More than 5,000 US digital accessibility suits were filed in 2025, and about 70% targeted ecommerce ([Fudge](https://www.fudge.ai/blog/ada-website-compliance/)).
- Shopify home pages average 75.1 detected errors, 33.9% worse than the average site ([WebAIM Million 2026](https://webaim.org/projects/million/)).
- Six failure types make up 96% of detected errors, and they have barely changed in seven years (same source).
- Overlay widgets do not change the underlying code, and the FTC fined the largest overlay vendor $1M over its compliance claims ([Wawsome](https://www.wawsome.com/blog/web-accessibility-tools-6-solutions-compared-for-eaa-and-wcag)).
- Only three Shopify apps change code (Patrol, TestParty, Adafix), priced from $29 to $599 a month ([Fudge](https://www.fudge.ai/blog/best-shopify-accessibility-apps/), [Adafix](https://pickyourapp.com/products/adafix-app)). A fourth, AccessFix by MK-Way, may also change code; unconfirmed (docs/research/competitor-teardown.md).

**Open questions and how the agents answer them.**

| Question | How agents answer it | When |
|---|---|---|
| Which themes cover most of our target stores? | Census of about 2,000 live stores, reading each storefront's public theme name | M2 |
| How much of the failure sits in theme code, content or third-party apps? | Census plus attribution of each failure to its source | M2 |
| Can each of the six failures be fixed automatically on each top theme? | Spike B, then the fixer lanes in M4 | M3, M4 |
| Will merchants pay $29 a month without a lawsuit hanging over them? | 20 interviews, then 10 paid pilots | M2, M5 |
| Do custom-distribution apps avoid the theme exemption, and will Shopify grant ours? | Spike A, then the exemption request | M3 |
| What documentation helps most after a demand letter? | Legal brief, then questions for two lawyers | M1, M6 |
| What exactly must an EU accessibility statement contain? | Legal brief, country by country for the first EU markets | M1 |

**Your learning path (about 6 hours in week 1).**

- The agents' primer and legal brief, written for you with sources.
- W3C's free introductory web-accessibility material and WebAIM's WCAG checklist.
- A guided screen-reader walk-through of three stores with VoiceOver (built into macOS) or NVDA (free on Windows).
- A 20-question quiz; the bar is 80%.

## Product: what v1 solves and how it differs

v1 does one job well: it fixes the six failure types behind 96% of detected errors, in the theme code of stores on the most-used themes, and proves every fix with a dated evidence pack. Fixes are written once per theme into a shared library, so each new store on a known theme is fixed in minutes and the library becomes the moat.

**The niche problems v1 solves.**

| Failure | Share of top million home pages | How v1 fixes it | Where the fix lives |
|---|---|---|---|
| Low-contrast text | 83.9% | Adjusts colour tokens just enough to pass, keeping the brand hue; merchant previews first | Theme settings and CSS |
| Missing alt text | 53.1% | Claude Haiku 4.5 drafts alt text from the image and product title; merchant reviews in bulk | Product media through the Admin API, no theme edit needed |
| Missing form labels | 51% | Adds real labels to search, newsletter, contact and quantity fields | Theme Liquid |
| Empty links | 46.3% | Names icon links (logo, social, cart) from context | Theme Liquid |
| Empty buttons | 30.6% | Names icon buttons (menu, close, quantity, slider controls) | Theme Liquid |
| Missing page language | 13.5% | Sets the page language from the store's locale | Theme layout file |
| Regressions | Not measured | Re-scans after every theme publish or app install and flags anything new | Monitoring |
| Proof | Not measured | Dated scans, a remediation log, an accessibility statement and a known-limitations list | Evidence pack |

Shares are from the [WebAIM Million 2026](https://webaim.org/projects/million/). Only the alt-text fix avoids the theme exemption, so it is also the fallback product if Shopify says no.

**How we differ.**

| Option | What it does | Price | Where we are better |
|---|---|---|---|
| Overlay widgets (accessiBe, UserWay) | Inject JavaScript at runtime; the code stays broken | $5 to $479/mo (accessiBe Scale; docs/research/competitor-teardown.md) | We change the code and add no widget |
| [Patrol](https://www.fudge.ai/blog/best-shopify-accessibility-apps/) | AI fixes in theme code | Fixes from $200/mo | A fraction of the price, a theme library, an evidence pack |
| [Adafix](https://pickyourapp.com/products/adafix-app) | Alt text and contrast fixes in code | From $29/mo | All six types, forms and buttons, regression watch, agency plan |
| [TestParty](https://pickyourapp.com/collections/store-design/products/testparty) | Managed fixes with monthly human audits | $599/mo app | Self-serve for small stores, human spot checks as an add-on |
| A freelancer | One-off manual fixes | Per project | Fixes are re-checked and re-applied after theme updates |

**What we never claim.** Not "compliant", "certified", "lawsuit-proof" or "100% accessible". We say how many detected issues we fixed, what we keep watching and what documentation you get. Automated tools cannot detect every WCAG failure, and WebAIM says so about its own scan.

**Not in v1:** keyboard traps in drawers and modals, carousels, variant pickers, fix packs for third-party apps, PDFs. They come in M8 once the core pays.

## Architecture: start small, scale by stage

At PoC everything runs on one small server in a stack you already use: TypeScript, Postgres, Drizzle, pg-boss and Playwright. Only the AI model, object storage and burst browsers are rented, and AI never sits on the hot path.

Architecture as text (the live doc has the drawing). Fixes are authored once per theme, then applied to every store on it.

1. Sample store pages: home, collection, product, cart; public pages only.
2. Scan: Playwright and axe-core on our own small server.
3. Issue store: Postgres and pg-boss, grouped by theme and page.
4. **Fix engine**: rules from the theme fix library; AI only offline.
5. Merchant preview: preview theme or pull request, visual diff, undo.
6. Publish and prove: merchant approves; alt text via API; evidence pack.
7. Re-scan after theme updates, back to step 1.

Only alt text calls an AI model at run time, and in batch; every other fix is a tested rule from the theme library.

**Components.**

- Embedded app: Shopify's React Router template with Polaris web components and App Bridge ([Shopify](https://shopify.dev/docs/apps/build/build)). Its session storage adapter points at the same Postgres.
- Jobs: pg-boss queues for scans, fixes and re-scans, so no separate queue service is needed.
- Scanner: Playwright with axe-core on the same server; one-off bursts such as the census go to Cloudflare Browser Run.
- Fix engine: rule-based fixers per theme, kept in a versioned theme fix library. Agents use Claude offline to author fixers for a new theme, then test and review them like any other code.
- Delivery adapters: preview theme (with the exemption or a custom-distribution app), GitHub pull request, patched theme file, and the Admin API for alt text.
- Evidence store: object storage for reports and screenshots.

**Cost-tiered stages (decide the first in D-10).**

| Stage | Stores | Setup | Infrastructure per month (est.) |
|---|---|---|---|
| PoC | Up to 20 | One small server for app, Postgres, queue and scanner; object storage; Haiku in batch for alt text | About $10 to $25 |
| Launch | Up to 200 | Managed Postgres with backups; a separate scan worker; Browser Run for bursts; free-tier error monitoring | About $40 to $100 |
| Growth | Up to 2,000 | Autoscaled scan workers; a read replica; scan frequency by plan; reports on a CDN | About $200 to $500 |

These ranges are planning estimates that Spike D replaces with measured numbers; agent plans are counted separately in the budget.

**Why it stays cheap.**

- Fixes are rules, not AI calls: once a theme's fixers exist, fixing another store on it costs one scan and a few API writes.
- Alt text runs in batch: Claude Haiku 4.5 costs $1 per million input tokens and $5 per million output tokens, halved through the Batch API ([Claude docs](https://docs.claude.com/en/docs/about-claude/pricing)). A downscaled image plus prompt is roughly 600 input tokens, so 1,000 images should cost under $1 (estimate; Spike C measures it).
- Browser time is cheap: Browser Run includes 10 hours on the $5 Workers Paid plan, then $0.09 an hour ([Cloudflare](https://developers.cloudflare.com/browser-run/pricing/)). At 5 to 10 seconds a page, one hour covers roughly 360 to 720 pages (estimate).
- Re-scans follow theme-publish and theme-update webhooks and plan schedules instead of constant polling.
- Shopify takes 0% of the first $1M of lifetime app revenue and 15% above that, after a $19 one-time registration ([Shopify](https://shopify.dev/docs/apps/store/revenue-share)).

**How it scales without a rewrite.**

1. Move the scanner to its own worker when scan-queue wait grows past an agreed limit.
2. Move Postgres to a managed service at launch for backups and point-in-time recovery.
3. Split queues by shop and schedule scans by plan.
4. Ship the theme library as its own versioned package with a test fixture per theme.

## Agent toolkit: skills, plugins, MCP servers and Codex

The biggest speed-up is Shopify's own AI Toolkit, which lets agents validate every API call and Liquid patch against Shopify's schemas before committing. The rest is mostly free and included in the agent plans.

| Tool | What it is | How we use it | Cost |
|---|---|---|---|
| [Claude Code](https://code.claude.com/docs/llms.txt) | Anthropic's coding agent in terminal, desktop and browser | Main builder, planner and researcher | Included in Pro $20, Max $100 or $200 ([Anthropic](https://support.anthropic.com/en/articles/11145838)) |
| [Subagents and dynamic workflows](https://code.claude.com/docs/en/agents.md) | Delegated workers; scripts that run many subagents and cross-check results | Research fan-out, census analysis, codebase audits | Plan usage |
| Agent view, Projects, worktrees, /batch | Many background sessions; multi-day cloud threads (public beta on Pro and Max); isolated git checkouts | Parallel builder lanes that never edit the same files | Plan usage |
| Routines and /goal | Scheduled or GitHub-triggered cloud runs; work until a condition holds | Weekly brief, nightly re-scans of golden stores, lanes running to their exit criteria | Plan usage |
| Hooks | Commands that run at points in a session | Block destructive commands and unapproved deploys; run tests after each edit | Free |
| [Shopify AI Toolkit](https://github.com/Shopify/shopify-ai-toolkit) | Shopify's plugin: the Dev MCP server plus agent skills for docs, GraphQL validation and Liquid and theme validation with Theme Check | Validate every Admin API query and theme patch; works in Codex too ([Shopify Dev MCP](https://shopify.dev/docs/apps/build/devmcp)) | Free |
| [Official plugins](https://code.claude.com/docs/en/plugins/anthropic-marketplaces.md) | code-review, feature-dev, commit-commands, security-guidance, TypeScript language server | Reviews, feature workflow and security checks on every pull request | Free |
| anthropics/skills | webapp-testing, frontend-design, skill-creator, mcp-builder | Playwright tests, the landing page, our own skills | Free |
| Playwright MCP or Claude in Chrome | Browser control for agents | QA, screenshots, demo recordings | Free |
| axe-core MCP servers | The community [a11y-mcp-server](https://www.npmjs.com/package/a11y-mcp-server) (axe-core with Puppeteer) or [Deque's axe MCP Server](https://www.deque.com/blog/a-closer-look-at-axe-mcp-server/) | Fix, re-scan, repeat inside the agent loop | Community free; Deque paid |
| Our own skills | wcag-fixer patterns, theme-census, evidence-pack, app-review checklist, decision-memo; built with skill-creator and tested with plugin evals | The same rules for every Claude and Codex agent | Free |
| [Codex](https://automationatlas.io/tools/chatgpt-codex/) | OpenAI's agent: CLI, parallel cloud tasks, GitHub pull-request review; reads AGENTS.md | A second builder pool for well-specified issues; an independent reviewer | Included in ChatGPT Plus at $20 a month |
| GitHub Actions | claude-code-action and codex-action | Turn approved issues into pull requests automatically | Actions minutes plus API usage |

**Setup order in M0.**

1. Install Claude Code and add the official plugins with /plugin.
2. Add Shopify's marketplace with `/plugin marketplace add Shopify/shopify-ai-toolkit`, then `/plugin install shopify-plugin@shopify-ai-toolkit`.
3. Add the Playwright and axe-core MCP servers with `claude mcp add`.
4. Commit AGENTS.md, subagent definitions in .claude/agents, our skills in .claude/skills, and hooks in .claude/settings.json.
5. On GitHub: branch protection, the Claude GitHub Action, and the Codex GitHub app.

**Watch-outs.** Running many sessions or subagents at once multiplies token usage, so parallel lanes eat plan limits fastest ([Claude Code docs](https://code.claude.com/docs/en/agents.md)). Agent teams are experimental and off by default; start with worktrees and agent view instead. Third-party marketplaces are not reviewed by Anthropic, so the Ops agent checks any plugin before install.

## Go-to-market

Win the first 10 stores by hand with free personalised scan reports, then let the App Store, agencies and theme-specific guides bring the next 40. The positioning line: real fixes in your theme code, not a widget, with the paperwork to show it.

**Pricing hypothesis (D-12).**

| Plan | Price | For | Includes |
|---|---|---|---|
| Free | $0 | Any store | Scan of key pages, an issue report, a draft accessibility statement |
| Starter | $29/mo | Small stores on supported themes | The six fix types, alt text for up to 1,000 images a month, a weekly re-scan, the evidence pack |
| Pro | $79/mo | Growing stores | Everything in Starter, daily re-scans, alerts after theme changes, priority support, an optional human spot check |
| Agency | $199/mo | Agencies, up to 10 stores | A multi-store dashboard and white-label reports |

Pilots get a founding price, for example 50% off for 12 months.

**Channels, in order.**

1. Design partners (weeks 3 to 7): stores on supported themes, picked from the census, get a free personalised report. You approve each batch; the goal is 10 paying pilots.
2. Agencies (from week 4): Shopify agencies that build on supported themes get the agency plan, white-label reports and a referral share you decide.
3. Shopify App Store (from launch): a listing tuned for accessibility, ADA, WCAG, EAA and alt-text searches, early reviews from pilots, fast support. The Built for Shopify badge comes later.
4. Content and free tools (from week 6): a fix guide per supported theme, an accessibility-statement generator, a contrast checker for Shopify palettes, an alt-text audit, and a monthly post on lawsuit trends from public data.
5. Communities: genuinely helpful answers in r/shopify and the Shopify Community, never spam.
6. Theme developers (M8): offer our fixes upstream and co-market with theme makers.

**Launch metrics.** Targets marked assumed are first guesses to replace with pilot data.

| Metric | Target by end of M7 |
|---|---|
| Installs that publish a first fix | 60% or more |
| Paying stores | 15 |
| Six-type errors fixed per store | 80% or more |
| Free to paid conversion | 20% (assumed) |
| Monthly churn | Under 5% (assumed) |

## Budget and cost guardrails

With your picks (Claude Pro at $20, a $150 cap, nothing bought without asking), monthly spend runs about $40 to $90 through M6 and about $90 to $190 after launch. The top of the launch range breaks the cap, and moving D-01 to option B fits under it only during M0 to M3.

| Item (per month) | M0 to M3 | M4 to M6 | M7 onward |
|---|---|---|---|
| Claude Pro (D-01, option A) | $20 | $20 | $20 |
| Server and object storage (est.) | $0 to $5 | $10 to $25 | $40 to $100 |
| Cloudflare Workers Paid for Browser Run, census bursts only (D-10) | $5 | $5 | $5 plus usage |
| Claude API for alt text and CI agents, under a spend limit (est.) | $10 to $20 | $20 to $40 | $20 to $60 |
| Domain and email (est.) | About $2 | About $2 | About $2 |
| **Total (est.)** | **About $40 to $50** | **About $60 to $90** | **About $90 to $190** |
| Cap (D-02) | $150 | $150 | $150 |
| If D-01 moves to B (adds $100: Max 5x replaces Pro, plus ChatGPT Plus for Codex) | About $140 to $150 | About $160 to $190 | About $190 to $290 |

**What these picks mean in practice.**

- Pro's limits are shared between claude.ai and Claude Code and suit light coding work ([Anthropic](https://support.anthropic.com/en/articles/11145838)), so plan on 1 to 2 builder lanes at a time instead of 3 to 6. M4 may run a week or two longer (estimate).
- When usage limits stall a lane, the planner flags it on the status board and sends a D-01 memo; that is the trigger to move to option B.
- Option B fits under the $150 cap only during M0 to M3; from M4 it needs a higher cap.
- Codex arrives only with option B, so until then every lane runs on Claude Code.
- CI agents bill the API key rather than the plan, so they stay light (review summaries, not full builds) to keep that line small.
- At launch, 15 paying stores at $29 bring about $435 a month in plan revenue (estimate); raising the cap from revenue is your call at G3 or G4.

**One-offs, each decided separately:** Shopify App Store registration of $19 at M6 ([Shopify](https://shopify.dev/docs/apps/store/revenue-share)); a lawyer review (D-14); human spot checks per release (D-13); an optional ads test at M7.

**Guardrails the agents must respect.**

- The API key has a monthly spend limit with alerts; the weekly brief reports spend and plan headroom.
- Agents buy nothing without asking (D-04): every paid sign-up, including Workers Paid for Browser Run, reaches you as a memo first.
- Free tiers and pay-per-use first; no annual commitments before gate G2.
- From M4, cost per merchant is tracked; infrastructure plus AI per store should stay under 10% of its plan price.
- If the cap is about to be crossed, agents pause non-critical lanes and send you a memo instead of spending.

## Risks and legal guardrails

The two risks that could stop the plan are Shopify refusing theme-write access and a fix breaking a live store; both have a fallback built into M3 and M4. Nothing here is legal advice; D-14 covers a lawyer's review before launch.

| Risk | What we do about it |
|---|---|
| Shopify denies the theme exemption | Pilot through a custom-distribution app (confirmed in Spike A), GitHub pull requests and patched theme files; alt-text fixes need no theme edit at all |
| A fix breaks a store's layout | Preview theme first, visual diff, one-click revert, golden-store tests for every supported theme |
| Overclaiming creates liability | Claims policy (D-06), terms that limit liability, a lawyer's review (D-14); never "compliant" or "lawsuit-proof" |
| Automated checks miss real barriers | Say so plainly in the product and reports; human spot checks per release (D-13) |
| Price war (Adafix is at $29) or Shopify adds native fixes | Compete on the theme library, evidence pack and regression watch; keep unit costs low enough to profit at $29 |
| Privacy | Read only public storefront pages and product media; implement the three mandatory privacy webhooks; store no customer data |
| Outreach feels like spam or ambulance chasing | Free, genuinely useful reports; you approve each batch; exclude stores named in lawsuits (D-16); honour every opt-out |
| Agents ship low-quality code fast | Contract-first interfaces, tests as exit criteria, reviewer agents, and you merge every one-way-door change |
| Census crawling causes complaints | Public pages only, robots.txt respected, gentle rate limits, no logins, a contact address in the crawler's user agent |
| Your time runs out | Gates batched into one weekly session; agents prepare every memo and summary in advance |

## Sources

Checked on 7 October 2026; prices and product features change, so agents re-verify each one inside the decision memo that depends on it.

- Shopify platform: [themeFilesUpsert exemption](https://shopify.dev/docs/api/admin-graphql/2025-04/mutations/themeFilesUpsert), [Asset API and exemption review](https://Shopify.dev/docs/apps/online-store/other-integration-methods/asset), [exemption request during development](https://community.shopify.dev/t/requesting-write-themes-themefilesupsert-exemption-for-app-in-development-phase/31997), [productUpdateMedia for alt text](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productupdatemedia.md), [GitHub integration for themes](https://shopify.dev/docs/storefronts/themes/tools/github), [React Router app template](https://github.com/Shopify/shopify-app-template-react-router), [build an app](https://shopify.dev/docs/apps/build/build), [revenue share](https://shopify.dev/docs/apps/store/revenue-share), [Dev MCP server](https://shopify.dev/docs/apps/build/devmcp), [Shopify AI Toolkit](https://github.com/Shopify/shopify-ai-toolkit)
- App review: [Growave on review time](https://www.growave.io/blog/how-long-does-shopify-app-review-take), [Taylor Sicard on rejections](https://taylorsicard.com/blog/shopify-app-store-review-rejected), [eSEOspace approval guide](https://eseospace.com/blog/shopify-app-store-approval/)
- Agents: [Claude Code docs index](https://code.claude.com/docs/llms.txt), [running agents in parallel](https://code.claude.com/docs/en/agents.md), [Anthropic's plugin marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces.md), [Claude Code on Pro and Max](https://support.anthropic.com/en/articles/11145838), [Claude API pricing](https://docs.claude.com/en/docs/about-claude/pricing), [Codex plans](https://automationatlas.io/tools/chatgpt-codex/), [Codex overview](https://codegen.com/?p=22313)
- Accessibility tooling: [WebAIM Million 2026](https://webaim.org/projects/million/), [a11y-mcp-server](https://www.npmjs.com/package/a11y-mcp-server), [Deque axe MCP Server](https://www.deque.com/blog/a-closer-look-at-axe-mcp-server/)
- Infrastructure: [Cloudflare Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/)
- Market and competitors: [Fudge on ADA compliance](https://www.fudge.ai/blog/ada-website-compliance/), [Fudge's Shopify accessibility apps](https://www.fudge.ai/blog/best-shopify-accessibility-apps/), [Adafix listing](https://pickyourapp.com/products/adafix-app), [TestParty listing](https://pickyourapp.com/collections/store-design/products/testparty), [Wawsome tool comparison](https://www.wawsome.com/blog/web-accessibility-tools-6-solutions-compared-for-eaa-and-wcag), [Siteimprove on Title II documents](https://www.siteimprove.com/blog/ada-title-ii-document-accessibility/)
