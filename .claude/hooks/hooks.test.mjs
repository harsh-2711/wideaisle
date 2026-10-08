import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkCommand } from "./guard.mjs";
import { handle, redact, startContext, stopDecision, toolEvent } from "./ledger-hook.mjs";
import * as L from "../../scripts/agents/ledger.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

describe("guard", () => {
  const blocked = [
    "git reset --hard HEAD~1",
    "git clean -fd",
    "git clean -xfd",
    "git push --force origin main",
    "git push -f",
    "git push origin +main",
    "git push --force-with-lease origin main",
    "git commit --no-verify -m x",
    "git checkout -- src/app.ts",
    "git checkout main -- src/app.ts",
    "git checkout .",
    "git checkout -f main",
    "git restore src/app.ts",
    "git stash drop",
    "git branch -D main",
    "rm -rf /",
    "rm -rf ~",
    "rm -rf .git",
    "cat .env",
    "grep TOKEN .env.local",
    "env",
    "printenv",
    "echo $ANTHROPIC_API_KEY",
    "shopify app deploy",
    "shopify theme publish --theme 123",
    "shopify theme push --live",
    "npm run deploy",
    "cd app && git reset --hard",
  ];
  const allowed = [
    "git status",
    "git push -u origin claude/feat-x",
    "git push --force-with-lease origin claude/feat-x",
    "git restore --staged src/app.ts",
    "git checkout -b claude/feat-y",
    "git checkout claude/feat-y",
    "git commit -m 'feat: x'",
    "cat .env.example",
    "rm -rf node_modules",
    "rm -rf build/",
    "shopify theme push --unpublished",
    "npm test",
    "echo $PATH",
    "test -n \"$ANTHROPIC_API_KEY\" && echo set",
  ];

  for (const cmd of blocked) it(`blocks: ${cmd}`, () => assert.equal(checkCommand(cmd, {}).allow, false));
  for (const cmd of allowed) it(`allows: ${cmd}`, () => assert.equal(checkCommand(cmd, {}).allow, true));

  it("allows a deploy with approval", () => {
    assert.equal(checkCommand("shopify app deploy", { WA_DEPLOY_APPROVED: "1" }).allow, true);
  });

  it("speaks the hook protocol", () => {
    const res = spawnSync("node", [path.join(HERE, "guard.mjs")], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git reset --hard" } }),
      encoding: "utf8",
    });
    const out = JSON.parse(res.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    const ok = spawnSync("node", [path.join(HERE, "guard.mjs")], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" } }),
      encoding: "utf8",
    });
    assert.equal(ok.stdout, "");
  });
});

describe("toolEvent and redact", () => {
  it("classifies tools", () => {
    assert.equal(toolEvent({ tool_name: "Edit", tool_input: { file_path: "a.ts" } }).event, "edit");
    assert.equal(toolEvent({ tool_name: "Bash", tool_input: { command: "git commit -m x" } }).event, "commit");
    assert.equal(toolEvent({ tool_name: "Bash", tool_input: { command: "npm test" } }).event, "test");
    assert.equal(toolEvent({ tool_name: "Bash", tool_input: { command: "ls" } }).event, "tool");
    assert.equal(toolEvent({ tool_name: "Read", tool_input: { file_path: "a" } }).event, "tool");
    assert.equal(toolEvent({ tool_name: "Bash", tool_input: { command: "x" }, error: "boom" }, true).event, "error");
  });

  it("redacts secrets", () => {
    assert.doesNotMatch(redact("curl -H 'Authorization: Bearer abc123' x"), /abc123/);
    assert.doesNotMatch(redact("API_KEY=sk-ant-0123456789abcdef npm test"), /0123456789/);
    assert.doesNotMatch(redact("push https://ghp_abcdefghijklmnopqrstuvwxyz@github.com"), /ghp_abc/);
  });
});

describe("stopDecision", () => {
  const task = { id: "T-001", state: "Running" };
  it("allows stopping with no task or a done task", () => {
    assert.equal(stopDecision(null, { dirty: ["a"] }, false).block, false);
    assert.equal(stopDecision({ id: "T-000" }, { dirty: ["a"] }, false).block, false);
    assert.equal(stopDecision({ ...task, state: "Done" }, { dirty: ["a"] }, false).block, false);
  });
  it("blocks on uncommitted work", () => {
    const d = stopDecision(task, { dirty: ["src/a.ts"], workAfterHandoff: 0 }, false);
    assert.equal(d.block, true);
    assert.match(d.reason, /checkpoint/);
  });
  it("blocks when work was committed after the last HANDOFF.md commit", () => {
    const d = stopDecision(task, { dirty: [], workAfterHandoff: 2 }, false);
    assert.equal(d.block, true);
    assert.match(d.reason, /HANDOFF/);
  });
  it("allows a clean, handed-off branch and never loops", () => {
    assert.equal(stopDecision(task, { dirty: [], workAfterHandoff: 0 }, false).block, false);
    assert.equal(stopDecision(task, { dirty: ["x"], workAfterHandoff: 3 }, true).block, false);
  });
});

describe("handle, in a scratch repo", () => {
  let root;
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "wa-hooks-"));
    fs.cpSync(path.join(REPO, ".agents", "templates"), path.join(root, ".agents", "templates"), { recursive: true });
    fs.writeFileSync(path.join(root, ".gitignore"), ".agents/ledger/\n.agents/**/*.lock/\n");
    git("init", "-q", "-b", "main");
    git("-c", "user.name=t", "-c", "user.email=t@t", "add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
    git("checkout", "-q", "-b", "claude/feat-x");
    L.createTask({ id: "T-001", title: "Test task", branch: "claude/feat-x", goal: "Prove the hooks", exit: ["it works"] }, root);
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "task");
    delete process.env.WA_TASK;
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("SessionStart loads the task and marks it Running", () => {
    const out = handle("SessionStart", { source: "startup", session_id: "s1" }, root);
    assert.match(out.stdout, /You are on task T-001/);
    assert.match(out.stdout, /HANDOFF\.md/);
    assert.equal(L.getTask("T-001", root).state, "Running");
    assert.equal(L.lastEvents("T-001", 5, root).at(-1).event, "start");
  });

  it("SessionStart after compaction re-injects a short checkpoint", () => {
    const out = handle("SessionStart", { source: "compact" }, root);
    assert.match(out.stdout, /Checkpoint for T-001/);
    assert.match(out.stdout, /Goal: Prove the hooks/);
    assert.ok(out.stdout.length < 2000);
  });

  it("logs tool calls and archives transcripts", () => {
    handle("PostToolUse", { tool_name: "Bash", tool_input: { command: "npm test" }, tool_response: { exitCode: 0 } }, root);
    const transcript = path.join(root, "t.jsonl");
    fs.writeFileSync(transcript, '{"message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}\n');
    handle("PreCompact", { transcript_path: transcript, session_id: "s1", trigger: "auto" }, root);
    const events = L.lastEvents("T-001", 10, root).map((e) => e.event);
    assert.deepEqual(events, ["test", "compact"]);
    const dir = path.join(root, ".agents", "ledger", "T-001", "transcripts");
    assert.equal(fs.readdirSync(dir).length, 1);
  });

  it("files a child report on SubagentStop", () => {
    const transcript = path.join(root, "child.jsonl");
    fs.writeFileSync(transcript, '{"message":{"role":"assistant","content":[{"type":"text","text":"Fixed 3 labels"}]}}\n');
    handle("SubagentStop", { agent_type: "builder", agent_id: "abc12345", agent_transcript_path: transcript }, root);
    const dir = path.join(root, ".agents", "tasks", "T-001", "children");
    const report = fs.readdirSync(dir).find((f) => f.endsWith(".md"));
    assert.match(fs.readFileSync(path.join(dir, report), "utf8"), /Fixed 3 labels/);
  });

  it("Notification moves the task to Blocked on you; the next tool call moves it back", () => {
    L.upsertTask("T-001", { state: "Running" }, root);
    handle("Notification", { notification_type: "permission_prompt", message: "Claude needs your permission" }, root);
    assert.equal(L.getTask("T-001", root).state, "Blocked on you");
    handle("PostToolUse", { tool_name: "Read", tool_input: { file_path: "x" } }, root);
    assert.equal(L.getTask("T-001", root).state, "Running");
  });

  it("Stop blocks on uncommitted work, then on a stale handoff, then allows", () => {
    fs.writeFileSync(path.join(root, "work.txt"), "x");
    let out = handle("Stop", {}, root);
    assert.match(JSON.parse(out.stdout).reason, /checkpoint/);

    git("add", "work.txt");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "work");
    out = handle("Stop", {}, root);
    assert.match(JSON.parse(out.stdout).reason, /HANDOFF/);

    fs.appendFileSync(path.join(root, ".agents", "tasks", "T-001", "HANDOFF.md"), "\nStep 1 done.\n");
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "handoff");
    out = handle("Stop", {}, root);
    assert.equal(out.stdout, undefined);
  });

  it("logs to T-000 when no task is mapped", () => {
    git("checkout", "-q", "-b", "claude/other");
    const out = handle("SessionStart", { source: "startup" }, root);
    assert.match(out.stdout, /no task is mapped/);
    assert.equal(L.lastEvents("T-000", 5, root).length, 1);
  });
});

describe("startContext", () => {
  it("handles a missing task folder", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wa-ctx-"));
    const text = startContext({ id: "T-404", title: "gone", branch: "", state: "Queued" }, "startup", root);
    assert.match(text, /T-404/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
