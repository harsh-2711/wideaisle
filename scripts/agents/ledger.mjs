// Run ledger: task status, task folders and the append-only event log.
// Hooks and the board CLI share this module. No dependencies beyond Node.
//
// Layout (see .agents/README.md):
//   .agents/tasks/T-xxx/status.json   one task's state; only its branch writes it
//   .agents/tasks/T-xxx/TASK.md, HANDOFF.md, children/
//   <ledger>/T-xxx/events.jsonl       append-only; its last write is the heartbeat
//   .agents/board.json                generated view of every status.json (gitignored)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATES = ["Queued", "Running", "Blocked on you", "In review", "Done", "Stalled"];
export const EVENTS = [
  "start", "step", "tool", "edit", "test", "commit", "error",
  "compact", "child-report", "handoff", "stop", "notify", "end",
];
export const STALE_MINUTES = 20;
export const TASK_ID = /^T-\d{3,}$/;
// Events with no task go to T-000, the housekeeping bucket.
export const NO_TASK = "T-000";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIELDS = { title: "", milestone: "", lane: "", agent: "", state: "Queued", step: "", branch: "", issue: null, needs: [] };

let cachedRoot = null;

export function repoRoot() {
  if (process.env.WA_ROOT) return process.env.WA_ROOT;
  if (cachedRoot) return cachedRoot;
  try {
    cachedRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    cachedRoot = path.resolve(HERE, "..", "..");
  }
  return cachedRoot;
}

export function paths(root = repoRoot()) {
  const agents = path.join(root, ".agents");
  return {
    root,
    agents,
    board: path.join(agents, "board.json"),
    tasks: path.join(agents, "tasks"),
    templates: path.join(agents, "templates"),
    // D-18: raw logs live in the ledger repo. Until it exists they go to a
    // gitignored folder in this repo.
    ledger: process.env.WA_LEDGER_DIR || path.join(agents, "ledger"),
  };
}

export function assertTaskId(id) {
  if (typeof id !== "string" || !TASK_ID.test(id)) {
    throw new Error(`task id must look like T-001, got "${id}"`);
  }
  return id;
}

export function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// A mkdir lock: atomic on every filesystem we care about. A lock older than
// 10 seconds is treated as left over from a crashed process.
export function withLock(file, fn) {
  const lock = file + ".lock";
  const deadline = Date.now() + 5000;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 10000) fs.rmSync(lock, { recursive: true, force: true });
      } catch {}
      if (Date.now() > deadline) throw new Error(`could not lock ${file}`);
      sleep(15);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function statusFile(id, root) {
  return path.join(paths(root).tasks, assertTaskId(id), "status.json");
}

export function getTask(id, root) {
  const file = statusFile(id, root);
  if (!fs.existsSync(file)) return null;
  return { id, ...FIELDS, ...JSON.parse(fs.readFileSync(file, "utf8")), heartbeat: lastHeartbeat(id, root) };
}

export function listTasks(root) {
  const dir = paths(root).tasks;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => TASK_ID.test(d) && fs.existsSync(path.join(dir, d, "status.json")))
    .sort(compareIds)
    .map((id) => getTask(id, root));
}

export function compareIds(a, b) {
  return Number(a.slice(2)) - Number(b.slice(2));
}

export function upsertTask(id, patch, root) {
  assertTaskId(id);
  if (patch.state && !STATES.includes(patch.state)) {
    throw new Error(`unknown state "${patch.state}". Use one of: ${STATES.join(", ")}`);
  }
  const file = statusFile(id, root);
  return withLock(file, () => {
    const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { id, ...FIELDS };
    const next = { ...FIELDS, ...current, ...patch, id };
    delete next.heartbeat;
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      writeAtomic(file, JSON.stringify(next, null, 2) + "\n");
    }
    return { ...next, heartbeat: lastHeartbeat(id, root) };
  });
}

export function currentBranch(cwd = repoRoot()) {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// The active task is WA_TASK if set, else the task whose branch is checked out.
export function currentTask(root = repoRoot()) {
  if (process.env.WA_TASK && TASK_ID.test(process.env.WA_TASK)) {
    return getTask(process.env.WA_TASK, root) ?? { id: process.env.WA_TASK, ...FIELDS, heartbeat: null };
  }
  const branch = currentBranch(root);
  if (!branch) return null;
  return listTasks(root).find((t) => t.branch === branch) ?? null;
}

export function eventFile(taskId, root) {
  return path.join(paths(root).ledger, assertTaskId(taskId), "events.jsonl");
}

// One short line per append, so concurrent appends from parallel tool calls
// do not interleave (O_APPEND writes of this size are atomic on local disks).
export function appendEvent(evt, root) {
  assertTaskId(evt.task);
  if (!EVENTS.includes(evt.event)) throw new Error(`unknown event "${evt.event}"`);
  const line = {
    ts: now(),
    task: evt.task,
    agent: evt.agent ?? process.env.WA_AGENT ?? "claude",
    parent: evt.parent ?? process.env.WA_PARENT ?? null,
    session: evt.session ?? null,
    event: evt.event,
    summary: String(evt.summary ?? "").slice(0, 500),
    refs: evt.refs ?? {},
  };
  const file = eventFile(evt.task, root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + "\n");
  return line;
}

// The heartbeat is the latest write to the task's event log or status file.
export function lastHeartbeat(taskId, root) {
  let latest = 0;
  for (const file of [eventFile(taskId, root), statusFile(taskId, root)]) {
    try {
      latest = Math.max(latest, fs.statSync(file).mtimeMs);
    } catch {}
  }
  return latest ? new Date(latest).toISOString().replace(/\.\d{3}Z$/, "Z") : null;
}

export function lastEvents(taskId, n = 50, root) {
  const file = eventFile(taskId, root);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const out = [];
  for (const l of lines.slice(-n)) {
    try {
      out.push(JSON.parse(l));
    } catch {}
  }
  return out;
}

export function minutesSince(iso, at = Date.now()) {
  if (!iso) return Infinity;
  return (at - Date.parse(iso)) / 60000;
}

export function staleTasks(root, minutes = STALE_MINUTES, at = Date.now()) {
  return listTasks(root).filter((t) => t.state === "Running" && minutesSince(t.heartbeat, at) > minutes);
}

export function markStale(root, minutes = STALE_MINUTES, at = Date.now()) {
  const stale = staleTasks(root, minutes, at);
  for (const t of stale) upsertTask(t.id, { state: "Stalled" }, root);
  return stale;
}

// Writes the gitignored .agents/board.json view: one line per task.
export function buildBoard(root) {
  const tasks = listTasks(root);
  const lines = tasks.map((t) => "    " + JSON.stringify(t));
  const text = `{\n  "generated": ${JSON.stringify(now())},\n  "tasks": [${lines.length ? "\n" + lines.join(",\n") + "\n  " : ""}]\n}\n`;
  writeAtomic(paths(root).board, text);
  return tasks;
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

// Creates .agents/tasks/<id>/ with status.json, TASK.md, HANDOFF.md and children/.
export function createTask({ id, title = "", milestone = "", lane = "", branch = "", goal = "", exit = [], needs = [], decisions = [] }, root) {
  assertTaskId(id);
  const p = paths(root);
  const dir = path.join(p.tasks, id);
  if (fs.existsSync(dir)) throw new Error(`${id} already exists`);
  fs.mkdirSync(path.join(dir, "children"), { recursive: true });
  fs.writeFileSync(path.join(dir, "children", ".gitkeep"), "");
  const vars = {
    id, title, milestone, lane, branch, goal,
    exit: exit.map((e) => `- [ ] ${e}`).join("\n") || "- [ ] (fill in)",
    needs: needs.length ? needs.join(", ") : "none",
    decisions: decisions.length ? decisions.join(", ") : "none",
    date: now().slice(0, 10),
  };
  for (const name of ["TASK.md", "HANDOFF.md"]) {
    const tpl = fs.readFileSync(path.join(p.templates, name), "utf8");
    fs.writeFileSync(path.join(dir, name), fill(tpl, vars));
  }
  const state = needs.some((n) => n.startsWith("owner:")) ? "Blocked on you" : "Queued";
  return upsertTask(id, { title, milestone, lane, branch, state, needs }, root);
}

export function digest(root, hours = 24, at = Date.now()) {
  const tasks = listTasks(root);
  const lines = [`Digest for the last ${hours} hours, ${new Date(at).toISOString().slice(0, 16)}Z`, ""];
  for (const s of ["Running", "Blocked on you", "Stalled", "In review", "Queued", "Done"]) {
    const ts = tasks.filter((t) => t.state === s);
    if (!ts.length) continue;
    lines.push(`${s} (${ts.length})`);
    for (const t of ts) lines.push(`- ${t.id} ${t.title}${t.step ? `: ${t.step}` : ""}`);
    lines.push("");
  }
  let events = 0;
  for (const id of [NO_TASK, ...tasks.map((t) => t.id)]) {
    events += lastEvents(id, 100000, root).filter((e) => at - Date.parse(e.ts) <= hours * 3600000).length;
  }
  lines.push(`Events logged: ${events}`);
  return lines.join("\n");
}
