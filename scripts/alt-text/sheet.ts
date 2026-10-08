// Turns a results.jsonl from `npm run alt-text` into the owner's rating
// sheet: a CSV of 50 drafts picked at random with a fixed seed (Q-26).
//
//   npm run alt-text:sheet -- --results data/alt-text/<run>/results.jsonl
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { SHEET_SEED, SHEET_SIZE, isReviewDraft, ratingSheet } from "../../app/lib/alt-text/sheet";
import { readJsonl } from "../../app/lib/alt-text/state";

const HELP = `Usage: npm run alt-text:sheet -- --results <results.jsonl> [options]

  --out <file>     CSV to write (default: rating-sheet.csv next to the results)
  --size <n>       Rows to sample (default ${SHEET_SIZE})
  --seed <n>       Random seed (default ${SHEET_SEED}); keep it fixed so the sample can be rebuilt
  --help

The rubric is in docs/spikes/alt-text-rating-sheet.md.`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function int(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) fail(`--${name} must be a whole number above 0`);
  return n;
}

function main() {
  const { values } = parseArgs({
    options: {
      results: { type: "string" },
      out: { type: "string" },
      size: { type: "string" },
      seed: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (!values.results) fail(HELP);
  if (!fs.existsSync(values.results)) fail(`Results file not found: ${values.results}`);
  const size = int(values.size, "size", SHEET_SIZE);
  const seed = int(values.seed, "seed", SHEET_SEED);

  const { rows, errors } = readJsonl(values.results);
  for (const e of errors.slice(0, 5)) console.error(`${values.results}: ${e}; skipped`);
  const drafts = rows.filter(isReviewDraft);
  if (drafts.length < rows.length) console.error(`Skipped ${rows.length - drafts.length} row(s) that are not review drafts.`);

  const sheet = ratingSheet(drafts, size, seed);
  if (!sheet.sampled.length) fail("No drafts with text to rate.");
  const out = values.out ?? path.join(path.dirname(values.results), "rating-sheet.csv");
  fs.writeFileSync(out, sheet.csv);
  console.log(`Wrote ${sheet.sampled.length} rows to ${out}, sampled from ${sheet.poolSize} drafts with seed ${seed}.`);
  if (sheet.sampled.length < size) console.log(`Only ${sheet.poolSize} drafts had text, so the sheet has fewer than ${size} rows.`);
}

main();
