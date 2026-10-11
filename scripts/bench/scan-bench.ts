#!/usr/bin/env -S npx tsx
// Scan benchmark (T-033, Spike D): how many pages an hour one machine can scan
// with Playwright and axe-core, through the same code as the census.
//
// Seeded Shopify-like stores are served from a local HTTP server. Each store
// gets its own host name, egress proxy and browser context, and its four
// pages (home, collection, product, cart) are loaded and scanned as
// scripts/census/census.ts does it, but with no politeness delay. Nothing is
// fetched from the internet.
//
//   npm run bench:scan                    # 200 pages at concurrency 1, 2 and 4
//   npm run bench:scan -- --full          # 1,000 pages at each
//   npm run bench:scan -- --pages 40 --concurrency 1,2
//
// Writes data/bench/scan-bench-<time>.json and .md (gitignored) and prints the
// Markdown summary.
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { chromium, type Browser } from "playwright";
import { scanPage } from "../../app/lib/scanner/axe";
import { sampleLinks } from "../../app/lib/scanner/detect";
import { PoliteClient, describeSkip } from "../../app/lib/scanner/polite";
import { openScanContext } from "../../scripts/census/census";
import {
  FIXTURE_VERSION,
  PAGE_KINDS,
  startFixtureProcess,
  writeFixtures,
  type FixtureHost,
  type FixtureManifest,
} from "./fixtures";
import {
  benchCpuSeconds,
  busyShare,
  cgroupCpuMax,
  loadAverage,
  readCpuTimes,
  startMemorySampler,
} from "./proc";
import {
  dist,
  formatSummary,
  type BenchResult,
  type LevelResult,
  type KindStats,
  type PageSample,
  type SummaryOptions,
} from "./summary";

export interface BenchOptions {
  // Pages scanned at each concurrency level.
  pages: number;
  concurrency: number[];
  seed: number;
  // Distinct stores generated; more stores than this reuse them in turn.
  // Each scan still gets a fresh context, so nothing is cached between them.
  stores: number;
  fixturesDir: string;
  executablePath?: string;
  // Milliseconds between memory readings.
  sampleMs?: number;
  // Scan one store untimed before each level (default true). The smoke test
  // turns it off so it scans only its own pages.
  warmup?: boolean;
  log?: (line: string) => void;
}

export const DEFAULTS = {
  pages: 200,
  fullPages: 1000,
  concurrency: [1, 2, 4],
  seed: 1,
  stores: 50,
};

const CONTACT = "scan-bench@localhost";

interface StoreRef {
  index: number;
  host: string;
}

// Scans up to `pages` of one store's pages the way the census scan loop does:
// robots.txt and a page slot, a vetted navigation, links from the home page,
// then axe-core. Returns one sample per scanned page.
//
// Mirrors the per-store body of `scan()` in scripts/census/census.ts (the
// `openScanContext` call, the `targets` list and the `for (const [kind,
// pathOf] of targets)` loop, lines 290 to 329 on 2026-10-11). Keep the two in
// step: a change to how the census loads or scans a page belongs here too.
async function scanStore(
  browser: Browser,
  store: StoreRef,
  port: number,
  pages: number,
  onPage: (s: PageSample, sixTypes: Record<string, number>) => void,
  onError: (msg: string) => void,
): Promise<void> {
  // A fresh client per store, as each census store has its own robots.txt.
  const client = new PoliteClient({
    contact: CONTACT,
    minDelayMs: 0,
    allowPrivate: true,
    lookup: async () => ["127.0.0.1"],
  });
  const domain = `${store.host}:${port}`;
  const origin = `http://${domain}`;
  const ctx = await openScanContext(browser, client, domain);
  try {
    const page = await ctx.context.newPage();
    let links: { collection: string | null; product: string | null } = {
      collection: null,
      product: null,
    };
    const targets: [string, () => string | null][] = [
      ["home", () => "/"],
      ["collection", () => links.collection ?? "/collections/all"],
      ["product", () => links.product],
      ["cart", () => "/cart"],
    ];
    for (const [kind, pathOf] of targets.slice(0, pages)) {
      try {
        const t0 = performance.now();
        const p = pathOf();
        if (!p) throw new Error("no link found");
        const url = origin + p;
        const skip = await client.pageTurn(url);
        if (skip) throw new Error(describeSkip(skip));
        const loaded = await ctx.goto(page, url);
        if ("skip" in loaded) throw new Error(loaded.skip);
        if (!loaded.res || loaded.res.status() >= 400)
          throw new Error(`HTTP ${loaded.res?.status() ?? "no response"}`);
        if (kind === "home") links = sampleLinks(await page.content(), origin);
        const t1 = performance.now();
        const scan = await scanPage(page, loaded.url);
        const t2 = performance.now();
        const domNodes = await page.evaluate(
          () => document.getElementsByTagName("*").length,
        );
        onPage(
          {
            store: store.index,
            kind,
            ms: t2 - t0,
            loadMs: t1 - t0,
            axeMs: t2 - t1,
            domNodes,
            violationNodes: scan.totalNodes,
          },
          scan.sixTypes,
        );
      } catch (err) {
        onError(
          `${store.host} ${kind}: ${(err as Error).message.split("\n")[0].slice(0, 200)}`,
        );
      }
    }
  } finally {
    await ctx.close();
  }
}

// Per page type: how many pages, and the spread of each timing.
function statsByKind(samples: PageSample[]): Record<string, KindStats> {
  return Object.fromEntries(
    PAGE_KINDS.map((k) => {
      const xs = samples.filter((s) => s.kind === k);
      return [
        k,
        {
          n: xs.length,
          pageMs: dist(xs.map((s) => s.ms)),
          loadMs: dist(xs.map((s) => s.loadMs)),
          axeMs: dist(xs.map((s) => s.axeMs)),
          domNodes: dist(xs.map((s) => s.domNodes)),
          violationNodes: dist(xs.map((s) => s.violationNodes)),
        },
      ];
    }),
  );
}

async function runLevel(
  opts: BenchOptions,
  manifest: FixtureManifest,
  server: FixtureHost,
  concurrency: number,
): Promise<LevelResult> {
  const port = server.port;
  const log = opts.log ?? (() => {});
  const browser = await chromium.launch({
    executablePath: opts.executablePath || undefined,
    // As the census launches it: WebRTC may not bypass the proxy.
    args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
  });
  const samples: PageSample[] = [];
  const errors: string[] = [];
  const sixTotals: Record<string, number> = {};
  let failed = 0;
  try {
    // Warm-up, not timed: one store, so the first context and JIT costs do
    // not land on the first timed pages.
    if (opts.warmup !== false)
      await scanStore(
        browser,
        manifest.stores[0],
        port,
        PAGE_KINDS.length,
        () => {},
        () => {},
      );

    const storeCount = Math.ceil(opts.pages / PAGE_KINDS.length);
    let next = 0;
    const loadAvgStart = loadAverage();
    const sampler = startMemorySampler(opts.sampleMs ?? 1000);
    const cpu0 = readCpuTimes();
    const bench0 = benchCpuSeconds();
    const nodeCpu0 = process.cpuUsage();
    const elu0 = performance.eventLoopUtilization();
    const requests0 = await server.requestCount();
    const t0 = performance.now();
    await Promise.all(
      Array.from({ length: Math.min(concurrency, storeCount) }, async () => {
        while (next < storeCount) {
          const i = next++;
          const left = opts.pages - i * PAGE_KINDS.length;
          await scanStore(
            browser,
            manifest.stores[i % manifest.stores.length],
            port,
            Math.min(PAGE_KINDS.length, left),
            (s, six) => {
              samples.push(s);
              for (const [type, n] of Object.entries(six))
                sixTotals[type] = (sixTotals[type] ?? 0) + n;
            },
            (msg) => {
              failed++;
              if (errors.length < 20) errors.push(msg);
            },
          );
          if ((i + 1) % 10 === 0)
            log(`  concurrency ${concurrency}: ${samples.length} pages`);
        }
      }),
    );
    const wallSeconds = (performance.now() - t0) / 1000;
    const elu = performance.eventLoopUtilization(elu0).utilization;
    const requests = (await server.requestCount()) - requests0;
    const cpu1 = readCpuTimes();
    const bench1 = benchCpuSeconds();
    const nodeCpu = process.cpuUsage(nodeCpu0);
    const peak = sampler.stop();
    const machine = cpu0 && cpu1 ? busyShare(cpu0, cpu1) : null;
    const benchCpu =
      bench0 !== null && bench1 !== null ? bench1 - bench0 : null;
    const scanned = samples.length;
    const cores = os.cpus().length;
    return {
      concurrency,
      pagesTarget: opts.pages,
      pagesScanned: scanned,
      pagesFailed: failed,
      stores: storeCount,
      wallSeconds,
      pagesPerHour: scanned > 0 ? (scanned / wallSeconds) * 3600 : 0,
      pageMs: dist(samples.map((s) => s.ms)),
      loadMs: dist(samples.map((s) => s.loadMs)),
      axeMs: dist(samples.map((s) => s.axeMs)),
      domNodes: dist(samples.map((s) => s.domNodes)),
      violationNodes: dist(samples.map((s) => s.violationNodes)),
      sixTypes: sixTotals,
      cpuSecondsPerPage:
        benchCpu === null || scanned === 0 ? null : benchCpu / scanned,
      nodeCpuSecondsPerPage:
        scanned > 0 ? (nodeCpu.user + nodeCpu.system) / 1e6 / scanned : 0,
      nodeEventLoopPercent: elu * 100,
      benchCpuPercent:
        benchCpu === null ? null : (benchCpu / (wallSeconds * cores)) * 100,
      machineBusyPercent: machine === null ? null : machine * 100,
      loadAvgStart,
      memory: peak && {
        peakNodeRssMb: peak.nodeRssMb,
        peakBrowserRssMb: peak.browserRssMb,
        peakTotalRssMb: peak.totalRssMb,
        peakTotalPssMb: peak.totalPssMb,
        peakProcesses: peak.processes,
        samples: peak.samples,
      },
      requestsPerPage: samples.length > 0 ? requests / samples.length : 0,
      byKind: statsByKind(samples),
      errors,
      samples,
    };
  } finally {
    await browser.close();
  }
}

function versionOf(pkg: string): string {
  try {
    return (
      createRequire(import.meta.url)(`${pkg}/package.json`) as {
        version: string;
      }
    ).version;
  } catch {
    return "unknown";
  }
}

export async function runBench(opts: BenchOptions): Promise<BenchResult> {
  const log = opts.log ?? (() => {});
  if (!Number.isInteger(opts.pages) || opts.pages < 1)
    throw new RangeError("pages must be a whole number of 1 or more");
  if (
    !opts.concurrency.length ||
    opts.concurrency.some((c) => !Number.isInteger(c) || c < 1)
  )
    throw new RangeError("concurrency must be whole numbers of 1 or more");
  const startedAt = new Date().toISOString();
  const distinct = Math.max(
    1,
    Math.min(opts.stores, Math.ceil(opts.pages / PAGE_KINDS.length)),
  );
  log(`fixtures: ${distinct} stores in ${opts.fixturesDir}`);
  const manifest = writeFixtures(opts.fixturesDir, opts.seed, distinct);
  // In a child process, so serving pages does not count as scanning them.
  const server = await startFixtureProcess(opts.fixturesDir);
  let chromiumVersion = "unknown";
  try {
    const probe = await chromium.launch({
      executablePath: opts.executablePath || undefined,
    });
    chromiumVersion = probe.version();
    await probe.close();
    const levels: LevelResult[] = [];
    for (const c of opts.concurrency) {
      log(`concurrency ${c}: ${opts.pages} pages`);
      levels.push(await runLevel(opts, manifest, server, c));
      const l = levels[levels.length - 1];
      log(
        `  ${l.pagesScanned} pages in ${l.wallSeconds.toFixed(1)} s, ${Math.round(l.pagesPerHour)} pages an hour, ${l.pagesFailed} failed`,
      );
    }
    const pages = manifest.stores.flatMap((s) => s.pages);
    const byKind = Object.fromEntries(
      PAGE_KINDS.map((k) => {
        const ps = pages.filter((p) => p.kind === k);
        return [
          k,
          {
            pageKb: dist(ps.map((p) => p.totalBytes / 1024)),
            htmlKb: dist(ps.map((p) => p.htmlBytes / 1024)),
          },
        ];
      }),
    );
    const cpus = os.cpus();
    return {
      tool: "scan-bench",
      startedAt,
      finishedAt: new Date().toISOString(),
      options: {
        pages: opts.pages,
        concurrency: opts.concurrency,
        seed: opts.seed,
        stores: distinct,
      },
      machine: {
        cpuCount: cpus.length,
        cpuModel: cpus[0]?.model.trim() ?? "unknown",
        memoryMb: Math.round(os.totalmem() / 1024 / 1024),
        platform: os.platform(),
        kernel: os.release(),
        cgroupCpuMax: cgroupCpuMax(),
        node: process.version,
        chromium: chromiumVersion,
        playwright: versionOf("playwright"),
        axeCore: versionOf("axe-core"),
      },
      fixtures: {
        stores: distinct,
        fixtureVersion: FIXTURE_VERSION,
        pageKb: dist(pages.map((p) => p.totalBytes / 1024)),
        htmlKb: dist(pages.map((p) => p.htmlBytes / 1024)),
        byKind,
      },
      levels,
    };
  } finally {
    await server.close();
  }
}

// Writes the JSON and the Markdown summary; returns their paths.
export function writeResult(
  result: BenchResult,
  outDir: string,
  summary: SummaryOptions = {},
): { json: string; md: string } {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = result.startedAt.replace(/[:.]/g, "-");
  const json = path.join(outDir, `scan-bench-${stamp}.json`);
  const md = path.join(outDir, `scan-bench-${stamp}.md`);
  fs.writeFileSync(json, JSON.stringify(result, null, 2));
  fs.writeFileSync(md, formatSummary(result, summary));
  return { json, md };
}

function intArg(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`--${name} must be a whole number from ${min} to ${max}`);
  return n;
}

export function parseConcurrency(value: string | undefined): number[] {
  if (value === undefined) return DEFAULTS.concurrency;
  const list = value.split(",").map((v) => Number(v.trim()));
  if (!list.length || list.some((n) => !Number.isInteger(n) || n < 1 || n > 32))
    throw new Error(
      "--concurrency must be a list of whole numbers from 1 to 32, such as 1,2,4",
    );
  return list;
}

async function main() {
  const { values } = parseArgs({
    options: {
      pages: { type: "string" },
      full: { type: "boolean" },
      concurrency: { type: "string" },
      seed: { type: "string" },
      stores: { type: "string" },
      out: { type: "string" },
      fixtures: { type: "string" },
      "server-price": { type: "string" },
    },
  });
  const pages = intArg(
    "pages",
    values.pages,
    values.full ? DEFAULTS.fullPages : DEFAULTS.pages,
    1,
    100000,
  );
  const seed = intArg("seed", values.seed, DEFAULTS.seed, 0, 2 ** 31);
  const stores = intArg("stores", values.stores, DEFAULTS.stores, 1, 1000);
  const outDir = values.out ?? path.join("data", "bench");
  const fixturesDir =
    values.fixtures ??
    path.join(outDir, "fixtures", `v${FIXTURE_VERSION}-seed-${seed}`);
  const summary: SummaryOptions = {};
  if (values["server-price"]) {
    summary.serverPrices = values["server-price"].split(",").map((v) => {
      const usd = Number(v);
      if (!Number.isFinite(usd) || usd < 0)
        throw new Error(
          "--server-price must be a list of monthly prices in dollars, such as 5,10,15",
        );
      return {
        label: `$${usd} a month`,
        usdPerMonth: usd,
        source: "--server-price input",
        asOf: new Date().toISOString().slice(0, 10),
      };
    });
  }
  const result = await runBench({
    pages,
    concurrency: parseConcurrency(values.concurrency),
    seed,
    stores,
    fixturesDir,
    executablePath: process.env.PW_CHROMIUM_PATH,
    log: (l) => console.error(l),
  });
  const files = writeResult(result, outDir, summary);
  console.log(formatSummary(result, summary));
  console.error(`wrote ${files.json} and ${files.md}`);
}

if (process.argv[1] && /scan-bench\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
