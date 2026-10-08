# Wide Aisle

Make room for every shopper.

Wide Aisle is a Shopify app that fixes the six most common accessibility failures directly in theme code and proves every fix with a dated evidence pack. The six are low-contrast text, missing alt text, missing form labels, empty links, empty buttons and missing page language. Together they make up 96% of errors detected on the top million home pages ([WebAIM Million 2026](https://webaim.org/projects/million/)).

We never claim a store is compliant, certified, lawsuit-proof or 100% accessible (decision D-06). We say what we fixed, what we watch and what documentation you get.

## Status

M0 (Foundations). See [.agents/milestones.md](.agents/milestones.md) for exit criteria, [.agents/tasks/](.agents/tasks/) for tasks (`npm run board -- list`) and [.agents/owner-queue.md](.agents/owner-queue.md) for what waits on you.

## Where things are

| Path | What it holds |
|---|---|
| [docs/plan/roadmap.md](docs/plan/roadmap.md) | The full plan, exported from the live doc |
| [docs/plan/kickoff.md](docs/plan/kickoff.md) | Plan summary, final decisions, open assumptions |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [decisions/](decisions/) | One memo per owner decision, with [INDEX.md](decisions/INDEX.md) |
| [.agents/](.agents/) | The run ledger: board, milestones, tasks, handoffs, templates |
| [.claude/](.claude/) | Claude Code hooks, permissions and subagents |
| [AGENTS.md](AGENTS.md) | Rules every agent reads first; CLAUDE.md imports it |

## How work happens

1. The owner approves decisions in [decisions/INDEX.md](decisions/INDEX.md).
2. The planner turns a milestone into tasks in `.agents/tasks/T-xxx/` with matching GitHub issues.
3. Each task or lane gets its own feature branch named `claude/<type>-<name>`, cut from the latest main.
4. Every branch reaches main through a pull request. It merges with a merge commit once CI is green and a reviewer agent has checked it.
5. Commits follow Conventional Commits, `type(scope): summary`, with `Refs: T-xxx` in the footer.

## Continue on your own machine

```bash
git clone https://github.com/harsh-2711/wideaisle.git
cd wideaisle
claude   # Claude Code reads CLAUDE.md, which imports AGENTS.md
```

Then ask: "Run npm run board -- list and continue the next task."
