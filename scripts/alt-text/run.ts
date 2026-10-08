// Drafts alt text for product images through the Message Batches API.
// Spike C (T-032). Writes a review queue under data/alt-text/<run>/; it
// never writes to a store.
//
//   npm run alt-text -- --input products.jsonl --dry-run
//   npm run alt-text -- --input products.jsonl --run spike-c --yes
//   npm run alt-text -- --run spike-c --yes          (resume)
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_IMAGE_WIDTH,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_TOKENS,
  RESULTS_FILE,
  STATE_FILE,
  altTextModel,
  buildBatchRequests,
  draftAltText,
  estimateRun,
  ESTIMATE_GUESS,
  imageTokens,
  prepareItems,
  readJsonl,
  SYSTEM_PROMPT,
  userText,
  type BatchesClient,
  type PreparedItem,
} from "../../app/lib/alt-text";

const HELP = `Usage: npm run alt-text -- [options]

  --input <file>        JSONL, one image per line: {"productId", "mediaId", "imageUrl",
                        "productTitle", "productType"?, "existingAlt"?, "locale"?}
  --run <name>          Run folder under data/alt-text/. Pass the same name to resume.
  --limit <n>           Use only the first n lines of the input.
  --max-images <n>      Refuse to send more images than this (default 250).
  --max-attempts <n>    Times one image may be sent, first try included (default ${DEFAULT_MAX_ATTEMPTS}).
  --allow-resubmit      Resend images whose batch may have been created but not saved.
  --dry-run             Build the requests and print the first one and an estimate. No API call.
  --yes                 Send the batch. Needed for every real run.
  --help

Needs ANTHROPIC_API_KEY for a real run (owner queue Q-04). Model: ALT_TEXT_MODEL,
default ${altTextModel({})}.`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function positiveInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) fail(`--${name} must be a whole number above 0`);
  return n;
}

function readInput(file: string, limit?: number): unknown[] {
  if (!fs.existsSync(file)) fail(`Input file not found: ${file}`);
  const { rows, errors } = readJsonl(file);
  for (const e of errors.slice(0, 5)) console.error(`${file}: ${e}; skipped`);
  return limit ? rows.slice(0, limit) : rows;
}

function printSkipped(skipped: { reason: string }[]) {
  if (!skipped.length) return;
  console.error(`Skipped ${skipped.length} input line(s):`);
  for (const s of skipped.slice(0, 5)) console.error(`  ${s.reason}`);
}

function usd(n: number | null): string {
  return n === null ? "unknown" : `$${n.toFixed(4)}`;
}

function estimateLine(prepared: PreparedItem[], model: string): string {
  const width = DEFAULT_IMAGE_WIDTH;
  const est = estimateRun(
    prepared.map((p) => SYSTEM_PROMPT.length + userText(p.item).length),
    imageTokens(width, Math.round(width * ESTIMATE_GUESS.heightRatio)),
    model,
  );
  return (
    `Estimate for ${est.images} image(s) on ${model}: about ${est.inputTokensPerImage} input and ` +
    `${est.outputTokensPerImage} output tokens each, ${usd(est.totalUsd)} in total, ` +
    `${usd(est.per1000Usd)} per 1,000 images. Prices ${est.priceStatus}. ` +
    "This is a guess; the run reports cost from real usage."
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      run: { type: "string" },
      limit: { type: "string" },
      "max-images": { type: "string" },
      "max-attempts": { type: "string" },
      "allow-resubmit": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const model = altTextModel();
  const limit = values.limit === undefined ? undefined : positiveInt(values.limit, "limit", 0);
  const maxImages = positiveInt(values["max-images"], "max-images", 250);
  const maxAttempts = positiveInt(values["max-attempts"], "max-attempts", DEFAULT_MAX_ATTEMPTS);

  const rows = values.input ? readInput(values.input, limit) : undefined;
  const { prepared, skipped } = prepareItems(rows ?? []);
  if (rows) printSkipped(skipped);

  if (values["dry-run"]) {
    if (!rows) fail("--dry-run needs --input");
    if (!prepared.length) fail("No usable images in the input.");
    const requests = buildBatchRequests(prepared, { model, maxTokens: DEFAULT_MAX_TOKENS, imageWidth: DEFAULT_IMAGE_WIDTH });
    const bytes = Buffer.byteLength(JSON.stringify({ requests }));
    console.log(JSON.stringify(requests[0], null, 2));
    console.log(`\n${requests.length} request(s), ${(bytes / 1024).toFixed(1)} KB as one batch (limit 256 MB).`);
    console.log(estimateLine(prepared, model));
    console.log("Dry run: nothing was sent.");
    return;
  }

  if (!rows && !values.run) fail(`Pass --input for a new run or --run to resume.\n\n${HELP}`);
  const runName = values.run ?? `run-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-")}`;
  if (!/^[\w.-]+$/.test(runName)) fail("--run may use letters, digits, dot, dash and underscore only");
  const dir = path.join(process.cwd(), "data", "alt-text", runName);
  const resuming = fs.existsSync(path.join(dir, STATE_FILE));
  if (!rows && !resuming) fail(`No saved run at ${dir}. Pass --input to start one.`);

  if (prepared.length > maxImages) fail(`${prepared.length} images is more than --max-images ${maxImages}. Raise it or use --limit.`);

  const missing: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY is not set. The owner creates a key with a spend limit (Q-04).");
  if (missing.length) fail(`Cannot run: nothing was sent.\n${missing.map((m) => `- ${m}`).join("\n")}\nUse --dry-run to check the requests without a key.`);

  if (!values.yes) {
    if (prepared.length) console.log(estimateLine(prepared, model));
    fail(`Add --yes to send. Run folder: ${dir}`);
  }

  const anthropic = new Anthropic();
  // The SDK's batches resource fits the narrow interface the runner needs.
  const client: BatchesClient = anthropic.messages.batches;
  const log = (line: string) => console.error(`${new Date().toISOString()} ${line}`);
  log(`${resuming ? "Resuming" : "Starting"} ${runName} in ${dir}`);
  process.on("SIGINT", () => {
    log(`Stopped. Run again with --run ${runName} --yes to resume; saved batches are not sent twice.`);
    process.exit(130);
  });

  const summary = await draftAltText({
    client,
    dir,
    items: rows,
    model,
    maxAttempts,
    allowResubmit: values["allow-resubmit"],
    log,
  });
  const c = summary.cost;
  console.log(
    [
      `Model: ${summary.model}. Batches: ${summary.batchIds.join(", ") || "none"}.`,
      `Drafts: ${summary.drafts.length} (${summary.drafts.filter((d) => d.needsReview).length} need review).`,
      `Retry: ${summary.retry.length}. Failed: ${summary.failed.length}. Skipped input: ${summary.skipped.length}.`,
      `Tokens: ${c.tokens.input} input, ${c.tokens.output} output over ${c.tokens.requests} billed request(s).`,
      `Cost: ${usd(c.totalUsd)} in total, ${usd(c.per1000DraftsUsd)} per 1,000 drafts. Prices ${c.priceStatus}.`,
      `Review queue: ${path.join(dir, RESULTS_FILE)}`,
      `Rating sheet: npm run alt-text:sheet -- --results ${path.join(dir, RESULTS_FILE)}`,
    ].join("\n"),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
