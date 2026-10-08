#!/usr/bin/env node
// One entry point for every ledger hook. Claude Code passes the event as
// JSON on stdin; settings.json names the event as the first argument.
// A bug here must never stop an agent, so every handler fails open, except
// Stop, which blocks on purpose until the work is checkpointed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  appendEvent, currentTask, lastEvents, NO_TASK, now, paths, repoRoot, staleTasks, upsertTask,
} from "../../scripts/agents/ledger.mjs";

const SECRET = /((?:token|secret|password|passwd|pass|api[_-]?key|authorization|auth)["']?\s*[:=]\s*["']?)[^\s"']+/gi;
const FLAG_SECRET = /(--?(?:password|passwd|pass|token|secret|api-key|apikey|auth)[ =])\S+/gi;
const BEARER = /\b(Bearer|Basic|token)\s+[\w.~+/=-]{6,}/gi;
const URL_USERINFO = /(\b[a-z][\w+.-]*:\/\/)[^\s/@]+@/gi;
const LONG_TOKEN = /\b(sk-[\w-]{10,}|sk_(live|test)_\w{10,}|gh[opsur]_\w{20,}|github_pat_\w{20,}|shp\w{2,3}_\w{16,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})/g;

export function redact(text) {
  return String(text ?? "")
    .replace(URL_USERINFO, "$1[redacted]@")
    .replace(BEARER, "$1 [redacted]")
    .replace(FLAG_SECRET, "$1[redacted]")
    .replace(SECRET, "$1[redacted]")
    .replace(LONG_TOKEN, "[redacted]");
}

function short(text, n = 200) {
  const t = redact(text).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

// Turns one PostToolUse or PostToolUseFailure input into a ledger event.
export function toolEvent(input, failed = false) {
  const name = input.tool_name ?? "tool";
  const ti = input.tool_input ?? {};
  const refs = { tool: name };
  if (failed) {
    return { event: "error", summary: short(`${name} failed: ${input.error ?? ""} ${ti.command ?? ti.file_path ?? ""}`), refs };
  }
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(name)) {
    const file = ti.file_path ?? ti.notebook_path ?? "";
    refs.files = [file];
    return { event: "edit", summary: short(`${name} ${file}`), refs };
  }
  if (name === "Bash") {
    const cmd = String(ti.command ?? "");
    refs.command = short(cmd, 300);
    if (/\bgit\s+commit\b/.test(cmd)) return { event: "commit", summary: short(cmd), refs };
    if (/\b(npm\s+(run\s+)?test|vitest|node\s+--test|playwright\s+test|npm\s+run\s+test:\w+)\b/.test(cmd)) {
      const out = input.tool_response ?? {};
      refs.result = out.interrupted ? "interrupted" : out.exitCode ?? out.exit_code ?? null;
      return { event: "test", summary: short(cmd), refs };
    }
    return { event: "tool", summary: short(cmd), refs };
  }
  const target = ti.file_path ?? ti.path ?? ti.pattern ?? ti.url ?? ti.description ?? "";
  return { event: "tool", summary: short(`${name} ${target}`), refs };
}

function section(md, heading) {
  const re = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m");
  return (md.match(re)?.[1] ?? "").trim();
}

function taskDir(id, root) {
  return path.join(paths(root).tasks, id);
}

function readMaybe(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// Text Claude Code adds to the context at session start.
export function startContext(task, source, root) {
  if (!task) {
    const stale = staleTasks(root);
    return [
      "Wide Aisle: no task is mapped to this branch. Run `npm run board -- list`, then check out the task's branch or set WA_TASK.",
      stale.length ? `Stale tasks (no heartbeat for 20 minutes): ${stale.map((t) => t.id).join(", ")}.` : "",
    ].filter(Boolean).join("\n");
  }
  const dir = taskDir(task.id, root);
  const handoff = readMaybe(path.join(dir, "HANDOFF.md"));
  if (source === "compact") {
    const goal = section(readMaybe(path.join(dir, "TASK.md")), "Goal");
    return [
      `Checkpoint for ${task.id} ${task.title} (re-injected after compaction).`,
      `Goal: ${goal || "see TASK.md"}`,
      `Current step: ${section(handoff, "Current step") || task.step || "not recorded"}`,
      `Next steps:\n${section(handoff, "Next three steps") || "see HANDOFF.md"}`,
      `Blockers:\n${section(handoff, "Blockers and open questions") || "none recorded"}`,
      `Full detail: .agents/tasks/${task.id}/HANDOFF.md`,
    ].join("\n");
  }
  const events = lastEvents(task.id, 50, root)
    .map((e) => `${e.ts} ${e.event} ${e.summary}`)
    .join("\n");
  return [
    `You are on task ${task.id}: ${task.title}. Branch ${task.branch || "(not set)"}. State ${task.state}.`,
    "--- TASK.md ---",
    readMaybe(path.join(dir, "TASK.md")).trim(),
    "--- HANDOFF.md ---",
    handoff.trim(),
    "--- Last events ---",
    events || "(none)",
  ].join("\n");
}

function git(args, root) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

// Facts the Stop check needs, gathered from git.
export function stopFacts(task, root) {
  const handoff = `.agents/tasks/${task.id}/HANDOFF.md`;
  const status = `.agents/tasks/${task.id}/status.json`;
  const dirty = git(["status", "--porcelain", "--untracked-files=all"], root)
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3))
    .filter((f) => !/^\.agents\/tasks\/[^/]+\/status\.json$/.test(f));
  let base = "";
  for (const ref of ["origin/main", "main"]) {
    try {
      base = git(["merge-base", "HEAD", ref], root);
      break;
    } catch {}
  }
  const range = base ? `${base}..HEAD` : "HEAD";
  const log = (r, ...pathspec) => {
    try {
      return git(["log", "--format=%H", r, "--", ...pathspec], root).split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  const work = [".", `:(exclude)${handoff}`, `:(exclude)${status}`];
  // Commit order, not timestamps: two commits in the same second would tie.
  const lastHandoff = log(range, handoff)[0];
  const workAfterHandoff = lastHandoff ? log(`${lastHandoff}..HEAD`, ...work).length : log(range, ...work).length;
  return { dirty, workAfterHandoff };
}

export const MAX_STOP_BLOCKS = 3;

// Decides whether the agent may end its turn. Claude Code sets
// stop_hook_active after a block, so that flag alone would let the second
// stop through with HANDOFF.md still stale. Instead the hook counts its own
// consecutive blocks and gives up only after MAX_STOP_BLOCKS, so it can
// never trap an agent in a loop.
export function stopDecision(task, facts, priorBlocks = 0) {
  if (!task || task.id === NO_TASK || task.state === "Done") return { block: false };
  const needs = [];
  if (facts.dirty.length) {
    needs.push(`commit a checkpoint (${facts.dirty.length} uncommitted files, for example ${facts.dirty[0]}) with chore(checkpoint): what is done, what is next, Refs: ${task.id}`);
  }
  if (facts.dirty.length || facts.workAfterHandoff > 0) {
    needs.push(`update .agents/tasks/${task.id}/HANDOFF.md (status, done so far with SHAs, current step, next three steps, blockers) and commit it`);
  }
  if (!needs.length) return { block: false };
  if (priorBlocks >= MAX_STOP_BLOCKS) return { block: false, gaveUp: true, reason: needs.join("; then ") };
  return { block: true, reason: `Before stopping: ${needs.join("; then ")}.` };
}

// Consecutive blocks in this session since the last allowed stop.
function priorStopBlocks(taskId, session, root) {
  let n = 0;
  for (const e of lastEvents(taskId, 200, root).reverse()) {
    if (e.event !== "stop" || (session && e.session !== session)) continue;
    if (!e.summary.startsWith("stop blocked")) break;
    n++;
  }
  return n;
}

function archiveTranscript(src, taskId, session, root) {
  if (!src || !fs.existsSync(src)) return null;
  const dir = path.join(paths(root).ledger, taskId, "transcripts");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${session ?? "session"}-${now().replace(/[:]/g, "")}.jsonl.gz`);
  fs.writeFileSync(out, zlib.gzipSync(fs.readFileSync(src)));
  return out;
}

function lastAssistantText(transcript) {
  if (!transcript || !fs.existsSync(transcript)) return "";
  const lines = fs.readFileSync(transcript, "utf8").trim().split("\n").reverse();
  for (const line of lines) {
    try {
      const m = JSON.parse(line).message;
      if (m?.role !== "assistant") continue;
      const text = Array.isArray(m.content) ? m.content.filter((c) => c.type === "text").map((c) => c.text).join("\n") : String(m.content ?? "");
      if (text.trim()) return text.trim();
    } catch {}
  }
  return "";
}

// Files the child's last message as its report, so the parent always has one.
function fileChildReport(task, input, root) {
  const text = input.last_assistant_message ?? lastAssistantText(input.agent_transcript_path);
  const name = `${now().slice(0, 10)}-${input.agent_type ?? "agent"}-${String(input.agent_id ?? "x").slice(0, 8)}.md`;
  const dir = task.id === NO_TASK ? path.join(paths(root).ledger, NO_TASK, "children") : path.join(taskDir(task.id, root), "children");
  fs.mkdirSync(dir, { recursive: true });
  const body = [
    `# Child report: ${input.agent_type ?? "agent"} for ${task.id}`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Child | ${input.agent_type ?? "agent"} (${input.agent_id ?? "unknown id"}) |`,
    `| Parent session | ${input.session_id ?? "unknown"} |`,
    `| Finished | ${now()} |`,
    "",
    "## Final message",
    "",
    redact(text) || "(the child left no final message)",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, name), body);
  return path.join(dir, name);
}

export function handle(event, input, root = repoRoot()) {
  const task = currentTask(root) ?? { id: NO_TASK, title: "no task", state: "Running" };
  const session = input.session_id ?? null;
  const log = (e) => appendEvent({ task: task.id, session, ...e }, root);
  const out = {};

  switch (event) {
    case "SessionStart": {
      const source = input.source ?? "startup";
      log({ event: source === "compact" ? "compact" : "start", summary: `session ${source}` });
      if (task.id !== NO_TASK && !["Done", "In review"].includes(task.state)) {
        upsertTask(task.id, { state: "Running", agent: process.env.WA_AGENT ?? task.agent ?? "claude" }, root, { create: false });
      }
      out.stdout = startContext(task.id === NO_TASK ? null : task, source, root);
      break;
    }
    case "PreCompact": {
      const file = archiveTranscript(input.transcript_path, task.id, session, root);
      log({ event: "compact", summary: `before ${input.trigger ?? "auto"} compaction`, refs: { transcript: file } });
      break;
    }
    case "PostToolUse":
    case "PostToolUseFailure": {
      log(toolEvent(input, event === "PostToolUseFailure"));
      if (task.id !== NO_TASK && task.state === "Blocked on you" && !(task.needs ?? []).some((n) => n.startsWith("owner:"))) {
        upsertTask(task.id, { state: "Running" }, root, { create: false });
      }
      break;
    }
    case "SubagentStart": {
      log({ event: "start", agent: input.agent_type ?? "subagent", parent: session, summary: `child ${input.agent_type ?? ""} started`, refs: { child: input.agent_id ?? null } });
      break;
    }
    case "SubagentStop": {
      const file = fileChildReport(task, input, root);
      log({ event: "child-report", agent: input.agent_type ?? "subagent", parent: session, summary: `child ${input.agent_type ?? ""} filed its report`, refs: { report: path.relative(root, file) } });
      break;
    }
    case "Notification": {
      log({ event: "notify", summary: short(input.message ?? input.notification_type ?? "") });
      const waiting = /permission|waiting for your input|idle/i.test(`${input.notification_type ?? ""} ${input.message ?? ""}`);
      // Only a running task becomes Blocked on you; In review and Done stay put.
      if (waiting && task.id !== NO_TASK && task.state === "Running") {
        upsertTask(task.id, { state: "Blocked on you", step: `waiting: ${short(input.message ?? "", 80)}` }, root, { create: false });
      }
      break;
    }
    case "Stop": {
      let decision = { block: false };
      if (task.id !== NO_TASK && process.env.WA_HOOKS_STRICT !== "0") {
        decision = stopDecision(task, stopFacts(task, root), priorStopBlocks(task.id, session, root));
      }
      log({ event: "stop", summary: decision.block ? `stop blocked: ${decision.reason}` : decision.gaveUp ? `stop allowed after ${MAX_STOP_BLOCKS} blocks: ${decision.reason}` : "turn ended" });
      if (decision.block) out.stdout = JSON.stringify({ decision: "block", reason: decision.reason });
      break;
    }
    case "SessionEnd": {
      const file = archiveTranscript(input.transcript_path, task.id, session, root);
      log({ event: "end", summary: `session ended: ${input.reason ?? "unknown"}; state ${task.state}`, refs: { transcript: file } });
      break;
    }
    default:
      break;
  }
  return out;
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const event = process.argv[2];
  let input = {};
  try {
    input = JSON.parse((await readStdin()) || "{}");
  } catch {}
  try {
    // The project dir Claude Code passes, not the shell's cwd, which may be
    // another repo.
    const root = process.env.CLAUDE_PROJECT_DIR || (input.cwd ? repoRootFrom(input.cwd) : repoRoot());
    const out = handle(event ?? input.hook_event_name, input, root);
    if (out.stdout) process.stdout.write(out.stdout);
  } catch (err) {
    process.stderr.write(`ledger hook (${event}) error: ${err.message}\n`);
  }
}

function repoRootFrom(cwd) {
  try {
    return git(["rev-parse", "--show-toplevel"], cwd);
  } catch {
    return repoRoot();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main();
}
