import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareItems } from "../../../app/lib/alt-text/request";
import { draftAltText, waitForBatch, type BatchesClient } from "../../../app/lib/alt-text/runner";
import { loadState } from "../../../app/lib/alt-text/state";
import type { ReviewDraft } from "../../../app/lib/alt-text/types";
import { MockBatches, USAGE, answer, canceled, errored, expired, item, noSleep, succeeded, tempDir } from "./mock-client";

const dirs: string[] = [];
function runDir(): string {
  const d = tempDir();
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const altFor = (customId: string) => `Blue trail running shoe ${customId.replace("m_", "")}, side view`;
const goodResponder = (req: { custom_id: string }) => succeeded(req.custom_id, answer(altFor(req.custom_id)));
const fast = { sleep: noSleep };

/** A client that fails the test if the run touches the API at all. */
const noApi: BatchesClient = {
  create: () => Promise.reject(new Error("create must not be called")),
  retrieve: () => Promise.reject(new Error("retrieve must not be called")),
  results: () => Promise.reject(new Error("results must not be called")),
};

function readLines(file: string): unknown[] {
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("waitForBatch", () => {
  it("polls with growing waits up to the cap until the batch ends", async () => {
    const client = new MockBatches(goodResponder, 5);
    client.adopt("msgbatch_9", []);
    const waits: number[] = [];
    const ended = await waitForBatch(client, "msgbatch_9", {
      initialDelayMs: 1000,
      factor: 2,
      maxDelayMs: 3000,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(ended.processing_status).toBe("ended");
    expect(waits).toEqual([1000, 2000, 3000, 3000, 3000]);
    expect(client.retrieved).toHaveLength(6);
  });

  it("defaults to 30 s, then doubles", async () => {
    const client = new MockBatches(goodResponder, 3);
    client.adopt("msgbatch_9", []);
    const waits: number[] = [];
    await waitForBatch(client, "msgbatch_9", { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([30_000, 60_000, 120_000]);
  });

  it("gives up after the timeout so a later run can resume", async () => {
    const client = new MockBatches(goodResponder, 100);
    client.adopt("msgbatch_9", []);
    let clock = 0;
    await expect(
      waitForBatch(client, "msgbatch_9", {
        initialDelayMs: 1000,
        timeoutMs: 5000,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      }),
    ).rejects.toThrow(/has not ended after/);
  });
});

describe("draftAltText", () => {
  it("creates one batch, polls, maps results back by custom_id and writes the review queue", async () => {
    const dir = runDir();
    const client = new MockBatches(goodResponder, 2);
    const items = [item(1), item(2), item(3)];
    const lines: string[] = [];
    const run = await draftAltText({ client, dir, items, poll: fast, log: (l) => lines.push(l) });

    expect(client.created).toHaveLength(1);
    expect(client.created[0].requests.map((r) => r.custom_id)).toEqual(["m_2001", "m_2002", "m_2003"]);
    expect(client.retrieved).toEqual(["msgbatch_1", "msgbatch_1", "msgbatch_1"]);
    // Results came back in reverse order; each draft still matches its image.
    expect(run.drafts.map((d) => [d.mediaId, d.draft])).toEqual(items.map((i, n) => [i.mediaId, altFor(`m_${2001 + n}`)]));
    expect(run.retry).toEqual([]);
    expect(run.failed).toEqual([]);
    expect(run.model).toBe("claude-haiku-5-5");
    expect(run.batchIds).toEqual(["msgbatch_1"]);
    expect(run.cost.tokens.requests).toBe(3);
    expect(run.cost.per1000DraftsUsd).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes("submitted msgbatch_1 with 3 request(s)"))).toBe(true);

    const results = readLines(path.join(dir, "results.jsonl")) as ReviewDraft[];
    expect(results.map((r) => r.mediaId)).toEqual(items.map((i) => i.mediaId));
    const summary = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
    expect(summary).toMatchObject({ model: "claude-haiku-5-5", images: 3, drafts: 3, needsReview: 0, retry: 0, failed: 0 });
    expect(fs.readFileSync(path.join(dir, "retry.jsonl"), "utf8")).toBe("");
  });

  it("retries errored, canceled, expired and unusable results once, and fails invalid requests", async () => {
    const dir = runDir();
    const first: Record<string, (id: string) => ReturnType<typeof succeeded>> = {
      m_2001: (id) => succeeded(id, answer("Blue shoe")),
      m_2002: (id) => expired(id),
      m_2003: (id) => errored(id, "overloaded_error"),
      m_2004: (id) => errored(id, "invalid_request_error", "Unable to download the image"),
      m_2005: (id) => succeeded(id, "{not json"),
      m_2006: (id) => canceled(id),
    };
    const client = new MockBatches((req, batchNo) =>
      batchNo === 1 ? first[req.custom_id](req.custom_id) : succeeded(req.custom_id, answer(`Retry ${req.custom_id}`)),
    );
    const run = await draftAltText({ client, dir, items: [1, 2, 3, 4, 5, 6].map((n) => item(n)), poll: fast });

    expect(client.created).toHaveLength(2);
    expect(client.created[1].requests.map((r) => r.custom_id).sort()).toEqual(["m_2002", "m_2003", "m_2005", "m_2006"]);
    expect(run.drafts.map((d) => d.customId)).toEqual(["m_2001", "m_2002", "m_2003", "m_2005", "m_2006"]);
    expect(run.failed).toEqual([
      expect.objectContaining({ customId: "m_2004", attempts: 1, reason: "errored: invalid_request_error: Unable to download the image" }),
    ]);
    expect(run.retry).toEqual([]);
    // Billed: first try of 2001 and 2005 (bad JSON is still billed), plus four retries.
    expect(run.cost.tokens.requests).toBe(6);
    expect(run.cost.tokens.input).toBe(6 * USAGE.input_tokens);
  });

  it("stops after maxAttempts and lists the rest for retry as reusable input", async () => {
    const dir = runDir();
    const client = new MockBatches((req) => expired(req.custom_id));
    const run = await draftAltText({ client, dir, items: [item(1), item(2)], poll: fast, maxAttempts: 2 });
    expect(client.created).toHaveLength(2);
    expect(run.drafts).toEqual([]);
    expect(run.retry.map((r) => [r.customId, r.attempts, r.reason])).toEqual([
      ["m_2001", 2, "expired before processing"],
      ["m_2002", 2, "expired before processing"],
    ]);
    const retryRows = readLines(path.join(dir, "retry.jsonl"));
    expect(prepareItems(retryRows).prepared.map((p) => p.item.mediaId)).toEqual([item(1).mediaId, item(2).mediaId]);
    expect(run.cost.tokens.requests).toBe(0);
  });

  it("records a result missing from the file as retryable and skips unknown custom_ids", async () => {
    const dir = runDir();
    const client = new MockBatches((req) =>
      req.custom_id === "m_2002" ? succeeded("m_9999", answer("Stray")) : succeeded(req.custom_id, answer("Blue shoe")),
    );
    const lines: string[] = [];
    const run = await draftAltText({ client, dir, items: [item(1), item(2)], poll: fast, maxAttempts: 1, log: (l) => lines.push(l) });
    expect(run.drafts.map((d) => d.customId)).toEqual(["m_2001"]);
    expect(run.retry).toEqual([expect.objectContaining({ customId: "m_2002", reason: "missing from batch results" })]);
    expect(lines.some((l) => l.includes("unknown custom_id m_9999"))).toBe(true);
  });

  it("refuses a new run with no images", async () => {
    await expect(draftAltText({ client: noApi, dir: runDir(), items: [{ nope: 1 }] })).rejects.toThrow(/no images/);
  });
});

describe("resume from saved state", () => {
  it("collects a batch sent before the process stopped, without sending it again", async () => {
    const dir = runDir();
    const first = new MockBatches(goodResponder);
    first.retrieve = () => Promise.reject(new Error("process stopped"));
    await expect(draftAltText({ client: first, dir, items: [item(1), item(2)], poll: fast })).rejects.toThrow("process stopped");
    expect(loadState(path.join(dir, "state.jsonl")).openBatches.get("msgbatch_1")).toEqual(["m_2001", "m_2002"]);

    const second = new MockBatches(goodResponder);
    second.adopt("msgbatch_1", first.created[0].requests);
    second.createError = new Error("create must not be called");
    const run = await draftAltText({ client: second, dir, poll: fast });
    expect(second.created).toHaveLength(0);
    expect(run.drafts.map((d) => d.customId)).toEqual(["m_2001", "m_2002"]);
  });

  it("makes no API calls when the run is already complete, and gives the same output", async () => {
    const dir = runDir();
    const done = await draftAltText({ client: new MockBatches(goodResponder), dir, items: [item(1), item(2)], poll: fast });
    const again = await draftAltText({ client: noApi, dir, items: [item(1), item(2)], poll: fast });
    expect(again.drafts).toEqual(done.drafts);
    expect(again.cost).toEqual(done.cost);
  });

  it("does not double count results when collection stopped half way", async () => {
    const dir = runDir();
    const client = new MockBatches(goodResponder);
    await draftAltText({ client, dir, items: [item(1), item(2)], poll: fast });
    const file = path.join(dir, "state.jsonl");
    // Drop the "collected" line, as if the process stopped while saving results.
    const kept = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l && !l.includes('"t":"collected"'));
    fs.writeFileSync(file, `${kept.join("\n")}\n`);

    const again = new MockBatches(goodResponder);
    again.adopt("msgbatch_1", client.created[0].requests);
    const run = await draftAltText({ client: again, dir, poll: fast });
    expect(again.resultsFetched).toEqual(["msgbatch_1"]);
    expect(run.drafts).toHaveLength(2);
    expect(run.cost.tokens.requests).toBe(2);
  });

  it("skips a line cut off by a crash", async () => {
    const dir = runDir();
    await draftAltText({ client: new MockBatches(goodResponder), dir, items: [item(1)], poll: fast });
    fs.appendFileSync(path.join(dir, "state.jsonl"), '{"t":"result","batchId":"msgb');
    const lines: string[] = [];
    const run = await draftAltText({ client: noApi, dir, poll: fast, log: (l) => lines.push(l) });
    expect(run.drafts).toHaveLength(1);
    expect(lines.some((l) => l.includes("skipped 1 unreadable line"))).toBe(true);
  });

  it("adds new images on resume and keeps known ones", async () => {
    const dir = runDir();
    await draftAltText({ client: new MockBatches(goodResponder), dir, items: [item(1)], poll: fast });
    const client = new MockBatches(goodResponder);
    const run = await draftAltText({ client, dir, items: [item(1), item(2)], poll: fast });
    expect(client.created).toHaveLength(1);
    expect(client.created[0].requests.map((r) => r.custom_id)).toEqual(["m_2002"]);
    expect(run.drafts.map((d) => d.customId)).toEqual(["m_2001", "m_2002"]);
  });

  it("keeps the run's model when a resume asks for another", async () => {
    const dir = runDir();
    const first = new MockBatches(goodResponder);
    first.retrieve = () => Promise.reject(new Error("stop"));
    await expect(draftAltText({ client: first, dir, items: [item(1)], model: "claude-haiku-4-5", poll: fast })).rejects.toThrow();
    const second = new MockBatches(goodResponder);
    second.adopt("msgbatch_1", first.created[0].requests);
    const lines: string[] = [];
    const run = await draftAltText({ client: second, dir, model: "claude-haiku-5-5", poll: fast, log: (l) => lines.push(l) });
    expect(run.model).toBe("claude-haiku-4-5");
    expect(first.created[0].requests[0].params.model).toBe("claude-haiku-4-5");
    expect(lines).toContain("this run uses claude-haiku-4-5; ignoring claude-haiku-5-5");
  });

  it("stops when batches.create may have created a batch it did not save", async () => {
    const dir = runDir();
    const first = new MockBatches(goodResponder);
    first.createError = new Error("socket hang up");
    await expect(draftAltText({ client: first, dir, items: [item(1)], poll: fast })).rejects.toThrow("socket hang up");

    await expect(draftAltText({ client: noApi, dir, poll: fast })).rejects.toThrow(/may have been created without being saved/);

    const second = new MockBatches(goodResponder);
    const run = await draftAltText({ client: second, dir, poll: fast, allowResubmit: true });
    expect(second.created).toHaveLength(1);
    expect(run.drafts).toHaveLength(1);
  });

  it("knows a 4xx from batches.create created nothing", async () => {
    const dir = runDir();
    const first = new MockBatches(goodResponder);
    first.createError = Object.assign(new Error("invalid model"), { status: 400 });
    await expect(draftAltText({ client: first, dir, items: [item(1)], poll: fast })).rejects.toThrow("invalid model");
    expect(loadState(path.join(dir, "state.jsonl")).danglingIntents.size).toBe(0);

    const run = await draftAltText({ client: new MockBatches(goodResponder), dir, poll: fast });
    expect(run.drafts).toHaveLength(1);
  });
});
