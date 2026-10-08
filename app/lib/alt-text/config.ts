// Settings for the alt-text batch spike (T-032). The model ID, request
// limits and prices live here and nowhere else.

/**
 * Default model: the latest Haiku. The plan (roadmap, D-11) named Haiku 4.5;
 * Haiku 5.5 replaced it as the current Haiku. Override with ALT_TEXT_MODEL.
 */
export const DEFAULT_ALT_TEXT_MODEL = "claude-haiku-5-5";

/** Alt text should stay under this many characters. Longer drafts need review. */
export const ALT_MAX_CHARS = 125;

/** Width in px we ask the Shopify CDN for. 512 px square is about 361 image tokens. */
export const DEFAULT_IMAGE_WIDTH = 512;

/** Room for low-effort thinking plus a JSON answer of about 100 tokens. */
export const DEFAULT_MAX_TOKENS = 1024;

/** Merchant text longer than this is cut before it reaches the prompt. */
export const MAX_MERCHANT_TEXT = 512;

// Spending limits. Each has a default and a hard ceiling that no option or
// flag can raise. They count across every command on the same run folder.

/** Images one run folder may hold in total, counting earlier commands on the same run. */
export const DEFAULT_MAX_IMAGES = 250;
export const MAX_IMAGES_CEILING = 1000;

/** Requests one run may send in total, first tries and retries together. */
export const DEFAULT_MAX_REQUESTS = 500;
export const MAX_REQUESTS_CEILING = 3000;

/** Times one image may be sent, first try included. */
export const DEFAULT_MAX_ATTEMPTS = 2;
export const MAX_ATTEMPTS_CEILING = 3;

/** The Batch API takes up to 100,000 requests per batch. */
export const MAX_REQUESTS_PER_BATCH = 100_000;

export type Effort = "low" | "medium" | "high";

type Env = Record<string, string | undefined>;

export function altTextModel(env: Env = process.env): string {
  return env.ALT_TEXT_MODEL?.trim() || DEFAULT_ALT_TEXT_MODEL;
}

// Haiku 4.5 and older models reject the effort parameter.
const NO_EFFORT = [/^claude-haiku-4-5/, /^claude-sonnet-4-5/, /^claude-opus-4-1/, /^claude-3/];

/** Effort for a model: "low" keeps thinking short, or undefined where the model has no effort setting. */
export function effortFor(model: string): Effort | undefined {
  return NO_EFFORT.some((re) => re.test(model)) ? undefined : "low";
}

export interface TokenPrices {
  /** USD per million tokens, standard (not batch) rates. */
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
}

export interface ModelPrice extends TokenPrices {
  /** The Batch API multiplies every token price by this. */
  batchMultiplier: number;
  /** Prompts over this many tokens use the `long` rates (Haiku 5.5 only). */
  longPromptThreshold?: number;
  long?: TokenPrices;
  /** Every price stays "to verify" until checked against a real invoice. */
  status: "to verify";
  source: string;
  read: string;
}

const PRICING_PAGE = "https://platform.claude.com/docs/en/about-claude/pricing";

/**
 * Prices read from the pricing page on 2026-10-08. They are "to verify":
 * check them against the Console usage page after the first real run (Q-04).
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheWrite5m: 0.125,
    cacheRead: 0.01,
    batchMultiplier: 0.5,
    longPromptThreshold: 100_000,
    long: { input: 0.5, output: 2.5, cacheWrite5m: 0.625, cacheRead: 0.05 },
    status: "to verify",
    source: PRICING_PAGE,
    read: "2026-10-08",
  },
  "claude-haiku-4-5": {
    input: 1,
    output: 5,
    cacheWrite5m: 1.25,
    cacheRead: 0.1,
    batchMultiplier: 0.5,
    status: "to verify",
    source: PRICING_PAGE,
    read: "2026-10-08",
  },
};

export function priceFor(model: string, prices: Record<string, ModelPrice> = MODEL_PRICES): ModelPrice | undefined {
  return prices[model] ?? prices[model.replace(/-\d{8}$/, "")];
}
