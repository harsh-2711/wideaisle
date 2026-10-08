import { expect, test } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PoliteClient } from "../../app/lib/scanner/polite";
import { discover, scan, type ScanRecord, type StoreRecord } from "../../scripts/census/census";

const HOME = `<!doctype html><html lang="en"><head><title>Example</title>
<script>Shopify = {}; Shopify.shop = "example.myshopify.com";
Shopify.theme = {"name":"Dawn","schema_name":"Dawn","schema_version":"15.0.0","theme_store_id":887,"role":"main"};</script>
<script src="https://cdn.shopify.com/x.js"></script></head>
<body><main><h1>Example</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
<a href="/collections/shirts">Shirts</a> <a href="/products/linen-shirt">Linen shirt</a></main></body></html>`;
const COLLECTION = `<!doctype html><html lang="en"><head><title>Shirts</title></head><body><main><a href="/cart"><svg></svg></a></main></body></html>`;
const PRODUCT = `<!doctype html><html lang="en"><head><title>Linen</title></head><body><main><form><input type="email" name="e"></form></main></body></html>`;

test("the census finds the store, respects robots.txt and scans the sampled pages", async ({ browser }) => {
  const hits: { path: string; ua: string }[] = [];
  const server = http.createServer((req, res) => {
    hits.push({ path: req.url ?? "", ua: String(req.headers["user-agent"]) });
    const pages: Record<string, string> = {
      "/robots.txt": "User-agent: *\nDisallow: /cart\n",
      "/": HOME,
      "/collections/shirts": COLLECTION,
      "/products/linen-shirt": PRODUCT,
    };
    const body = pages[req.url ?? ""];
    res.writeHead(body ? 200 : 404, { "content-type": req.url === "/robots.txt" ? "text/plain" : "text/html" });
    res.end(body ?? "not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-census-"));
  try {
    const client = new PoliteClient({ contact: "census@example.com", minDelayMs: 50, allowPrivate: true });
    const storesFile = path.join(dir, "stores.jsonl");
    await discover([`127.0.0.1:${port}`], storesFile, client, { scheme: "http" });
    const stores = fs.readFileSync(storesFile, "utf8").trim().split("\n").map((l) => JSON.parse(l) as StoreRecord);
    expect(stores[0].isShopify).toBe(true);
    expect(stores[0].theme?.schemaName).toBe("Dawn");

    const scansFile = path.join(dir, "scans.jsonl");
    await scan(stores, scansFile, client, { browser });
    const [record] = fs.readFileSync(scansFile, "utf8").trim().split("\n").map((l) => JSON.parse(l) as ScanRecord);
    expect(record.pages.map((p) => p.kind)).toEqual(["home", "collection", "product"]);
    expect(record.skipped).toEqual([{ kind: "cart", reason: "robots.txt disallows it" }]);
    expect(record.pages[0].sixTypes["missing-alt"]).toBe(1);
    expect(record.pages[1].sixTypes["empty-link"]).toBe(1);
    expect(record.pages[2].sixTypes["missing-label"]).toBe(1);

    // Never fetched the cart, and every request named us.
    expect(hits.some((h) => h.path === "/cart")).toBe(false);
    expect(hits.every((h) => h.ua.includes("contact: census@example.com"))).toBe(true);

    // A second run resumes: nothing new is scanned.
    const before = hits.length;
    await scan(stores, scansFile, client, { browser });
    expect(hits.length).toBe(before);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
