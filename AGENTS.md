# Wide Aisle: agent guide

Wide Aisle is a Shopify app that fixes common accessibility failures
in theme code and proves each fix. The plan is in docs/plan/roadmap.md.
Read it before your first task. docs/plan/kickoff.md lists the
decisions treated as final.

## Before any task
1. Read .agents/board.json and your folder in .agents/tasks/<id>/.
2. Read TASK.md, HANDOFF.md and the last 50 events of the task.
3. Check decisions/INDEX.md. Do not start work that needs a Pending decision.

## Git
- Branch: claude/<type>-<name>, one per lane or task, cut from the latest main.
  The type is a Conventional Commit type. Example: claude/feat-scanner-sampler.
- Never commit to main. Every branch reaches main through a pull request.
- A pull request merges once CI is green and a reviewer agent has checked it.
  Agents merge their own pull requests. The owner merges one-way-door changes:
  data model, billing, anything that writes to a live store.
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
