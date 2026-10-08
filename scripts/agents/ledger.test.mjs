import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as L from "./ledger.mjs";
import { planSync } from "./sync-board.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(HERE, "..", "..", ".agents", "templates");
const BOARD_CLI = path.join(HERE, "board.mjs");
const run = promisify(execFile);

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "wa-ledger-"));
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.cpSync(TEMPLATES, path.join(root, ".agents", "templates"), { recursive: true });
  delete process.env.WA_LEDGER_DIR;
  delete process.env.WA_TASK;
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("task status", () => {
  it("starts empty, creates the tasks folder on first write, sorts numerically", () => {
    assert.deepEqual(L.listTasks(root), []);
    L.upsertTask("T-1000", { title: "c" }, root);
    L.upsertTask("T-999", { title: "b" }, root);
    L.upsertTask("T-001", { title: "a" }, root);
    assert.deepEqual(L.listTasks(root).map((t) => t.id), ["T-001", "T-999", "T-1000"]);
  });

  it("rejects bad ids and unknown states", () => {
    assert.throws(() => L.upsertTask(undefined, { title: "x" }, root), /T-001/);
    assert.throws(() => L.upsertTask("../../x", {}, root), /T-001/);
    assert.throws(() => L.eventFile("../escape", root), /T-001/);
    assert.throws(() => L.upsertTask("T-001", { state: "Doing" }, root), /unknown state/);
  });

  it("skips writes that change nothing", () => {
    L.upsertTask("T-001", { title: "a" }, root);
    const file = path.join(root, ".agents", "tasks", "T-001", "status.json");
    const before = fs.statSync(file).mtimeMs;
    L.upsertTask("T-001", { title: "a" }, root);
    assert.equal(fs.statSync(file).mtimeMs, before);
  });

  it("keeps every update when 20 processes write at once", async () => {
    const env = { ...process.env, WA_ROOT: root };
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        run("node", [BOARD_CLI, "set", `T-${String(i + 1).padStart(3, "0")}`, "state=Running", `step=s${i}`], { env }),
      ),
    );
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => run("node", [BOARD_CLI, "set", "T-001", `step=again${i}`], { env })),
    );
    const tasks = L.listTasks(root);
    assert.equal(tasks.length, 20);
    assert.ok(tasks.every((t) => t.state === "Running"));
    assert.match(L.getTask("T-001", root).step, /^again\d$/);
    assert.equal(L.lastEvents("T-001", 100, root).length, 11);
  });

  it("finds stale running tasks and marks them", () => {
    L.upsertTask("T-001", { state: "Running" }, root);
    L.upsertTask("T-002", { state: "Running" }, root);
    L.upsertTask("T-003", { state: "Queued" }, root);
    const later = Date.now() + 30 * 60000;
    L.appendEvent({ task: "T-002", event: "tool", summary: "x" }, root);
    assert.deepEqual(L.staleTasks(root, 20).map((t) => t.id), []);
    assert.deepEqual(L.staleTasks(root, 20, later).map((t) => t.id), ["T-001", "T-002"]);
    L.markStale(root, 20, later);
    assert.equal(L.getTask("T-001", root).state, "Stalled");
    assert.equal(L.getTask("T-003", root).state, "Queued");
  });

  it("builds the board view", () => {
    L.upsertTask("T-002", { title: "b" }, root);
    L.upsertTask("T-001", { title: "a" }, root);
    L.buildBoard(root);
    const text = fs.readFileSync(path.join(root, ".agents", "board.json"), "utf8");
    assert.equal(text.split("\n").filter((l) => l.includes('"id"')).length, 2);
    assert.deepEqual(JSON.parse(text).tasks.map((t) => t.id), ["T-001", "T-002"]);
  });
});

describe("task folders", () => {
  it("creates the folder from templates", () => {
    const t = L.createTask({ id: "T-001", title: "Scaffold", milestone: "M0", lane: "repo", goal: "Ship it", exit: ["CI passes"] }, root);
    assert.equal(t.state, "Queued");
    const dir = path.join(root, ".agents", "tasks", "T-001");
    const task = fs.readFileSync(path.join(dir, "TASK.md"), "utf8");
    assert.match(task, /# T-001: Scaffold/);
    assert.match(task, /- \[ \] CI passes/);
    assert.doesNotMatch(task, /\{\{/);
    assert.ok(fs.existsSync(path.join(dir, "HANDOFF.md")));
    assert.ok(fs.existsSync(path.join(dir, "children")));
  });

  it("defaults missing fields and blocks tasks that need the owner", () => {
    const t = L.createTask({ id: "T-002", needs: ["owner:Q-03"] }, root);
    assert.equal(t.title, "");
    assert.equal(t.state, "Blocked on you");
  });

  it("rejects duplicates", () => {
    L.createTask({ id: "T-003", title: "x" }, root);
    assert.throws(() => L.createTask({ id: "T-003", title: "x" }, root), /already exists/);
  });

  it("resolves the current task from WA_TASK, then from the branch", () => {
    L.upsertTask("T-004", { title: "x" }, root);
    process.env.WA_TASK = "T-004";
    assert.equal(L.currentTask(root).id, "T-004");
    delete process.env.WA_TASK;
    execFileSync("git", ["init", "-q", "-b", "claude/feat-x"], { cwd: root });
    L.upsertTask("T-005", { title: "y", branch: "claude/feat-x" }, root);
    assert.equal(L.currentTask(root).id, "T-005");
  });
});

describe("events", () => {
  it("appends to the ledger dir, reads the tail and sets the heartbeat", () => {
    for (let i = 0; i < 60; i++) L.appendEvent({ task: "T-001", event: "tool", summary: `call ${i}` }, root);
    const last = L.lastEvents("T-001", 50, root);
    assert.equal(last.length, 50);
    assert.equal(last.at(-1).summary, "call 59");
    assert.ok(L.lastHeartbeat("T-001", root));
  });

  it("honours WA_LEDGER_DIR", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "wa-ext-"));
    process.env.WA_LEDGER_DIR = other;
    L.appendEvent({ task: "T-001", event: "start", summary: "go" }, root);
    assert.ok(fs.existsSync(path.join(other, "T-001", "events.jsonl")));
    fs.rmSync(other, { recursive: true, force: true });
  });

  it("rejects unknown events, cuts long summaries, skips corrupt lines", () => {
    assert.throws(() => L.appendEvent({ task: "T-001", event: "nap" }, root), /unknown event/);
    const e = L.appendEvent({ task: "T-001", event: "step", summary: "x".repeat(900) }, root);
    assert.equal(e.summary.length, 500);
    fs.appendFileSync(L.eventFile("T-001", root), "{broken\n");
    assert.equal(L.lastEvents("T-001", 10, root).length, 1);
  });

  it("builds a digest", () => {
    L.upsertTask("T-001", { title: "a", state: "Running", step: "tests" }, root);
    L.upsertTask("T-002", { title: "b", state: "Blocked on you" }, root);
    L.appendEvent({ task: "T-001", event: "step", summary: "x" }, root);
    L.appendEvent({ task: "T-000", event: "tool", summary: "y" }, root);
    const d = L.digest(root);
    assert.match(d, /Running \(1\)/);
    assert.match(d, /Blocked on you \(1\)/);
    assert.match(d, /Events logged: 2/);
  });
});

describe("planSync", () => {
  const project = {
    fields: {
      Status: { id: "F1", options: { Queued: "o1", Running: "o2", "Blocked on you": "o3", "In review": "o4", Done: "o5", Stalled: "o6" } },
      Step: { id: "F2" },
    },
    items: [{ id: "I1", title: "T-001 Scaffold" }],
  };

  it("updates existing items and creates missing ones", () => {
    const ops = planSync(
      [
        { id: "T-001", title: "Scaffold", state: "Running", step: "lint" },
        { id: "T-002", title: "Ledger", state: "Queued", issue: 7 },
      ],
      project,
    );
    assert.deepEqual(ops[0], { op: "status", task: "T-001", item: "I1", field: "F1", option: "o2" });
    assert.deepEqual(ops[1], { op: "text", task: "T-001", item: "I1", field: "F2", value: "lint" });
    assert.deepEqual(ops[2], { op: "create", task: "T-002", title: "T-002 Ledger", issue: 7 });
    assert.equal(ops[3].op, "status");
  });

  it("fails clearly when the Status field or an option is missing", () => {
    assert.throws(() => planSync([], { fields: {}, items: [] }), /Status/);
    assert.throws(
      () => planSync([{ id: "T-9", title: "x", state: "Done" }], { fields: { Status: { id: "F", options: {} } }, items: [] }),
      /no option "Done"/,
    );
  });
});
