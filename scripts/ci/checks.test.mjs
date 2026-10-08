import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { checkClaims, checkDecisions, checkHandoff, checkWriting, decisionsUsed, parseDecisionIndex } from "./checks.mjs";

let root;
const write = (rel, text) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "wa-ci-"));
  write(
    "decisions/INDEX.md",
    [
      "| ID | Decision | Final pick | Needed by | Status |",
      "|---|---|---|---|---|",
      "| [D-01](D-01.md) | Plans | A | M0 | Changed |",
      "| [D-05](D-05.md) | Stack | A | M0 | Approved |",
      "| [D-20](D-20.md) | New thing | none yet | G1 | Pending |",
    ].join("\n"),
  );
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("decisions", () => {
  it("parses the index and a task's decisions", () => {
    assert.deepEqual(parseDecisionIndex(fs.readFileSync(path.join(root, "decisions/INDEX.md"), "utf8")), { "D-01": "Changed", "D-05": "Approved", "D-20": "Pending" });
    assert.deepEqual(decisionsUsed("| Decisions used | D-05, D-08 |"), ["D-05", "D-08"]);
    assert.deepEqual(decisionsUsed("| Decisions used | none |"), []);
  });

  it("fails a task that uses a Pending or unknown decision, unless it is Done", () => {
    write(".agents/tasks/T-001/TASK.md", "| Decisions used | D-05, D-20 |");
    write(".agents/tasks/T-002/TASK.md", "| Decisions used | D-99 |");
    write(".agents/tasks/T-003/TASK.md", "| Decisions used | D-20 |");
    write(".agents/tasks/T-003/status.json", JSON.stringify({ state: "Done" }));
    write(".agents/tasks/T-004/TASK.md", "| Decisions used | D-01 |");
    const errors = checkDecisions(root);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /T-001 uses D-20, which is still Pending/);
    assert.match(errors[1], /T-002 uses D-99/);
  });
});

describe("handoff", () => {
  beforeEach(() => write(".agents/tasks/T-007/status.json", JSON.stringify({ branch: "claude/feat-scanner" })));

  it("requires HANDOFF.md on a task branch with work in it", () => {
    assert.equal(checkHandoff("claude/feat-scanner", ["app/lib/scanner/a.ts"], root).length, 1);
    assert.deepEqual(checkHandoff("claude/feat-scanner", ["app/lib/scanner/a.ts", ".agents/tasks/T-007/HANDOFF.md"], root), []);
  });

  it("ignores branches with no task and task-only changes", () => {
    assert.deepEqual(checkHandoff("claude/docs-x", ["README.md"], root), []);
    assert.deepEqual(checkHandoff("claude/feat-scanner", [".agents/tasks/T-007/TASK.md"], root), []);
  });
});

describe("claims and writing", () => {
  it("flags banned claims in UI copy and marketing only", () => {
    write("app/routes/app._index.tsx", "<p>Your store is now ADA compliant</p>\n<p>We fixed 12 issues</p>");
    write("docs/growth/landing.md", "Become lawsuit-proof today\nQuote: never say certified <!-- claims-ok -->");
    write("docs/research/legal-brief.md", "Vendors claim to make sites compliant.");
    const errors = checkClaims(["app/routes/app._index.tsx", "docs/growth/landing.md", "docs/research/legal-brief.md"], root);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /app\._index\.tsx:1/);
    assert.match(errors[1], /landing\.md:1/);
  });

  it("flags em dashes in changed text files", () => {
    write("docs/a.md", "Fine line.\nBad — line.");
    write("docs/licenses/x.md", "Licence — text");
    write("img.png", "—");
    const errors = checkWriting(["docs/a.md", "docs/licenses/x.md", "img.png", "gone.md"], root);
    assert.deepEqual(errors, ["docs/a.md:2: em dash; use a period, comma or colon"]);
  });
});
