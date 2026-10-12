// Smoke test for the scan benchmark (T-033): 3 pages at concurrency 1 through
// the census scan path. It lives with the Playwright tests because that CI
// job has a browser.
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBench, writeResult } from "../../scripts/bench/scan-bench";
import { formatSummary } from "../../scripts/bench/summary";

test("the scan benchmark scans 3 pages at concurrency 1 and writes its results", async () => {
  test.setTimeout(180_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-bench-smoke-"));
  try {
    const result = await runBench({
      pages: 3,
      concurrency: [1],
      seed: 1,
      stores: 50,
      fixturesDir: path.join(dir, "fixtures"),
      executablePath: process.env.PW_CHROMIUM_PATH,
      // Scan only the 3 pages, with no untimed warm-up store.
      warmup: false,
    });
    expect(result.options.stores).toBe(1);
    const [level] = result.levels;
    expect(level.concurrency).toBe(1);
    expect(level.pagesFailed).toBe(0);
    expect(level.errors).toEqual([]);
    expect(level.samples.map((s) => s.kind)).toEqual([
      "home",
      "collection",
      "product",
    ]);
    expect(level.pagesScanned).toBe(3);
    expect(level.pagesPerHour).toBeGreaterThan(0);
    expect(level.pageMs.p95).toBeGreaterThanOrEqual(level.pageMs.p50);
    for (const s of level.samples) {
      expect(s.domNodes).toBeGreaterThan(500);
      expect(s.violationNodes).toBeGreaterThan(0);
      expect(s.ms).toBeCloseTo(s.loadMs + s.axeMs, 6);
    }
    // The /proc readings: Node plus at least one Chromium process, and CPU
    // time for the pages. The fixture server's requests come from its child
    // process: robots.txt once, then each page's HTML, CSS and JS.
    expect(level.memory?.peakProcesses).toBeGreaterThan(1);
    expect(level.cpuSecondsPerPage).toBeGreaterThan(0);
    expect(level.nodeEventLoopPercent).toBeGreaterThan(0);
    expect(level.requestsPerPage).toBeGreaterThan(5);
    expect(level.byKind.home.n).toBe(1);
    expect(level.byKind.cart.n).toBe(0);
    expect(result.machine.cpuCount).toBeGreaterThan(0);
    expect(result.machine.axeCore).toMatch(/^\d+\.\d+\.\d+/);

    const files = writeResult(result, path.join(dir, "out"));
    expect(
      JSON.parse(fs.readFileSync(files.json, "utf8")).levels[0].pagesScanned,
    ).toBe(3);
    expect(fs.readFileSync(files.md, "utf8")).toBe(formatSummary(result));
    expect(fs.readFileSync(files.md, "utf8")).toContain("| 1 | 3 | 0 |");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
