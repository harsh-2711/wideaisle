# Run ledger

This folder is the project's metadata: what every agent is doing, what it did, and what waits on the owner. Hooks write most of it. Agents read it before any task (see AGENTS.md).

| Path | What it holds | Who writes it |
|---|---|---|
| `board.json` | One line per task: id, title, milestone, lane, agent, state, step, heartbeat, branch, issue, needs | Hooks and `npm run board` |
| `milestones.md` | M0 to M8 exit criteria and the gates | Planner, with evidence |
| `owner-queue.md` | Everything that waits on the owner, and what each item unblocks | Planner |
| `tasks/T-xxx/TASK.md` | Goal, exit criteria, issue, decisions used | Planner |
| `tasks/T-xxx/HANDOFF.md` | The living checkpoint | The agent on the task |
| `tasks/T-xxx/children/` | Child reports, filed by the parent | Parent agent |
| `templates/` | TASK, HANDOFF, decision memo, child report | Rarely changed |
| `ledger/` | Raw event logs, `<task>/events.jsonl` (gitignored) | Hooks only |

## Task states

Queued, Running, Blocked on you, In review, Done, Stalled. A Running task with no heartbeat for 20 minutes is Stalled.

## Raw logs (D-18)

Event logs and transcripts belong in the private repo `harsh-2711/wideaisle-ledger`. Until it exists, hooks write to `.agents/ledger/`, which git ignores. Once it exists:

```bash
git clone git@github.com:harsh-2711/wideaisle-ledger.git ../wideaisle-ledger
export WA_LEDGER_DIR="$PWD/../wideaisle-ledger"
```

## Board commands

```bash
npm run board -- list
npm run board -- new T-010 --title "Census crawler" --milestone M2 --lane data --branch claude/feat-census
npm run board -- set T-010 state=Running step="robots.txt check"
npm run board -- event T-010 step "crawler respects robots.txt"
npm run board -- stale --mark
npm run board -- digest
```

## Status board (D-19)

`board.json` is the source of truth. `scripts/agents/sync-board.mjs` mirrors it to a GitHub Project:

```bash
export GITHUB_TOKEN=...          # fine-grained token with Projects read and write
export WA_PROJECT_OWNER=harsh-2711
export WA_PROJECT_NUMBER=1       # from the Project URL
node scripts/agents/sync-board.mjs --dry-run
node scripts/agents/sync-board.mjs
```

The Project needs a single-select field "Status" with the six states above. Text fields "Step", "Agent" and "Heartbeat" are filled when they exist.
