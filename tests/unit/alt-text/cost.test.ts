import { describe, expect, it } from "vitest";
import { MODEL_PRICES, type ModelPrice } from "../../../app/lib/alt-text/config";
import { costReport, requestCostUsd, sumUsage } from "../../../app/lib/alt-text/cost";
import type { TokenUsage } from "../../../app/lib/alt-text/types";

const u = (input: number, output: number, cacheWrite = 0, cacheRead = 0): TokenUsage => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: cacheWrite,
  cache_read_input_tokens: cacheRead,
});

// Round numbers so the expected values are easy to check by hand.
const TEST_PRICE: ModelPrice = {
  input: 2,
  output: 10,
  cacheWrite5m: 2.5,
  cacheRead: 0.2,
  batchMultiplier: 0.5,
  longPromptThreshold: 1000,
  long: { input: 4, output: 20, cacheWrite5m: 5, cacheRead: 0.4 },
  status: "to verify",
  source: "test",
  read: "2026-10-08",
};

describe("cost", () => {
  it("marks every price as to verify, with a source and date", () => {
    for (const p of Object.values(MODEL_PRICES)) {
      expect(p.status).toBe("to verify");
      expect(p.source).toMatch(/^https:\/\//);
      expect(p.read).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("sums usage across requests", () => {
    expect(sumUsage([u(10, 2, 3, 4), u(1, 1)])).toEqual({ requests: 2, input: 11, output: 3, cacheWrite: 3, cacheRead: 4 });
  });

  it("prices one request at batch rates, all token kinds included", () => {
    // (500*2 + 100*10 + 100*2.5 + 200*0.2) / 1e6 * 0.5 = 2290 / 1e6 * 0.5
    expect(requestCostUsd(u(500, 100, 100, 200), TEST_PRICE)).toBeCloseTo(0.001145, 9);
  });

  it("uses long-prompt rates above the threshold", () => {
    // 1001 prompt tokens > 1000: (1001*4 + 10*20) / 1e6 * 0.5
    expect(requestCostUsd(u(1001, 10), TEST_PRICE)).toBeCloseTo(0.002102, 9);
  });

  it("computes cost per 1,000 drafts from the usage the Batch API returned", () => {
    const usages = [u(900, 100), u(900, 100), u(900, 100), u(900, 100)];
    // Each: (900*2 + 100*10) / 1e6 * 0.5 = 0.0014. Four requests: 0.0056.
    const r = costReport(usages, "test-model", 2, { "test-model": TEST_PRICE });
    expect(r.priced).toBe(true);
    expect(r.priceStatus).toMatch(/^to verify/);
    expect(r.totalUsd).toBeCloseTo(0.0056, 9);
    expect(r.per1000RequestsUsd).toBeCloseTo(1.4, 9);
    // Two of four requests gave a usable draft, so each draft carries two requests.
    expect(r.per1000DraftsUsd).toBeCloseTo(2.8, 9);
    expect(r.avgInputTokens).toBe(900);
    expect(r.avgOutputTokens).toBe(100);
  });

  it("uses the config table for the default model", () => {
    // Haiku 5.5 batch: (900*0.10 + 100*0.50) / 1e6 * 0.5 = 0.00007 per image
    const r = costReport([u(900, 100)], "claude-haiku-5-5", 1);
    expect(r.per1000DraftsUsd).toBeCloseTo(0.07, 9);
  });

  it("returns no cost for a model without a price", () => {
    const r = costReport([u(900, 100)], "claude-unknown", 1);
    expect(r).toMatchObject({ priced: false, totalUsd: null, per1000DraftsUsd: null, per1000RequestsUsd: null });
    expect(r.priceStatus).toMatch(/no price for claude-unknown/);
    expect(r.tokens.requests).toBe(1);
  });

  it("handles a run with no billed requests", () => {
    const r = costReport([], "claude-haiku-5-5", 0);
    expect(r).toMatchObject({ totalUsd: 0, per1000RequestsUsd: null, per1000DraftsUsd: null, avgInputTokens: 0 });
  });
});
