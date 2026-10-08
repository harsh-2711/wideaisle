#!/usr/bin/env node
// PreToolUse guard for Bash. Blocks destructive git, pushes to main, secret
// reads and production deploys. It parses each command into words, so quoted
// text and heredoc bodies are data unless a shell runs them.
//
// Threat model: it stops an agent's mistakes. It is one layer of several
// (deny rules, CI, branch protection, reviews), not a sandbox against a
// determined attacker. When it cannot parse a command it blocks it.
// See .claude/README.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIMITS = { depth: 8, size: 100000 };
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);
const PROTECTED = /^(refs\/heads\/)?(main|master)$/;
const SECRET_NAME = /(TOKEN|SECRET|PASSW(OR)?D|CREDENTIAL|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|(^|_)KEY(_|$)|(^|_)PASS(_|$))/i;
const READERS = new Set([
  "cat", "tac", "less", "more", "head", "tail", "bat", "grep", "egrep", "fgrep", "rg", "ag", "sed", "awk",
  "cp", "scp", "rsync", "mv", "base64", "xxd", "od", "hexdump", "strings", "source", ".", "diff", "cmp",
  "nl", "sort", "uniq", "cut", "paste", "tr", "wc", "jq", "yq", "python", "python3", "node", "openssl",
]);
const PATTERN_FIRST = new Set(["grep", "egrep", "fgrep", "rg", "ag", "sed", "awk", "jq", "yq"]);
const RESERVED = new Set(["if", "then", "elif", "else", "fi", "do", "done", "while", "until", "for", "in", "case", "esac", "!", "time", "coproc", "select", "function", "{", "}"]);
const ENV_CANDIDATES = [".env", ".env.local", ".env.development", ".env.production", ".env.test", ".env.staging"];

class GuardError extends Error {}

function block(reason) {
  return { allow: false, reason };
}

// ---------- tokenizer ----------

function matchClose(src, start, open, close) {
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    const ch = src[j];
    if (ch === "\\") {
      j++;
      continue;
    }
    if (ch === "'") {
      const k = src.indexOf("'", j + 1);
      if (k < 0) return -1;
      j = k;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return j;
  }
  return -1;
}

function ansiC(s) {
  return s.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_, e) => {
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"' }[e] ?? e;
  });
}

// Splits a command into segments. Each segment has its words, the operator
// before it, its redirections, heredoc bodies and here-strings. Command and
// process substitutions are parsed too and returned as extra segments.
export function parse(cmd, depth = 0) {
  const src = String(cmd ?? "");
  if (depth > LIMITS.depth) throw new GuardError("commands nest too deep to check");
  if (src.length > LIMITS.size) throw new GuardError("command is too long to check");
  const segments = [];
  const extra = [];
  let words = [];
  let word = null;
  let quoted = false;
  // exp mirrors word, but single-quoted text has its $ hidden, since the
  // shell never expands it.
  let exp = null;
  let prevOp = null;
  const pending = []; // heredocs waiting for their body: { delim, seg }
  const segHeredocs = new Map();

  const pushWord = () => {
    if (word !== null) words.push({ text: word, quoted, exp: exp ?? word });
    word = null;
    exp = null;
    quoted = false;
  };
  const add = (text, expandable = text) => {
    word = (word ?? "") + text;
    exp = (exp ?? "") + expandable;
  };
  const endSegment = (op) => {
    pushWord();
    if (words.length) {
      const index = segments.length;
      segments.push({ words, prevOp, heredocs: segHeredocs.get(index) ?? [] });
      segHeredocs.set(index, segments[index].heredocs);
    }
    words = [];
    prevOp = op;
  };
  const sub = (inner) => {
    extra.push(...parse(inner, depth + 1));
    add("$SUB");
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);

    if (c === "$" && src[i + 1] === "'") {
      let j = i + 2;
      let s = "";
      while (j < src.length && src[j] !== "'") {
        if (src[j] === "\\" && j + 1 < src.length) {
          s += src[j] + src[j + 1];
          j += 2;
        } else s += src[j++];
      }
      if (j >= src.length) throw new GuardError("unclosed $' quote");
      add(ansiC(s), ansiC(s).replace(/\$/g, "\u0000"));
      quoted = true;
      i = j + 1;
      continue;
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw new GuardError("unclosed ' quote");
      add(src.slice(i + 1, j), src.slice(i + 1, j).replace(/\$/g, "\u0000"));
      quoted = true;
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\" && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
        } else if (src[j] === "$" && src[j + 1] === "(" && src[j + 2] !== "(") {
          const close = matchClose(src, j + 1, "(", ")");
          if (close < 0) throw new GuardError("unclosed $(");
          extra.push(...parse(src.slice(j + 2, close), depth + 1));
          s += "$SUB";
          j = close + 1;
        } else if (src[j] === "`") {
          const close = src.indexOf("`", j + 1);
          if (close < 0) throw new GuardError("unclosed backtick");
          extra.push(...parse(src.slice(j + 1, close), depth + 1));
          s += "$SUB";
          j = close + 1;
        } else s += src[j++];
      }
      if (j >= src.length) throw new GuardError('unclosed " quote');
      add(s);
      quoted = true;
      i = j + 1;
      continue;
    }
    if (c === "\\" && i + 1 < src.length) {
      if (src[i + 1] !== "\n") add(src[i + 1], src[i + 1] === "$" ? "\u0000" : src[i + 1]);
      i += 2;
      continue;
    }
    if (c === "#" && word === null) {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (src.startsWith("$((", i)) {
      const close = matchClose(src, i + 1, "(", ")");
      if (close < 0) throw new GuardError("unclosed $((");
      add("$ARITH");
      i = close + 1;
      continue;
    }
    if (two === "$(" || ((c === "<" || c === ">") && src[i + 1] === "(")) {
      const close = matchClose(src, i + 1, "(", ")");
      if (close < 0) throw new GuardError("unclosed substitution");
      sub(src.slice(i + 2, close));
      i = close + 1;
      continue;
    }
    if (c === "`") {
      const close = src.indexOf("`", i + 1);
      if (close < 0) throw new GuardError("unclosed backtick");
      sub(src.slice(i + 1, close));
      i = close + 1;
      continue;
    }
    if (src.startsWith("<<<", i)) {
      pushWord();
      words.push({ text: "<<<", redirect: true });
      i += 3;
      continue;
    }
    if (two === "<<") {
      pushWord();
      let j = i + 2;
      if (src[j] === "-") j++;
      while (src[j] === " " || src[j] === "\t") j++;
      const m = src.slice(j).match(/^(['"]?)([\w.-]+)\1/);
      if (!m) throw new GuardError("heredoc without a delimiter");
      pending.push({ delim: m[2], seg: segments.length });
      i = j + m[0].length;
      continue;
    }
    if (c === "\n") {
      endSegment("\n");
      i++;
      while (pending.length) {
        const h = pending.shift();
        const lines = [];
        let closed = false;
        while (i < src.length) {
          const nl = src.indexOf("\n", i);
          const line = src.slice(i, nl < 0 ? src.length : nl);
          i = nl < 0 ? src.length : nl + 1;
          if (line.replace(/^\t+/, "").trimEnd() === h.delim) {
            closed = true;
            break;
          }
          lines.push(line);
        }
        if (!closed) lines.push("");
        if (!segHeredocs.has(h.seg)) segHeredocs.set(h.seg, []);
        segHeredocs.get(h.seg).push(lines.join("\n"));
      }
      continue;
    }
    const redirect = src.slice(i).match(/^(\d*)(>>|>\||>&|<&|<>|>|<)|^&>>?/);
    if (redirect && (word === null || /^\d+$/.test(word))) {
      if (word !== null && /^\d+$/.test(word)) {
        word = null;
        exp = null;
      }
      pushWord();
      words.push({ text: redirect[0], redirect: true });
      i += redirect[0].length;
      continue;
    }
    if (["&&", "||", "|&", ";;"].includes(two)) {
      endSegment(two);
      i += 2;
      continue;
    }
    if (c === ";" || c === "|" || c === "&" || c === "(" || c === ")") {
      endSegment(c);
      i++;
      continue;
    }
    if (c === " " || c === "\t") {
      pushWord();
      i++;
      continue;
    }
    add(c);
    i++;
  }
  endSegment(null);
  if (pending.length) {
    for (const h of pending) {
      if (!segHeredocs.has(h.seg)) segHeredocs.set(h.seg, []);
    }
  }
  // Heredoc bodies arrive after their segment was created; attach them.
  segments.forEach((s, idx) => {
    s.heredocs = segHeredocs.get(idx) ?? s.heredocs;
  });
  return [...segments, ...extra];
}

// ---------- argv ----------

const WRAPPER_VALUE_FLAGS = {
  sudo: new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "--user", "--group", "--chdir"]),
  nice: new Set(["-n", "--adjustment"]),
  xargs: new Set(["-I", "-L", "-n", "-P", "-d", "-E", "-s", "-a", "--max-args", "--max-procs", "--delimiter", "--arg-file"]),
  timeout: new Set(["-s", "-k", "--signal", "--kill-after"]),
  exec: new Set(["-a"]),
  stdbuf: new Set(["-i", "-o", "-e"]),
  env: new Set(["-u", "-C", "--unset", "--chdir"]),
  ionice: new Set(["-c", "-n", "-p"]),
  chrt: new Set(["-p"]),
};

const base = (w) => String(w).replace(/^.*\//, "");

// The command's own words, without assignments, redirections, reserved
// words or wrappers such as sudo, env, xargs, timeout and nice. Returns
// { args, redirects, splitString } where splitString is env -S's command.
export function argv(seg) {
  const args = [];
  const redirects = [];
  const ws = seg.words;
  for (let k = 0; k < ws.length; k++) {
    if (ws[k].redirect) {
      const target = ws[k + 1];
      if (target) redirects.push({ op: ws[k].text, target: target.text });
      k++;
      continue;
    }
    args.push(ws[k].text);
  }
  let splitString = null;
  let changed = true;
  while (args.length && changed) {
    changed = false;
    if (/^HUSKY=0$/.test(args[0])) return { args: ["husky-off"], redirects };
    if (/^[A-Za-z_]\w*=/.test(args[0]) || RESERVED.has(args[0])) {
      args.shift();
      changed = true;
      continue;
    }
    const w = base(args[0]);
    if (w === "command" && args.some((a) => a === "-v" || a === "-V")) return { args: [], redirects };
    if (w === "env") {
      // env alone, or with only options and assignments, prints the environment.
      const rest = args.slice(1);
      let k = 0;
      while (k < rest.length && (rest[k].startsWith("-") || /^[A-Za-z_]\w*=/.test(rest[k]))) {
        k += WRAPPER_VALUE_FLAGS.env.has(rest[k]) || rest[k] === "-S" ? 2 : 1;
      }
      if (k >= rest.length && !rest.some((a) => a.startsWith("-S") || a.startsWith("--split-string"))) {
        if (rest.some((a) => /^HUSKY=0$/.test(a))) return { args: ["husky-off"], redirects };
        args[0] = "env";
        break;
      }
    }
    if (["sudo", "nohup", "command", "nice", "time", "exec", "xargs", "timeout", "stdbuf", "env", "ionice", "chrt", "doas", "caffeinate", "unbuffer"].includes(w)) {
      args.shift();
      const valueFlags = WRAPPER_VALUE_FLAGS[w] ?? new Set();
      while (args.length && (args[0].startsWith("-") || (w === "env" && /^[A-Za-z_]\w*=/.test(args[0])))) {
        if (/^HUSKY=0$/.test(args[0])) return { args: ["husky-off"], redirects };
        const f = args.shift();
        if (w === "env" && (f === "-S" || f.startsWith("--split-string"))) {
          splitString = f.includes("=") ? f.split("=").slice(1).join("=") : args.shift();
          continue;
        }
        if (w === "env" && f.startsWith("-S") && f.length > 2) {
          splitString = f.slice(2);
          continue;
        }
        if (valueFlags.has(f)) args.shift();
      }
      if (w === "timeout" && args.length && /^\d/.test(args[0])) args.shift();
      changed = true;
    }
  }
  if (args.length) args[0] = base(args[0]);
  return { args, redirects, splitString };
}

// Expands -xfd into -x -f -d. Long options keep their name only.
function flagSet(args) {
  const out = new Set();
  for (const a of args) {
    if (a === "--") break;
    if (a.startsWith("--")) out.add(a.split("=")[0]);
    else if (/^-[A-Za-z]+$/.test(a)) for (const ch of a.slice(1)) out.add("-" + ch);
  }
  return out;
}

// Positional words, skipping the values of options that take one.
function positionals(args, valueFlags = new Set()) {
  const out = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "--") {
      out.push(...args.slice(k + 1));
      break;
    }
    if (a.startsWith("-")) {
      if (valueFlags.has(a)) k++;
      continue;
    }
    out.push(a);
  }
  return out;
}

// ---------- git ----------

const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env", "--super-prefix"]);
const RISKY_CONFIG = /^(alias\.|core\.hookspath|core\.sshcommand|core\.fsmonitor|core\.editor|sequence\.editor|credential\.)/i;

function checkGit(args) {
  let k = 0;
  while (k < args.length && args[k].startsWith("-")) {
    const opt = args[k].split("=")[0];
    if (opt === "-c" || opt === "--config-env") {
      const value = args[k].includes("=") && opt !== "-c" ? args[k].split("=").slice(1).join("=") : args[k + 1] ?? "";
      if (RISKY_CONFIG.test(value)) return block("Git config overrides for aliases, hooks and editors are blocked.");
    }
    k += GIT_GLOBAL_WITH_VALUE.has(opt) && !args[k].includes("=") ? 2 : 1;
  }
  const sub = args[k];
  const rest = args.slice(k + 1);
  const f = flagSet(rest);
  switch (sub) {
    case "reset":
      if (f.has("--hard") || f.has("--merge") || f.has("--keep")) return block("git reset --hard throws away work. Commit a checkpoint or make a backup branch instead.");
      break;
    case "clean":
      if ((f.has("-f") || f.has("--force")) && !f.has("-n") && !f.has("--dry-run")) return block("git clean -f deletes untracked files for good. Remove specific files by name instead.");
      break;
    case "commit":
    case "merge":
    case "rebase":
    case "am":
    case "cherry-pick":
      if (f.has("--no-verify") || (sub === "commit" && f.has("-n"))) return block("Skipping hooks is not allowed. Fix what the hook reports.");
      break;
    case "push": {
      if (f.has("--no-verify")) return block("Skipping hooks is not allowed. Fix what the hook reports.");
      if (f.has("--mirror") || f.has("--delete") || f.has("-d") || f.has("--prune") || f.has("--all")) {
        return block("Mirror, all-branch and delete pushes are blocked.");
      }
      const valueFlags = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec", "--signed"]);
      const pos = positionals(rest, valueFlags);
      const hasRepo = rest.some((a) => a === "--repo" || a.startsWith("--repo="));
      const refspecs = hasRepo ? pos : pos.slice(1);
      if (f.has("-f") || f.has("--force") || refspecs.some((r) => r.startsWith("+"))) {
        return block("Force pushes are blocked. Use --force-with-lease, and only on your own claude/* branch.");
      }
      const dests = refspecs.map((r) => (r.includes(":") ? r.split(":").pop() : r));
      if (dests.some((d) => PROTECTED.test(d))) return block("Pushing to main is blocked. Every change reaches main through a pull request.");
      if ([...f].some((x) => x === "--force-with-lease" || x === "--force-if-includes")) {
        if (!dests.length || !dests.every((d) => /^(refs\/heads\/)?(claude|backup)\//.test(d))) {
          return block("--force-with-lease is allowed only on a named claude/* or backup/* branch.");
        }
      }
      break;
    }
    case "checkout": {
      if (f.has("-f") || f.has("--force") || f.has("--ours") || f.has("--theirs")) return block("A forced checkout overwrites local changes. Commit them first.");
      const dd = rest.indexOf("--");
      if (dd >= 0 && dd < rest.length - 1) return block("git checkout -- <path> overwrites local changes. Keep both sides.");
      if (positionals(rest, new Set(["-b", "-B", "--orphan"])).includes(".")) return block("git checkout . overwrites every local change.");
      break;
    }
    case "restore":
      if (!f.has("--staged") || f.has("--worktree") || f.has("-W")) return block("git restore overwrites local changes. Use --staged to unstage only.");
      break;
    case "switch":
      if (f.has("-f") || f.has("--force") || f.has("--discard-changes")) return block("A forced switch drops local changes.");
      break;
    case "stash":
      if (["drop", "clear"].includes(positionals(rest)[0])) return block("Dropping a stash loses work.");
      break;
    case "branch":
      if ((f.has("-D") || f.has("-d") || f.has("--delete") || f.has("-f") || f.has("--force") || f.has("-M") || f.has("-m")) && positionals(rest).some((b) => PROTECTED.test(b))) {
        return block("main is shared.");
      }
      break;
    case "update-ref":
      if (positionals(rest).some((r) => /refs\/heads\/(main|master)$/.test(r))) return block("Moving main by hand is blocked.");
      break;
    case "config": {
      const pos = positionals(rest, new Set(["--file", "-f", "--blob", "--type"]));
      const reading = f.has("--get") || f.has("--get-all") || f.has("--list") || f.has("-l") || f.has("--get-regexp") || (pos.length === 1 && !f.has("--unset"));
      if (!reading && pos.some((p) => RISKY_CONFIG.test(p))) return block("Setting git aliases, hooks or editors is blocked.");
      break;
    }
    case "filter-branch":
    case "filter-repo":
      return block("History rewrites are blocked.");
    default:
      break;
  }
  return null;
}

// ---------- rm and find ----------

// True when deleting p would take out the root, home, the project, an
// ancestor of the project, .git, or the ledger folders.
export function isDangerousPath(p, cwd = process.cwd(), project = process.env.CLAUDE_PROJECT_DIR || cwd) {
  const home = os.homedir();
  let t = String(p)
    .replace(/^~(?=\/|$)/, home)
    .replace(/\$\{?HOME\}?/g, home)
    .replace(/\$\{?PWD\}?/g, cwd);
  if (/\$/.test(t)) return true; // an unknown variable could be anything
  // A glob deletes what its folder holds; judge the folder.
  while (/(^|\/)[^/]*[*?[][^/]*\/?$/.test(t)) t = t.replace(/\/?[^/]*[*?[][^/]*\/?$/, "") || ".";
  const abs = path.resolve(cwd, t);
  const proj = path.resolve(project);
  if (abs === "/" || abs === home || abs === proj) return true;
  if (proj.startsWith(abs + path.sep)) return true;
  if (abs.split(path.sep).includes(".git")) return true;
  const rel = path.relative(proj, abs);
  if (!rel.startsWith("..") && /^(\.agents|\.claude)(\/|$)/.test(rel) && rel.split(path.sep).length <= 1) return true;
  return false;
}

function checkRm(args) {
  const f = flagSet(args);
  if (!(f.has("-r") || f.has("-R") || f.has("--recursive"))) return null;
  const bad = positionals(args).find((t) => isDangerousPath(t));
  return bad ? block(`Recursive delete of "${bad}" is blocked (root, home, the project, .git or the ledger).`) : null;
}

function checkFind(args, env, depth) {
  const start = [];
  for (const a of args) {
    if (a.startsWith("-") || a === "(" || a === "!") break;
    start.push(a);
  }
  if (args.includes("-delete") && (start.length === 0 || start.some((p) => isDangerousPath(p)))) {
    return block("find -delete on the repo, home or root is blocked. Delete specific paths instead.");
  }
  for (let k = 0; k < args.length; k++) {
    if (["-exec", "-execdir", "-ok", "-okdir"].includes(args[k])) {
      const cmd = [];
      for (k++; k < args.length && args[k] !== ";" && args[k] !== "+"; k++) cmd.push(args[k]);
      const r = checkArgs(cmd.map((t) => (t === "{}" ? "FILE" : t)), [], env, depth + 1, null);
      if (r) return r;
    }
  }
  return null;
}

// ---------- secrets ----------

function globToRegex(g) {
  return new RegExp("^" + g.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".").replace(/\[!/g, "[^") + "$");
}

export function isEnvFile(p) {
  const name = base(p);
  if (name === ".env.example") return false;
  if (/^\.env(\..+)?$/.test(name)) return true;
  if (/[*?[]/.test(name)) {
    try {
      const re = globToRegex(name);
      return ENV_CANDIDATES.some((c) => re.test(c));
    } catch {
      return true;
    }
  }
  return false;
}

function checkSecrets(cmd, args, redirects, words) {
  const rest = args.slice(1);
  const pos = positionals(rest, new Set(["-e", "-f", "--file", "--regexp", "-A", "-B", "-C", "-m", "--max-count", "-d", "-D", "--include", "--exclude", "-g", "--glob", "-t", "--type", "-n", "-c"].filter((x) => !(cmd === "cat" && (x === "-n")))));
  if (redirects.some((r) => /<|<>/.test(r.op) && !r.op.includes("<<") && isEnvFile(r.target))) {
    return block("Reading .env files is blocked. Use .env.example for variable names.");
  }
  if (READERS.has(cmd)) {
    let files = pos;
    if (PATTERN_FIRST.has(cmd) && !rest.some((a) => a === "-e" || a === "-f" || a.startsWith("--regexp"))) files = pos.slice(1);
    if (["cp", "scp", "rsync", "mv"].includes(cmd)) files = pos.slice(0, -1);
    if (files.some(isEnvFile)) return block("Reading .env files is blocked. Use .env.example for variable names.");
    if (files.some((p) => /\/proc\/[^/]+\/environ$/.test(p))) return block("Reading a process environment is blocked.");
  }
  if (cmd === "env" || cmd === "printenv") {
    const names = pos.filter((a) => !/^\w+=/.test(a));
    if (cmd === "env" && names.length === 0) return block("Dumping the environment can print secrets. Check one variable with: test -n \"$NAME\" && echo set");
    if (cmd === "printenv" && (names.length === 0 || names.some((n) => SECRET_NAME.test(n)))) {
      return block("Printing the environment or a secret is blocked. Check it is set with: test -n \"$NAME\" && echo set");
    }
  }
  if ((cmd === "set" && rest.filter((a) => !/^[-+]o$|^[-+][a-z]+$/.test(a)).length === 0 && !rest.some((a) => /^[-+]/.test(a))) ||
      (cmd === "export" && (rest.length === 0 || rest.includes("-p"))) ||
      ((cmd === "declare" || cmd === "typeset") && (rest.length === 0 || rest.includes("-p") || rest.every((a) => a.startsWith("-")))) ||
      (cmd === "compgen" && rest.includes("-v"))) {
    return block("Dumping the environment can print secrets.");
  }
  if ((cmd === "declare" || cmd === "typeset") && pos.some((n) => SECRET_NAME.test(n) && !n.includes("="))) {
    return block("Printing a secret is blocked.");
  }
  if (["echo", "printf", "print", "printenv", "logger"].includes(cmd)) {
    const raw = words.map((w) => w.exp ?? w.text).join(" ");
    const vars = [...raw.matchAll(/\$\{?!?([A-Za-z_]\w*)/g)].map((m) => m[1]);
    if (vars.some((v) => SECRET_NAME.test(v))) return block("Printing a secret is blocked. Check it is set with: test -n \"$NAME\" && echo set");
  }
  return null;
}

// ---------- deploys ----------

const RUNNERS = { npx: 0, bunx: 0, pnpx: 0 };

// Strips package runners (npx, pnpm dlx/exec, yarn dlx/exec, npm exec, bunx)
// and returns the command they run.
function unwrapRunner(args) {
  const [cmd, ...rest] = args;
  let tail = null;
  if (cmd in RUNNERS) tail = rest;
  else if (cmd === "pnpm" && ["dlx", "exec"].includes(rest[0])) tail = rest.slice(1);
  else if (cmd === "yarn" && ["dlx", "exec"].includes(rest[0])) tail = rest.slice(1);
  else if (cmd === "npm" && ["exec", "x"].includes(rest[0])) tail = rest.slice(1);
  if (!tail) return null;
  const valueFlags = new Set(["-p", "--package", "-c", "--call"]);
  let k = 0;
  while (k < tail.length && (tail[k].startsWith("-"))) {
    if (tail[k] === "--") {
      k++;
      break;
    }
    k += valueFlags.has(tail[k]) ? 2 : 1;
  }
  const out = tail.slice(k);
  if (!out.length) return null;
  let pkg = out[0].replace(/^(@[^/]+\/[^@]+|[^@]+)@.*$/, "$1");
  if (/^@shopify\/cli/.test(pkg)) pkg = "shopify";
  pkg = base(pkg.replace(/^@[^/]+\//, ""));
  return [pkg, ...out.slice(1)];
}

function checkDeploy(args, env) {
  if (env.WA_DEPLOY_APPROVED === "1") return null;
  const msg = "Production deploys are blocked for agents. They run in CI on a pull request the owner labels deploy-approved.";
  const [cmd, ...rest] = args;
  const pos = positionals(rest, new Set(["--path", "--config", "-c", "--store", "-s", "--theme", "-t", "--environment", "-e"]));
  const f = flagSet(rest);
  if (cmd === "shopify") {
    if (pos[0] === "app" && ["deploy", "release"].includes(pos[1])) return block(msg);
    if (pos[0] === "theme" && pos[1] === "publish") return block(msg);
    if (pos[0] === "theme" && pos[1] === "push" && (f.has("--live") || f.has("-l") || f.has("--allow-live") || f.has("-a"))) return block(msg);
  }
  if (["fly", "flyctl"].includes(cmd) && pos[0] === "deploy") return block(msg);
  if (cmd === "wrangler" && ["deploy", "publish"].includes(pos[0])) return block(msg);
  if (cmd === "vercel" && (f.has("--prod") || pos[0] === "deploy")) return block(msg);
  return null;
}

// npm/pnpm/yarn run <script>: the deploy script, and the "shopify" script
// that passes its arguments to the Shopify CLI.
function scriptCommand(args) {
  const [cmd, ...rest] = args;
  if (!["npm", "pnpm", "yarn", "bun"].includes(cmd)) return null;
  let k = 0;
  if (["run", "run-script", "rum", "urn"].includes(rest[0])) k = 1;
  else if (cmd === "npm") return null;
  while (k < rest.length && rest[k].startsWith("-")) k++;
  const script = rest[k];
  if (!script) return null;
  const tail = rest.slice(k + 1).filter((a) => a !== "--");
  if (/^deploy(:|$)/.test(script)) return { deploy: true };
  if (script === "shopify") return { args: ["shopify", ...tail] };
  return null;
}

// ---------- main check ----------

function checkArgs(args, redirects, env, depth, seg) {
  if (!args.length) return null;
  const cmd = args[0];
  const rest = args.slice(1);

  if (cmd === "husky-off") return block("HUSKY=0 skips the commit hooks. Fix what the hook reports.");
  const runner = unwrapRunner(args);
  if (runner) return checkArgs(runner, redirects, env, depth + 1, seg);
  const script = scriptCommand(args);
  if (script?.deploy && env.WA_DEPLOY_APPROVED !== "1") {
    return block("Production deploys are blocked for agents. They run in CI on a pull request the owner labels deploy-approved.");
  }
  if (script?.args) {
    const r = checkArgs(script.args, redirects, env, depth + 1, seg);
    if (r) return r;
  }

  if (SHELLS.has(cmd)) {
    const ci = rest.findIndex((a) => /^-\w*c\w*$/.test(a));
    if (ci >= 0) {
      if (rest[ci + 1] === undefined) return block("A shell -c with no command is blocked.");
      const r = checkCommand(rest[ci + 1], env, depth + 1);
      if (!r.allow) return r;
    } else if (seg) {
      const scriptFile = positionals(rest, new Set(["-o", "+o", "-O", "+O", "--rcfile", "--init-file"]))[0];
      for (const body of seg.heredocs) {
        const r = checkCommand(body, env, depth + 1);
        if (!r.allow) return r;
      }
      const hs = seg.words.findIndex((w) => w.redirect && w.text === "<<<");
      if (hs >= 0 && seg.words[hs + 1]) {
        const r = checkCommand(seg.words[hs + 1].text, env, depth + 1);
        if (!r.allow) return r;
      }
      if (!scriptFile && seg.pipedFrom) {
        const prev = argv(seg.pipedFrom).args;
        if (["echo", "printf"].includes(prev[0])) {
          const r = checkCommand(prev.slice(1).filter((a) => !a.startsWith("-")).join(" "), env, depth + 1);
          if (!r.allow) return r;
        } else {
          return block("Piping into a shell is blocked. Save the script to a file, read it, then run it.");
        }
      }
    }
  }
  if (cmd === "eval" || cmd === "source" && false) {
    const r = checkCommand(rest.join(" "), env, depth + 1);
    if (!r.allow) return r;
  }

  return (
    (cmd === "git" && checkGit(rest)) ||
    (cmd === "rm" && checkRm(rest)) ||
    (cmd === "find" && checkFind(rest, env, depth)) ||
    checkSecrets(cmd, args, redirects, seg?.words ?? args.map((t) => ({ text: t }))) ||
    checkDeploy(args, env) ||
    null
  );
}

export function checkCommand(command, env = process.env, depth = 0) {
  if (depth > LIMITS.depth) return block("Commands nest too deep to check. Split them up.");
  let segments;
  try {
    segments = parse(command, depth);
  } catch (err) {
    if (err instanceof GuardError) return block(`The guard could not parse this command (${err.message}). Split it into simpler commands.`);
    throw err;
  }
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    if (seg.prevOp === "|" || seg.prevOp === "|&") seg.pipedFrom = segments[k - 1];
    const { args, redirects, splitString } = argv(seg);
    if (splitString !== null && splitString !== undefined) {
      const r = checkCommand(splitString, env, depth + 1);
      if (!r.allow) return r;
    }
    const found = checkArgs(args, redirects, env, depth, seg);
    if (found) return found;
    if (args[0] === "env" && redirects.some((r) => />/.test(r.op))) return block("Dumping the environment is blocked.");
  }
  return { allow: true };
}

// ---------- hook entry ----------

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Blocked by .claude/hooks/guard.mjs: ${reason}`,
      },
    }),
  );
}

async function main() {
  let input;
  try {
    input = JSON.parse((await readStdin()) || "{}");
  } catch {
    return deny("the hook input was not valid JSON.");
  }
  if (input.tool_name !== "Bash") return;
  const res = checkCommand(input.tool_input?.command);
  if (!res.allow) deny(res.reason);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
if (invoked) {
  main().catch((err) => {
    // Fail closed: a bug in the guard blocks the command and says why.
    deny(`the guard hit an error (${err.message}). Simplify the command or report this.`);
  });
}
