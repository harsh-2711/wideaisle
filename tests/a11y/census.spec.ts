import { expect, test } from "@playwright/test";
import dgram from "node:dgram";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PoliteClient } from "../../app/lib/scanner/polite";
import { discover, openScanContext, scan, type ScanRecord, type StoreRecord } from "../../scripts/census/census";

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
    expect(record.skipped).toEqual([{ kind: "cart", reason: expect.stringMatching(/^robots.txt disallows .*\/cart$/) }]);
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

test("the scan browser reaches no private address, by HTTP or WebRTC", async ({ browser }) => {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    res.end("x");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const packets: number[] = [];
  const udp = dgram.createSocket("udp4");
  udp.on("message", (m) => packets.push(m.length));
  await new Promise<void>((r) => udp.bind(0, "127.0.0.1", r));
  const udpPort = udp.address().port;

  // A strict client: the store name resolves to a public address, nothing
  // private is allowed, and robots.txt is missing (allow all).
  const client = new PoliteClient({
    contact: "census@example.com",
    minDelayMs: 0,
    lookup: async () => ["93.184.216.34"],
    fetchImpl: async () => new Response("", { status: 404 }),
  });
  const ctx = await openScanContext(browser, client, "store.test");
  try {
    const page = await ctx.context.newPage();
    const html = `<!doctype html><html lang="en"><head><title>Hostile</title>
<link rel="stylesheet" href="http://localhost:${port}/css">
<script src="http://127.0.0.1:${port}/script.js"></script></head>
<body><iframe src="http://169.254.169.254/latest/meta-data/"></iframe>
<script>
fetch("http://127.0.0.1:${port}/fetch").catch(() => {});
navigator.sendBeacon("http://[::1]:${port}/beacon", "x");
window.rtcType = typeof RTCPeerConnection;
try {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${udpPort}" }] });
  pc.createDataChannel("x");
  pc.createOffer().then((o) => pc.setLocalDescription(o));
} catch (e) {}
</script></body></html>`;
    await page.route("http://store.test/", (route) => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://store.test/");
    await page.waitForTimeout(1500);
    expect(hits).toEqual([]);
    expect(packets).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { rtcType: string }).rtcType)).toBe("undefined");
    expect([...ctx.proxy.blocked]).toEqual(expect.arrayContaining(["localhost", "127.0.0.1", "169.254.169.254"]));
  } finally {
    await ctx.close();
    server.close();
    udp.close();
  }
});

test("browser redirects are vetted before the browser requests them", async ({ browser }) => {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    const redirects: Record<string, string> = { "/a": "/b", "/c": "/secret", "/d": `http://localhost:${port}/x`, "/f": "/b#top" };
    // A script that navigates while the page is still parsing.
    if (req.url === "/g") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<!doctype html><html lang="en"><head><title>g</title><script>location.href = "/h";</script></head><body>g</body></html>`);
    }
    // The same, from a page whose Referer is only its origin, and from one
    // that rewrote its own URL first.
    if (req.url === "/i" || req.url === "/j") {
      res.writeHead(200, { "content-type": "text/html", "referrer-policy": "origin" });
      const rewrite = req.url === "/j" ? `history.replaceState(null, "", "/j?variant=1");` : "";
      return res.end(`<!doctype html><html lang="en"><head><title>${req.url}</title><script>${rewrite}location.href = "/h";</script></head><body>i</body></html>`);
    }
    if (req.url === "/robots.txt") return res.end("User-agent: *\nDisallow: /secret\n");
    const to = redirects[req.url ?? ""];
    if (to) {
      res.writeHead(302, { location: to });
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/html" });
    // A page script tries to navigate somewhere the scan did not ask for.
    res.end(`<!doctype html><html lang="en"><title>b</title><script>setTimeout(() => { location.href = "/e"; }, 10)</script></html>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  const client = new PoliteClient({ contact: "census@example.com", minDelayMs: 0, allowPrivate: true });
  const ctx = await openScanContext(browser, client, `127.0.0.1:${port}`);
  try {
    const page = await ctx.context.newPage();
    expect(await client.pageTurn(origin + "/a")).toBeNull();
    const ok = await ctx.goto(page, origin + "/a");
    expect("res" in ok && ok.res?.status()).toBe(200);
    expect("url" in ok && ok.url).toBe(origin + "/b");
    await page.waitForTimeout(300);

    expect(await ctx.goto(page, origin + "/c")).toMatchObject({ skip: expect.stringMatching(/robots.txt disallows .*\/secret/) });
    expect(await ctx.goto(page, origin + "/d")).toMatchObject({ skip: expect.stringMatching(/another site/) });

    // A fragment in Location does not break the match with what Chromium requests.
    const frag = await ctx.goto(page, origin + "/f");
    expect("url" in frag && frag.url).toBe(origin + "/b#top");
    // A navigation during parsing is followed as a vetted hop, not a 30 s hang.
    const started = Date.now();
    const parsed = await ctx.goto(page, origin + "/g");
    expect("url" in parsed && parsed.url).toBe(origin + "/h");
    expect(Date.now() - started).toBeLessThan(10_000);
    for (const from of ["/i", "/j"]) {
      const t0 = Date.now();
      const hop = await ctx.goto(page, origin + from);
      expect("url" in hop && hop.url).toBe(origin + "/h");
      expect(Date.now() - t0).toBeLessThan(10_000);
    }

    expect(hits).not.toContain("/secret");
    expect(hits).not.toContain("/x");
    expect(hits).not.toContain("/e");
  } finally {
    await ctx.close();
    server.close();
  }
});
