import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifiedWebhook {
  topic: string;
  shop: string;
  payload: unknown;
  webhookId: string;
  // Call after the handler succeeds. Only then is the id remembered, so a
  // failed handler's retry from Shopify is processed, not dropped.
  done: () => void;
}

export type VerifyResult =
  | { ok: true; hook: VerifiedWebhook }
  | { ok: false; status: 200 | 401; reason: string };

export interface VerifyOptions {
  // Topics this route accepts. The HMAC covers the body only, so without
  // this a signed body could be replayed to another route under another topic.
  topics: string[];
  // Deliveries older than this are rejected as replays. Shopify retries a
  // failed delivery for up to 48 hours, so the default allows 49.
  maxAgeMs?: number;
  now?: number;
}

const MAX_SEEN = 10000;
// Ids of webhooks already handled, to answer duplicates without redoing
// work. In memory per process, capped in size; good enough for one server
// (D-10). Only HMAC-valid deliveries can add entries.
const seen = new Map<string, number>();

function prune(now: number, ttl: number) {
  for (const [k, t] of seen) {
    if (now - t <= ttl && seen.size <= MAX_SEEN) break; // insertion order: oldest first
    seen.delete(k);
  }
}

export function resetSeenWebhooks() {
  seen.clear();
}

// Checks Shopify's HMAC on a webhook without loading or refreshing the shop's
// session. Uninstall and privacy webhooks must work after the app has lost
// access, when a token refresh would fail.
export async function verifyShopifyWebhook(request: Request, secret: string, opts: VerifyOptions): Promise<VerifyResult> {
  if (!secret) throw new Error("SHOPIFY_API_SECRET is not set");
  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? 49 * 60 * 60 * 1000;
  const fail = (reason: string): VerifyResult => ({ ok: false, status: 401, reason });

  const header = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const body = await request.text();
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  const given = Buffer.from(header, "base64");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return fail("bad signature");

  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  const topic = request.headers.get("x-shopify-topic") ?? "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return fail("bad shop domain");
  if (!opts.topics.includes(topic)) return fail(`topic ${topic || "(none)"} not handled here`);

  const triggeredAt = Date.parse(request.headers.get("x-shopify-triggered-at") ?? "");
  if (Number.isNaN(triggeredAt) || now - triggeredAt > maxAge || triggeredAt - now > 5 * 60 * 1000) return fail("stale or future-dated");

  const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";
  if (!webhookId) return fail("no webhook id");
  prune(now, maxAge);
  if (seen.has(webhookId)) return { ok: false, status: 200, reason: "already handled" };

  let payload: unknown = null;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    return fail("body is not JSON");
  }
  return {
    ok: true,
    hook: { topic, shop, payload, webhookId, done: () => void seen.set(webhookId, now) },
  };
}
