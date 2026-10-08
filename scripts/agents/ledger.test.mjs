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
    for (let i = 1; i <= 20; i++) L.upsertTask(`T-${String(i).padStart(3, "0")}`, { title: `t${i}` }, root);
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
    L.markStale(root, 20, later, { all: true });
    assert.equal(L.getTask("T-001", root).state, "Stalled");
    assert.equal(L.getTask("T-003", root).state, "Queued");
  });

  it("marks only the current branch's task unless all is set", () => {
    execFileSync("git", ["init", "-q", "-b", "claude/feat-a"], { cwd: root });
    L.upsertTask("T-001", { state: "Running", branch: "claude/feat-a" }, root);
    L.upsertTask("T-002", { state: "Running", branch: "claude/feat-b" }, root);
    const later = Date.now() + 30 * 60000;
    assert.deepEqual(L.markStale(root, 20, later).map((t) => t.id), ["T-001"]);
    assert.equal(L.getTask("T-002", root).state, "Running");
  });

  it("does not mark a task that changed state after the stale check", () => {
    L.upsertTask("T-001", { state: "Done" }, root);
    const later = Date.now() + 30 * 60000;
    const res = L.updateTask("T-001", (cur) => (cur.state === "Running" ? { state: "Stalled" } : null), root, { create: false });
    assert.equal(res.state, "Done");
    assert.deepEqual(L.markStale(root, 20, later, { all: true }), []);
  });

  it("uses the recorded update time, not file mtimes", () => {
    L.upsertTask("T-001", { state: "Running" }, root);
    const file = path.join(root, ".agents", "tasks", "T-001", "status.json");
    const old = new Date(Date.now() - 3 * 86400000);
    const status = JSON.parse(fs.readFileSync(file, "utf8"));
    status.updated = old.toISOString();
    fs.writeFileSync(file, JSON.stringify(status));
    // A fresh clone gives the file a new mtime; the task must still be stale.
    assert.deepEqual(L.staleTasks(root).map((t) => t.id), ["T-001"]);
  });

  it("reclaims an orphaned lock instead of failing", () => {
    L.upsertTask("T-001", { title: "a" }, root);
    const lock = path.join(root, ".agents", "tasks", "T-001", "status.json.lock");
    fs.mkdirSync(lock);
    const old = new Date(Date.now() - 60000);
    fs.utimesSync(lock, old, old);
    const t0 = Date.now();
    L.upsertTask("T-001", { title: "b" }, root);
    assert.ok(Date.now() - t0 < 2000);
    assert.equal(L.getTask("T-001", root).title, "b");
    assert.ok(!fs.existsSync(lock));
  });

  it("skips a corrupt status file and names it", () => {
    L.upsertTask("T-001", { title: "ok" }, root);
    L.upsertTask("T-002", { title: "bad" }, root);
    fs.writeFileSync(path.join(root, ".agents", "tasks", "T-002", "status.json"), "<<<<<<< HEAD\n{");
    const errors = [];
    const write = process.stderr.write;
    process.stderr.write = (m) => errors.push(String(m));
    try {
      assert.deepEqual(L.listTasks(root).map((t) => t.id), ["T-001"]);
    } finally {
      process.stderr.write = write;
    }
    assert.match(errors.join(""), /T-002.*status\.json/);
  });

  it("rejects unknown fields, bad issue numbers and set on a missing task", () => {
    assert.throws(() => L.upsertTask("T-001", { foo: "bar" }, root), /unknown field/);
    assert.throws(() => L.upsertTask("T-001", { issue: "abc" }, root), /issue must be a number/);
    assert.throws(() => L.upsertTask("T-099", { step: "x" }, root, { create: false }), /does not exist/);
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

  it("ignores an invalid WA_TASK instead of guessing", () => {
    execFileSync("git", ["init", "-q", "-b", "claude/feat-x"], { cwd: root });
    L.upsertTask("T-005", { title: "y", branch: "claude/feat-x" }, root);
    process.env.WA_TASK = "t-5";
    const write = process.stderr.write;
    process.stderr.write = () => true;
    try {
      assert.equal(L.currentTask(root), null);
    } finally {
      process.stderr.write = write;
    }
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

describe("handoff lint", () => {
  // Builds a handoff from HANDOFF_SECTIONS, so the test does not depend on
  // the template file. body overrides a section's text; omit drops sections.
  function handoff({ body = {}, omit = [] } = {}) {
    const text = {
      "Done so far": "| Step | Commit |\n|---|---|\n| 1. Write the check | abc1234 |",
      "Current step": "2. Tests for the check.",
      ...body,
    };
    const parts = L.HANDOFF_SECTIONS.filter((s) => !omit.includes(s)).map((s) => `## ${s}\n\n${text[s] ?? "Some text."}\n`);
    return `# Handoff: T-900 Test\n\n${parts.join("\n")}`;
  }
  const notStarted = { "Current step": "Not started.", "Done so far": "| Step | Commit |\n|---|---|" };

  it("passes a complete handoff with a commit while Running", () => {
    assert.deepEqual(L.lintHandoff(handoff(), "Running"), []);
  });

  it("names each missing section", () => {
    for (const name of L.HANDOFF_SECTIONS) {
      assert.deepEqual(L.lintHandoff(handoff({ omit: [name] })), [`missing section: ${name}`]);
    }
    const all = L.lintHandoff("# Handoff: T-900 Test\n");
    assert.deepEqual(all, L.HANDOFF_SECTIONS.map((s) => `missing section: ${s}`));
  });

  it("reports a (fill in) placeholder", () => {
    const text = handoff({ body: { "Next three steps": "1. Read TASK.md.\n2. (fill in)\n3. (fill in)" } });
    assert.deepEqual(L.lintHandoff(text, "Running"), ["placeholder left: (fill in)"]);
  });

  it("reports Running with Not started as the current step", () => {
    const text = handoff({ body: { "Current step": "Not started." } });
    assert.deepEqual(L.lintHandoff(text, "Running"), ["state is Running but the current step says Not started"]);
  });

  it("reports In review with an empty Done so far table", () => {
    const text = handoff({ body: { "Done so far": "| Step | Commit |\n|---|---|" } });
    assert.deepEqual(L.lintHandoff(text, "In review"), ["state is In review but Done so far lists no commit"]);
  });

  it("checks Stalled like Running", () => {
    assert.deepEqual(L.lintHandoff(handoff({ body: notStarted }), "Stalled"), [
      "state is Stalled but the current step says Not started",
      "state is Stalled but Done so far lists no commit",
    ]);
  });

  it("skips the state checks for Queued and Done", () => {
    for (const state of ["Queued", "Done"]) {
      assert.deepEqual(L.lintHandoff(handoff({ body: notStarted }), state), []);
    }
  });

  it("lint-handoff checks one task or every task that is not Done", async () => {
    const env = { ...process.env, WA_ROOT: root };
    const write = (id, state, text) => {
      L.upsertTask(id, { title: id, state }, root);
      if (text != null) fs.writeFileSync(path.join(root, ".agents", "tasks", id, "HANDOFF.md"), text);
    };
    write("T-001", "Running", handoff());
    write("T-002", "Running", handoff({ body: { "Current step": "Not started." } }));
    write("T-003", "Done", handoff({ omit: ["How to verify"] }));
    write("T-004", "Queued", null);
    const fails = async (args, extra = {}) => {
      const err = await run("node", [BOARD_CLI, "lint-handoff", ...args], { env: { ...env, ...extra } }).then(() => null, (e) => e);
      assert.ok(err, `expected lint-handoff ${args.join(" ")} to exit 1`);
      assert.equal(err.code, 1);
      return err;
    };

    const all = await fails(["--all"]);
    assert.deepEqual(all.stdout.trim().split("\n"), [
      "T-002: state is Running but the current step says Not started",
      "T-004: no HANDOFF.md",
    ]);
    const { stdout } = await run("node", [BOARD_CLI, "lint-handoff", "T-001"], { env });
    assert.match(stdout, /1 handoff ok/);
    // An explicit id is checked even when the task is Done.
    assert.equal((await fails(["T-003"])).stdout.trim(), "T-003: missing section: How to verify");
    // No id: the current task, from WA_TASK or the branch.
    assert.equal((await fails([], { WA_TASK: "T-002" })).stdout.trim(), "T-002: state is Running but the current step says Not started");
    assert.match((await fails([])).stderr, /no current task/);
    assert.match((await fails(["--all", "T-001"])).stderr, /one task id, or --all/);
    assert.match((await fails(["T-099"])).stderr, /T-099 does not exist/);
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
