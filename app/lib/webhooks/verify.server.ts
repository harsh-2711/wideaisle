import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifiedWebhook {
  topic: string;
  shop: string;
  payload: unknown;
  webhookId: string;
}

export interface VerifyOptions {
  // Topics this route accepts. The HMAC covers the body only, so without
  // this a signed body could be replayed to another route under another topic.
  topics: string[];
  // Deliveries older than this are rejected as replays. Shopify retries a
  // failed delivery for up to 48 hours, so the default allows 49.
  maxAgeMs?: number;
  now?: number;
}

const DAY = 24 * 60 * 60 * 1000;
// Webhook ids seen recently, to drop duplicate and replayed deliveries.
// In memory per process; good enough for one server (D-10).
const seen = new Map<string, number>();

function remember(id: string, now: number, ttl: number): boolean {
  for (const [k, t] of seen) if (now - t > ttl) seen.delete(k);
  if (seen.has(id)) return false;
  seen.set(id, now);
  return true;
}

// Checks Shopify's HMAC on a webhook without loading or refreshing the shop's
// session. Uninstall and privacy webhooks must work after the app has lost
// access, when a token refresh would fail.
export async function verifyShopifyWebhook(request: Request, secret: string, opts: VerifyOptions): Promise<VerifiedWebhook | null> {
  if (!secret) throw new Error("SHOPIFY_API_SECRET is not set");
  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? 49 * 60 * 60 * 1000;
  const header = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const body = await request.text();
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(header, "base64");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  const topic = request.headers.get("x-shopify-topic") ?? "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop) || !opts.topics.includes(topic)) return null;
  const triggeredAt = Date.parse(request.headers.get("x-shopify-triggered-at") ?? "");
  if (Number.isNaN(triggeredAt) || now - triggeredAt > maxAge || triggeredAt - now > 5 * 60 * 1000) return null;
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";
  if (!webhookId || !remember(webhookId, now, Math.max(maxAge, DAY))) return null;
  let payload: unknown = null;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
  return { topic, shop, payload, webhookId };
}
