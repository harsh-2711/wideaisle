import { Session } from "@shopify/shopify-api";
import { DrizzleSessionStoragePostgres } from "@shopify/shopify-app-session-storage-drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../app/db/schema";

// Runs only with a database: set DATABASE_URL (CI starts a Postgres service).
const url = process.env.DATABASE_URL;

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
