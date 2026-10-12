// The census keeps a store's CSS, JS and fonts for the rest of its scan, as
// a visitor's browser would (T-025). A local server counts what reaches it.
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { Browser } from "playwright";
import { PoliteClient } from "../../app/lib/scanner/polite";
import { scan, type ScanRecord, type StoreRecord } from "../../scripts/census/census";

const YEAR = "public, max-age=31536000";
// Over the 5 MB entry cap.
const BIG = 5_200_000;
const PAGES = ["/", "/collections/shirts", "/products/linen-shirt", "/cart"];
const KINDS = ["home", "collection", "product", "cart"];

// A script that adds one element to the page once it is parsed.
const adds = (tag: string, props: Record<string, string> = {}) =>
  `document.addEventListener("DOMContentLoaded", () => { const el = document.createElement(${JSON.stringify(tag)}); Object.assign(el, ${JSON.stringify(props)}); document.querySelector("main").append(el); });`;

// Every host resolves to one local server; the Host header picks what it
// serves. Each page uses every asset, and each asset leaves a mark that axe
// reports, so a page's results show which assets ran on it:
//   theme.css   .faint text is low-contrast; asks for w.woff2
//   theme.js    an empty button
//   fresh.js    an unlabelled input; sent with no-store
//   big.js      an empty link; over the entry cap
//   cdn.test/shared.css  the same file for every store, also read by axe
async function startStores(browser: Browser) {
  const hits: string[] = [];
  let port = 0;
  const html = (title: string) => `<!doctype html><html lang="en"><head><title>${title}</title>
<link rel="stylesheet" href="/assets/theme.css">
<link rel="stylesheet" href="http://cdn.test:${port}/shared.css">
<script src="/assets/theme.js"></script>
<script src="/assets/fresh.js"></script>
<script src="/assets/big.js"></script></head>
<body><main><h1>${title}</h1><p class="faint">Faint text</p>
<a href="/collections/shirts">Shirts</a> <a href="/products/linen-shirt">Linen shirt</a></main></body></html>`;
  const assets: Record<string, { type: string; cache: string; body: string }> = {
    "/assets/theme.css": {
      type: "text/css",
      cache: YEAR,
      body: `@font-face { font-family: W; src: url(/assets/w.woff2) format("woff2"); font-display: swap; }
.faint { color: #ccc; background: #fff; font-family: W, sans-serif; }`,
    },
    "/assets/theme.js": { type: "text/javascript", cache: YEAR, body: adds("button") },
    "/assets/fresh.js": { type: "text/javascript", cache: "no-store", body: adds("input", { type: "text" }) },
    "/assets/big.js": { type: "text/javascript", cache: YEAR, body: `/*${"x".repeat(BIG)}*/\n${adds("a", { href: "/big" })}` },
    "/assets/w.woff2": { type: "font/woff2", cache: YEAR, body: "not a real font" },
  };
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host).split(":")[0];
    const url = req.url ?? "/";
    hits.push(host + url);
    if (host === "cdn.test" && url === "/shared.css") {
      // As public CDNs send it. axe-core reads cross-origin stylesheets
      // again by XHR on every page, and this lets those reads use the copy.
      res.writeHead(200, { "content-type": "text/css", "cache-control": YEAR, "access-control-allow-origin": "*" });
      return res.end("h1 { margin: 0; }");
    }
    const asset = host !== "cdn.test" ? assets[url] : undefined;
    if (asset) {
      res.writeHead(200, { "content-type": asset.type, "cache-control": asset.cache });
      return res.end(asset.body);
    }
    if (host !== "cdn.test" && PAGES.includes(url)) {
      res.writeHead(200, { "content-type": "text/html", "cache-control": "private, no-store" });
      return res.end(html(`${host} ${url}`));
    }
    // robots.txt and anything else: not found, so every page is allowed.
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-census-cache-"));
  return {
    count: (host: string, url: string) => hits.filter((h) => h === host + url).length,
    // Scans the stores one after the other, as one census worker does.
    async scan(names: string[]): Promise<ScanRecord[]> {
      const stores: StoreRecord[] = names.map((name) => ({
        domain: `${name}:${port}`,
        origin: `http://${name}:${port}`,
        checkedAt: new Date().toISOString(),
        isShopify: true,
        shopDomain: null,
        theme: null,
        apps: [],
      }));
      const client = new PoliteClient({ contact: "census@example.com", minDelayMs: 50, allowPrivate: true, lookup: async () => ["127.0.0.1"] });
      const out = path.join(dir, "scans.jsonl");
      await scan(stores, out, client, { browser, concurrency: 1 });
      return fs.readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l) as ScanRecord);
    },
    close() {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("a store's CSS, JS and fonts are fetched once, and no-store files on every page", async ({ browser }) => {
  test.setTimeout(60_000);
  const stores = await startStores(browser);
  try {
    const [record] = await stores.scan(["a.test"]);
    expect(record.pages.map((p) => p.kind)).toEqual(KINDS);
    for (const url of ["/assets/theme.css", "/assets/theme.js", "/assets/w.woff2"]) expect(stores.count("a.test", url), url).toBe(1);
    expect(stores.count("cdn.test", "/shared.css")).toBe(1);
    expect(stores.count("a.test", "/assets/fresh.js")).toBe(4);
    // Pages are never cached.
    for (const url of PAGES) expect(stores.count("a.test", url), url).toBe(1);
    // The cached CSS and JS still applied on the pages that did not fetch them.
    for (const p of record.pages) {
      expect(p.sixTypes["low-contrast"], p.kind).toBeGreaterThan(0);
      expect(p.sixTypes["empty-button"], p.kind).toBe(1);
      expect(p.sixTypes["missing-label"], p.kind).toBe(1);
    }
  } finally {
    stores.close();
  }
});

test("a file over the entry cap is not cached and still loads on every page", async ({ browser }) => {
  test.setTimeout(60_000);
  const stores = await startStores(browser);
  try {
    const [record] = await stores.scan(["a.test"]);
    expect(record.pages.map((p) => p.kind)).toEqual(KINDS);
    // theme.js has the same headers and was cached; big.js was not.
    expect(stores.count("a.test", "/assets/theme.js")).toBe(1);
    expect(stores.count("a.test", "/assets/big.js")).toBe(4);
    for (const p of record.pages) expect(p.sixTypes["empty-link"], p.kind).toBe(1);
  } finally {
    stores.close();
  }
});

test("two stores scanned one after the other share no cached files", async ({ browser }) => {
  test.setTimeout(90_000);
  const stores = await startStores(browser);
  try {
    const records = await stores.scan(["a.test", "b.test"]);
    expect(records.map((r) => r.pages.length)).toEqual([4, 4]);
    // The same CDN file is fetched again for the second store.
    expect(stores.count("cdn.test", "/shared.css")).toBe(2);
    for (const host of ["a.test", "b.test"]) {
      for (const url of ["/assets/theme.css", "/assets/theme.js", "/assets/w.woff2"]) expect(stores.count(host, url), host + url).toBe(1);
    }
  } finally {
    stores.close();
  }
});
