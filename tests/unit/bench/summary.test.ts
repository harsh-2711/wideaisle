import { describe, expect, it } from "vitest";
import {
  browserSecondsPerPage,
  cpuSecondsPerPage,
  dist,
  fmtInt,
  fmtSec,
  fmtUsd,
  formatSummary,
  percentile,
  type BenchResult,
  type LevelResult,
} from "../../../scripts/bench/summary";

describe("percentiles", () => {
  it("uses the nearest rank", () => {
    const xs = [15, 20, 35, 40, 50];
    expect(percentile(xs, 0)).toBe(15);
    expect(percentile(xs, 30)).toBe(20);
    expect(percentile(xs, 40)).toBe(20);
    expect(percentile(xs, 50)).toBe(35);
    expect(percentile(xs, 95)).toBe(50);
    expect(percentile(xs, 100)).toBe(50);
    expect(percentile([3, 1, 2], 50)).toBe(2);
    expect(Number.isNaN(percentile([], 50))).toBe(true);
    expect(() => percentile(xs, 101)).toThrow(RangeError);
  });

  it("summarises a list without changing it", () => {
    const xs = Array.from({ length: 100 }, (_, i) => 100 - i);
    const d = dist(xs);
    expect(d).toEqual({
      n: 100,
      mean: 50.5,
      p50: 50,
      p95: 95,
      min: 1,
      max: 100,
    });
    expect(xs[0]).toBe(100);
    expect(dist([]).n).toBe(0);
  });
});

describe("number formats", () => {
  it("formats counts, seconds and dollars", () => {
    expect(fmtInt(1234567.4)).toBe("1,234,567");
    expect(fmtInt(Number.NaN)).toBe("n/a");
    expect(fmtSec(1234)).toBe("1.23 s");
    expect(fmtUsd(0)).toBe("$0");
    expect(fmtUsd(0.00456)).toBe("$0.0046");
    expect(fmtUsd(0.0456)).toBe("$0.046");
    expect(fmtUsd(12.345)).toBe("$12.35");
    expect(fmtUsd(Number.POSITIVE_INFINITY)).toBe("n/a");
  });
});

function level(
  concurrency: number,
  pages: number,
  wallSeconds: number,
  cpuSecondsPerPage: number | null,
): LevelResult {
  const ms = dist([1000, 2000, 3000]);
  return {
    concurrency,
    pagesTarget: pages,
    pagesScanned: pages,
    pagesFailed: 0,
    stores: Math.ceil(pages / 4),
    wallSeconds,
    pagesPerHour: pages > 0 ? (pages / wallSeconds) * 3600 : 0,
    pageMs: ms,
    loadMs: dist([200]),
    axeMs: dist([1800]),
    domNodes: dist([1500]),
    violationNodes: dist([40]),
    sixTypes: { "low-contrast": 10 },
    cpuSecondsPerPage,
    nodeCpuSecondsPerPage: 0.5,
    benchCpuPercent: 40,
    machineBusyPercent: 45,
    loadAvgStart: [0.5, 0.5, 0.5],
    memory: {
      peakNodeRssMb: 300,
      peakBrowserRssMb: 900,
      peakTotalRssMb: 1200,
      peakTotalPssMb: 800,
      peakProcesses: 9,
      samples: 10,
    },
    errors: [],
    requestsPerPage: 14,
    samples: [],
  };
}

function result(levels: LevelResult[]): BenchResult {
  return {
    tool: "scan-bench",
    startedAt: "2026-10-09T08:00:00.000Z",
    finishedAt: "2026-10-09T08:30:00.000Z",
    options: {
      pages: 200,
      concurrency: levels.map((l) => l.concurrency),
      seed: 1,
      stores: 50,
    },
    machine: {
      cpuCount: 4,
      cpuModel: "Test CPU",
      memoryMb: 16000,
      platform: "linux",
      kernel: "6.0",
      cgroupCpuMax: null,
      node: "v22.0.0",
      chromium: "141.0",
      playwright: "1.64.0",
      axeCore: "4.13.0",
    },
    fixtures: {
      stores: 50,
      fixtureVersion: 2,
      pageKb: dist([400, 800, 1200]),
      htmlKb: dist([100]),
      byKind: {},
    },
    levels,
  };
}

describe("summary", () => {
  // 200 pages in 720 s at concurrency 1 (3.6 s a page), 200 in 360 s at 2.
  const r = result([level(1, 200, 720, 3.0), level(2, 200, 360, 2.7)]);

  it("picks the browser time and CPU time the costs use", () => {
    expect(browserSecondsPerPage(r)).toBeCloseTo(3.6, 10);
    expect(cpuSecondsPerPage(r)).toBe(2.7);
    expect(browserSecondsPerPage(result([level(1, 0, 10, null)]))).toBeNull();
    expect(cpuSecondsPerPage(result([level(1, 10, 10, null)]))).toBeNull();
  });

  it("lists throughput, memory and both costs", () => {
    const md = formatSummary(r);
    expect(md).toContain("# Scan benchmark, 2026-10-09");
    expect(md).toContain(
      "| 1 | 200 | 0 | 720.00 s | 1,000 | 2.00 s | 3.00 s |",
    );
    expect(md).toContain("| 2 | 200 | 0 | 360.00 s | 2,000 |");
    expect(md).toContain("1,200 MB | 800 MB |");
    expect(md).toContain("14.0 at concurrency 1, 14.0 at concurrency 2.");
    // $5 a month at 1,000 pages an hour: 5 / (730 * 1000) * 1000.
    expect(md).toContain(
      "| This machine, concurrency 1 | 1,000 | $0.0068 | $0.014 | $0.021 |",
    );
    // 1 vCPU at 2.7 CPU-s a page and 80% efficiency: 1,067 pages an hour.
    expect(md).toContain("| 1 vCPU, estimated from CPU-s a page | 1,067 |");
    expect(md).toContain(
      "## Cost per 1,000 pages: Browser Run (plan figures, not measured)",
    );
    // 3.6 s a page: 1 browser-hour per 1,000 pages, 10,000 pages in 10 hours.
    expect(md).toContain("| Browser-hours per 1,000 pages | 1.00 |");
    expect(md).toContain(
      "| Pages the included hours cover each month | 10,000 |",
    );
    expect(md).toContain("| Each 1,000 pages past that | $0.090 |");
    expect(md).toContain("| 10,000 | 10.0 | $5.00 | $0.500 |");
    expect(md).toContain("| 100,000 | 100.0 | $13.10 | $0.131 |");
    expect(md).toContain("not a quote");
    expect(md).not.toContain(String.fromCharCode(0x2014));
  });

  it("takes server prices as inputs", () => {
    const md = formatSummary(r, {
      serverPrices: [
        {
          label: "$20 a month",
          usdPerMonth: 20,
          source: "input",
          asOf: "2026-10-09",
        },
      ],
      vcpus: [],
    });
    expect(md).toContain("| Rate | Pages an hour | $20 a month |");
    expect(md).not.toContain("vCPU, estimated");
  });

  it("says so when nothing was scanned", () => {
    const md = formatSummary(result([level(1, 0, 10, null)]));
    expect(md).toContain("No pages were scanned");
  });
});
