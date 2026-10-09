// Cost per 1,000 page scans from measured throughput (T-033, D-10).
//
// No figure here is a price quote. Server prices are inputs. The Browser Run
// figures are the ones in the plan (docs/plan/roadmap.md), which cites
// Cloudflare's pricing page; check that page before relying on them (Q-05).

// Hours in an average month (8,760 / 12).
export const HOURS_PER_MONTH = 730;

export interface PriceSource {
  // Where the figure comes from, and whether anyone opened that page.
  source: string;
  // The date the figure was taken from the source.
  asOf: string;
}

export interface BrowserRunPricing extends PriceSource {
  planUsdPerMonth: number;
  includedBrowserHours: number;
  usdPerBrowserHour: number;
}

// From docs/plan/roadmap.md ("Browser time is cheap") and D-10.
export const BROWSER_RUN_PLAN: BrowserRunPricing = {
  planUsdPerMonth: 5,
  includedBrowserHours: 10,
  usdPerBrowserHour: 0.09,
  source: "docs/plan/roadmap.md and D-10, citing https://developers.cloudflare.com/browser-run/pricing/ (not re-opened for T-033)",
  asOf: "2026-10-07",
};

export interface ServerPrice extends PriceSource {
  label: string;
  usdPerMonth: number;
}

// The D-10 planning range for "one small server". Estimates, not quotes.
export const SERVER_PRICE_EXAMPLES: ServerPrice[] = [5, 10, 15].map((usd) => ({
  label: `$${usd} a month`,
  usdPerMonth: usd,
  source: "D-10 estimate (about $5 to $15 a month), not a quote",
  asOf: "2026-10-07",
}));

function positive(name: string, n: number) {
  if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${name} must be a number above 0`);
}

function nonNegative(name: string, n: number) {
  if (!Number.isFinite(n) || n < 0) throw new RangeError(`${name} must be a number of 0 or more`);
}

// A server billed by the month, busy for `utilisation` of the time at the
// measured rate. At 1.0 this is the floor; idle hours raise it.
export function serverCostPer1000(pagesPerHour: number, usdPerMonth: number, utilisation = 1): number {
  positive("pagesPerHour", pagesPerHour);
  nonNegative("usdPerMonth", usdPerMonth);
  if (!(utilisation > 0 && utilisation <= 1)) throw new RangeError("utilisation must be above 0 and at most 1");
  return (usdPerMonth / (HOURS_PER_MONTH * utilisation * pagesPerHour)) * 1000;
}

// Pages a month one server can scan at the measured rate.
export function serverPagesPerMonth(pagesPerHour: number, utilisation = 1): number {
  positive("pagesPerHour", pagesPerHour);
  return pagesPerHour * HOURS_PER_MONTH * utilisation;
}

// A rough rate for a server of another size, from CPU-seconds per page
// measured here. `efficiency` covers what does not scale with cores (the
// browser process, Node, waits). Shared vCPUs on small plans may be slower
// than the measured CPU, so treat the result as an upper bound.
export function pagesPerHourFromCpu(vcpus: number, cpuSecondsPerPage: number, efficiency = 0.8): number {
  positive("vcpus", vcpus);
  positive("cpuSecondsPerPage", cpuSecondsPerPage);
  if (!(efficiency > 0 && efficiency <= 1)) throw new RangeError("efficiency must be above 0 and at most 1");
  return (vcpus * 3600 * efficiency) / cpuSecondsPerPage;
}

export interface SessionOptions {
  // Browser time per session that is not page time (start, connect, close).
  sessionOverheadSeconds?: number;
  // Pages scanned in one browser session; the census scans a store's four.
  pagesPerSession?: number;
}

// Browser-hours that `pages` scans keep a remote browser open.
export function browserHoursFor(pages: number, secondsPerPage: number, opts: SessionOptions = {}): number {
  nonNegative("pages", pages);
  positive("secondsPerPage", secondsPerPage);
  const overhead = opts.sessionOverheadSeconds ?? 0;
  const perSession = opts.pagesPerSession ?? 4;
  nonNegative("sessionOverheadSeconds", overhead);
  positive("pagesPerSession", perSession);
  const sessions = Math.ceil(pages / perSession);
  return (pages * secondsPerPage + sessions * overhead) / 3600;
}

export interface BrowserRunMonth {
  pages: number;
  browserHours: number;
  billableHours: number;
  usageUsd: number;
  totalUsd: number;
  // Total for the month, plan included, per 1,000 pages.
  usdPer1000: number;
}

// One month on the plan: the fixed fee, then hours past the included ones.
export function browserRunMonth(pagesPerMonth: number, secondsPerPage: number, pricing: BrowserRunPricing = BROWSER_RUN_PLAN, opts: SessionOptions = {}): BrowserRunMonth {
  const hours = browserHoursFor(pagesPerMonth, secondsPerPage, opts);
  const billable = Math.max(0, hours - pricing.includedBrowserHours);
  const usage = billable * pricing.usdPerBrowserHour;
  const total = pricing.planUsdPerMonth + usage;
  return {
    pages: pagesPerMonth,
    browserHours: hours,
    billableHours: billable,
    usageUsd: usage,
    totalUsd: total,
    usdPer1000: pagesPerMonth > 0 ? (total / pagesPerMonth) * 1000 : 0,
  };
}

// What 1,000 more pages cost once the included hours are used up.
export function browserRunMarginalPer1000(secondsPerPage: number, pricing: BrowserRunPricing = BROWSER_RUN_PLAN, opts: SessionOptions = {}): number {
  return browserHoursFor(1000, secondsPerPage, opts) * pricing.usdPerBrowserHour;
}

// Pages the included hours cover each month.
export function pagesInIncludedHours(secondsPerPage: number, pricing: BrowserRunPricing = BROWSER_RUN_PLAN, opts: SessionOptions = {}): number {
  const hoursPerPage = browserHoursFor(1000, secondsPerPage, opts) / 1000;
  return Math.floor(pricing.includedBrowserHours / hoursPerPage);
}
