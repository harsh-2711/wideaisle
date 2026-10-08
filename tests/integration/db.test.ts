import { Session } from "@shopify/shopify-api";
import { DrizzleSessionStoragePostgres } from "@shopify/shopify-app-session-storage-drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../app/db/schema";

// Runs only with a database: set DATABASE_URL (CI starts a Postgres service).
// CI also sets REQUIRE_DATABASE=1 so a missing database fails instead of skipping.
const url = process.env.DATABASE_URL;
if (!url && process.env.REQUIRE_DATABASE === "1") throw new Error("REQUIRE_DATABASE=1 but DATABASE_URL is not set");

describe.skipIf(!url)("Postgres", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await migrate(drizzle(pool, { schema }), { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("stores, loads and deletes a Shopify session through the Drizzle adapter", async () => {
    const storage = new DrizzleSessionStoragePostgres(drizzle(pool, { schema }), schema.sessionTable);
    const session = new Session({
      id: "offline_test.myshopify.com",
      shop: "test.myshopify.com",
      state: "state",
      isOnline: false,
      scope: "read_themes",
      accessToken: "shpat_test",
    });
    expect(await storage.storeSession(session)).toBe(true);
    const loaded = await storage.loadSession(session.id);
    expect(loaded?.shop).toBe("test.myshopify.com");
    expect(loaded?.accessToken).toBe("shpat_test");
    expect(await storage.findSessionsByShop("test.myshopify.com")).toHaveLength(1);
    expect(await storage.deleteSession(session.id)).toBe(true);
    expect(await storage.loadSession(session.id)).toBeUndefined();
  });

  it("deletes a shop's sessions on uninstall and shop/redact, and rejects bad signatures", async () => {
    process.env.SHOPIFY_API_SECRET = "test-secret";
    const db = drizzle(pool, { schema });
    const insert = (id: string) =>
      db.insert(schema.sessionTable).values({ id, shop: "gone.myshopify.com", state: "s", accessToken: "shpat_x" });
    const signed = (topic: string, body = "{}", secret = "test-secret") =>
      ({
        request: new Request("https://app.example/webhooks", {
          method: "POST",
          body,
          headers: {
            "x-shopify-hmac-sha256": createHmac("sha256", secret).update(body).digest("base64"),
            "x-shopify-shop-domain": "gone.myshopify.com",
            "x-shopify-topic": topic,
            "x-shopify-triggered-at": new Date().toISOString(),
            "x-shopify-webhook-id": `${topic}-${secret}-${Math.random()}`,
          },
        }),
      }) as never;
    const count = async () => (await db.select().from(schema.sessionTable).where(eq(schema.sessionTable.shop, "gone.myshopify.com"))).length;

    const uninstalled = await import("../../app/routes/webhooks.app.uninstalled");
    const compliance = await import("../../app/routes/webhooks.compliance");

    await insert("offline_gone");
    expect((await uninstalled.action(signed("app/uninstalled", "{}", "wrong"))).status).toBe(401);
    expect(await count()).toBe(1);
    expect((await uninstalled.action(signed("app/uninstalled"))).status).toBe(200);
    expect(await count()).toBe(0);

    expect((await uninstalled.action(signed("shop/redact"))).status).toBe(401);
    await insert("offline_gone_2");
    expect((await compliance.action(signed("customers/redact"))).status).toBe(200);
    expect(await count()).toBe(1);
    expect((await compliance.action(signed("shop/redact"))).status).toBe(200);
    expect(await count()).toBe(0);
  });

  it("sends and fetches a pg-boss job", async () => {
    const boss = new PgBoss({ connectionString: url });
    await boss.start();
    await boss.createQueue("scan-test");
    const id = await boss.send("scan-test", { shop: "test.myshopify.com" });
    expect(id).toBeTruthy();
    const [job] = await boss.fetch<{ shop: string }>("scan-test");
    expect(job?.data.shop).toBe("test.myshopify.com");
    await boss.complete("scan-test", job!.id);
    await boss.stop({ graceful: false });
  }, 30000);
});
