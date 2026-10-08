# Claude Code setup

Everything here loads when Claude Code opens the repo. The owner accepts the plugins and MCP servers once, on the first run.

| Path | What it does |
|---|---|
| `settings.json` | Hooks, allow and deny rules, plugins |
| `hooks/guard.mjs` | PreToolUse: blocks destructive git, secret reads and unapproved production deploys |
| `hooks/ledger-hook.mjs` | Writes the run ledger on every hook event (see below) |
| `agents/` | One subagent per role: planner, lane-lead, researcher, data, architect, builder, reviewer, qa, growth, ops |
| `skills/` | Our own skills, added later |
| `../.mcp.json` | Playwright and axe-core MCP servers |

## Hooks

| Event | What happens |
|---|---|
| SessionStart (startup, resume, clear) | Loads TASK.md, HANDOFF.md and the last 50 events into context; marks the task Running |
| SessionStart (compact) | Re-injects a short checkpoint: goal, current step, next steps, blockers |
| PreCompact | Archives the transcript and logs a compact event |
| PreToolUse (Bash) | guard.mjs blocks the commands listed below |
| PostToolUse, PostToolUseFailure | One event per tool call, secrets redacted; this is the heartbeat |
| SubagentStart, SubagentStop | Logs each child and files its final message in the task's children/ folder |
| Stop | Blocks ending the turn while there is uncommitted work, or work committed after the last HANDOFF.md commit |
| Notification | Logs it and moves the task to Blocked on you when Claude waits for input |
| SessionEnd | Archives the final transcript and records the end state |

The active task is the one whose `branch` matches the checked-out branch, or `WA_TASK=T-xxx`. With no task, events go to `T-000` and Stop never blocks. Set `WA_HOOKS_STRICT=0` to turn the Stop check off for a session.

## What the guard blocks

- Destructive git: hard resets, forced cleans, force pushes (except `--force-with-lease` on a named `claude/*` or `backup/*` branch), skipping hooks with `--no-verify`, checking out or restoring files over local changes, dropping stashes, deleting main.
- Recursive deletes of the root, home, the repo or `.git`.
- Secrets: reading `.env` files, dumping the environment, printing a variable whose name holds TOKEN, SECRET, KEY or PASSWORD.
- Production deploys (`shopify app deploy`, `shopify theme publish`, a live theme push, `npm run deploy`) unless `WA_DEPLOY_APPROVED=1`, which only CI sets for a pull request labelled `deploy-approved`.

Heredoc bodies and quoted text (commit messages, file contents) are not treated as commands. Text run through `bash -c` or `eval` still is.

## Plugins

Official: code-review, feature-dev, commit-commands, security-guidance, typescript-lsp, frontend-design, skill-creator. Shopify AI Toolkit (`shopify-plugin`): the Dev MCP server plus docs, GraphQL and Liquid validation. anthropics/skills (`example-skills`): webapp-testing, mcp-builder and others. Third-party marketplaces are not reviewed by Anthropic; the ops agent checks a plugin before it is added.

## Tests

```bash
npm run test:agents
```
