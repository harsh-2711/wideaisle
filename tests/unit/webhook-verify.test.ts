import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyWebhook } from "../../app/lib/webhooks/verify.server";

const SECRET = "test-secret";

function hook(body: string, opts: { secret?: string; shop?: string; topic?: string; hmac?: string } = {}) {
  const hmac = opts.hmac ?? createHmac("sha256", opts.secret ?? SECRET).update(body).digest("base64");
  return new Request("https://app.example/webhooks/app/uninstalled", {
    method: "POST",
    body,
    headers: {
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-shop-domain": opts.shop ?? "test.myshopify.com",
      "x-shopify-topic": opts.topic ?? "app/uninstalled",
    },
  });
}

describe("verifyShopifyWebhook", () => {
  it("accepts a correctly signed webhook", async () => {
    const res = await verifyShopifyWebhook(hook('{"id":1}'), SECRET);
    expect(res).toEqual({ topic: "app/uninstalled", shop: "test.myshopify.com", payload: { id: 1 } });
  });

  it("rejects a wrong secret, a tampered body and a missing signature", async () => {
    expect(await verifyShopifyWebhook(hook("{}", { secret: "other" }), SECRET)).toBeNull();
    const signed = createHmac("sha256", SECRET).update('{"id":1}').digest("base64");
    expect(await verifyShopifyWebhook(hook('{"id":2}', { hmac: signed }), SECRET)).toBeNull();
    expect(await verifyShopifyWebhook(hook("{}", { hmac: "" }), SECRET)).toBeNull();
  });

  it("rejects a bad shop domain or missing topic", async () => {
    expect(await verifyShopifyWebhook(hook("{}", { shop: "evil.example.com" }), SECRET)).toBeNull();
    expect(await verifyShopifyWebhook(hook("{}", { topic: "" }), SECRET)).toBeNull();
  });

  it("refuses to run without a secret", async () => {
    await expect(verifyShopifyWebhook(hook("{}"), "")).rejects.toThrow(/SHOPIFY_API_SECRET/);
  });
});
