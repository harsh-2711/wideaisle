import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifiedWebhook {
  topic: string;
  shop: string;
  payload: unknown;
}

// Checks Shopify's HMAC on a webhook without loading or refreshing the shop's
// session. Uninstall and privacy webhooks must work after the app has lost
// access, when a token refresh would fail.
export async function verifyShopifyWebhook(request: Request, secret: string): Promise<VerifiedWebhook | null> {
  if (!secret) throw new Error("SHOPIFY_API_SECRET is not set");
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
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop) || !topic) return null;
  let payload: unknown = null;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
  return { topic, shop, payload };
}
