// Run ledger: the board, task folders and the append-only event log.
// Hooks and the board CLI share this module. No dependencies beyond Node.
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

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function repoRoot(cwd = process.cwd()) {
  if (process.env.WA_ROOT) return process.env.WA_ROOT;
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return path.resolve(HERE, "..", "..");
  }
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

export function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function readBoard(root) {
  const file = paths(root).board;
  if (!fs.existsSync(file)) return { updated: null, tasks: [] };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// One task per line keeps diffs and merge conflicts small.
export function formatBoard(board) {
  const lines = board.tasks.map((t) => "    " + JSON.stringify(t));
  return [
    "{",
    `  "updated": ${JSON.stringify(board.updated)},`,
    `  "tasks": [${lines.length ? "\n" + lines.join(",\n") + "\n  " : ""}]`,
    "}",
    "",
  ].join("\n");
}

export function writeBoard(board, root) {
  board.updated = now();
  board.tasks.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(paths(root).board, formatBoard(board));
  return board;
}

export function getTask(id, root) {
  return readBoard(root).tasks.find((t) => t.id === id) ?? null;
}

export function upsertTask(id, patch, root) {
  if (patch.state && !STATES.includes(patch.state)) {
    throw new Error(`unknown state "${patch.state}". Use one of: ${STATES.join(", ")}`);
  }
  const board = readBoard(root);
  let task = board.tasks.find((t) => t.id === id);
  if (!task) {
    task = { id, title: "", milestone: "", lane: "", agent: "", state: "Queued", step: "", heartbeat: null, branch: "", issue: null, needs: [] };
    board.tasks.push(task);
  }
  Object.assign(task, patch);
  writeBoard(board, root);
  return task;
}

export function heartbeat(id, root, extra = {}) {
  return upsertTask(id, { heartbeat: now(), ...extra }, root);
}

export function currentBranch(cwd) {
  try {
    return execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// The active task is WA_TASK if set, else the task whose branch is checked out.
export function currentTask(root = repoRoot()) {
  if (process.env.WA_TASK) return getTask(process.env.WA_TASK, root) ?? { id: process.env.WA_TASK };
  const branch = currentBranch(root);
  if (!branch) return null;
  return readBoard(root).tasks.find((t) => t.branch === branch) ?? null;
}

export function eventFile(taskId, root) {
  return path.join(paths(root).ledger, taskId, "events.jsonl");
}

export function appendEvent(evt, root) {
  if (!evt.task) throw new Error("event needs a task");
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

export function lastEvents(taskId, n = 50, root) {
  const file = eventFile(taskId, root);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  return lines.slice(-n).map((l) => JSON.parse(l));
}

export function minutesSince(iso, at = Date.now()) {
  if (!iso) return Infinity;
  return (at - Date.parse(iso)) / 60000;
}

export function staleTasks(root, minutes = STALE_MINUTES, at = Date.now()) {
  return readBoard(root).tasks.filter(
    (t) => t.state === "Running" && minutesSince(t.heartbeat, at) > minutes,
  );
}

export function markStale(root, minutes = STALE_MINUTES, at = Date.now()) {
  const stale = staleTasks(root, minutes, at);
  for (const t of stale) upsertTask(t.id, { state: "Stalled" }, root);
  return stale;
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

// Creates .agents/tasks/<id>/ with TASK.md, HANDOFF.md and children/,
// and adds the task to the board.
export function createTask({ id, title, milestone, lane, branch = "", goal = "", exit = [], needs = [], decisions = [] }, root) {
  if (!/^T-\d{3,}$/.test(id)) throw new Error(`task id must look like T-001, got "${id}"`);
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
  const board = readBoard(root);
  const by = (s) => board.tasks.filter((t) => t.state === s);
  const lines = [`Digest for the last ${hours} hours, ${new Date(at).toISOString().slice(0, 16)}Z`, ""];
  for (const s of ["Running", "Blocked on you", "Stalled", "In review", "Queued", "Done"]) {
    const ts = by(s);
    if (!ts.length) continue;
    lines.push(`${s} (${ts.length})`);
    for (const t of ts) lines.push(`- ${t.id} ${t.title}${t.step ? `: ${t.step}` : ""}`);
    lines.push("");
  }
  let events = 0;
  for (const t of board.tasks) {
    events += lastEvents(t.id, 10000, root).filter((e) => at - Date.parse(e.ts) <= hours * 3600000).length;
  }
  lines.push(`Events logged: ${events}`);
  return lines.join("\n");
}
