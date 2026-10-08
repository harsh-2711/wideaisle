import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyWebhook } from "../../app/lib/webhooks/verify.server";

const SECRET = "test-secret";

let n = 0;
const OPTS = { topics: ["app/uninstalled"] };

function hook(body: string, opts: { secret?: string; shop?: string; topic?: string; hmac?: string; at?: string; id?: string } = {}) {
  const hmac = opts.hmac ?? createHmac("sha256", opts.secret ?? SECRET).update(body).digest("base64");
  return new Request("https://app.example/webhooks/app/uninstalled", {
    method: "POST",
    body,
    headers: {
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-shop-domain": opts.shop ?? "test.myshopify.com",
      "x-shopify-topic": opts.topic ?? "app/uninstalled",
      "x-shopify-triggered-at": opts.at ?? new Date().toISOString(),
      "x-shopify-webhook-id": opts.id ?? `id-${++n}`,
    },
  });
}

describe("verifyShopifyWebhook", () => {
  it("accepts a correctly signed webhook", async () => {
    const res = await verifyShopifyWebhook(hook('{"id":1}', { id: "w-1" }), SECRET, OPTS);
    expect(res).toEqual({ topic: "app/uninstalled", shop: "test.myshopify.com", payload: { id: 1 }, webhookId: "w-1" });
  });

  it("rejects a wrong secret, a tampered body and a missing signature", async () => {
    expect(await verifyShopifyWebhook(hook("{}", { secret: "other" }), SECRET, OPTS)).toBeNull();
    const signed = createHmac("sha256", SECRET).update('{"id":1}').digest("base64");
    expect(await verifyShopifyWebhook(hook('{"id":2}', { hmac: signed }), SECRET, OPTS)).toBeNull();
    expect(await verifyShopifyWebhook(hook("{}", { hmac: "" }), SECRET, OPTS)).toBeNull();
  });

  it("rejects a bad shop domain or missing topic", async () => {
    expect(await verifyShopifyWebhook(hook("{}", { shop: "evil.example.com" }), SECRET, OPTS)).toBeNull();
    expect(await verifyShopifyWebhook(hook("{}", { topic: "" }), SECRET, OPTS)).toBeNull();
  });

  it("refuses to run without a secret", async () => {
    await expect(verifyShopifyWebhook(hook("{}"), "", OPTS)).rejects.toThrow(/SHOPIFY_API_SECRET/);
  });

  it("rejects a topic this route does not handle", async () => {
    expect(await verifyShopifyWebhook(hook("{}", { topic: "customers/redact" }), SECRET, OPTS)).toBeNull();
  });

  it("rejects stale, future-dated and repeated deliveries", async () => {
    const old = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(await verifyShopifyWebhook(hook("{}", { at: old }), SECRET, OPTS)).toBeNull();
    expect(await verifyShopifyWebhook(hook("{}", { at: future }), SECRET, OPTS)).toBeNull();
    expect(await verifyShopifyWebhook(hook("{}", { id: "dup" }), SECRET, OPTS)).not.toBeNull();
    expect(await verifyShopifyWebhook(hook("{}", { id: "dup" }), SECRET, OPTS)).toBeNull();
  });
});
