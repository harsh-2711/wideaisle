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
| Stop | Blocks ending the turn while there is uncommitted work, or work committed after the last HANDOFF.md commit. Gives up after three blocks in a row, so it never loops |
| Notification | Logs it and moves the task to Blocked on you when Claude waits for input |
| SessionEnd | Archives the final transcript and records the end state |

The active task is the one whose `branch` matches the checked-out branch, or `WA_TASK=T-xxx`. With no task, events go to `T-000` and Stop never blocks. Set `WA_HOOKS_STRICT=0` to turn the Stop check off for a session.

## What the guard blocks

- Skipping hooks: `--no-verify`, `HUSKY=0`, and git config overrides for aliases, hooks and editors.
- Destructive git: hard resets, forced cleans (a `-n` dry run is fine), force pushes (except `--force-with-lease` on a named `claude/*` or `backup/*` branch), skipping hooks with `--no-verify`, checking out or restoring files over local changes, dropping stashes, deleting main.
- Recursive deletes (`rm -r`, `find -delete`) of the root, home, the project or an ancestor of it, `.git`, `.agents` or `.claude`. Targets are resolved as paths, so `./.` and `foo/..` count.
- Piping into a shell (`curl ... | sh`). Save the script, read it, then run it.
- Secrets: reading `.env` files, dumping the environment, printing a variable whose name holds TOKEN, SECRET, KEY or PASSWORD.
- Pushes to main, so every change goes through a pull request.
- Production deploys (`shopify app deploy`, `shopify theme publish`, a live theme push, `npm run deploy`). Agents never deploy. Deploys run in CI, outside Claude Code, on a pull request the owner labels `deploy-approved`.

The guard stops an agent's mistakes. It is one layer with the deny rules, CI, branch protection and reviews, not a sandbox against a determined attacker. When it cannot parse a command, or hits an error, it blocks the command and says why.

The guard parses each command into words. Quoted text and heredoc bodies (commit messages, file contents) are data. Text that a shell runs (`bash -c`, `eval`, a heredoc fed to `bash`, `$(...)`) is checked as a command.

## Plugins

Official: code-review, feature-dev, commit-commands, security-guidance, typescript-lsp, frontend-design, skill-creator. Shopify AI Toolkit (`shopify-plugin`): the Dev MCP server plus docs, GraphQL and Liquid validation. anthropics/skills (`example-skills`): webapp-testing, mcp-builder and others. Third-party marketplaces are not reviewed by Anthropic; the ops agent checks a plugin before it is added.

## Tests

```bash
npm run test:agents
```
