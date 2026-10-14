// The census loads at most MAX_PAGE_BYTES of a page's HTML, on the wire and
// after decompression (T-028). A page over it is skipped with a clear
// reason, quickly, and the scan goes on to the next store.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { PoliteClient } from "../../app/lib/scanner/polite";
import { MAX_PAGE_BYTES, PAGE_TOO_LARGE, scan, type ScanRecord, type StoreRecord } from "../../scripts/census/census";
import { expect, test } from "./census-browser";

const KINDS = ["home", "collection", "product", "cart"];
const page = (title: string) =>
  `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1><a href="/collections/shirts">Shirts</a> <a href="/products/shirt">Shirt</a></main></body></html>`;
// Over the cap as sent, and small as sent but over the cap once decompressed.
const BIG = `<!doctype html><html lang="en"><head><title>big</title></head><body>${"<p>x</p>".repeat(Math.ceil((MAX_PAGE_BYTES * 1.2) / 8))}</body></html>`;
const BOMB = zlib.gzipSync(Buffer.alloc(MAX_PAGE_BYTES * 5, " "));

async function startStores() {
  const seen: { host: string; url: string; cookie: string }[] = [];
  const server = http.createServer((req, res) => {
    res.on("error", () => {});
    const host = String(req.headers.host).split(":")[0];
    const url = req.url ?? "/";
    seen.push({ host, url, cookie: String(req.headers.cookie ?? "") });
    if (url === "/robots.txt") return res.writeHead(404).end();
    if (host === "big.test") return res.writeHead(200, { "content-type": "text/html" }).end(BIG);
    if (host === "bomb.test") return res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }).end(BOMB);
    const cookie = host === "cookie.test" && url === "/" ? { "set-cookie": "wa_visit=1; Path=/" } : {};
    res.writeHead(200, { "content-type": "text/html", ...cookie }).end(page(`${host} ${url}`));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-census-doc-cap-"));
  return {
    seen,
    async scan(browser: import("playwright").Browser, names: string[]): Promise<ScanRecord[]> {
      const stores: StoreRecord[] = names.map((n) => ({ domain: `${n}:${port}`, origin: `http://${n}:${port}`, checkedAt: "", isShopify: true, shopDomain: null, theme: null, apps: [] }));
      const client = new PoliteClient({ contact: "census@example.com", minDelayMs: 0, allowPrivate: true, lookup: async () => ["127.0.0.1"] });
      const out = path.join(dir, `scans-${names.join("-")}.jsonl`);
      await scan(stores, out, client, { browser, concurrency: 1 });
      return fs.readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l) as ScanRecord);
    },
    close() {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("a page over the cap is skipped quickly, and the next store still scans", async ({ censusBrowser }) => {
  test.setTimeout(90_000);
  const stores = await startStores();
  try {
    const [big, bomb, ok] = await stores.scan(censusBrowser, ["big.test", "bomb.test", "ok.test"]);
    for (const r of [big, bomb]) {
      expect(r.pages, r.domain).toEqual([]);
      // Each page it tried is skipped with the reason; the product page has
      // no link to follow, since no page loaded.
      expect(r.skipped, r.domain).toEqual([
        { kind: "home", reason: PAGE_TOO_LARGE },
        { kind: "collection", reason: PAGE_TOO_LARGE },
        { kind: "product", reason: "no link found" },
        { kind: "cart", reason: PAGE_TOO_LARGE },
      ]);
      expect(r.retry, r.domain).toBeUndefined();
      expect(r.error, r.domain).toBeUndefined();
    }
    // Both capped stores together took a few seconds at most.
    expect(Date.parse(ok.scannedAt) - Date.parse(big.scannedAt)).toBeLessThan(10_000);
    expect(ok.pages.map((p) => p.kind)).toEqual(KINDS);
  } finally {
    stores.close();
  }
});

test("a cookie a page sets is sent with the store's next page", async ({ censusBrowser }) => {
  // Pages come through the census's own fetch, which sends the context's
  // cookies as route.fetch did.
  const stores = await startStores();
  try {
    const [record] = await stores.scan(censusBrowser, ["cookie.test"]);
    expect(record.pages.map((p) => p.kind)).toEqual(KINDS);
    const pages = stores.seen.filter((s) => s.host === "cookie.test" && s.url !== "/robots.txt");
    expect(pages[0]).toMatchObject({ url: "/", cookie: "" });
    for (const p of pages.slice(1)) expect(p.cookie, p.url).toBe("wa_visit=1");
  } finally {
    stores.close();
  }
});
