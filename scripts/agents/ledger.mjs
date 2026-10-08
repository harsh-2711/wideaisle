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
export const FIELDS = { title: "", milestone: "", lane: "", agent: "", state: "Queued", step: "", branch: "", issue: null, needs: [], updated: null };
const LOCK_STALE_MS = 3000;
const LOCK_WAIT_MS = 8000;

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

function ageMs(p) {
  try {
    return Date.now() - fs.statSync(p).mtimeMs;
  } catch {
    return -1;
  }
}

// Removes a lock left by a crashed process. Only one waiter may reclaim at a
// time, and it re-checks the age inside, so it never removes a lock that a
// live process took a moment ago.
function reclaim(lock) {
  const guard = lock + ".reclaim";
  if (ageMs(guard) > 30000) fs.rmSync(guard, { recursive: true, force: true });
  try {
    fs.mkdirSync(guard);
  } catch {
    return;
  }
  try {
    if (ageMs(lock) > LOCK_STALE_MS) fs.rmSync(lock, { recursive: true, force: true });
  } finally {
    fs.rmSync(guard, { recursive: true, force: true });
  }
}

// A mkdir lock: atomic on every filesystem we care about. Holders keep it
// for milliseconds, so a lock older than LOCK_STALE_MS is left over from a
// crashed process.
export function withLock(file, fn) {
  const lock = file + ".lock";
  const deadline = Date.now() + LOCK_WAIT_MS;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (ageMs(lock) > LOCK_STALE_MS) reclaim(lock);
      if (Date.now() > deadline) throw new Error(`could not lock ${file}. If no agent is running, remove ${lock}`);
      sleep(10 + Math.floor(Math.random() * 20));
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

function readStatus(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`cannot read ${file}: ${err.message}`);
  }
}

export function getTask(id, root) {
  const file = statusFile(id, root);
  if (!fs.existsSync(file)) return null;
  const status = { id, ...FIELDS, ...readStatus(file) };
  return { ...status, heartbeat: lastHeartbeat(id, root, status) };
}

// Skips a status file that cannot be read (for example one with merge
// conflict markers) and says which one, so one bad file never hides the rest.
export function listTasks(root) {
  const dir = paths(root).tasks;
  if (!fs.existsSync(dir)) return [];
  const tasks = [];
  for (const id of fs.readdirSync(dir).filter((d) => TASK_ID.test(d)).sort(compareIds)) {
    try {
      const t = getTask(id, root);
      if (t) tasks.push(t);
    } catch (err) {
      process.stderr.write(`ledger: skipped ${id}: ${err.message}\n`);
    }
  }
  return tasks;
}

export function compareIds(a, b) {
  return Number(a.slice(2)) - Number(b.slice(2));
}

function checkPatch(patch) {
  for (const key of Object.keys(patch)) {
    if (!(key in FIELDS)) throw new Error(`unknown field "${key}". Fields: ${Object.keys(FIELDS).join(", ")}`);
  }
  if (patch.state && !STATES.includes(patch.state)) {
    throw new Error(`unknown state "${patch.state}". Use one of: ${STATES.join(", ")}`);
  }
  if (patch.issue != null && !Number.isInteger(patch.issue)) throw new Error(`issue must be a number, got "${patch.issue}"`);
  if (patch.needs && !Array.isArray(patch.needs)) throw new Error("needs must be a list");
}

// Applies change(current) under the task's lock. change returns a patch, or
// null to leave the task alone. Returns the task, or null if it was left alone
// and does not exist.
export function updateTask(id, change, root, { create = true } = {}) {
  const file = statusFile(id, root);
  return withLock(file, () => {
    const exists = fs.existsSync(file);
    if (!exists && !create) throw new Error(`${id} does not exist. Create it with: npm run board -- new ${id}`);
    const current = exists ? readStatus(file) : { id, ...FIELDS };
    const base = { ...FIELDS, ...current, id };
    delete base.heartbeat;
    const patch = change(base);
    if (!patch) return exists ? { ...base, heartbeat: lastHeartbeat(id, root, base) } : null;
    checkPatch(patch);
    const { updated: _ignored, ...rest } = base;
    const next = { ...base, ...patch, id };
    const { updated: _ignored2, ...restNext } = next;
    if (exists && JSON.stringify(restNext) === JSON.stringify(rest)) return { ...base, heartbeat: lastHeartbeat(id, root, base) };
    next.updated = now();
    writeAtomic(file, JSON.stringify(next, null, 2) + "\n");
    return { ...next, heartbeat: lastHeartbeat(id, root, next) };
  });
}

export function upsertTask(id, patch, root, opts) {
  assertTaskId(id);
  checkPatch(patch);
  return updateTask(id, () => patch, root, opts);
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
  const fromEnv = process.env.WA_TASK;
  if (fromEnv) {
    if (!TASK_ID.test(fromEnv)) {
      process.stderr.write(`ledger: WA_TASK="${fromEnv}" is not a task id like T-001; ignoring it and logging to ${NO_TASK}\n`);
      return null;
    }
    return getTask(fromEnv, root) ?? { id: fromEnv, ...FIELDS, heartbeat: null };
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

// The heartbeat is the later of the last event written on this machine and
// the task's recorded "updated" time. File mtimes are not used: a clone or
// checkout resets them.
export function lastHeartbeat(taskId, root, status) {
  let latest = status?.updated ? Date.parse(status.updated) : 0;
  try {
    latest = Math.max(latest, fs.statSync(eventFile(taskId, root)).mtimeMs);
  } catch {}
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

// Marks stale tasks as Stalled, re-checking each one under its lock. By
// default only the task on the current branch is touched, so a check run on
// one branch never edits another branch's status file. all: true is for the
// planner or the server job.
export function markStale(root, minutes = STALE_MINUTES, at = Date.now(), { all = false } = {}) {
  const branch = all ? null : currentBranch(root ?? repoRoot());
  const marked = [];
  for (const t of staleTasks(root, minutes, at)) {
    if (!all && (!branch || t.branch !== branch)) continue;
    const res = updateTask(
      t.id,
      (cur) => (cur.state === "Running" && minutesSince(lastHeartbeat(t.id, root, cur), at) > minutes ? { state: "Stalled" } : null),
      root,
      { create: false },
    );
    if (res?.state === "Stalled") marked.push(res);
  }
  return marked;
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

// Sections every HANDOFF.md has, in order (see .agents/templates/HANDOFF.md).
export const HANDOFF_SECTIONS = [
  "Goal and exit criteria", "Status", "Done so far", "Current step", "Next three steps",
  "Blockers and open questions", "Decisions used", "Files touched", "How to verify", "Lessons and gotchas",
];

// Lists what keeps a HANDOFF.md from being enough for a fresh agent:
// missing sections, template placeholders, and a status that does not
// match the task's state.
export function lintHandoff(text, state = "") {
  const problems = [];
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  for (const name of HANDOFF_SECTIONS) {
    if (!headings.includes(name)) problems.push(`missing section: ${name}`);
  }
  if (/\(fill in\)/.test(text)) problems.push("placeholder left: (fill in)");
  const section = (name) => {
    const m = new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(text);
    return m ? m[1].trim() : "";
  };
  if (["Running", "In review", "Stalled"].includes(state)) {
    if (/^Not started\.?$/.test(section("Current step"))) problems.push(`state is ${state} but the current step says Not started`);
    if (!/\|[^|\n]+\|\s*[0-9a-f]{7,40}\s*\|/.test(section("Done so far"))) problems.push(`state is ${state} but Done so far lists no commit`);
  }
  return problems;
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
