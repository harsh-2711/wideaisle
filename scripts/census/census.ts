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
//   npx tsx scripts/census/census.ts report --input data/census/stores.jsonl --scans data/census/scans.jsonl --out docs/census/gap-report.md
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser, type BrowserContext, type Page, type Request, type Response } from "playwright";
import { buildReport, pickRecords, renderReport, type ScanLine, type StoreLine } from "../../app/lib/census/report";
import { AssetCache, reusableForMs, type AssetRequest } from "../../app/lib/scanner/asset-cache";
import { scanPage, type PageScan } from "../../app/lib/scanner/axe";
import { detectStore, sampleLinks, type StoreFacts } from "../../app/lib/scanner/detect";
import { ContentEncodingError, DEFAULT_PORTS, pinnedFetch, portOf, ResponseTooLargeError, startEgressProxy, type EgressProxy } from "../../app/lib/scanner/egress";
import { BlockedAddressError, sameSite } from "../../app/lib/scanner/netguard";
import { describeSkip, isSkip, PoliteClient } from "../../app/lib/scanner/polite";
import { BLOCK_SPECULATION_RULES, isHtml, withoutRulesHeader, withoutRulesScripts } from "../../app/lib/scanner/speculation";

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

// The largest page HTML the census loads, on the wire and after
// decompression (T-028). The Spike D fixtures, modelled on Dawn, have
// 75 to 214 KB of HTML at the median and at most 1.3 MB with their CSS and
// JS; large live collection pages are said to reach a few MB (not measured,
// Q-01). 10 MB leaves a wide margin, and keeps hostile HTML from holding
// memory or the event loop. A page over it is skipped, not scanned.
export const MAX_PAGE_BYTES = 10_000_000;
export const PAGE_TOO_LARGE = `page over ${MAX_PAGE_BYTES / 1_000_000} MB, not scanned`;
// A page whose content-encoding the census cannot decode: an unknown
// encoding, too many layers or corrupt data (T-029).
export const pageNotDecoded = (why: string) => `page could not be decoded (${why}), not scanned`;

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
  // Loads a page the way PoliteClient fetches one: every redirect hop is
  // checked against robots.txt and the store's site, and gets its own slot,
  // before the browser requests it. The first URL must already have had its
  // turn (client.pageTurn).
  goto(page: Page, url: string): Promise<{ res: Response | null; url: string } | { skip: string; retry: boolean }>;
  close(): Promise<void>;
}

// A browser context for one store. Every request the browser sends goes
// through the egress proxy, which connects only to vetted public
// addresses; loopback is sent through it too. The page HTML itself comes
// from pinnedFetch, which applies the same checks and a size cap (T-028).
// Service workers, WebSockets and WebRTC would get around
// those controls, so they are off. Images and media are not loaded: axe
// does not need them, and the store's servers are spared.
// Chromium drops the fragment and escapes some characters that WHATWG URL
// keeps, so compare URLs in one form.
export function sameUrl(a: string, b: string): boolean {
  const norm = (x: string) => {
    const u = new URL(x);
    u.hash = "";
    try {
      return decodeURI(u.href);
    } catch {
      return u.href;
    }
  };
  return norm(a) === norm(b);
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function assetRequest(req: Request): AssetRequest {
  return { method: req.method(), url: req.url(), resourceType: req.resourceType(), headers: req.headers() };
}

export async function openScanContext(browser: Browser, client: PoliteClient, domain: string): Promise<ScanContext> {
  const proxy = await startEgressProxy({ ...client.guard, ports: client.allowPrivate ? "any" : DEFAULT_PORTS });
  // The one main-frame navigation the scan asked for, where it redirected,
  // and a signal for a redirect that arrives while the page is loading.
  // `skip` is why the page was not loaded: over MAX_PAGE_BYTES, or a body
  // that could not be decoded.
  const nav: { expected: string | null; current: string | null; redirect: string | null; skip: string | null; loading: boolean; signal: () => void } = {
    expected: null,
    current: null,
    redirect: null,
    skip: null,
    loading: false,
    signal: () => {},
  };
  // Pages come through the census's own fetch, capped (T-028).
  const fetchPage = pinnedFetch({ ...client.guard, maxBytes: MAX_PAGE_BYTES });
  // The store's CSS, JS and fonts (T-025). Routing turns the browser's HTTP
  // cache off, so without this every page would fetch them all again. Only
  // responses the browser fetched through the proxy are stored, and the
  // cache dies with the context, so no store sees another's entries.
  const assets = new AssetCache();
  // Requests the route handler sent on to the network. Only their answers
  // are stored, so a cache hit, or anything another handler fulfils, never
  // is. The route handler sees only the first hop of a redirect chain.
  const viaProxy = new WeakSet<Request>();
  const firstHop = (req: Request) => {
    let first = req;
    for (let prev = req.redirectedFrom(); prev; prev = prev.redirectedFrom()) first = prev;
    return first;
  };
  const remember = async (req: Request) => {
    const ask = assetRequest(req);
    if (!AssetCache.stores(ask) || !viaProxy.has(firstHop(req))) return;
    try {
      const res = await req.response();
      if (!res) return;
      const headers = await res.allHeaders();
      // Read no body that would not be stored. The decoded size is checked
      // again when it is.
      if (reusableForMs(ask, res.status(), headers, Date.now()) === null) return;
      if ((await req.sizes()).responseBodySize > assets.limits.maxEntryBytes) return;
      assets.put(ask, res.status(), headers, await res.body());
    } catch {
      // The context closed, or the browser no longer holds the body.
    }
  };
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({
      userAgent: client.userAgent,
      serviceWorkers: "block",
      proxy: { server: proxy.server, bypass: "<-loopback>" },
    });
    await context.addInitScript(noWebRtc);
    await context.addInitScript({ content: BLOCK_SPECULATION_RULES });
    await context.routeWebSocket(/.*/, (ws) => ws.close());
    context.on("requestfinished", (req) => void remember(req));
    await context.route("**/*", async (route) => {
      const req = route.request();
      if (["image", "media"].includes(req.resourceType())) return route.abort("blockedbyclient");
      // A prefetch (<link rel="prefetch">) fetches a page the scan did not
      // ask for, outside robots.txt and the gap between page loads (T-027).
      const headers = req.headers();
      if (/prefetch|prerender/i.test(`${headers["sec-purpose"] ?? ""} ${headers["purpose"] ?? ""}`)) return route.abort("blockedbyclient");
      if (!req.isNavigationRequest() || req.frame().parentFrame() !== null) {
        // A fresh copy from an earlier page of this store makes no request.
        // A miss goes out through the proxy as before.
        const hit = assets.get(assetRequest(req));
        if (hit) return route.fulfill(hit);
        viaProxy.add(req);
        return route.continue();
      }
      // Main-frame navigations: only the one the scan asked for, on the
      // store's site. Anything else gets an empty 204, which keeps the page
      // where it is (an abort would leave an error page behind).
      const url = new URL(req.url()).href;
      if (!nav.expected || !sameUrl(url, nav.expected) || !sameSite(domain, new URL(url).host)) {
        // A page script navigating while the page loads would stop the load
        // event; treat it as a redirect, which goto vets like any other hop.
        // Only the page being loaded may redirect this way: the window opens
        // once it commits, so the previous page's timers cannot land here.
        // A Referer, when sent, must come from that page's origin. Compare
        // origins only: a referrer policy or history.replaceState can change
        // the rest of it.
        const referer = headers["referer"];
        const fromCurrent = !referer || (nav.current !== null && sameOrigin(referer, nav.current));
        if (nav.loading && fromCurrent && !nav.redirect && sameSite(domain, new URL(url).host)) {
          nav.redirect = url;
          nav.signal();
        }
        return route.fulfill({ status: 204 });
      }
      nav.expected = null;
      try {
        // The census's own fetch, not route.fetch (T-028). Playwright reads
        // and decompresses a whole body, with no limit, before route.fetch
        // returns. pinnedFetch stops at MAX_PAGE_BYTES on the wire and after
        // decompression, across every content-encoding layer together
        // (T-029). It connects only to vetted addresses, and does not
        // follow redirects, so the scan can vet each hop. Like route.fetch,
        // it sends the browser's headers and the context's cookies.
        // The egress proxy refused other ports on its own; this path checks
        // them here rather than trusting every caller to run pageTurn first.
        const port = portOf(new URL(url));
        if (!client.allowPrivate && !DEFAULT_PORTS.includes(port)) throw new BlockedAddressError(`port ${port} is not allowed`);
        const cookies = await context!.cookies(url);
        const headers: Record<string, string> = { ...req.headers(), "accept-encoding": "gzip, deflate, br" };
        if (cookies.length) headers["cookie"] = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        const res = await fetchPage(url, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
          nav.redirect = new URL(location, url).href;
          return route.fulfill({ status: 200, contentType: "text/html", body: "" });
        }
        if (!res.decodedBody || !res.headerList) throw new Error("pinnedFetch gives the body and every header");
        // Playwright splits a set-cookie value on newlines, other headers
        // on nothing, so repeated headers are joined that way.
        const resHeaders: Record<string, string> = {};
        for (const [k, v] of res.headerList) resHeaders[k] = k in resHeaders ? `${resHeaders[k]}${k === "set-cookie" ? "\n" : ", "}${v}` : v;
        // Speculation rules would make Chromium fetch other pages without
        // passing this handler (T-027). Drop the header and make inline rule
        // sets inert; init scripts catch rules a page adds later. The body
        // is decoded, so its transfer headers go too. A body that cannot be
        // decoded throws here; it never reaches the browser still encoded.
        const raw = await res.decodedBody();
        const body = (isHtml(resHeaders) && withoutRulesScripts(raw)) || raw;
        return route.fulfill({ status: res.status, headers: withoutRulesHeader(resHeaders, true), body });
      } catch (err) {
        const skip = err instanceof ResponseTooLargeError ? PAGE_TOO_LARGE : err instanceof ContentEncodingError ? pageNotDecoded(err.message) : null;
        if (skip) {
          nav.skip = skip;
          return route.fulfill({ status: 200, contentType: "text/html", body: "" });
        }
        // Recorded as the egress proxy records its refusals.
        if (err instanceof BlockedAddressError) proxy.blocked.add(new URL(url).hostname);
        return route.fulfill({ status: 502, contentType: "text/plain", body: "" });
      }
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
    async goto(page, url) {
      let current = url;
      for (let hop = 0; hop <= 5; hop++) {
        if (hop > 0) {
          const host = new URL(current).host;
          if (!sameSite(domain, host)) return { skip: `redirected to another site (${host})`, retry: false };
          const skip = await client.pageTurn(current);
          if (skip) return { skip: describeSkip(skip), retry: skip.retry };
        }
        nav.expected = new URL(current).href;
        nav.redirect = null;
        nav.skip = null;
        nav.current = new URL(current).href;
        const redirected = new Promise<void>((resolve) => (nav.signal = resolve));
        let res: Response | null;
        try {
          res = await page.goto(current, { waitUntil: "commit", timeout: 30000 });
          nav.loading = true;
          if (!nav.redirect) await Promise.race([page.waitForLoadState("load", { timeout: 30000 }), redirected]);
        } finally {
          nav.loading = false;
        }
        if (nav.skip) return { skip: nav.skip, retry: false };
        if (!nav.redirect) return { res, url: current };
        current = nav.redirect;
      }
      return { skip: "too many redirects", retry: false };
    },
    close: async () => {
      await ctx.close();
      await proxy.close();
    },
  };
}

// Playwright 1.64.0 passes these in its own --disable-features switch.
// Chromium honours only the last --disable-features switch, and Playwright
// puts ours after its own, so ours must repeat this list (T-026). A spec in
// tests/a11y/census-egress.spec.ts fails when Playwright's list changes.
export const PLAYWRIGHT_DISABLED_FEATURES = [
  "AvoidUnnecessaryBeforeUnloadCheckSync",
  "DestroyProfileOnBrowserClose",
  "DialMediaRouteProvider",
  "GlobalMediaControls",
  "HttpsUpgrades",
  "LensOverlay",
  "MediaRouter",
  "PaintHolding",
  "ThirdPartyStoragePartitioning",
  "BlockOriginHeaderModificationOnRedirect",
  "Translate",
  "AutoDeElevate",
  "OptimizationHints",
  "NetworkTimeServiceQuerying",
  "AimEnabled",
  "msForceBrowserSignIn",
  "msEdgeUpdateLaunchServicesPreferredVersion",
];

// Features that make Chromium itself call Google from a store's context,
// through the egress proxy, which lets any public host through.
export const CENSUS_DISABLED_FEATURES = [
  // Sends each form's shape to content-autofill.googleapis.com.
  "AutofillServerCommunication",
  // Asks optimizationguide-pa.googleapis.com for page-load hints.
  "OptimizationHintsFetching",
];

// Playwright 1.64.0's own --enable-features list. It passes none when
// PLAYWRIGHT_LEGACY_SCREENSHOT is set. Only the last --enable-features
// switch counts too, so ours repeats it (T-027).
export const PLAYWRIGHT_ENABLED_FEATURES = process.env.PLAYWRIGHT_LEGACY_SCREENSHOT ? [] : ["CDPScreenshotNewSurface"];

export const CENSUS_ENABLED_FEATURES = [
  // <link rel="prerender"> starts a NoState prefetch in the full Chromium
  // build, which Playwright's route handler never sees. The holdback turns
  // it off (T-027).
  "NoStatePrefetchHoldback",
];

// Playwright already turns off background networking, component updates,
// sync and the like. These add what the census needs on top.
export const CENSUS_CHROMIUM_ARGS = [
  // WebRTC's UDP traffic would not go through the proxy.
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--disable-domain-reliability",
  "--no-pings",
  `--disable-features=${[...PLAYWRIGHT_DISABLED_FEATURES, ...CENSUS_DISABLED_FEATURES].join(",")}`,
  `--enable-features=${[...PLAYWRIGHT_ENABLED_FEATURES, ...CENSUS_ENABLED_FEATURES].join(",")}`,
];

export interface CensusBrowser {
  browser: Browser;
  // Hosts the browser itself tried to reach outside any store's context.
  refused: Set<string>;
  close(): Promise<void>;
}

// Launches Chromium for the census (and the scan benchmark). Each store's
// context has its own egress proxy. Traffic outside those contexts, such as
// Chromium's sign-in check and push-service check-in, goes to a proxy that
// allows no port, so it is refused and never leaves the machine.
// `extraArgs` is for tests only, such as --ignore-certificate-errors for a
// local HTTPS server; the census passes none.
export async function launchCensusBrowser(executablePath?: string, opts: { extraArgs?: string[] } = {}): Promise<CensusBrowser> {
  const deny = await startEgressProxy({ ports: [] });
  try {
    const browser = await chromium.launch({
      executablePath: executablePath || undefined,
      args: [...CENSUS_CHROMIUM_ARGS, ...(opts.extraArgs ?? [])],
      proxy: { server: deny.server },
    });
    return {
      browser,
      refused: deny.blocked,
      close: async () => {
        await browser.close();
        await deny.close();
      },
    };
  } catch (err) {
    await deny.close();
    throw err;
  }
}

export async function scan(stores: StoreRecord[], out: string, client: PoliteClient, opts: { concurrency?: number; browser?: Browser } = {}) {
  const seen = done(out);
  const launched = opts.browser ? null : await launchCensusBrowser(process.env.PW_CHROMIUM_PATH);
  const browser = opts.browser ?? launched!.browser;
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
          // One page failing does not end the store's scan.
          try {
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
            const loaded = await ctx.goto(page, url);
            if ("skip" in loaded) {
              record.skipped.push({ kind, reason: loaded.skip });
              if (loaded.retry) record.retry = true;
              continue;
            }
            const { res } = loaded;
            if (!res || res.status() >= 400) {
              record.skipped.push({ kind, reason: `HTTP ${res?.status() ?? "no response"}` });
              continue;
            }
            // Links come from the page the browser already loaded, so the
            // home page is fetched once.
            if (kind === "home") links = sampleLinks(await page.content(), origin);
            record.pages.push({ kind, ...(await scanPage(page, loaded.url)) });
          } catch (err) {
            record.skipped.push({ kind, reason: (err as Error).message.split("\n")[0].slice(0, 200) });
            // A blocked address or port fails the same way every time.
            if (!(err instanceof BlockedAddressError)) record.retry = true;
          }
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
    await launched?.close();
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
      scans: { type: "string" },
    },
  });
  const [cmd] = positionals;
  if (!values.input || !values.out || !["discover", "scan", "report"].includes(cmd)) {
    console.error("Usage: census.ts discover|scan|report --input FILE --out FILE [--scans FILE] [--limit N] [--concurrency N] [--delay MS]");
    process.exit(2);
  }
  if (cmd === "report") {
    if (!values.scans) {
      console.error("report needs --scans as well as --input (stores).");
      process.exit(2);
    }
    // A resumed run can hold several lines per domain; keep the last one
    // with data, so a failed retry does not hide an earlier scan.
    const stores = pickRecords(readRecords<StoreLine>(values.input));
    const scans = pickRecords(readRecords<ScanLine>(values.scans));
    fs.writeFileSync(values.out, renderReport(buildReport(stores, scans), new Date().toISOString().slice(0, 10)));
    console.log(`wrote ${values.out}`);
    return;
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
