// Drafts alt text through the Message Batches API: create a batch, poll it
// with backoff, read the results, map them back by custom_id and retry what
// can be retried. Every step is logged to data/ first, so a stopped run
// resumes without sending the same images twice.
//
// Output is a review queue. Nothing is written to a store (D-11).
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  BatchCreateParams,
  MessageBatch,
  MessageBatchIndividualResponse,
} from "@anthropic-ai/sdk/resources/messages";
import {
  DEFAULT_IMAGE_WIDTH,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_TOKENS,
  MAX_REQUESTS_PER_BATCH,
  altTextModel,
} from "./config";
import { costReport, type CostReport } from "./cost";
import { outcomeFor } from "./parse";
import { buildBatchRequests, prepareItems, type SkippedItem } from "./request";
import { applyRecord, loadState, openLog, toJsonl, writeFileAtomic, type RunConfig, type StateRecord } from "./state";
import type { ReviewDraft, UnfinishedItem } from "./types";

/**
 * The part of the SDK client this module uses. `new Anthropic().messages.batches`
 * fits it; tests pass a mock.
 */
export interface BatchesClient {
  create(params: BatchCreateParams): PromiseLike<MessageBatch>;
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
      throw new Error(`${batchId} has not ended after ${Math.round((now() - started) / 60_000)} min; run again to resume`);
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
  /** Times one image may be sent, first try included. Default 2. */
  maxAttempts?: number;
  poll?: PollOptions;
  /** Resubmit images whose batches.create call had no known outcome. May pay twice. */
  allowResubmit?: boolean;
  log?: (line: string) => void;
  now?: () => Date;
}

export interface RunSummary {
  dir: string;
  model: string;
  batchIds: string[];
  drafts: ReviewDraft[];
  /** Errored (not invalid request), canceled, expired or unusable output, after the last attempt. */
  retry: UnfinishedItem[];
  /** Invalid requests and refusals. Retrying the same request will not help. */
  failed: UnfinishedItem[];
  skipped: SkippedItem[];
  cost: CostReport;
}

export const STATE_FILE = "state.jsonl";
export const RESULTS_FILE = "results.jsonl";
export const RETRY_FILE = "retry.jsonl";
export const FAILED_FILE = "failed.jsonl";
export const SUMMARY_FILE = "summary.json";

function isClientError(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

export async function draftAltText(opts: RunOptions): Promise<RunSummary> {
  const log = opts.log ?? (() => {});
  const stamp = () => (opts.now ? opts.now() : new Date()).toISOString();
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const file = path.join(opts.dir, STATE_FILE);
  const state = loadState(file);
  const write = openLog(file);
  const record = (rec: StateRecord) => {
    write(rec);
    applyRecord(state, rec);
  };
  if (state.badLines) log(`${file}: skipped ${state.badLines} unreadable line(s)`);

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

  let skipped: SkippedItem[] = [];
  if (opts.items) {
    const prepared = prepareItems(opts.items);
    skipped = prepared.skipped;
    const knownMedia = new Set([...state.items.values()].map((i) => i.mediaId));
    for (const p of prepared.prepared) {
      if (knownMedia.has(p.item.mediaId)) continue;
      if (state.items.has(p.customId)) throw new Error(`custom_id ${p.customId} already used by another media ID in this run`);
      record({ t: "input", at: stamp(), customId: p.customId, item: p.item });
    }
  }
  if (!state.items.size) throw new Error(`no images in ${opts.dir}: pass items to start a run`);

  if (state.danglingIntents.size) {
    const count = [...state.danglingIntents.values()].reduce((n, ids) => n + ids.length, 0);
    if (!opts.allowResubmit) {
      throw new Error(
        `a batch with ${count} image(s) may have been created without being saved. ` +
          "Check the Console batch list, then resume with allowResubmit to send them again.",
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
      batch = await opts.client.create({ requests });
    } catch (err) {
      // A 4xx means no batch was created. Anything else (timeouts, 5xx) stays
      // an open intent, so a resume checks before sending again.
      if (isClientError(err)) record({ t: "submit_failed", at: stamp(), intentId, error: String((err as Error).message) });
      throw err;
    }
    record({ t: "submitted", at: stamp(), intentId, batchId: batch.id, customIds: ids });
    log(`submitted ${batch.id} with ${ids.length} request(s)`);
  };

  for (;;) {
    for (const batchId of [...state.openBatches.keys()]) await collect(batchId);
    const pending = [...state.items.keys()].filter((id) => {
      const outcome = state.outcomes.get(id);
      if (outcome && outcome.kind !== "retry") return false;
      return (state.attempts.get(id) ?? 0) < maxAttempts;
    });
    if (!pending.length) break;
    for (let i = 0; i < pending.length; i += MAX_REQUESTS_PER_BATCH) {
      await submit(pending.slice(i, i + MAX_REQUESTS_PER_BATCH));
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
    else retry.push({ ...item, customId, attempts, reason: outcome?.reason ?? "not processed" });
  }
  const cost = costReport(state.usages, config.model, drafts.length);
  const summary: RunSummary = { dir: opts.dir, model: config.model, batchIds: state.batchIds, drafts, retry, failed, skipped, cost };

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
        cost,
      },
      null,
      2,
    )}\n`,
  );
  return summary;
}
