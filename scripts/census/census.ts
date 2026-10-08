#!/usr/bin/env -S npx tsx
// Store census (T-020).
//
//   discover  Reads domains, fetches each home page politely, and keeps the
//             Shopify stores with their theme and apps.
//   scan      For each Shopify store, scans home, a collection, a product and
//             the cart with Playwright and axe-core.
//
// Needs CENSUS_CONTACT (an email or URL, Q-02). Output is JSON lines, one
// store per line, and a run can resume: stores already in the output are
// skipped. Public pages only, robots.txt respected, no logins.
//
//   npx tsx scripts/census/census.ts discover --input domains.txt --out data/census/stores.jsonl
//   npx tsx scripts/census/census.ts scan --input data/census/stores.jsonl --out data/census/scans.jsonl
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser, type BrowserContext, type Request, type Response } from "playwright";
import { scanPage, type PageScan } from "../../app/lib/scanner/axe";
import { detectStore, sampleLinks, type StoreFacts } from "../../app/lib/scanner/detect";
import { DEFAULT_PORTS, startEgressProxy, type EgressProxy } from "../../app/lib/scanner/egress";
import { sameSite } from "../../app/lib/scanner/netguard";
import { describeSkip, isSkip, PoliteClient } from "../../app/lib/scanner/polite";

export interface StoreRecord extends StoreFacts {
  domain: string;
  origin: string | null;
  checkedAt: string;
  error?: string;
  // True when a later run should try this domain again.
  retry?: boolean;
}

export interface ScanRecord {
  domain: string;
  theme: StoreFacts["theme"];
  apps: string[];
  scannedAt: string;
  pages: (PageScan & { kind: string })[];
  skipped: { kind: string; reason: string }[];
  // Hosts the egress proxy refused while the store's pages loaded.
  blockedHosts?: string[];
  error?: string;
  retry?: boolean;
}

// A domain is retried at most this many times across runs.
export const MAX_ATTEMPTS = 3;

function readLines(file: string): string[] {
  return fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

// Reads JSON lines, skipping any that do not parse (a run cut off mid-write).
export function readRecords<T>(file: string): T[] {
  const out: T[] = [];
  for (const line of readLines(file)) {
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // ignore a truncated line
    }
  }
  return out;
}

// Domains a resumed run skips: any with a final record, or with a retryable
// error recorded MAX_ATTEMPTS times.
export function done(out: string): Set<string> {
  if (!fs.existsSync(out)) return new Set();
  const attempts = new Map<string, number>();
  const finished = new Set<string>();
  for (const r of readRecords<{ domain: string; retry?: boolean }>(out)) {
    if (!r.retry) finished.add(r.domain);
    else attempts.set(r.domain, (attempts.get(r.domain) ?? 0) + 1);
  }
  for (const [domain, n] of attempts) if (n >= MAX_ATTEMPTS) finished.add(domain);
  return finished;
}

// The last record for each domain, for readers of a resumed output file.
export function latest<T extends { domain: string }>(records: T[]): T[] {
  return [...new Map(records.map((r) => [r.domain, r])).values()];
}

function append(out: string, record: unknown) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.appendFileSync(out, JSON.stringify(record) + "\n");
}

// Domain lists come as plain domains or Tranco's "rank,domain" CSV.
export function parseDomains(lines: string[]): string[] {
  return lines.map((l) => l.split(",").pop()!.trim().toLowerCase()).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export async function discover(domains: string[], out: string, client: PoliteClient, opts: { concurrency?: number; scheme?: string } = {}) {
  const seen = done(out);
  await pool(domains.filter((d) => !seen.has(d)), opts.concurrency ?? 8, async (domain) => {
    const origin = `${opts.scheme ?? "https"}://${domain}`;
    const base: StoreRecord = { domain, origin, checkedAt: new Date().toISOString(), isShopify: false, shopDomain: null, theme: null, apps: [] };
    try {
      const res = await client.get(origin + "/");
      if (isSkip(res)) return append(out, { ...base, error: describeSkip(res), retry: res.retry || undefined });
      if (res.status >= 400) return append(out, { ...base, error: `HTTP ${res.status}`, retry: res.status >= 500 || res.status === 429 || undefined });
      const final = new URL(res.url);
      if (!sameSite(domain, final.host)) return append(out, { ...base, error: `redirected to another site (${final.host})` });
      append(out, { ...base, origin: final.origin, ...detectStore(res.text) });
    } catch (err) {
      append(out, { ...base, error: (err as Error).message.slice(0, 200), retry: true });
    }
  });
}

// Removes WebRTC from every page and frame: its UDP traffic does not go
// through the proxy, and a page could aim STUN at a private address.
function noWebRtc() {
  const w = globalThis as unknown as Record<string, unknown>;
  for (const k of ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCIceCandidate", "RTCSessionDescription"]) {
    try {
      delete w[k];
    } catch {
      w[k] = undefined;
    }
  }
}

export interface ScanContext {
  context: BrowserContext;
  proxy: EgressProxy;
  close(): Promise<void>;
}

// A browser context for one store. Every request goes through the egress
// proxy, which connects only to vetted public addresses; loopback is sent
// through it too. Service workers, WebSockets and WebRTC would get around
// those controls, so they are off. Images and media are not loaded: axe
// does not need them, and the store's servers are spared.
export async function openScanContext(browser: Browser, client: PoliteClient, domain: string): Promise<ScanContext> {
  const proxy = await startEgressProxy({ ...client.guard, ports: client.allowPrivate ? "any" : DEFAULT_PORTS });
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({
      userAgent: client.userAgent,
      serviceWorkers: "block",
      proxy: { server: proxy.server, bypass: "<-loopback>" },
    });
    await context.addInitScript(noWebRtc);
    await context.routeWebSocket(/.*/, (ws) => ws.close());
    await context.route("**/*", (route) => {
      const req = route.request();
      if (["image", "media"].includes(req.resourceType())) return route.abort("blockedbyclient");
      // The main frame stays on the store's site.
      if (req.isNavigationRequest() && req.frame().parentFrame() === null && !sameSite(domain, new URL(req.url()).host)) {
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
  } catch (err) {
    await context?.close();
    await proxy.close();
    throw err;
  }
  const ctx = context;
  return {
    context: ctx,
    proxy,
    close: async () => {
      await ctx.close();
      await proxy.close();
    },
  };
}

// Redirects inside the browser are followed without a route callback, so
// check every hop after the fact and drop the page if a hop was off-limits.
async function badRedirect(res: Response, client: PoliteClient, domain: string): Promise<string | null> {
  const hops: string[] = [];
  for (let req: Request | null = res.request(); req; req = req.redirectedFrom()) hops.unshift(req.url());
  // The first URL was checked before the page loaded.
  for (const hop of hops.slice(1)) {
    if (!sameSite(domain, new URL(hop).host)) return `redirected to another site (${new URL(hop).host})`;
    const skip = await client.verdict(hop);
    if (skip) return describeSkip(skip);
  }
  return null;
}

export async function scan(stores: StoreRecord[], out: string, client: PoliteClient, opts: { concurrency?: number; browser?: Browser } = {}) {
  const seen = done(out);
  const browser =
    opts.browser ??
    (await chromium.launch({
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    }));
  try {
    await pool(stores.filter((s) => s.isShopify && s.origin && !seen.has(s.domain)), opts.concurrency ?? 2, async (store) => {
      const record: ScanRecord = { domain: store.domain, theme: store.theme, apps: store.apps, scannedAt: new Date().toISOString(), pages: [], skipped: [] };
      let ctx: ScanContext | undefined;
      try {
        ctx = await openScanContext(browser, client, store.domain);
        const page = await ctx.context.newPage();
        const origin = store.origin!;
        let links: { collection: string | null; product: string | null } = { collection: null, product: null };
        const targets: [string, () => string | null][] = [
          ["home", () => "/"],
          ["collection", () => links.collection ?? "/collections/all"],
          ["product", () => links.product],
          ["cart", () => "/cart"],
        ];
        for (const [kind, pathOf] of targets) {
          const p = pathOf();
          if (!p) {
            record.skipped.push({ kind, reason: "no link found" });
            continue;
          }
          const url = origin + p;
          const skip = await client.pageTurn(url);
          if (skip) {
            record.skipped.push({ kind, reason: describeSkip(skip) });
            if (skip.retry) record.retry = true;
            continue;
          }
          const res = await page.goto(url, { waitUntil: "load", timeout: 30000 });
          if (!res || res.status() >= 400) {
            record.skipped.push({ kind, reason: `HTTP ${res?.status() ?? "no response"}` });
            continue;
          }
          const bad = await badRedirect(res, client, store.domain);
          if (bad) {
            record.skipped.push({ kind, reason: bad });
            continue;
          }
          // Links come from the page the browser already loaded, so the home
          // page is fetched once.
          if (kind === "home") links = sampleLinks(await page.content(), origin);
          record.pages.push({ kind, ...(await scanPage(page, url)) });
        }
      } catch (err) {
        record.error = (err as Error).message.slice(0, 200);
        record.retry = true;
      } finally {
        await ctx?.close();
      }
      if (ctx?.proxy.blocked.size) record.blockedHosts = [...ctx.proxy.blocked].slice(0, 50);
      append(out, record);
    });
  } finally {
    if (!opts.browser) await browser.close();
  }
}

function intArg(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${name} must be a whole number from ${min} to ${max}`);
  return n;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string" },
      out: { type: "string" },
      limit: { type: "string" },
      concurrency: { type: "string" },
      delay: { type: "string" },
    },
  });
  const [cmd] = positionals;
  if (!values.input || !values.out || !["discover", "scan"].includes(cmd)) {
    console.error("Usage: census.ts discover|scan --input FILE --out FILE [--limit N] [--concurrency N] [--delay MS]");
    process.exit(2);
  }
  // 2 seconds between page loads on one store is the floor (plan crawl rules).
  const delay = intArg("delay", values.delay, 2000, 2000, 60000);
  const limit = intArg("limit", values.limit, Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER);
  const concurrency = intArg("concurrency", values.concurrency, cmd === "discover" ? 8 : 2, 1, 32);
  const client = new PoliteClient({ contact: process.env.CENSUS_CONTACT ?? "", minDelayMs: delay });
  if (cmd === "discover") {
    await discover(parseDomains(readLines(values.input)).slice(0, limit), values.out, client, { concurrency });
  } else {
    const stores = latest(readRecords<StoreRecord>(values.input)).slice(0, limit);
    await scan(stores, values.out, client, { concurrency });
  }
  console.log(`done: ${values.out}`);
}

if (process.argv[1] && /census\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
