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

const ACTIVE = new Set(["Running", "In review", "Stalled"]);

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
    // Only work in progress is blocked; a queued or blocked task may wait on
    // a Pending decision.
    if (!ACTIVE.has(state)) continue;
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
  // -z keeps non-ASCII paths unquoted.
  return git(["diff", "-z", "--name-only", `${base}...HEAD`], root).split("\0").filter(Boolean);
}

// Open tasks whose branch is this one. Several tasks may share a branch.
export function tasksForBranch(branch, root = ROOT) {
  const tasksDir = path.join(root, ".agents", "tasks");
  if (!branch || !fs.existsSync(tasksDir)) return [];
  const ids = [];
  for (const id of fs.readdirSync(tasksDir)) {
    const f = path.join(tasksDir, id, "status.json");
    if (!fs.existsSync(f)) continue;
    try {
      const s = JSON.parse(fs.readFileSync(f, "utf8"));
      if (s.branch === branch && s.state !== "Done") ids.push(id);
    } catch {}
  }
  return ids.sort();
}

export function checkHandoff(branch, files, root = ROOT) {
  const ids = tasksForBranch(branch, root);
  if (!ids.length) return [];
  const work = files.filter((f) => !ids.some((id) => f.startsWith(`.agents/tasks/${id}/`)));
  const updated = ids.some((id) => files.includes(`.agents/tasks/${id}/HANDOFF.md`));
  if (work.length && !updated) {
    return [`Branch ${branch} belongs to ${ids.join(", ")}, but this pull request updates none of their HANDOFF.md files.`];
  }
  return [];
}

// ---------- claims and writing ----------

// The word list in docs/policy/claims-policy.md ("Words we never use"),
// with common word forms. Bare "compliance" is allowed only where it names
// Shopify's compliance webhooks and topics.
const CLAIM_TERMS = [
  "(?:ada|wcag|eaa|fully)[- ]compliant", "compliant",
  "compliance(?! (?:webhooks?|topics?|lane)\\b)",
  "conform(?:s|ing|ance|ant)?", "meets? (?:the )?wcag",
  "certif(?:y|ies|ied|ication|icates?)",
  "audit(?:s|ed|ing|ors?)?(?! log)",
  "lawsuit[- ]proof", "sue[- ]proof", "lawsuit protection", "protection from (?:\\w+ ){0,2}lawsuits?",
  "(?:avoid|stop|prevent)(?:s|ed|ing)? (?:\\w+ ){0,2}lawsuits?", "reduces? (?:your )?legal risk",
  "protects? you", "you(?:'re| are) protected",
  "100% accessible", "fully accessible", "completely accessible", "barrier[- ]free",
  "your (?:store|site|shop) is (?:now )?accessible", "makes? your (?:store|site|shop) accessible",
  "guarantee[sd]?",
  "(?:instant|automatic|one[- ]click) accessibility", "fix(?:es)? everything",
  "accessibility (?:badge|seal)", "trust ?mark",
  "shopify[- ](?:certified|approved|endorsed)", "(?:approved|endorsed) by shopify",
].join("|");
const BANNED_CLAIMS = new RegExp(`\\b(?:${CLAIM_TERMS})\\b`, "i");
// Saying what something is not ("not certified", "we don't guarantee",
// "non-compliant") is allowed. Only a few filler words may sit between the
// negation and the term, so "not only ADA compliant" or "never settle for
// less than 100% accessible" still count as claims.
const FILL = "(?:(?:a|an|any|be|been|yet|ever|claim|claims|say|promise|offer|make|makes|your|our|this|store|site|shop|is|are|it|we|to|the|same|as)\\s+){0,4}";
const NEGATION = "(?:not|never|cannot|(?:do|does|did|is|are|was|were|wo|ca|could|would|should|has|have)n['\u2019]t)";
const NEGATED = new RegExp(`\\b(?:non-?|${NEGATION}\\s+(?!only\\b|just\\b|merely\\b|simply\\b)${FILL}|no\\s+|without\\s+)(?:${CLAIM_TERMS})\\b`, "gi");
// The limits text the policy requires in every report, used as written.
const REQUIRED_TEXT = /not a statement that your store conforms to WCAG or meets any law/gi;
// Scare copy: telling a merchant they fall short of a law or face a
// lawsuit, negated or not. The gap is bounded to keep matching fast.
const SCARE = /\b(?:you|your)\b[^.!?]{0,80}?\b(?:sued|lawsuits?|demand letters?|legal action|(?:not|isn't|aren't|non-?)\s*(?:\w+[- ]){0,2}compliant)\b|\byou could be next\b/i;
// Where a claim would reach a merchant: app UI, emails and report
// templates, marketing drafts and extensions.
const CLAIM_PATHS = [/^app\/routes\//, /^app\/components\//, /^app\/templates\//, /^app\/emails\//, /^docs\/growth\//, /^extensions\//];
const CLAIM_ALLOW = /claims-ok/; // a line may opt out, for example to quote what we never say

export function checkClaims(files, root = ROOT) {
  const errors = [];
  for (const f of files.filter((x) => CLAIM_PATHS.some((re) => re.test(x)))) {
    const full = path.join(root, f);
    if (!fs.existsSync(full)) continue;
    fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
      if (CLAIM_ALLOW.test(line)) return;
      const text = line.replace(REQUIRED_TEXT, "");
      if (SCARE.test(text)) errors.push(`${f}:${i + 1}: scare copy (D-06, claims policy): ${line.trim().slice(0, 120)}`);
      else if (BANNED_CLAIMS.test(text.replace(NEGATED, ""))) errors.push(`${f}:${i + 1}: banned claim (D-06): ${line.trim().slice(0, 120)}`);
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
      if (line.includes("\u2014")) errors.push(`${f}:${i + 1}: em dash; use a period, comma or colon`);
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
