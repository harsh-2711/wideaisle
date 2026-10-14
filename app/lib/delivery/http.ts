// The slice of fetch the delivery clients use. The global fetch fits it;
// tests pass a fake that replays recorded responses.
export interface ResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface RequestInitLike {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export type FetchLike = (url: string, init: RequestInitLike) => Promise<ResponseLike>;

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryPolicy {
  // Total tries, including the first.
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 6, baseDelayMs: 1000, maxDelayMs: 30_000 };

// Exponential backoff with full jitter. `random` is injectable for tests.
export function backoffMs(attempt: number, policy: RetryPolicy, random: () => number = Math.random): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  return Math.max(policy.baseDelayMs, Math.round(ceiling * (0.5 + random() / 2)));
}

// Retry-After is either seconds or an HTTP date.
export function retryAfterMs(headers: ResponseLike["headers"], now: () => number = Date.now): number | null {
  const value = headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now());
}

export function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
