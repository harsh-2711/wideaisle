#!/usr/bin/env node
// Repo rule checks that CI runs on every pull request.
//
//   decisions  No task may use a decision that is still Pending (roadmap,
//              operating rule 2).
//   handoff    A pull request from a task's branch must update that task's
//              HANDOFF.md (the handoff rule; hooks do not run for Codex).
//   claims     UI copy and marketing never claim compliant, certified,
//              lawsuit-proof or 100% accessible (D-06).
//   writing    No em dashes in changed text files (AGENTS.md).
//
// Usage: node scripts/ci/checks.mjs <check> [--base <ref>] [--branch <name>]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------- decisions ----------

export function parseDecisionIndex(text) {
  const statuses = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*\[?(D-\d+)\]?[^|]*\|.*\|\s*(Pending|Approved|Changed|Rejected)\s*\|\s*$/);
    if (m) statuses[m[1]] = m[2];
  }
  return statuses;
}

export function decisionsUsed(taskMd) {
  const row = taskMd.split("\n").find((l) => /^\|\s*Decisions used\s*\|/.test(l)) ?? "";
  return [...row.matchAll(/D-\d+/g)].map((m) => m[0]);
}

export function checkDecisions(root = ROOT) {
  const index = path.join(root, "decisions", "INDEX.md");
  const statuses = parseDecisionIndex(fs.readFileSync(index, "utf8"));
  const errors = [];
  const tasksDir = path.join(root, ".agents", "tasks");
  if (!fs.existsSync(tasksDir)) return errors;
  for (const id of fs.readdirSync(tasksDir).filter((d) => /^T-\d+$/.test(d))) {
    const taskFile = path.join(tasksDir, id, "TASK.md");
    const statusFile = path.join(tasksDir, id, "status.json");
    if (!fs.existsSync(taskFile)) continue;
    const state = fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, "utf8")).state : "Queued";
    if (state === "Done") continue;
    for (const d of decisionsUsed(fs.readFileSync(taskFile, "utf8"))) {
      if (!statuses[d]) errors.push(`${id} uses ${d}, which is not in decisions/INDEX.md`);
      else if (statuses[d] === "Pending") errors.push(`${id} uses ${d}, which is still Pending. Wait for the owner's decision.`);
      else if (statuses[d] === "Rejected") errors.push(`${id} uses ${d}, which was Rejected`);
    }
  }
  return errors;
}

// ---------- handoff ----------

function git(args, root = ROOT) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export function changedFiles(base, root = ROOT) {
  return git(["diff", "--name-only", `${base}...HEAD`], root).split("\n").filter(Boolean);
}

export function taskForBranch(branch, root = ROOT) {
  const tasksDir = path.join(root, ".agents", "tasks");
  if (!fs.existsSync(tasksDir)) return null;
  for (const id of fs.readdirSync(tasksDir)) {
    const f = path.join(tasksDir, id, "status.json");
    if (!fs.existsSync(f)) continue;
    try {
      if (JSON.parse(fs.readFileSync(f, "utf8")).branch === branch) return id;
    } catch {}
  }
  return null;
}

export function checkHandoff(branch, files, root = ROOT) {
  const id = taskForBranch(branch, root);
  if (!id) return [];
  const handoff = `.agents/tasks/${id}/HANDOFF.md`;
  const work = files.filter((f) => !f.startsWith(`.agents/tasks/${id}/`));
  if (work.length && !files.includes(handoff)) {
    return [`Branch ${branch} is task ${id}, but this pull request does not update ${handoff}.`];
  }
  return [];
}

// ---------- claims and writing ----------

const BANNED_CLAIMS = /\b(ada[- ]compliant|wcag[- ]compliant|fully compliant|compliant|certified|lawsuit[- ]proof|100% accessible|guarantee[sd]? (compliance|accessibility))\b/i;
// Where a claim would reach a merchant: app UI and marketing drafts.
const CLAIM_PATHS = [/^app\/routes\//, /^app\/components\//, /^docs\/growth\//, /^extensions\//];
const CLAIM_ALLOW = /claims-ok/; // a line may opt out, for example to quote what we never say

export function checkClaims(files, root = ROOT) {
  const errors = [];
  for (const f of files.filter((x) => CLAIM_PATHS.some((re) => re.test(x)))) {
    const full = path.join(root, f);
    if (!fs.existsSync(full)) continue;
    fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
      if (BANNED_CLAIMS.test(line) && !CLAIM_ALLOW.test(line)) errors.push(`${f}:${i + 1}: banned claim (D-06): ${line.trim().slice(0, 120)}`);
    });
  }
  return errors;
}

const TEXT = /\.(md|mdx|ts|tsx|js|mjs|cjs|json|yml|yaml|toml|liquid|css|html|txt)$/;

export function checkWriting(files, root = ROOT) {
  const errors = [];
  for (const f of files.filter((x) => TEXT.test(x) && !x.startsWith("docs/licenses/") && x !== "package-lock.json")) {
    const full = path.join(root, f);
    if (!fs.existsSync(full)) continue;
    fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
      if (line.includes("—")) errors.push(`${f}:${i + 1}: em dash; use a period, comma or colon`);
    });
  }
  return errors;
}

// ---------- cli ----------

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { base: { type: "string" }, branch: { type: "string" } },
  });
  const check = positionals[0];
  const base = values.base ?? "origin/main";
  let errors;
  switch (check) {
    case "decisions":
      errors = checkDecisions();
      break;
    case "handoff":
      errors = checkHandoff(values.branch ?? git(["branch", "--show-current"]), changedFiles(base));
      break;
    case "claims":
      errors = checkClaims(changedFiles(base));
      break;
    case "writing":
      errors = checkWriting(changedFiles(base));
      break;
    default:
      console.error("Usage: node scripts/ci/checks.mjs decisions|handoff|claims|writing [--base ref] [--branch name]");
      process.exit(2);
  }
  for (const e of errors) console.error(`::error::${e}`);
  console.log(`${check}: ${errors.length ? `${errors.length} problem(s)` : "ok"}`);
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main();
