#!/usr/bin/env node
// PreToolUse guard for Bash. Blocks destructive git, pushes to main, secret
// reads and production deploys. It parses the command into words, so quoted
// text and heredoc bodies are data unless a shell runs them. See .claude/README.md.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const SHELLS = new Set(["bash", "sh", "zsh", "dash"]);
const PROTECTED = /^(refs\/heads\/)?(main|master)$/;
const SECRET_NAME = /(^|_)(TOKEN|SECRET|SECRETS|PASSWORD|PASSWD|PASS|KEY|APIKEY|CREDENTIALS?)(_|$)/i;
const READERS = new Set(["cat", "less", "more", "head", "tail", "bat", "grep", "egrep", "rg", "sed", "awk", "cp", "scp", "base64", "xxd", "od", "strings", "source", ".", "diff", "nl", "sort", "uniq", "cut"]);
const PATTERN_FIRST = new Set(["grep", "egrep", "rg", "sed", "awk"]);
const OPERATORS = new Set([";", "&&", "||", "|", "&", "\n", "|&"]);

// Splits a command into segments of words. Handles quotes, escapes,
// operators, redirections and heredocs.
export function parse(cmd) {
  const src = String(cmd ?? "");
  const segments = [];
  let words = [];
  let word = null;
  let quoted = false;
  const heredocs = [];
  const push = () => {
    if (word !== null) words.push({ text: word, quoted });
    word = null;
    quoted = false;
  };
  const end = (op) => {
    push();
    if (words.length) segments.push({ words, op, heredocs: heredocs.splice(0) });
    words = [];
  };
  let i = 0;
  const pendingHeredocs = [];
  while (i < src.length) {
    const c = src[i];
    if (c === "'" ) {
      const j = src.indexOf("'", i + 1);
      word = (word ?? "") + src.slice(i + 1, j < 0 ? src.length : j);
      quoted = true;
      i = j < 0 ? src.length : j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\" && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
        } else s += src[j++];
      }
      word = (word ?? "") + s;
      quoted = true;
      i = j + 1;
      continue;
    }
    if (c === "\\" && i + 1 < src.length) {
      if (src[i + 1] === "\n") {
        i += 2;
        continue;
      }
      word = (word ?? "") + src[i + 1];
      i += 2;
      continue;
    }
    if (c === "#" && word === null) {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
      push();
      let j = i + 2;
      if (src[j] === "-") j++;
      while (src[j] === " " || src[j] === "\t") j++;
      const m = src.slice(j).match(/^(['"]?)([\w.-]+)\1/);
      if (m) {
        pendingHeredocs.push({ delim: m[2], target: () => heredocs });
        i = j + m[0].length;
        continue;
      }
    }
    if (c === "\n") {
      end("\n");
      i++;
      // Bodies of heredocs opened on the line that just ended.
      while (pendingHeredocs.length) {
        const h = pendingHeredocs.shift();
        const lines = [];
        while (i < src.length) {
          const nl = src.indexOf("\n", i);
          const line = src.slice(i, nl < 0 ? src.length : nl);
          i = nl < 0 ? src.length : nl + 1;
          if (line.trim() === h.delim) break;
          lines.push(line);
        }
        const seg = segments.at(-1);
        if (seg) seg.heredocs.push(lines.join("\n"));
      }
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["&&", "||", "|&"].includes(two)) {
      end(two);
      i += 2;
      continue;
    }
    if (c === ";" || c === "|" || c === "&") {
      if (c === "&" && (src[i - 1] === ">" || src[i + 1] === ">")) {
        word = (word ?? "") + c;
        i++;
        continue;
      }
      end(c);
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === "{" || c === "}") {
      if (word === null) {
        end(c);
        i++;
        continue;
      }
    }
    if (c === "`" || (c === "$" && src[i + 1] === "(")) {
      // Command substitution: check its contents as their own command.
      const close = c === "`" ? src.indexOf("`", i + 1) : matchParen(src, i + 1);
      const inner = src.slice(i + (c === "`" ? 1 : 2), close < 0 ? src.length : close);
      segments.push(...parse(inner));
      word = (word ?? "") + "$SUB";
      i = close < 0 ? src.length : close + 1;
      continue;
    }
    if (c === " " || c === "\t") {
      push();
      i++;
      continue;
    }
    word = (word ?? "") + c;
    i++;
  }
  end(null);
  return segments.filter((s) => !OPERATORS.has(s.words[0]?.text));
}

function matchParen(src, open) {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "(") depth++;
    else if (src[j] === ")" && --depth === 0) return j;
  }
  return -1;
}

const REDIRECT = /^(\d*>>?|\d*<|&>|>&|\d*>&\d*)$/;

// The words that make up the command itself: no env assignments, no
// redirections, no wrappers such as sudo, command, nice or /usr/bin/env.
function argv(words) {
  const out = [];
  let skipNext = false;
  for (const w of words) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (!w.quoted && REDIRECT.test(w.text)) {
      skipNext = true;
      continue;
    }
    if (!w.quoted && /^(\d*>>?|\d*<|&>)\S+/.test(w.text)) continue;
    out.push(w.text);
  }
  while (out.length) {
    if (/^\w+=/.test(out[0])) out.shift();
    else if (["sudo", "command", "nice", "nohup", "time", "exec", "xargs"].includes(out[0])) out.shift();
    else if (/(^|\/)env$/.test(out[0]) && out.length > 1 && (/^\w+=/.test(out[1]) || /^-/.test(out[1]))) {
      out.shift();
      while (out.length && (/^\w+=/.test(out[0]) || /^-/.test(out[0]))) out.shift();
    } else break;
  }
  if (out.length) out[0] = out[0].replace(/^.*\//, "");
  return out;
}

function hasRedirectOut(words) {
  return words.some((w) => !w.quoted && /^(\d*>>?|&>)/.test(w.text));
}

// Expands -xfd into -x -f -d. Long options stay as they are.
function flags(args) {
  const out = new Set();
  for (const a of args) {
    if (a === "--") break;
    if (a.startsWith("--")) out.add(a.split("=")[0]);
    else if (/^-[A-Za-z]+$/.test(a)) for (const ch of a.slice(1)) out.add("-" + ch);
  }
  return out;
}

const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);

function gitSub(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    i += GIT_GLOBAL_WITH_VALUE.has(args[i]) ? 2 : 1;
  }
  return { sub: args[i], rest: args.slice(i + 1) };
}

function block(reason) {
  return { allow: false, reason };
}

function checkGit(args) {
  const { sub, rest } = gitSub(args);
  const f = flags(rest);
  const positional = rest.filter((a) => !a.startsWith("-"));
  switch (sub) {
    case "reset":
      if (f.has("--hard")) return block("git reset --hard throws away work. Commit a checkpoint or make a backup branch instead.");
      break;
    case "clean":
      if (f.has("-f") || f.has("--force")) return block("git clean -f deletes untracked files for good. Remove specific files by name instead.");
      break;
    case "commit":
    case "merge":
    case "rebase":
    case "am":
      if (f.has("--no-verify") || (sub === "commit" && f.has("-n"))) return block("Skipping hooks is not allowed. Fix what the hook reports.");
      break;
    case "push": {
      if (f.has("--no-verify")) return block("Skipping hooks is not allowed. Fix what the hook reports.");
      if (f.has("--mirror") || f.has("--delete") || f.has("-d")) return block("Mirror pushes and remote deletes are blocked.");
      const refspecs = positional.slice(1);
      if (f.has("-f") || f.has("--force") || refspecs.some((r) => r.startsWith("+"))) {
        return block("Force pushes are blocked. Use --force-with-lease, and only on your own claude/* branch.");
      }
      const dests = refspecs.map((r) => (r.includes(":") ? r.split(":").pop() : r));
      if (dests.some((d) => PROTECTED.test(d))) return block("Pushing to main is blocked. Every change reaches main through a pull request.");
      if ([...f].some((x) => x.startsWith("--force-with-lease") || x === "--force-if-includes")) {
        if (!dests.length || !dests.every((d) => /^(refs\/heads\/)?(claude|backup)\//.test(d))) {
          return block("--force-with-lease is allowed only on a named claude/* or backup/* branch.");
        }
      }
      break;
    }
    case "checkout":
      if (f.has("-f") || f.has("--force")) return block("A forced checkout overwrites local changes. Commit them first.");
      if (rest.includes("--") && rest.indexOf("--") < rest.length - 1) return block("git checkout -- <path> overwrites local changes. Keep both sides.");
      if (positional.includes(".")) return block("git checkout . overwrites every local change.");
      break;
    case "restore":
      if (!f.has("--staged") || f.has("--worktree") || f.has("-W")) return block("git restore overwrites local changes. Use --staged to unstage only.");
      break;
    case "switch":
      if (f.has("-f") || f.has("--force") || f.has("--discard-changes")) return block("A forced switch drops local changes.");
      break;
    case "stash":
      if (["drop", "clear"].includes(positional[0])) return block("Dropping a stash loses work.");
      break;
    case "branch":
      if ((f.has("-D") || f.has("-d") || f.has("--delete")) && positional.some((b) => PROTECTED.test(b))) return block("main is shared.");
      break;
    case "update-ref":
      if (positional.some((r) => /refs\/heads\/(main|master)$/.test(r))) return block("Moving main by hand is blocked.");
      break;
    default:
      break;
  }
  return null;
}

const DANGEROUS_RM = /^(\/|\/\*|~|~\/|~\/\*|\$HOME|\$\{HOME\}|\$HOME\/\*?|\.|\.\/|\.\/\*|\*|\.\.|\.\.\/|\.git|\.git\/.*|.*\/\.git\/?)$/;

function checkRm(args) {
  const f = flags(args);
  if (!(f.has("-r") || f.has("-R") || f.has("--recursive"))) return null;
  const targets = args.filter((a) => !a.startsWith("-"));
  const bad = targets.find((t) => DANGEROUS_RM.test(t));
  return bad ? block(`Recursive delete of "${bad}" is blocked (root, home, the repo or .git).`) : null;
}

function isEnvFile(p) {
  const base = String(p).replace(/^.*\//, "");
  return /^\.env(\..+)?$/.test(base) && base !== ".env.example";
}

function checkSecrets(cmd, args, words) {
  const positional = args.filter((a) => !a.startsWith("-"));
  if (READERS.has(cmd)) {
    let files = positional;
    if (PATTERN_FIRST.has(cmd)) files = positional.slice(1);
    if (cmd === "cp" || cmd === "scp") files = positional.slice(0, -1);
    if (files.some(isEnvFile)) return block("Reading .env files is blocked. Use .env.example for variable names.");
    if (files.some((p) => /\/proc\/[^/]+\/environ$/.test(p))) return block("Reading a process environment is blocked.");
  }
  if (cmd === "env" || cmd === "printenv") {
    const names = positional.filter((a) => !/^\w+=/.test(a));
    if (cmd === "env" && names.length === 0) return block("Dumping the environment can print secrets. Check one variable with: test -n \"$NAME\" && echo set");
    if (cmd === "printenv" && (names.length === 0 || names.some((n) => SECRET_NAME.test(n)))) {
      return block("Printing the environment or a secret is blocked. Check it is set with: test -n \"$NAME\" && echo set");
    }
  }
  if ((cmd === "set" && args.length === 1) || (cmd === "export" && (args.includes("-p") || args.length === 1)) || cmd === "declare" && args.includes("-x")) {
    return block("Dumping the environment can print secrets.");
  }
  if (["echo", "printf", "print"].includes(cmd)) {
    const raw = words.map((w) => w.text).join(" ");
    const vars = [...raw.matchAll(/\$\{?([A-Za-z_]\w*)/g)].map((m) => m[1]);
    if (vars.some((v) => SECRET_NAME.test(v))) return block("Printing a secret is blocked. Check it is set with: test -n \"$NAME\" && echo set");
  }
  return null;
}

function checkDeploy(cmd, args, env) {
  if (env.WA_DEPLOY_APPROVED === "1") return null;
  const a = args.slice(1);
  const f = flags(a);
  const msg = "Production deploys are blocked for agents. They run from CI on a pull request the owner labels deploy-approved.";
  if (cmd === "shopify" || (cmd === "npx" && /^@?shopify/.test(a[0] ?? ""))) {
    const words = cmd === "npx" ? a.slice(1) : a;
    if (words[0] === "app" && ["deploy", "release"].includes(words[1])) return block(msg);
    if (words[0] === "theme" && words[1] === "publish") return block(msg);
    if (words[0] === "theme" && words[1] === "push" && (f.has("--live") || f.has("-l") || f.has("--allow-live") || f.has("-a"))) return block(msg);
  }
  if (["npm", "pnpm", "yarn"].includes(cmd)) {
    const i = a[0] === "run" || a[0] === "run-script" ? 1 : 0;
    if (a[i] === "deploy" && (i === 1 || cmd !== "npm")) return block(msg);
  }
  if (["fly", "flyctl"].includes(cmd) && a[0] === "deploy") return block(msg);
  if (cmd === "wrangler" && ["deploy", "publish"].includes(a[0])) return block(msg);
  return null;
}

export function checkCommand(command, env = process.env, depth = 0) {
  if (depth > 5) return block("Command nesting is too deep to check.");
  for (const seg of parse(command)) {
    const args = argv(seg.words);
    if (!args.length) continue;
    const cmd = args[0];
    const rest = args.slice(1);

    // A shell running a string, a heredoc or stdin: check what it runs.
    if (SHELLS.has(cmd)) {
      const ci = rest.findIndex((a) => /^-\w*c\w*$/.test(a));
      if (ci >= 0 && rest[ci + 1] !== undefined) {
        const r = checkCommand(rest[ci + 1], env, depth + 1);
        if (!r.allow) return r;
      }
      for (const body of seg.heredocs) {
        const r = checkCommand(body, env, depth + 1);
        if (!r.allow) return r;
      }
    }
    if (cmd === "eval") {
      const r = checkCommand(rest.join(" "), env, depth + 1);
      if (!r.allow) return r;
    }

    const found =
      (cmd === "git" && checkGit(rest)) ||
      (cmd === "rm" && checkRm(rest)) ||
      checkSecrets(cmd, args, seg.words) ||
      checkDeploy(cmd, args, env) ||
      (cmd === "env" && hasRedirectOut(seg.words) ? block("Dumping the environment is blocked.") : null);
    if (found) return found;
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

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
if (invoked) {
  main().catch((err) => {
    // Fail open on a bug in the guard itself, but say so.
    process.stderr.write(`guard hook error: ${err.message}\n`);
  });
}
