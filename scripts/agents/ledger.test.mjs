import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as L from "./ledger.mjs";
import { planSync } from "./sync-board.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(HERE, "..", "..", ".agents", "templates");

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "wa-ledger-"));
  fs.mkdirSync(path.join(root, ".agents", "tasks"), { recursive: true });
  fs.cpSync(TEMPLATES, path.join(root, ".agents", "templates"), { recursive: true });
  delete process.env.WA_LEDGER_DIR;
  delete process.env.WA_TASK;
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("board", () => {
  it("starts empty and writes one task per line", () => {
    assert.deepEqual(L.readBoard(root).tasks, []);
    L.upsertTask("T-002", { title: "b" }, root);
    L.upsertTask("T-001", { title: "a" }, root);
    const text = fs.readFileSync(L.paths(root).board, "utf8");
    const taskLines = text.split("\n").filter((l) => l.includes('"id"'));
    assert.equal(taskLines.length, 2);
    assert.match(taskLines[0], /T-001/);
    assert.equal(JSON.parse(text).tasks.length, 2);
  });

  it("rejects unknown states", () => {
    assert.throws(() => L.upsertTask("T-001", { state: "Doing" }, root), /unknown state/);
  });

  it("finds stale running tasks and marks them", () => {
    const old = new Date(Date.now() - 30 * 60000).toISOString();
    L.upsertTask("T-001", { state: "Running", heartbeat: old }, root);
    L.upsertTask("T-002", { state: "Running", heartbeat: new Date().toISOString() }, root);
    L.upsertTask("T-003", { state: "Queued", heartbeat: old }, root);
    assert.deepEqual(L.staleTasks(root).map((t) => t.id), ["T-001"]);
    L.markStale(root);
    assert.equal(L.getTask("T-001", root).state, "Stalled");
    assert.equal(L.getTask("T-002", root).state, "Running");
  });
});

describe("tasks", () => {
  it("creates the task folder from templates", () => {
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

  it("puts tasks that need the owner in Blocked on you", () => {
    const t = L.createTask({ id: "T-002", title: "Dev store", milestone: "M0", lane: "ops", needs: ["owner:Q-03"] }, root);
    assert.equal(t.state, "Blocked on you");
  });

  it("rejects bad ids and duplicates", () => {
    assert.throws(() => L.createTask({ id: "42", title: "x" }, root), /T-001/);
    L.createTask({ id: "T-003", title: "x" }, root);
    assert.throws(() => L.createTask({ id: "T-003", title: "x" }, root), /already exists/);
  });

  it("resolves the current task from WA_TASK", () => {
    L.upsertTask("T-004", { title: "x" }, root);
    process.env.WA_TASK = "T-004";
    assert.equal(L.currentTask(root).id, "T-004");
  });

  it("resolves the current task from the checked-out branch", () => {
    execFileSync("git", ["init", "-q", "-b", "claude/feat-x"], { cwd: root });
    L.upsertTask("T-005", { title: "x", branch: "claude/feat-x" }, root);
    assert.equal(L.currentTask(root).id, "T-005");
  });
});

describe("events", () => {
  it("appends to the ledger dir and reads the tail", () => {
    for (let i = 0; i < 60; i++) L.appendEvent({ task: "T-001", event: "tool", summary: `call ${i}` }, root);
    const last = L.lastEvents("T-001", 50, root);
    assert.equal(last.length, 50);
    assert.equal(last.at(-1).summary, "call 59");
    assert.ok(fs.existsSync(path.join(root, ".agents", "ledger", "T-001", "events.jsonl")));
  });

  it("honours WA_LEDGER_DIR", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "wa-ext-"));
    process.env.WA_LEDGER_DIR = other;
    L.appendEvent({ task: "T-001", event: "start", summary: "go" }, root);
    assert.ok(fs.existsSync(path.join(other, "T-001", "events.jsonl")));
    fs.rmSync(other, { recursive: true, force: true });
  });

  it("rejects unknown events and long summaries are cut", () => {
    assert.throws(() => L.appendEvent({ task: "T-001", event: "nap" }, root), /unknown event/);
    const e = L.appendEvent({ task: "T-001", event: "step", summary: "x".repeat(900) }, root);
    assert.equal(e.summary.length, 500);
  });

  it("builds a digest", () => {
    L.upsertTask("T-001", { title: "a", state: "Running", step: "tests" }, root);
    L.upsertTask("T-002", { title: "b", state: "Blocked on you" }, root);
    L.appendEvent({ task: "T-001", event: "step", summary: "x" }, root);
    const d = L.digest(root);
    assert.match(d, /Running \(1\)/);
    assert.match(d, /Blocked on you \(1\)/);
    assert.match(d, /Events logged: 1/);
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
