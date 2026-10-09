// Drafts alt text through the Message Batches API: create a batch, poll it
// with backoff, read the results, map them back by custom_id and retry what
// can be retried. Every step is logged to data/ first, so a stopped run
// resumes without sending the same images twice.
//
// Output is a review queue. Nothing is written to a store (D-11).
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  BatchCreateParams,
  MessageBatch,
  MessageBatchIndividualResponse,
} from "@anthropic-ai/sdk/resources/messages";
import {
  DEFAULT_IMAGE_WIDTH,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MAX_REQUESTS,
  DEFAULT_MAX_TOKENS,
  MAX_ATTEMPTS_CEILING,
  MAX_IMAGES_CEILING,
  MAX_REQUESTS_CEILING,
  MAX_REQUESTS_PER_BATCH,
  altTextModel,
} from "./config";
import { costReport, type CostReport } from "./cost";
import { outcomeFor } from "./parse";
import { buildBatchRequests, customIdFor, prepareItems, type PreparedItem, type SkippedItem } from "./request";
import { applyRecord, loadState, openLog, toJsonl, writeFileAtomic, type RunConfig, type StateRecord } from "./state";
import type { ReviewDraft, UnfinishedItem } from "./types";

/**
 * The part of the SDK client this module uses. `new Anthropic().messages.batches`
 * fits it; tests pass a mock.
 */
export interface BatchesClient {
  create(params: BatchCreateParams, options?: { maxRetries?: number }): PromiseLike<MessageBatch>;
  retrieve(batchId: string): PromiseLike<MessageBatch>;
  results(batchId: string): PromiseLike<AsyncIterable<MessageBatchIndividualResponse>>;
}

export interface PollOptions {
  /** First wait after a status check. Default 30 s. */
  initialDelayMs?: number;
  /** Longest wait between checks. Default 10 min. */
  maxDelayMs?: number;
  /** Each wait is the last one times this. Default 2. */
  factor?: number;
  /** Give up after this long. Default 25 h: batches expire after 24 h. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls until processing_status is "ended", waiting longer after each check. */
export async function waitForBatch(
  client: BatchesClient,
  batchId: string,
  opts: PollOptions = {},
  log: (line: string) => void = () => {},
): Promise<MessageBatch> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const factor = opts.factor ?? 2;
  const maxDelay = opts.maxDelayMs ?? 10 * 60_000;
  const timeout = opts.timeoutMs ?? 25 * 3_600_000;
  const started = now();
  let delay = opts.initialDelayMs ?? 30_000;
  for (;;) {
    const batch = await client.retrieve(batchId);
    if (batch.processing_status === "ended") return batch;
    const c = batch.request_counts;
    log(`${batchId}: ${batch.processing_status}, ${c.processing} processing; next check in ${Math.round(delay / 1000)} s`);
    if (now() - started + delay > timeout) {
      throw new Error(`${batchId} has not ended after ${Math.round((now() - started) / 60_000)} min; run again with the same --run to resume`);
    }
    await sleep(delay);
    delay = Math.min(delay * factor, maxDelay);
  }
}

export interface RunOptions {
  client: BatchesClient;
  /** Run folder, for example data/alt-text/<run name>. */
  dir: string;
  /** Inputs for a new run. On resume, new media IDs are added and known ones ignored. */
  items?: unknown[];
  model?: string;
  maxTokens?: number;
  imageWidth?: number;
  /** Most images the run folder may hold, counting earlier commands on it. Default 250, ceiling 1,000. */
  maxImages?: number;
  /** Most requests the run may send in total, first tries and retries. Default 500, ceiling 3,000. */
  maxRequests?: number;
  /** Times one image may be sent, first try included. Default 2, ceiling 3. */
  maxAttempts?: number;
  poll?: PollOptions;
  /** Resubmit images whose batches.create call had no known outcome. May pay twice. */
  allowResubmit?: boolean;
  log?: (line: string) => void;
  now?: () => Date;
}

export interface RunLimits {
  maxImages: number;
  maxRequests: number;
  maxAttempts: number;
}

export interface RunSummary {
  dir: string;
  model: string;
  batchIds: string[];
  drafts: ReviewDraft[];
  /** Errored (not invalid request), canceled, expired, unusable output or not sent because of the request cap. */
  retry: UnfinishedItem[];
  /** Invalid requests and refusals. Retrying the same request will not help. */
  failed: UnfinishedItem[];
  skipped: SkippedItem[];
  /** Requests sent for this run so far, all commands and retries included. */
  requestsSent: number;
  limits: RunLimits;
  cost: CostReport;
}

export const STATE_FILE = "state.jsonl";
export const RESULTS_FILE = "results.jsonl";
export const RETRY_FILE = "retry.jsonl";
export const FAILED_FILE = "failed.jsonl";
export const SUMMARY_FILE = "summary.json";
export const LOCK_FILE = "lock";

function limit(name: string, value: number | undefined, fallback: number, ceiling: number): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a whole number above 0`);
  if (n > ceiling) throw new Error(`${name} ${n} is above the hard ceiling of ${ceiling}`);
  return n;
}

/** Checks the spending limits against their hard ceilings. Throws before anything is read or sent. */
export function runLimits(opts: Pick<RunOptions, "maxImages" | "maxRequests" | "maxAttempts">): RunLimits {
  return {
    maxImages: limit("maxImages", opts.maxImages, DEFAULT_MAX_IMAGES, MAX_IMAGES_CEILING),
    maxRequests: limit("maxRequests", opts.maxRequests, DEFAULT_MAX_REQUESTS, MAX_REQUESTS_CEILING),
    maxAttempts: limit("maxAttempts", opts.maxAttempts, DEFAULT_MAX_ATTEMPTS, MAX_ATTEMPTS_CEILING),
  };
}

/**
 * Takes the run folder's lock file, so two processes cannot work on the same
 * run. Returns a release function; the lock is also removed if the process exits.
 */
export function lockRun(dir: string): () => void {
  const file = path.join(dir, LOCK_FILE);
  let fd: number;
  try {
    fd = fs.openSync(file, "wx");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`another process is working on this run: ${file} exists. If none is, delete that file and run again.`);
    }
    throw err;
  }
  fs.writeSync(fd, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`);
  fs.closeSync(fd);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off("exit", release);
    fs.rmSync(file, { force: true });
  };
  process.on("exit", release);
  return release;
}

export async function draftAltText(opts: RunOptions): Promise<RunSummary> {
  const limits = runLimits(opts);
  fs.mkdirSync(opts.dir, { recursive: true });
  const release = lockRun(opts.dir);
  try {
    return await runLocked(opts, limits);
  } finally {
    release();
  }
}

async function runLocked(opts: RunOptions, limits: RunLimits): Promise<RunSummary> {
  const log = opts.log ?? (() => {});
  const stamp = () => (opts.now ? opts.now() : new Date()).toISOString();
  const file = path.join(opts.dir, STATE_FILE);
  const state = loadState(file);
  if (state.badLines) log(`${file}: skipped ${state.badLines} unreadable line(s)`);

  // New images, checked against the run's image cap before anything is written.
  let skipped: SkippedItem[] = [];
  const toAdd: PreparedItem[] = [];
  if (opts.items) {
    const prepared = prepareItems(opts.items);
    skipped = prepared.skipped;
    const knownMedia = new Set([...state.items.values()].map((i) => i.mediaId));
    const usedIds = new Set(state.items.keys());
    for (const p of prepared.prepared) {
      if (knownMedia.has(p.item.mediaId)) continue;
      // An image added by an earlier command may hold this custom_id already.
      const customId = usedIds.has(p.customId) ? customIdFor(p.item.mediaId, true) : p.customId;
      if (usedIds.has(customId)) throw new Error(`custom_id ${customId} is already used in this run`);
      usedIds.add(customId);
      toAdd.push({ customId, item: p.item });
    }
  }
  const total = state.items.size + toAdd.length;
  if (!total) throw new Error(`no images in ${opts.dir}: pass items to start a run`);
  if (total > limits.maxImages) {
    throw new Error(
      `this run would hold ${total} images (${state.items.size} already in it, ${toAdd.length} new), ` +
        `more than the cap of ${limits.maxImages}. Nothing was added or sent.`,
    );
  }

  const write = openLog(file);
  const record = (rec: StateRecord) => {
    write(rec);
    applyRecord(state, rec);
  };

  // The model and request settings are fixed when a run starts.
  if (!state.config) {
    const config: RunConfig = {
      model: opts.model ?? altTextModel(),
      maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      imageWidth: opts.imageWidth ?? DEFAULT_IMAGE_WIDTH,
    };
    record({ t: "config", at: stamp(), config });
  } else if (opts.model && opts.model !== state.config.model) {
    log(`this run uses ${state.config.model}; ignoring ${opts.model}`);
  }
  const config = state.config as RunConfig;
  for (const p of toAdd) record({ t: "input", at: stamp(), customId: p.customId, item: p.item });

  if (state.danglingIntents.size) {
    const count = [...state.danglingIntents.values()].reduce((n, ids) => n + ids.length, 0);
    if (!opts.allowResubmit) {
      throw new Error(
        `a batch with ${count} image(s) may have been created without being saved. ` +
          "Check the Console batch list, then resume with allowResubmit (--allow-resubmit) to send them again.",
      );
    }
    for (const intentId of [...state.danglingIntents.keys()]) {
      record({ t: "submit_failed", at: stamp(), intentId, error: "abandoned on resume" });
    }
  }

  const collect = async (batchId: string) => {
    await waitForBatch(opts.client, batchId, opts.poll, log);
    const expected = new Set(state.openBatches.get(batchId) ?? []);
    const seen = new Set<string>();
    for await (const res of await opts.client.results(batchId)) {
      if (!expected.has(res.custom_id)) {
        log(`${batchId}: result for unknown custom_id ${res.custom_id}; skipped`);
        continue;
      }
      seen.add(res.custom_id);
      if (state.resultKeys.has(`${batchId} ${res.custom_id}`)) continue;
      const item = state.items.get(res.custom_id);
      if (!item) continue;
      record({ t: "result", at: stamp(), batchId, customId: res.custom_id, outcome: outcomeFor(res, item, config.model) });
    }
    for (const id of expected) {
      if (seen.has(id) || state.resultKeys.has(`${batchId} ${id}`)) continue;
      record({ t: "result", at: stamp(), batchId, customId: id, outcome: { kind: "retry", reason: "missing from batch results", usage: null } });
    }
    record({ t: "collected", at: stamp(), batchId });
  };

  const submit = async (ids: string[]) => {
    const requests = buildBatchRequests(
      ids.map((customId) => ({ customId, item: state.items.get(customId)! })),
      { model: config.model, maxTokens: config.maxTokens, imageWidth: config.imageWidth },
    );
    const intentId = randomUUID();
    record({ t: "intent", at: stamp(), intentId, customIds: ids });
    let batch: MessageBatch;
    try {
      // No SDK retries here: batches.create has no idempotency key, so a retry
      // after a slow reply or a 429 could create and bill a second batch.
      batch = await opts.client.create({ requests }, { maxRetries: 0 });
    } catch (err) {
      // Any error is an unknown outcome: the intent stays open, and a resume
      // stops until someone checks the Console batch list.
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `batches.create failed (${reason}). A batch with ${ids.length} image(s) may still have been created. ` +
          "Check the Console batch list before resuming with allowResubmit (--allow-resubmit).",
        { cause: err },
      );
    }
    record({ t: "submitted", at: stamp(), intentId, batchId: batch.id, customIds: ids });
    log(`submitted ${batch.id} with ${ids.length} request(s)`);
  };

  // Requests sent or possibly sent for this run, across every command on it.
  const requestsSent = () => [...state.attempts.values()].reduce((a, b) => a + b, 0) + state.maybeSent;
  const isPending = (id: string) => {
    const outcome = state.outcomes.get(id);
    if (outcome && outcome.kind !== "retry") return false;
    return (state.attempts.get(id) ?? 0) < limits.maxAttempts;
  };
  let capped = false;
  for (;;) {
    for (const batchId of [...state.openBatches.keys()]) await collect(batchId);
    const pending = [...state.items.keys()].filter(isPending);
    if (!pending.length) break;
    const room = limits.maxRequests - requestsSent();
    if (room <= 0) {
      capped = true;
      log(`request cap of ${limits.maxRequests} reached; ${pending.length} image(s) not sent`);
      break;
    }
    const send = pending.slice(0, room);
    for (let i = 0; i < send.length; i += MAX_REQUESTS_PER_BATCH) {
      await submit(send.slice(i, i + MAX_REQUESTS_PER_BATCH));
    }
  }

  const drafts: ReviewDraft[] = [];
  const retry: UnfinishedItem[] = [];
  const failed: UnfinishedItem[] = [];
  for (const [customId, item] of state.items) {
    const outcome = state.outcomes.get(customId);
    const attempts = state.attempts.get(customId) ?? 0;
    if (outcome?.kind === "draft") drafts.push(outcome.draft);
    else if (outcome?.kind === "failed") failed.push({ ...item, customId, attempts, reason: outcome.reason });
    else {
      let reason = outcome?.reason ?? "not processed";
      if (capped && isPending(customId)) {
        reason = outcome ? `${outcome.reason}; not resent: request cap of ${limits.maxRequests} reached` : `not sent: request cap of ${limits.maxRequests} reached`;
      }
      retry.push({ ...item, customId, attempts, reason });
    }
  }
  const cost = costReport(state.usages, config.model, drafts.length);
  const sent = requestsSent();
  const summary: RunSummary = {
    dir: opts.dir,
    model: config.model,
    batchIds: state.batchIds,
    drafts,
    retry,
    failed,
    skipped,
    requestsSent: sent,
    limits,
    cost,
  };

  writeFileAtomic(path.join(opts.dir, RESULTS_FILE), toJsonl(drafts));
  writeFileAtomic(path.join(opts.dir, RETRY_FILE), toJsonl(retry));
  writeFileAtomic(path.join(opts.dir, FAILED_FILE), toJsonl(failed));
  writeFileAtomic(
    path.join(opts.dir, SUMMARY_FILE),
    `${JSON.stringify(
      {
        model: config.model,
        batches: state.batchIds,
        images: state.items.size,
        drafts: drafts.length,
        needsReview: drafts.filter((d) => d.needsReview).length,
        retry: retry.length,
        failed: failed.length,
        skipped: skipped.length,
        requestsSent: sent,
        limits,
        cost,
      },
      null,
      2,
    )}\n`,
  );
  return summary;
}
