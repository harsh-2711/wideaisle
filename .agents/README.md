# Run ledger

This folder is the project's metadata: what every agent is doing, what it did, and what waits on the owner. Hooks write most of it. Agents read it before any task (see AGENTS.md).

| Path | What it holds | Who writes it |
|---|---|---|
| `tasks/T-xxx/status.json` | One task's state: title, milestone, lane, agent, state, step, branch, issue, needs | Hooks and `npm run board` on that task's branch |
| `tasks/T-xxx/TASK.md` | Goal, exit criteria, issue, decisions used | Planner |
| `tasks/T-xxx/HANDOFF.md` | The living checkpoint | The agent on the task |
| `tasks/T-xxx/children/` | Child reports, filed by the parent | Parent agent |
| `milestones.md` | M0 to M8 exit criteria and the gates | Planner, with evidence |
| `owner-queue.md` | Everything that waits on the owner, and what each item unblocks | Planner |
| `templates/` | TASK, HANDOFF, decision memo, child report | Rarely changed |
| `board.json` | Generated view of every status.json, one line per task (gitignored) | `npm run board -- build` |
| `ledger/` | Raw event logs, `<task>/events.jsonl` (gitignored) | Hooks only |

Each task's state lives in its own file, so parallel branches never edit the same lines. Events with no active task go to `T-000`.

## Task states

Queued, Running, Blocked on you, In review, Done, Stalled.

The heartbeat is the last write to a task's event log or status file. A Running task with no heartbeat for 20 minutes is Stalled: `npm run board -- stale --mark`. Until the project server exists, the SessionStart hook runs this check.

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
npm run board -- build      # writes .agents/board.json
```

`set` also logs a step event, so the heartbeat moves with it. Repeat a flag to pass more than one value: `--exit "a" --exit "b"`.

## Status board (D-19)

The task folders are the source of truth. `scripts/agents/sync-board.mjs` mirrors them to a GitHub Project:

```bash
export WA_PROJECT_TOKEN=...      # classic token with the "project" scope
export WA_PROJECT_OWNER=harsh-2711
export WA_PROJECT_NUMBER=1       # from the Project URL
node scripts/agents/sync-board.mjs --dry-run
node scripts/agents/sync-board.mjs
```

The Project needs a single-select field "Status" with the six states above. Text fields "Step", "Agent" and "Heartbeat" are filled when they exist.
