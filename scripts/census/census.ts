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
import { chromium, type Browser } from "playwright";
import { scanPage, type PageScan } from "../../app/lib/scanner/axe";
import { detectStore, sampleLinks, type StoreFacts } from "../../app/lib/scanner/detect";
import { PoliteClient } from "../../app/lib/scanner/polite";

export interface StoreRecord extends StoreFacts {
  domain: string;
  origin: string | null;
  checkedAt: string;
  error?: string;
}

export interface ScanRecord {
  domain: string;
  theme: StoreFacts["theme"];
  apps: string[];
  scannedAt: string;
  pages: (PageScan & { kind: string })[];
  skipped: { kind: string; reason: string }[];
  error?: string;
}

function readLines(file: string): string[] {
  return fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

function done(out: string): Set<string> {
  if (!fs.existsSync(out)) return new Set();
  return new Set(readLines(out).map((l) => (JSON.parse(l) as { domain: string }).domain));
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
      if (!res) return append(out, { ...base, error: "robots.txt disallows /" });
      if (res.status >= 400) return append(out, { ...base, error: `HTTP ${res.status}` });
      append(out, { ...base, origin: new URL(res.url).origin, ...detectStore(res.text) });
    } catch (err) {
      append(out, { ...base, error: (err as Error).message.slice(0, 200) });
    }
  });
}

export async function scan(stores: StoreRecord[], out: string, client: PoliteClient, opts: { concurrency?: number; browser?: Browser } = {}) {
  const seen = done(out);
  const browser = opts.browser ?? (await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined }));
  try {
    await pool(stores.filter((s) => s.isShopify && s.origin && !seen.has(s.domain)), opts.concurrency ?? 2, async (store) => {
      const record: ScanRecord = { domain: store.domain, theme: store.theme, apps: store.apps, scannedAt: new Date().toISOString(), pages: [], skipped: [] };
      const context = await browser.newContext({ userAgent: client.userAgent });
      const page = await context.newPage();
      try {
        const origin = store.origin!;
        const home = await client.get(origin + "/");
        const links = home ? sampleLinks(home.text, origin) : { collection: null, product: null };
        const targets: [string, string | null][] = [
          ["home", "/"],
          ["collection", links.collection ?? "/collections/all"],
          ["product", links.product],
          ["cart", "/cart"],
        ];
        for (const [kind, p] of targets) {
          if (!p) {
            record.skipped.push({ kind, reason: "no link found" });
            continue;
          }
          const url = origin + p;
          if (!(await client.canVisit(url))) {
            record.skipped.push({ kind, reason: "robots.txt disallows it" });
            continue;
          }
          await client.waitTurn(origin);
          const res = await page.goto(url, { waitUntil: "load", timeout: 30000 });
          if (!res || res.status() >= 400) {
            record.skipped.push({ kind, reason: `HTTP ${res?.status() ?? "no response"}` });
            continue;
          }
          record.pages.push({ kind, ...(await scanPage(page, url)) });
        }
      } catch (err) {
        record.error = (err as Error).message.slice(0, 200);
      } finally {
        await context.close();
      }
      append(out, record);
    });
  } finally {
    if (!opts.browser) await browser.close();
  }
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
  const client = new PoliteClient({ contact: process.env.CENSUS_CONTACT ?? "", minDelayMs: Number(values.delay ?? 2000) });
  const limit = Number(values.limit ?? Infinity);
  const concurrency = values.concurrency ? Number(values.concurrency) : undefined;
  if (cmd === "discover") {
    await discover(parseDomains(readLines(values.input)).slice(0, limit), values.out, client, { concurrency });
  } else {
    const stores = readLines(values.input).map((l) => JSON.parse(l) as StoreRecord).slice(0, limit);
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
