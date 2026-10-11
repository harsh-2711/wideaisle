// Result types, statistics and the Markdown summary for the scan benchmark
// (T-033).
import {
  BROWSER_RUN_PLAN,
  browserHoursFor,
  browserRunMarginalPer1000,
  browserRunMonth,
  pagesInIncludedHours,
  pagesPerHourFromCpu,
  SERVER_PRICE_EXAMPLES,
  serverCostPer1000,
  type BrowserRunPricing,
  type ServerPrice,
} from "./cost";

export interface Dist {
  n: number;
  mean: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
}

// Nearest-rank percentile: the smallest value with at least p% of values at
// or below it. NaN for no values.
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  if (p < 0 || p > 100) throw new RangeError("p must be from 0 to 100");
  const sorted = [...xs].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function dist(xs: number[]): Dist {
  if (!xs.length)
    return { n: 0, mean: NaN, p50: NaN, p95: NaN, min: NaN, max: NaN };
  return {
    n: xs.length,
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
    p50: percentile(xs, 50),
    p95: percentile(xs, 95),
    min: Math.min(...xs),
    max: Math.max(...xs),
  };
}

export interface PageSample {
  store: number;
  kind: string;
  // pageTurn, navigation and link sampling, then axe, as the census does.
  ms: number;
  loadMs: number;
  axeMs: number;
  domNodes: number;
  violationNodes: number;
}

export interface LevelResult {
  concurrency: number;
  pagesTarget: number;
  pagesScanned: number;
  pagesFailed: number;
  stores: number;
  wallSeconds: number;
  pagesPerHour: number;
  pageMs: Dist;
  loadMs: Dist;
  axeMs: Dist;
  domNodes: Dist;
  violationNodes: Dist;
  sixTypes: Record<string, number>;
  // CPU-seconds a page used by the Node process and Chromium together, and
  // by Node alone.
  cpuSecondsPerPage: number | null;
  nodeCpuSecondsPerPage: number;
  // The benchmark's share of all CPUs, and the whole machine's. A gap
  // between them means other work shared the machine.
  benchCpuPercent: number | null;
  machineBusyPercent: number | null;
  loadAvgStart: number[] | null;
  memory: {
    peakNodeRssMb: number;
    peakBrowserRssMb: number;
    peakTotalRssMb: number;
    peakTotalPssMb: number | null;
    peakProcesses: number;
    samples: number;
  } | null;
  errors: string[];
  samples: PageSample[];
}

export interface BenchResult {
  tool: "scan-bench";
  startedAt: string;
  finishedAt: string;
  options: {
    pages: number;
    concurrency: number[];
    seed: number;
    stores: number;
  };
  machine: {
    cpuCount: number;
    cpuModel: string;
    memoryMb: number;
    platform: string;
    kernel: string;
    cgroupCpuMax: string | null;
    node: string;
    chromium: string;
    playwright: string;
    axeCore: string;
  };
  fixtures: {
    stores: number;
    fixtureVersion: number;
    pageKb: Dist;
    htmlKb: Dist;
    byKind: Record<string, { pageKb: Dist; htmlKb: Dist }>;
  };
  levels: LevelResult[];
}

// ---------- formatting ----------

export function fmtInt(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "n/a";
}

export function fmtSec(ms: number): string {
  return Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)} s` : "n/a";
}

export function fmtUsd(x: number): string {
  if (!Number.isFinite(x)) return "n/a";
  if (x === 0) return "$0";
  if (x < 0.01) return `$${x.toFixed(4)}`;
  if (x < 1) return `$${x.toFixed(3)}`;
  return `$${x.toFixed(2)}`;
}

function fmtMb(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n)
    ? "n/a"
    : `${fmtInt(n)} MB`;
}

function fmtPct(n: number | null): string {
  return n === null || !Number.isFinite(n) ? "n/a" : `${Math.round(n)}%`;
}

export interface SummaryOptions {
  serverPrices?: ServerPrice[];
  browserRun?: BrowserRunPricing;
  monthlyPages?: number[];
  vcpus?: number[];
}

// The browser time one page keeps a remote browser open: wall time per page
// at the lowest concurrency measured, which includes opening and closing a
// context per store. Local fixtures have no network time, so this is a floor.
export function browserSecondsPerPage(result: BenchResult): number | null {
  const level = [...result.levels]
    .filter((l) => l.pagesScanned > 0)
    .sort((a, b) => a.concurrency - b.concurrency)[0];
  return level ? level.wallSeconds / level.pagesScanned : null;
}

// CPU-seconds a page at the highest concurrency measured, where the least
// CPU sits idle.
export function cpuSecondsPerPage(result: BenchResult): number | null {
  const level = [...result.levels]
    .filter((l) => l.cpuSecondsPerPage !== null && l.pagesScanned > 0)
    .sort((a, b) => b.concurrency - a.concurrency)[0];
  return level?.cpuSecondsPerPage ?? null;
}

export function formatSummary(
  result: BenchResult,
  opts: SummaryOptions = {},
): string {
  const prices = opts.serverPrices ?? SERVER_PRICE_EXAMPLES;
  const br = opts.browserRun ?? BROWSER_RUN_PLAN;
  const monthly = opts.monthlyPages ?? [10_000, 100_000, 1_000_000];
  const vcpus = opts.vcpus ?? [1, 2];
  const m = result.machine;
  const f = result.fixtures;
  const out: string[] = [];

  out.push(`# Scan benchmark, ${result.startedAt.slice(0, 10)}`, "");
  out.push(
    `- Machine: ${m.cpuCount} x ${m.cpuModel}, ${fmtInt(m.memoryMb)} MB RAM, ${m.platform} ${m.kernel}${m.cgroupCpuMax ? `, cgroup cpu.max "${m.cgroupCpuMax}"` : ""}.`,
  );
  out.push(
    `- Software: Node ${m.node}, Chromium ${m.chromium}, Playwright ${m.playwright}, axe-core ${m.axeCore}.`,
  );
  out.push(
    `- Fixtures: ${f.stores} seeded stores (seed ${result.options.seed}, fixture version ${f.fixtureVersion}). Pages of ${fmtInt(f.pageKb.min)} to ${fmtInt(f.pageKb.max)} KB of HTML, CSS and JS (median ${fmtInt(f.pageKb.p50)} KB).`,
  );
  out.push(
    "- Path: the census scan path (`openScanContext` with its egress proxy, then `scanPage`), one context per store of 4 pages, no politeness delay.",
  );
  out.push("");

  out.push("## Throughput", "");
  out.push(
    "| Concurrency | Pages | Failed | Wall time | Pages an hour | p50 a page | p95 a page | Load p50 | axe p50 | DOM nodes p50 | CPU-s a page | CPU used | Machine busy | Peak RSS | Peak PSS |",
  );
  out.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const l of result.levels) {
    out.push(
      `| ${l.concurrency} | ${fmtInt(l.pagesScanned)} | ${fmtInt(l.pagesFailed)} | ${fmtSec(l.wallSeconds * 1000)} | ${fmtInt(l.pagesPerHour)} | ${fmtSec(l.pageMs.p50)} | ${fmtSec(l.pageMs.p95)} | ${fmtSec(l.loadMs.p50)} | ${fmtSec(l.axeMs.p50)} | ${fmtInt(l.domNodes.p50)} | ${l.cpuSecondsPerPage === null ? "n/a" : l.cpuSecondsPerPage.toFixed(2)} | ${fmtPct(l.benchCpuPercent)} | ${fmtPct(l.machineBusyPercent)} | ${fmtMb(l.memory?.peakTotalRssMb)} | ${fmtMb(l.memory?.peakTotalPssMb)} |`,
    );
  }
  out.push("");
  out.push(
    "CPU-s a page and CPU used count the Node process and Chromium only. Machine busy counts every process; when it is well above CPU used, other work shared the machine and the wall times are pessimistic.",
  );
  out.push(
    "Peak RSS sums the Node process and the Chromium processes, so shared pages count more than once. Peak PSS splits shared pages and is the better guide to RAM needed.",
  );
  out.push("");

  out.push("## Cost per 1,000 pages: small server", "");
  out.push(
    `Server prices are inputs, not quotes. Source of the example prices: ${prices[0]?.source ?? "none"}, ${prices[0]?.asOf ?? ""}. Each figure assumes the server scans all month at that rate; idle hours raise it.`,
  );
  out.push("");
  out.push(
    `| Rate | Pages an hour | ${prices.map((p) => p.label).join(" | ")} |`,
  );
  out.push(`|---|---|${prices.map(() => "---").join("|")}|`);
  const rows: [string, number][] = result.levels
    .filter((l) => l.pagesPerHour > 0)
    .map((l) => [`This machine, concurrency ${l.concurrency}`, l.pagesPerHour]);
  const cpuS = cpuSecondsPerPage(result);
  if (cpuS)
    for (const v of vcpus)
      rows.push([
        `${v} vCPU, estimated from CPU-s a page`,
        pagesPerHourFromCpu(v, cpuS),
      ]);
  for (const [label, rate] of rows)
    out.push(
      `| ${label} | ${fmtInt(rate)} | ${prices.map((p) => fmtUsd(serverCostPer1000(rate, p.usdPerMonth))).join(" | ")} |`,
    );
  out.push("");
  if (cpuS)
    out.push(
      `The vCPU rows use ${cpuS.toFixed(2)} CPU-seconds a page and 80% efficiency. Shared vCPUs on small plans can be slower than this CPU.`,
      "",
    );

  out.push(
    "## Cost per 1,000 pages: Browser Run (plan figures, not measured)",
    "",
  );
  const secs = browserSecondsPerPage(result);
  out.push(
    `Plan figures: $${br.planUsdPerMonth} a month with ${br.includedBrowserHours} browser-hours, then $${br.usdPerBrowserHour} a browser-hour. Source: ${br.source}, as of ${br.asOf}.`,
  );
  if (secs) {
    out.push(
      `Browser time a page: ${secs.toFixed(2)} s, the wall time a page at concurrency ${[...result.levels].sort((a, b) => a.concurrency - b.concurrency)[0].concurrency} here. Live pages add network time, so this is a floor.`,
    );
    out.push("");
    out.push("| Item | Value |");
    out.push("|---|---|");
    out.push(
      `| Browser-hours per 1,000 pages | ${browserHoursFor(1000, secs).toFixed(2)} |`,
    );
    out.push(
      `| Pages the included hours cover each month | ${fmtInt(pagesInIncludedHours(secs, br))} |`,
    );
    out.push(
      `| Each 1,000 pages past that | ${fmtUsd(browserRunMarginalPer1000(secs, br))} |`,
    );
    out.push("");
    out.push(
      "| Pages a month | Browser-hours | Total a month | Per 1,000 pages |",
    );
    out.push("|---|---|---|---|");
    for (const n of monthly) {
      const mo = browserRunMonth(n, secs, br);
      out.push(
        `| ${fmtInt(n)} | ${mo.browserHours.toFixed(1)} | ${fmtUsd(mo.totalUsd)} | ${fmtUsd(mo.usdPer1000)} |`,
      );
    }
  } else {
    out.push("", "No pages were scanned, so there is no browser time to cost.");
  }
  out.push("");
  return out.join("\n");
}
