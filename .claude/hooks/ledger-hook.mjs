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

const SECRET = /((?:token|secret|password|passwd|api[_-]?key|authorization)["']?\s*[:=]\s*["']?)[^\s"']+/gi;
const BEARER = /\b(Bearer|Basic|token)\s+[\w.~+/=-]{6,}/gi;
const LONG_TOKEN = /\b(sk-[\w-]{10,}|ghp_\w{20,}|github_pat_\w{20,}|shpat_\w{20,}|shpss_\w{20,}|xox[abp]-[\w-]{10,})/g;

export function redact(text) {
  return String(text ?? "").replace(BEARER, "$1 [redacted]").replace(SECRET, "$1[redacted]").replace(LONG_TOKEN, "[redacted]");
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

// Decides whether the agent may end its turn.
export function stopDecision(task, facts, stopHookActive) {
  if (!task || task.id === NO_TASK || task.state === "Done") return { block: false };
  if (stopHookActive) return { block: false };
  if (facts.dirty.length) {
    return {
      block: true,
      reason: `Commit a checkpoint before stopping (${facts.dirty.length} uncommitted files, for example ${facts.dirty[0]}). Use chore(checkpoint): what is done, what is next. Refs: ${task.id}.`,
    };
  }
  if (facts.workAfterHandoff > 0) {
    return {
      block: true,
      reason: `Update .agents/tasks/${task.id}/HANDOFF.md (status, done so far with SHAs, current step, next three steps, blockers) and commit it before stopping.`,
    };
  }
  return { block: false };
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
      if (waiting && task.id !== NO_TASK) upsertTask(task.id, { state: "Blocked on you" }, root, { create: false });
      break;
    }
    case "Stop": {
      let decision = { block: false };
      if (task.id !== NO_TASK && process.env.WA_HOOKS_STRICT !== "0") {
        decision = stopDecision(task, stopFacts(task, root), Boolean(input.stop_hook_active));
      }
      log({ event: "stop", summary: decision.block ? `stop blocked: ${decision.reason}` : "turn ended" });
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
    const root = input.cwd ? repoRootFrom(input.cwd) : repoRoot();
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
