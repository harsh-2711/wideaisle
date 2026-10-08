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

  // Regression: a retried or 4xx create used to clear the intent, so a
  // resume could send another batch while an earlier one was billed.
  for (const status of [429, 400, 500]) {
    it(`treats a ${status} from batches.create as an unknown outcome and keeps the intent`, async () => {
      const dir = runDir();
      const first = new MockBatches(goodResponder);
      first.createError = Object.assign(new Error(`status ${status}`), { status });
      await expect(draftAltText({ client: first, dir, items: [item(1)], poll: fast })).rejects.toThrow(
        /batches\.create failed \(status \d+\)\. A batch with 1 image\(s\) may still have been created\. Check the Console batch list/,
      );
      expect(first.createOptions).toEqual([{ maxRetries: 0 }]);
      const saved = loadState(path.join(dir, "state.jsonl"));
      expect(saved.danglingIntents.size).toBe(1);
      expect(fs.readFileSync(path.join(dir, "state.jsonl"), "utf8")).not.toContain("submit_failed");

      await expect(draftAltText({ client: noApi, dir, poll: fast })).rejects.toThrow(/Check the Console batch list/);
    });
  }
});

describe("SDK retries", () => {
  // Regression: create used the SDK's default of two retries with no idempotency key.
  it("sends batches.create with maxRetries 0 and leaves retrieve and results on SDK defaults", async () => {
    const client = new MockBatches(goodResponder, 1);
    await draftAltText({ client, dir: runDir(), items: [item(1)], poll: fast });
    expect(client.createOptions).toEqual([{ maxRetries: 0 }]);
    expect(client.extraArgs.length).toBe(3); // two retrieves, one results
    expect(client.extraArgs.every((args) => args.length === 0)).toBe(true);
  });
});

describe("spending limits", () => {
  // Regression: the image cap applied per --input, so two commands on one run could send 500.
  it("caps images per run, counting images added by earlier commands", async () => {
    const dir = runDir();
    await draftAltText({ client: new MockBatches(goodResponder), dir, items: [item(1), item(2)], poll: fast, maxImages: 3 });
    const before = fs.readFileSync(path.join(dir, "state.jsonl"), "utf8");
    await expect(draftAltText({ client: noApi, dir, items: [item(3), item(4)], poll: fast, maxImages: 3 })).rejects.toThrow(
      "this run would hold 4 images (2 already in it, 2 new), more than the cap of 3. Nothing was added or sent.",
    );
    expect(fs.readFileSync(path.join(dir, "state.jsonl"), "utf8")).toBe(before);
    // Known media IDs do not count twice.
    const again = await draftAltText({ client: noApi, dir, items: [item(1), item(2)], poll: fast, maxImages: 2 });
    expect(again.drafts).toHaveLength(2);
    // A resume with a lower cap than the run already holds is refused too.
    await expect(draftAltText({ client: noApi, dir, poll: fast, maxImages: 1 })).rejects.toThrow(/would hold 2 images/);
  });

  // Regression: there was no cap on requests per run, retries included.
  it("caps requests per run, retries included", async () => {
    const dir = runDir();
    const client = new MockBatches((req) => expired(req.custom_id));
    const lines: string[] = [];
    const run = await draftAltText({
      client,
      dir,
      items: [item(1), item(2), item(3)],
      poll: fast,
      maxRequests: 4,
      maxAttempts: 2,
      log: (l) => lines.push(l),
    });
    expect(client.created.map((b) => b.requests.length)).toEqual([3, 1]);
    expect(run.requestsSent).toBe(4);
    expect(run.retry.map((r) => [r.customId, r.attempts, r.reason])).toEqual([
      ["m_2001", 2, "expired before processing"],
      ["m_2002", 1, "expired before processing; not resent: request cap of 4 reached"],
      ["m_2003", 1, "expired before processing; not resent: request cap of 4 reached"],
    ]);
    expect(lines).toContain("request cap of 4 reached; 2 image(s) not sent");
    const summary = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
    expect(summary).toMatchObject({ requestsSent: 4, limits: { maxImages: 250, maxRequests: 4, maxAttempts: 2 } });
  });

  it("keeps the request cap across commands on the same run", async () => {
    const dir = runDir();
    const first = await draftAltText({ client: new MockBatches(goodResponder), dir, items: [item(1), item(2), item(3)], poll: fast, maxRequests: 2 });
    expect(first.drafts).toHaveLength(2);
    expect(first.retry).toEqual([expect.objectContaining({ customId: "m_2003", attempts: 0, reason: "not sent: request cap of 2 reached" })]);
    // A second command with the same cap sends nothing.
    const second = await draftAltText({ client: noApi, dir, poll: fast, maxRequests: 2 });
    expect(second.requestsSent).toBe(2);
    // Raising the cap sends only the one image still pending.
    const client = new MockBatches(goodResponder);
    const third = await draftAltText({ client, dir, poll: fast, maxRequests: 3 });
    expect(client.created.map((b) => b.requests.map((r) => r.custom_id))).toEqual([["m_2003"]]);
    expect(third.drafts).toHaveLength(3);
  });

  it("counts requests in an abandoned batch toward the cap, since it may have been billed", async () => {
    const dir = runDir();
    const first = new MockBatches(goodResponder);
    first.createError = new Error("socket hang up");
    await expect(draftAltText({ client: first, dir, items: [item(1)], poll: fast })).rejects.toThrow();
    const run = await draftAltText({ client: noApi, dir, poll: fast, allowResubmit: true, maxRequests: 1 });
    expect(run.requestsSent).toBe(1);
    expect(run.retry).toEqual([expect.objectContaining({ customId: "m_2001", reason: "not sent: request cap of 1 reached" })]);
  });

  // Regression: --max-attempts had no ceiling.
  it("refuses limits above the hard ceilings before touching the run folder", async () => {
    const dir = path.join(runDir(), "not-created");
    await expect(draftAltText({ client: noApi, dir, items: [item(1)], maxAttempts: 4 })).rejects.toThrow("maxAttempts 4 is above the hard ceiling of 3");
    await expect(draftAltText({ client: noApi, dir, items: [item(1)], maxImages: 1001 })).rejects.toThrow("maxImages 1001 is above the hard ceiling of 1000");
    await expect(draftAltText({ client: noApi, dir, items: [item(1)], maxRequests: 3001 })).rejects.toThrow("maxRequests 3001 is above the hard ceiling of 3000");
    await expect(draftAltText({ client: noApi, dir, items: [item(1)], maxAttempts: 0 })).rejects.toThrow("maxAttempts must be a whole number above 0");
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe("custom_id clash across commands", () => {
  // Regression: an image added later whose custom_id matched an earlier image threw.
  it("hashes the custom_id of a new image that clashes with one added earlier", async () => {
    const dir = runDir();
    await draftAltText({ client: new MockBatches(goodResponder), dir, items: [item(1)], poll: fast });
    const video = item(9, { mediaId: "gid://shopify/Video/2001" }); // same numeric tail as item(1)
    const client = new MockBatches(goodResponder);
    const run = await draftAltText({ client, dir, items: [video], poll: fast });
    const [sent] = client.created[0].requests;
    expect(sent.custom_id).toMatch(/^h_[0-9a-f]{40}$/);
    expect(run.drafts.map((d) => d.mediaId)).toEqual([item(1).mediaId, video.mediaId]);
  });
});

describe("run lock", () => {
  // Regression: two processes could work on the same run folder at once.
  it("refuses a run folder another process holds, and leaves that lock alone", async () => {
    const dir = runDir();
    fs.writeFileSync(path.join(dir, "lock"), "{}\n");
    await expect(draftAltText({ client: noApi, dir, items: [item(1)], poll: fast })).rejects.toThrow(/another process is working on this run/);
    expect(fs.existsSync(path.join(dir, "lock"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "state.jsonl"))).toBe(false);
  });

  it("blocks a second run started while the first is still working", async () => {
    const dir = runDir();
    const first = draftAltText({ client: new MockBatches(goodResponder, 1), dir, items: [item(1)], poll: fast });
    await expect(draftAltText({ client: noApi, dir, items: [item(1)], poll: fast })).rejects.toThrow(/another process is working on this run/);
    expect((await first).drafts).toHaveLength(1);
  });

  it("removes the lock and its exit handler when a run ends or fails", async () => {
    const listeners = process.listenerCount("exit");
    const dir = runDir();
    await draftAltText({ client: new MockBatches(goodResponder), dir, items: [item(1)], poll: fast });
    expect(fs.existsSync(path.join(dir, "lock"))).toBe(false);
    const failing = new MockBatches(goodResponder);
    failing.retrieve = () => Promise.reject(new Error("stop"));
    await expect(draftAltText({ client: failing, dir: runDir(), items: [item(1)], poll: fast })).rejects.toThrow("stop");
    for (const d of dirs) expect(fs.existsSync(path.join(d, "lock"))).toBe(false);
    expect(process.listenerCount("exit")).toBe(listeners);
  });
});
