// Cost from the token usage the Batch API returns. Prices come from the
// config table and stay "to verify" until checked against an invoice.
import { MODEL_PRICES, priceFor, type ModelPrice, type TokenPrices } from "./config";
import type { TokenUsage } from "./types";

export interface UsageTotals {
  requests: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface CostReport {
  model: string;
  /** False when the model has no row in the price table. Costs are then null. */
  priced: boolean;
  priceStatus: string;
  tokens: UsageTotals;
  totalUsd: number | null;
  /** Cost per 1,000 billed requests (every succeeded result, usable or not). */
  per1000RequestsUsd: number | null;
  /** Cost per 1,000 images that got a draft. Retries and unusable output are included in the cost. */
  per1000DraftsUsd: number | null;
  avgInputTokens: number;
  avgOutputTokens: number;
}

export function sumUsage(usages: TokenUsage[]): UsageTotals {
  const t: UsageTotals = { requests: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  for (const u of usages) {
    t.requests += 1;
    t.input += u.input_tokens;
    t.output += u.output_tokens;
    t.cacheWrite += u.cache_creation_input_tokens;
    t.cacheRead += u.cache_read_input_tokens;
  }
  return t;
}

/** Cost of one request in USD at batch rates. Long prompts use the long rates where the model has them. */
export function requestCostUsd(u: TokenUsage, price: ModelPrice): number {
  const promptTokens = u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens;
  const rates: TokenPrices =
    price.long && price.longPromptThreshold !== undefined && promptTokens > price.longPromptThreshold ? price.long : price;
  const perToken =
    u.input_tokens * rates.input +
    u.output_tokens * rates.output +
    u.cache_creation_input_tokens * rates.cacheWrite5m +
    u.cache_read_input_tokens * rates.cacheRead;
  return (perToken / 1_000_000) * price.batchMultiplier;
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Guesses used only for the estimate printed before a run. The real cost comes from usage. */
export const ESTIMATE_GUESS = {
  /** Text tokens per character, rounded up for the newer tokenizer. */
  tokensPerChar: 0.3,
  /** Structured-output and message overhead per request. */
  overheadTokens: 200,
  /** JSON answer plus low-effort thinking. */
  outputTokens: 200,
  /** Portrait product photos are often 4:5, so assume the long side is 1.25 x the width. */
  heightRatio: 1.25,
};

export interface RunEstimate {
  images: number;
  inputTokensPerImage: number;
  outputTokensPerImage: number;
  totalUsd: number | null;
  per1000Usd: number | null;
  priceStatus: string;
}

/**
 * A rough cost estimate before anything is sent, from prompt length and
 * image size. It is a guess, not a quote: Spike C measures the real figure.
 */
export function estimateRun(
  promptChars: number[],
  imageTokensPerImage: number,
  model: string,
  prices: Record<string, ModelPrice> = MODEL_PRICES,
): RunEstimate {
  const g = ESTIMATE_GUESS;
  const avgChars = promptChars.length ? promptChars.reduce((a, b) => a + b, 0) / promptChars.length : 0;
  const inputTokensPerImage = Math.round(avgChars * g.tokensPerChar + g.overheadTokens + imageTokensPerImage);
  const usage: TokenUsage = { input_tokens: inputTokensPerImage, output_tokens: g.outputTokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const price = priceFor(model, prices);
  const each = price ? requestCostUsd(usage, price) : null;
  return {
    images: promptChars.length,
    inputTokensPerImage,
    outputTokensPerImage: g.outputTokens,
    totalUsd: each === null ? null : round(each * promptChars.length),
    per1000Usd: each === null ? null : round(each * 1000),
    priceStatus: price ? `${price.status}: read from ${price.source} on ${price.read}` : `no price for ${model}`,
  };
}

export function costReport(
  usages: TokenUsage[],
  model: string,
  drafts: number,
  prices: Record<string, ModelPrice> = MODEL_PRICES,
): CostReport {
  const tokens = sumUsage(usages);
  const price = priceFor(model, prices);
  const avgInputTokens = tokens.requests ? Math.round((tokens.input + tokens.cacheWrite + tokens.cacheRead) / tokens.requests) : 0;
  const avgOutputTokens = tokens.requests ? Math.round(tokens.output / tokens.requests) : 0;
  if (!price) {
    return {
      model,
      priced: false,
      priceStatus: `no price for ${model} in MODEL_PRICES; add it before quoting a cost`,
      tokens,
      totalUsd: null,
      per1000RequestsUsd: null,
      per1000DraftsUsd: null,
      avgInputTokens,
      avgOutputTokens,
    };
  }
  const total = usages.reduce((sum, u) => sum + requestCostUsd(u, price), 0);
  return {
    model,
    priced: true,
    priceStatus: `${price.status}: read from ${price.source} on ${price.read}`,
    tokens,
    totalUsd: round(total),
    per1000RequestsUsd: tokens.requests ? round((total / tokens.requests) * 1000) : null,
    per1000DraftsUsd: drafts ? round((total / drafts) * 1000) : null,
    avgInputTokens,
    avgOutputTokens,
  };
}
