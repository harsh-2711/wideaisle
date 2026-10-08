#!/usr/bin/env node
// PreToolUse guard for Bash. Blocks destructive git commands, secret reads
// and production deploys that lack approval. See .claude/README.md.
import { fileURLToPath } from "node:url";

const RULES = [
  { re: /\bgit\s+reset\b[^|;&]*--hard\b/, why: "git reset --hard throws away work. Commit a checkpoint or make a backup branch instead." },
  { re: /\bgit\s+clean\b[^|;&]*\s-\w*f/, why: "git clean -f deletes untracked files for good. Remove specific files by name instead." },
  { re: /\bgit\s+(commit|push|merge)\b[^|;&]*\s(--no-verify|-n)\b/, why: "Skipping hooks is not allowed. Fix what the hook reports." },
  { re: /\bgit\s+checkout\b[^|;&]*\s(-f|--force)\b/, why: "A forced checkout overwrites local changes. Commit or stash them first." },
  { re: /\bgit\s+checkout\s+(\S+\s+)?--\s+\S/, why: "git checkout -- <path> overwrites someone's changes. Ask the task owner, or keep both sides." },
  { re: /\bgit\s+checkout\s+\.(\s|$)/, why: "git checkout . overwrites every local change." },
  { re: /\bgit\s+restore\b(?![^|;&]*--staged)[^|;&]*\s\S/, why: "git restore overwrites local changes. Use --staged to unstage only." },
  { re: /\bgit\s+switch\b[^|;&]*\s(-f|--force|--discard-changes)\b/, why: "A forced switch drops local changes." },
  { re: /\bgit\s+stash\s+(drop|clear)\b/, why: "Dropping a stash loses work." },
  { re: /\bgit\s+branch\s+(-D|-d|--delete)\s+(main|master)\b/, why: "main is shared." },
  { re: /\brm\s+-\w*r\w*\s+(-\w+\s+)*(\/|~|\$HOME|\.|\.\/|\*|\.git)(\s|$)/, why: "Recursive delete of the root, home, repo or .git is blocked." },
  { raw: true, re: /\b(cat|less|more|head|tail|bat|grep|rg|sed|awk|cp|scp|base64|xxd)\b[^|;&]*(^|[\s/'"])\.env(?!\.example)(\.\w+)?\b/, why: "Reading .env files is blocked. Use .env.example for variable names." },
  { raw: true, re: /(^|[;&|]\s*)(env|printenv|set|export\s+-p)\s*($|[;&|])/, why: "Dumping the environment can print secrets. Check one variable with: test -n \"$NAME\" && echo set" },
  { raw: true, re: /\b(echo|printf|printenv)\b[^|;&]*\$\{?\w*(TOKEN|SECRET|KEY|PASSWORD|PASS)\w*/i, why: "Printing a secret is blocked. Check it is set with: test -n \"$NAME\" && echo set" },
];

const DEPLOYS = [
  /\bshopify\s+app\s+deploy\b/,
  /\bshopify\s+app\s+release\b/,
  /\bshopify\s+theme\s+publish\b/,
  /\bshopify\s+theme\s+push\b[^|;&]*(--live|--allow-live|\s-l\b|\s-a\b)/,
  /\bnpm\s+run\s+deploy\b/,
  /\b(fly|flyctl)\s+deploy\b/,
  /\bwrangler\s+(deploy|publish)\b/,
];

function forcePush(cmd) {
  const m = cmd.match(/\bgit\s+push\b([^|;&]*)/);
  if (!m) return null;
  const args = m[1];
  const plainForce = /\s(--force|-f)(\s|$)/.test(args) || /\s\+\S+/.test(args);
  const lease = /\s--force-with-lease\b/.test(args) || /\s--force-if-includes\b/.test(args);
  if (plainForce) return "Force pushes are blocked. Use --force-with-lease, and only on your own claude/* branch.";
  if (lease && !/\s(origin\s+)?(claude|backup)\/\S+/.test(args)) {
    return "--force-with-lease is allowed only on a named claude/* or backup/* branch.";
  }
  return null;
}

// Text that is data, not a command: heredoc bodies and quoted strings (commit
// messages, echo text, file contents). Quotes are kept when the command runs
// a string as code (bash -c, sh -c, eval), so the guard still sees inside it.
export function withoutHeredocs(cmd) {
  return String(cmd ?? "").replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "<<HEREDOC");
}

export function commandText(cmd) {
  let text = withoutHeredocs(cmd);
  if (!/\b(bash|sh|zsh)\s+-\w*c\b|\beval\b/.test(text)) {
    text = text.replace(/'[^']*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');
  }
  return text;
}

export function checkCommand(cmd, env = process.env) {
  const text = commandText(cmd);
  // Secret rules look inside double quotes too, where variables expand.
  const raw = withoutHeredocs(cmd);
  for (const r of RULES) if (r.re.test(r.raw ? raw : text)) return { allow: false, reason: r.why };
  const fp = forcePush(text);
  if (fp) return { allow: false, reason: fp };
  if (DEPLOYS.some((re) => re.test(text)) && env.WA_DEPLOY_APPROVED !== "1") {
    return { allow: false, reason: "Production deploys need the owner's approval: a pull request labelled deploy-approved, run from CI." };
  }
  return { allow: true };
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  let input = {};
  try {
    input = JSON.parse((await readStdin()) || "{}");
  } catch {
    return;
  }
  if (input.tool_name !== "Bash") return;
  const res = checkCommand(input.tool_input?.command);
  if (res.allow) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Blocked by .claude/hooks/guard.mjs: ${res.reason}`,
      },
    }),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    // Fail open on a bug in the guard itself, but say so.
    process.stderr.write(`guard hook error: ${err.message}\n`);
  });
}
