// A stand-in for `new Anthropic().messages.batches`. No test calls the API.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  BatchCreateParams,
  Message,
  MessageBatch,
  MessageBatchIndividualResponse,
} from "@anthropic-ai/sdk/resources/messages";
import type { BatchesClient } from "../../../app/lib/alt-text/runner";
import type { AltTextInput, TokenUsage } from "../../../app/lib/alt-text/types";

export const USAGE: TokenUsage = { input_tokens: 900, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

export function item(n: number, extra: Partial<AltTextInput> = {}): AltTextInput {
  return {
    productId: `gid://shopify/Product/${1000 + n}`,
    mediaId: `gid://shopify/MediaImage/${2000 + n}`,
    imageUrl: `https://cdn.shopify.com/s/files/1/0001/files/shoe-${n}.jpg?v=1700000000`,
    productTitle: `Trail runner ${n}`,
    productType: "Shoes",
    ...extra,
  };
}

export function answer(alt: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ alt, decorative: false, needs_review: false, confidence: "high", review_note: "", ...extra });
}

export function message(text: string, opts: { stop?: Message["stop_reason"]; usage?: TokenUsage; thinking?: boolean } = {}): Message {
  const content: unknown[] = [];
  if (opts.thinking) content.push({ type: "thinking", thinking: "", signature: "sig" });
  content.push({ type: "text", text, citations: null });
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason: opts.stop ?? "end_turn",
    stop_sequence: null,
    usage: opts.usage ?? USAGE,
  } as unknown as Message;
}

export function succeeded(customId: string, text: string, opts: Parameters<typeof message>[1] = {}): MessageBatchIndividualResponse {
  return { custom_id: customId, result: { type: "succeeded", message: message(text, opts) } };
}

export function errored(customId: string, type: string, msg = "boom"): MessageBatchIndividualResponse {
  return {
    custom_id: customId,
    result: { type: "errored", error: { type: "error", request_id: null, error: { type, message: msg } } },
  } as MessageBatchIndividualResponse;
}

export function expired(customId: string): MessageBatchIndividualResponse {
  return { custom_id: customId, result: { type: "expired" } };
}

export function canceled(customId: string): MessageBatchIndividualResponse {
  return { custom_id: customId, result: { type: "canceled" } };
}

export function batch(id: string, status: MessageBatch["processing_status"], processing = 0): MessageBatch {
  return {
    id,
    type: "message_batch",
    processing_status: status,
    request_counts: { processing, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
    archived_at: null,
    cancel_initiated_at: null,
    created_at: "2026-10-08T00:00:00Z",
    ended_at: status === "ended" ? "2026-10-08T00:10:00Z" : null,
    expires_at: "2026-10-09T00:00:00Z",
    results_url: null,
  };
}

type Responder = (req: BatchCreateParams.Request, batchNo: number) => MessageBatchIndividualResponse | null;

/**
 * Records every call. Each batch reports `in_progress` for `pollsBeforeEnd`
 * checks, then `ended`. Results come from `respond`, newest request last, so
 * the order differs from the request order.
 */
export class MockBatches implements BatchesClient {
  created: BatchCreateParams[] = [];
  /** The request options passed with each create call, failed calls included. */
  createOptions: unknown[] = [];
  retrieved: string[] = [];
  resultsFetched: string[] = [];
  /** Arguments after the batch ID, per retrieve or results call. Empty means SDK defaults. */
  extraArgs: unknown[][] = [];
  private polls = new Map<string, number>();
  private requests = new Map<string, BatchCreateParams.Request[]>();
  createError: Error | null = null;

  constructor(
    private respond: Responder = (req) => succeeded(req.custom_id, answer(`Blue trail running shoe, side view`)),
    private pollsBeforeEnd = 0,
  ) {}

  async create(params: BatchCreateParams, options?: { maxRetries?: number }): Promise<MessageBatch> {
    this.createOptions.push(options);
    if (this.createError) throw this.createError;
    this.created.push(params);
    const id = `msgbatch_${this.created.length}`;
    this.requests.set(id, params.requests);
    this.polls.set(id, 0);
    return batch(id, "in_progress", params.requests.length);
  }

  async retrieve(batchId: string, ...rest: unknown[]): Promise<MessageBatch> {
    this.extraArgs.push(rest);
    this.retrieved.push(batchId);
    const n = this.polls.get(batchId) ?? 0;
    this.polls.set(batchId, n + 1);
    return batch(batchId, n >= this.pollsBeforeEnd ? "ended" : "in_progress", 1);
  }

  async results(batchId: string, ...rest: unknown[]): Promise<AsyncIterable<MessageBatchIndividualResponse>> {
    this.extraArgs.push(rest);
    this.resultsFetched.push(batchId);
    const batchNo = Number(batchId.split("_")[1]);
    const rows = (this.requests.get(batchId) ?? [])
      .map((r) => this.respond(r, batchNo))
      .filter((r): r is MessageBatchIndividualResponse => r !== null)
      .reverse();
    return (async function* () {
      yield* rows;
    })();
  }

  /** Lets a resumed run see a batch created by an earlier process. */
  adopt(batchId: string, requests: BatchCreateParams.Request[]) {
    this.requests.set(batchId, requests);
    this.polls.set(batchId, 0);
  }
}

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "alt-text-"));
}

export const noSleep = async () => {};
