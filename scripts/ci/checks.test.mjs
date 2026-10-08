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

  it("fails active tasks that use a Pending or unknown decision; queued, blocked and done tasks may wait", () => {
    write(".agents/tasks/T-001/TASK.md", "| Decisions used | D-05, D-20 |");
    write(".agents/tasks/T-001/status.json", JSON.stringify({ state: "Running" }));
    write(".agents/tasks/T-002/TASK.md", "| Decisions used | D-99 |");
    write(".agents/tasks/T-002/status.json", JSON.stringify({ state: "In review" }));
    write(".agents/tasks/T-003/TASK.md", "| Decisions used | D-20 |");
    write(".agents/tasks/T-003/status.json", JSON.stringify({ state: "Done" }));
    write(".agents/tasks/T-004/TASK.md", "| Decisions used | D-01 |");
    write(".agents/tasks/T-004/status.json", JSON.stringify({ state: "Running" }));
    write(".agents/tasks/T-005/TASK.md", "| Decisions used | D-20 |");
    write(".agents/tasks/T-005/status.json", JSON.stringify({ state: "Blocked on you" }));
    const errors = checkDecisions(root);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /T-001 uses D-20, which is still Pending/);
    assert.match(errors[1], /T-002 uses D-99/);
  });
});

describe("handoff", () => {
  beforeEach(() => {
    write(".agents/tasks/T-007/status.json", JSON.stringify({ branch: "claude/feat-scanner", state: "Running" }));
    write(".agents/tasks/T-008/status.json", JSON.stringify({ branch: "claude/feat-scanner", state: "Queued" }));
    write(".agents/tasks/T-001/status.json", JSON.stringify({ branch: "claude/feat-scanner", state: "Done" }));
    write(".agents/tasks/T-009/status.json", JSON.stringify({ branch: "", state: "Queued" }));
  });

  it("requires HANDOFF.md on a task branch with work in it", () => {
    assert.equal(checkHandoff("claude/feat-scanner", ["app/lib/scanner/a.ts"], root).length, 1);
    assert.deepEqual(checkHandoff("claude/feat-scanner", ["app/lib/scanner/a.ts", ".agents/tasks/T-007/HANDOFF.md"], root), []);
    // Any open task on the branch counts; a Done task with the same branch does not.
    assert.deepEqual(checkHandoff("claude/feat-scanner", ["app/lib/scanner/a.ts", ".agents/tasks/T-008/HANDOFF.md"], root), []);
    assert.equal(checkHandoff("claude/feat-scanner", ["app/lib/scanner/a.ts", ".agents/tasks/T-001/HANDOFF.md"], root).length, 1);
    assert.deepEqual(checkHandoff("", ["app/a.ts"], root), []);
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
    write("app/routes/b.tsx", "<p>We are not certified and never claim to be ADA compliant.</p>\n<p>Overlays leave sites non-compliant.</p>");
    const errors = checkClaims(["app/routes/app._index.tsx", "docs/growth/landing.md", "docs/research/legal-brief.md", "app/routes/b.tsx"], root);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /app\._index\.tsx:1/);
    assert.match(errors[1], /landing\.md:1/);
  });

  it("covers the claims policy word list and its allowed negations", () => {
    const banned = [
      "Your store now meets WCAG 2.2 AA.",
      "Lawsuit protection for every plan",
      "Get your accessibility certificate",
      "Make your shop fully accessible",
      "A free accessibility audit",
      "Guaranteed results in a week",
      "One-click accessibility for Shopify",
      "Approved by Shopify",
      "WCAG conformant themes",
      "We protect you from demand letters",
      "Never settle for less than 100% accessible.",
      "Why not get guaranteed compliance?",
      "Not only ADA compliant, but fast.",
      "Not just fully accessible, but beautiful.",
      "It's not hard to be ADA compliant with Wide Aisle.",
      "WCAG 2.2 AA compliance in a click",
      "Avoid ADA lawsuits.",
      "Stop ADA lawsuits before they start.",
      "We certify your store",
      "Download your certificate",
      "Reach WCAG 2.2 AA conformance",
      "Your store meets the WCAG 2.2 AA standard.",
      "Shopify-approved",
      "Makes your site accessible",
      "We fix everything",
      "Congratulations, your store is accessible!",
    ];
    const allowed = [
      "We do not guarantee any legal outcome.",
      "This is not an audit and not a certification.",
      "We never claim your store is fully accessible.",
      "Automated scans cannot make your store accessible on their own.",
      "Fixed 12 of 40 detected issues.",
      "console.log(`Unexpected compliance topic ${topic}`);",
      "Some barriers need a person to find them.",
      "We don't guarantee any legal outcome.",
      "This isn't an audit.",
      "This report isn\u2019t a certification.",
      "Wide Aisle doesn't make your store fully accessible.",
      "They are not a statement that your store conforms to WCAG or meets any law.",
      "See the audit log for each change.",
      "// Unexpected compliance topic, M6 compliance lane",
    ];
    write("app/routes/claims.tsx", [...banned, ...allowed].join("\n"));
    const errors = checkClaims(["app/routes/claims.tsx"], root);
    assert.deepEqual(errors.map((e) => Number(e.split(":")[1])), banned.map((_, i) => i + 1));
  });

  it("flags negated scare copy that the negation rule would let through", () => {
    const scare = [
      "Your store is not ADA compliant and is at risk of a lawsuit.",
      "You could get sued this year.",
      "Your store may not be ADA compliant.",
      "You're not ADA compliant.",
      "You could be next.",
      "Act now, before you get a demand letter.",
      "Overlays get you sued.",
    ];
    const fine = ["We found 12 issues on your home page.", "The shop is not compliant with our webhook format", "Documentation you can share with your lawyer."];
    write("app/emails/outreach.txt", [...scare, ...fine].join("\n"));
    const errors = checkClaims(["app/emails/outreach.txt"], root);
    assert.deepEqual(errors.map((e) => Number(e.split(":")[1])), scare.map((_, i) => i + 1));
    assert.ok(errors.every((e) => /scare copy/.test(e)));
  });

  it("flags em dashes in changed text files", () => {
    write("docs/a.md", "Fine line.\nBad \u2014 line.");
    write("docs/licenses/x.md", "Licence \u2014 text");
    write("img.png", "\u2014");
    const errors = checkWriting(["docs/a.md", "docs/licenses/x.md", "img.png", "gone.md"], root);
    assert.deepEqual(errors, ["docs/a.md:2: em dash; use a period, comma or colon"]);
  });
});
