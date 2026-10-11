import { describe, expect, it } from "vitest";
import {
  BROWSER_RUN_PLAN,
  browserHoursFor,
  browserRunMarginalPer1000,
  browserRunMonth,
  HOURS_PER_MONTH,
  pagesInIncludedHours,
  pagesPerHourFromCpu,
  SERVER_PRICE_EXAMPLES,
  serverCostPer1000,
  serverPagesPerMonth,
} from "../../../scripts/bench/cost";

describe("small server cost", () => {
  it("spreads the monthly price over the pages scanned in a month", () => {
    // $7.30 a month is $0.01 an hour; 1,000 pages an hour is $0.01 per 1,000.
    expect(serverCostPer1000(1000, 7.3)).toBeCloseTo(0.01, 10);
    expect(serverCostPer1000(2000, 7.3)).toBeCloseTo(0.005, 10);
    expect(serverPagesPerMonth(1000)).toBe(1000 * HOURS_PER_MONTH);
  });

  it("costs more when the server sits idle part of the month", () => {
    expect(serverCostPer1000(1000, 7.3, 0.25)).toBeCloseTo(0.04, 10);
    expect(serverPagesPerMonth(1000, 0.5)).toBe(500 * HOURS_PER_MONTH);
  });

  it("rejects inputs that make no sense", () => {
    expect(() => serverCostPer1000(0, 5)).toThrow(RangeError);
    expect(() => serverCostPer1000(100, -1)).toThrow(RangeError);
    expect(() => serverCostPer1000(100, 5, 0)).toThrow(RangeError);
    expect(() => serverCostPer1000(100, 5, 1.5)).toThrow(RangeError);
    expect(() => serverCostPer1000(Number.NaN, 5)).toThrow(RangeError);
  });

  it("scales a rate to another server size from CPU-seconds a page", () => {
    // 2 vCPUs, 3.6 CPU-seconds a page, no losses: 2,000 pages an hour.
    expect(pagesPerHourFromCpu(2, 3.6, 1)).toBeCloseTo(2000, 10);
    expect(pagesPerHourFromCpu(2, 3.6)).toBeCloseTo(1600, 10);
    expect(() => pagesPerHourFromCpu(0, 3.6)).toThrow(RangeError);
    expect(() => pagesPerHourFromCpu(1, 3.6, 0)).toThrow(RangeError);
  });

  it("labels the example prices as estimates with a source and a date", () => {
    expect(SERVER_PRICE_EXAMPLES.map((p) => p.usdPerMonth)).toEqual([
      5, 10, 15,
    ]);
    for (const p of SERVER_PRICE_EXAMPLES) {
      expect(p.source).toMatch(/estimate/i);
      expect(p.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("Browser Run cost", () => {
  it("uses the plan figures from the roadmap", () => {
    expect(BROWSER_RUN_PLAN).toMatchObject({
      planUsdPerMonth: 5,
      includedBrowserHours: 10,
      usdPerBrowserHour: 0.09,
    });
    expect(BROWSER_RUN_PLAN.source).toMatch(/roadmap/);
    expect(BROWSER_RUN_PLAN.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("turns seconds a page into browser-hours, with session overhead", () => {
    expect(browserHoursFor(3600, 1)).toBeCloseTo(1, 10);
    // 8 pages in sessions of 4: two sessions of 9 s overhead each.
    expect(
      browserHoursFor(8, 0.5, {
        sessionOverheadSeconds: 9,
        pagesPerSession: 4,
      }),
    ).toBeCloseTo((8 * 0.5 + 18) / 3600, 10);
    // A partial session still pays its overhead.
    expect(
      browserHoursFor(5, 1, { sessionOverheadSeconds: 10, pagesPerSession: 4 }),
    ).toBeCloseTo((5 + 20) / 3600, 10);
    expect(browserHoursFor(0, 1)).toBe(0);
    expect(() => browserHoursFor(10, 0)).toThrow(RangeError);
    expect(() => browserHoursFor(10, 1, { pagesPerSession: 0 })).toThrow(
      RangeError,
    );
  });

  it("charges only the plan fee inside the included hours", () => {
    // 3.6 s a page: 1,000 pages is one browser-hour.
    const m = browserRunMonth(5000, 3.6);
    expect(m.browserHours).toBeCloseTo(5, 10);
    expect(m.billableHours).toBe(0);
    expect(m.totalUsd).toBe(5);
    expect(m.usdPer1000).toBeCloseTo(1, 10);
  });

  it("charges each hour past the included ones", () => {
    const m = browserRunMonth(30000, 3.6);
    expect(m.browserHours).toBeCloseTo(30, 10);
    expect(m.billableHours).toBeCloseTo(20, 10);
    expect(m.usageUsd).toBeCloseTo(1.8, 10);
    expect(m.totalUsd).toBeCloseTo(6.8, 10);
    expect(m.usdPer1000).toBeCloseTo(6.8 / 30, 10);
    expect(browserRunMonth(0, 3.6).usdPer1000).toBe(0);
  });

  it("gives the marginal cost and the pages the included hours cover", () => {
    expect(browserRunMarginalPer1000(3.6)).toBeCloseTo(0.09, 10);
    expect(pagesInIncludedHours(3.6)).toBe(10000);
    // 4 s of session overhead shared by 4 pages: 4.6 s a page.
    expect(
      pagesInIncludedHours(3.6, BROWSER_RUN_PLAN, {
        sessionOverheadSeconds: 4,
        pagesPerSession: 4,
      }),
    ).toBe(7826);
    expect(() => pagesInIncludedHours(0)).toThrow(RangeError);
    const custom = {
      ...BROWSER_RUN_PLAN,
      includedBrowserHours: 0,
      usdPerBrowserHour: 1,
    };
    expect(browserRunMarginalPer1000(1.8, custom)).toBeCloseTo(0.5, 10);
    expect(pagesInIncludedHours(1.8, custom)).toBe(0);
  });
});
