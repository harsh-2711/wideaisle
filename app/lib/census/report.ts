// Turns census output into the M2 gap report (T-021): theme share, how
// common each of the six failure types is, the most common failure
// patterns, the apps behind the most failures, and what kind of change
// would fix them.
//
// The report is committed to a public repo, so it never names a store.
// Theme names come only from the Theme Store, and any theme or pattern
// seen in fewer than minStores stores is folded into "Other".
import { FAILURE_TYPES, failureTypeForRule, type FailureType } from "../a11y/rules";
import { APP_DOM_MARKERS } from "../scanner/detect";

export interface StoreLine {
  domain: string;
  // The myshopify.com name; several country domains can share one shop.
  shopDomain?: string | null;
  isShopify: boolean;
  theme: { name: string | null; schemaName: string | null; version: string | null; themeStoreId: number | null } | null;
  apps: string[];
  error?: string;
}

export interface ScanLine {
  domain: string;
  theme: StoreLine["theme"];
  apps: string[];
  pages: {
    kind: string;
    rules: { rule: string; nodes: number; bySource: { theme: number; app: number; unknown: number }; samples: { target: string; html: string }[] }[];
    sixTypes: Record<FailureType, number>;
    totalNodes: number;
  }[];
  skipped?: { kind: string; reason: string }[];
  error?: string;
}

export interface Row {
  label: string;
  count: number;
  share: number;
}

export type FixKind = "theme patch" | "content edit" | "app change" | "source unclear" | "unclear";

export interface GapReport {
  minStores: number;
  storesChecked: number;
  shopifyStores: number;
  storesScanned: number;
  pagesScanned: number;
  pagesByKind: Row[];
  storesWithSkippedPages: number;
  themes: Row[];
  themeVersions: Record<string, Row[]>;
  topFiveCoverage: { stores: number; share: number };
  sixTypePrevalence: Row[]; // share of scanned stores with at least one
  sixTypeShareOfAll: number; // six-type nodes / all violation nodes
  avgFailuresPerPage: number;
  patterns: Row[]; // stores showing the pattern, out of scanned stores
  apps: Row[];
  fixKinds: Row[];
  v1Themes: string[];
}

export const UNKNOWN_THEME = "Unknown";
export const CUSTOM_THEME = "Custom or unlisted";
export const OTHER = "Other (fewer stores than the reporting floor)";
const NOT_A_FAMILY = new Set([UNKNOWN_THEME, CUSTOM_THEME, OTHER]);

function rows(counts: Map<string, number>, total: number, top = Infinity): Row[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([label, count]) => ({ label, count, share: total ? count / total : 0 }));
}

function bump(m: Map<string, number>, key: string, by = 1) {
  m.set(key, (m.get(key) ?? 0) + by);
}

// Only a Theme Store theme has a public name. A store's own name for its
// theme ("Acme Outdoor | acme.com live", "Copy of Dawn") can identify it,
// so anything else is grouped as custom.
export function themeFamily(theme: StoreLine["theme"]): string {
  if (!theme) return UNKNOWN_THEME;
  const schema = theme.schemaName?.trim();
  if (theme.themeStoreId == null || !schema) return CUSTOM_THEME;
  return schema;
}

// A failure pattern: the rule plus the element's tag and its first class,
// read from the element's own opening tag, with Liquid-generated ids and
// numbers stripped, so the same template across stores groups together.
export function patternOf(rule: string, html: string): string {
  const open = /^<[^>]*>/.exec(html.trim())?.[0] ?? "";
  const tag = /^<([a-z0-9-]+)/i.exec(open)?.[1]?.toLowerCase() ?? "?";
  const cls = /\sclass\s*=\s*["']([^"']+)["']/i.exec(open)?.[1]?.replace(/`/g, "").split(/\s+/).find((c) => c && !/\d{3,}/.test(c)) ?? "";
  return `${rule}: <${tag}${cls ? ` class="${cls}"` : ""}>`;
}

// Which kind of change fixes a failure. Alt text on product images is
// content (set in the admin); failures inside app blocks need the app
// changed; the six types in theme sections live in theme code or settings.
// Where the scanner could not tell the source, say so.
export function fixKind(rule: string, source: "theme" | "app" | "unknown", html: string): FixKind {
  if (source === "app") return "app change";
  const type = failureTypeForRule(rule);
  // Samples are cut at 300 characters, so read any image URL attribute and
  // do not need its closing quote.
  const src = [...html.matchAll(/\s(?:data-)?src(?:set)?\s*=\s*["']?([^"'\s>]*)/gi)].map((m) => m[1]).join(" ");
  if (type === "missing-alt" && /cdn\.shopify\.com\/s\/files|\/cdn\/shop\/(products|files)\//i.test(src)) return "content edit";
  if (!type) return "unclear";
  return source === "theme" ? "theme patch" : "source unclear";
}

// The app whose markup appears in a failing element, among the apps the
// store loads. Null when no marker matches.
export function appFor(storeApps: string[], samples: { target: string; html: string }[]): string | null {
  for (const app of storeApps) {
    const marker = APP_DOM_MARKERS[app];
    if (marker && samples.some((s) => marker.test(s.target) || marker.test(s.html))) return app;
  }
  return null;
}

// The record to report for each domain: the last one with data, else the
// last one. A failed or empty retry should not hide an earlier scan.
export function pickRecords<T extends { domain: string; error?: string }>(records: T[]): T[] {
  const has = (x: T) => !x.error && (!("pages" in x) || (x as { pages: unknown[] }).pages.length > 0);
  const out = new Map<string, T>();
  for (const r of records) {
    const prev = out.get(r.domain);
    if (!prev || has(r) || !has(prev)) out.set(r.domain, r);
  }
  return [...out.values()];
}

// One shop can answer on several domains (country domains with Shopify
// Markets). Counting each would let one brand pass the reporting floor
// alone, so stores are keyed by their myshopify.com name when known.
export function shopKey(s: { domain: string; shopDomain?: string | null }): string {
  return (s.shopDomain || s.domain).toLowerCase();
}

// Suffixes where the brand sits one label further left (acme.co.uk).
const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz", "com.br", "co.jp", "com.mx", "co.za",
  "com.sg", "co.in", "com.tr", "co.kr", "com.cn", "com.hk", "com.ar", "co.il", "com.my", "com.co", "com.pe",
]);

// A brand key from a domain: the label left of the public suffix, so
// acme.com, acme.co.uk and acme.de are one brand. Two unrelated brands with
// the same name are merged, which only lowers counts: the safe direction
// for the reporting floor.
export function brandKey(domain: string): string {
  const parts = domain.toLowerCase().replace(/^www\./, "").split(":")[0].split(".").filter(Boolean);
  if (parts.length < 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(lastTwo) && parts.length >= 3 ? parts[parts.length - 3] : parts[parts.length - 2];
}

function majorVersion(version: string | null | undefined): string {
  const major = /^\s*(\d+)\./.exec(version ?? "")?.[1];
  return major ? `${major}.x` : "unknown";
}

// Shop counts per label, plus the brands behind them. A label is reported
// only when at least minStores distinct brands use it.
class Tally {
  shops = new Map<string, number>();
  brands = new Map<string, Set<string>>();
  add(label: string, brand: string) {
    bump(this.shops, label);
    if (!this.brands.has(label)) this.brands.set(label, new Set());
    this.brands.get(label)!.add(brand);
  }
  passes(label: string, minStores: number): boolean {
    return (this.brands.get(label)?.size ?? 0) >= minStores;
  }
  // Labels under the floor fold into `other`.
  folded(minStores: number, other: string, keep: (label: string) => boolean = () => false): Map<string, number> {
    const out = new Map<string, number>();
    for (const [label, count] of this.shops) bump(out, keep(label) || this.passes(label, minStores) ? label : other, count);
    return out;
  }
}

export function buildReport(stores: StoreLine[], scans: ScanLine[], opts: { minStores?: number } = {}): GapReport {
  const minStores = opts.minStores ?? 5;
  const keyOf = new Map(stores.map((s) => [s.domain, shopKey(s)]));
  const shopify = [...new Map(stores.filter((s) => s.isShopify).map((s) => [shopKey(s), s])).values()];
  const rawThemes = new Tally();
  for (const s of shopify) rawThemes.add(themeFamily(s.theme), brandKey(s.domain));
  const themeCounts = rawThemes.folded(minStores, OTHER, (label) => NOT_A_FAMILY.has(label));
  const familyOf = (t: StoreLine["theme"]) => {
    const fam = themeFamily(t);
    return themeCounts.has(fam) ? fam : OTHER;
  };
  const versionTallies = new Map<string, Tally>();
  for (const s of shopify) {
    const fam = familyOf(s.theme);
    if (NOT_A_FAMILY.has(fam)) continue;
    if (!versionTallies.has(fam)) versionTallies.set(fam, new Tally());
    versionTallies.get(fam)!.add(majorVersion(s.theme?.version), brandKey(s.domain));
  }
  // Versions are free text a merchant can edit; small groups fold away too.
  const versions = new Map<string, Map<string, number>>([...versionTallies].map(([fam, t]) => [fam, t.folded(minStores, "other")]));

  // One scan per shop, so a brand's country domains count once.
  const scanned = [...new Map(scans.filter((s) => !s.error && s.pages.length).map((s) => [keyOf.get(s.domain) ?? s.domain.toLowerCase(), s])).values()];
  const prevalence = new Map<string, number>(Object.values(FAILURE_TYPES).map((t) => [t.label, 0]));
  const patternTally = new Tally();
  const patternSeen = new Set<string>();
  const pagesByKind = new Map<string, number>();
  const apps = new Map<string, number>();
  const kinds = new Map<string, number>();
  let sixNodes = 0;
  let allNodes = 0;
  let pages = 0;
  for (const store of scanned) {
    const hasType = new Set<FailureType>();
    for (const page of store.pages) {
      pages++;
      bump(pagesByKind, page.kind);
      allNodes += page.totalNodes;
      for (const [t, count] of Object.entries(page.sixTypes) as [FailureType, number][]) {
        sixNodes += count;
        if (count > 0) hasType.add(t);
      }
      for (const r of page.rules) {
        // The first sample stands for the rule on this page.
        const sample = r.samples[0]?.html ?? "";
        const pattern = patternOf(r.rule, sample);
        // Each shop counts once per pattern; the floor counts brands.
        const shop = keyOf.get(store.domain) ?? store.domain.toLowerCase();
        if (!patternSeen.has(`${pattern}\u0000${shop}`)) {
          patternSeen.add(`${pattern}\u0000${shop}`);
          patternTally.add(pattern, brandKey(store.domain));
        }
        for (const src of ["theme", "app", "unknown"] as const) {
          const count = r.bySource[src] ?? 0;
          if (!count || !failureTypeForRule(r.rule)) continue;
          bump(kinds, fixKind(r.rule, src, sample), count);
        }
        if (r.bySource.app > 0) bump(apps, appFor(store.apps, r.samples) ?? "Unidentified app", r.bySource.app);
      }
    }
    for (const t of hasType) bump(prevalence, FAILURE_TYPES[t].label);
  }

  // A pattern is reported by how many stores show it, and only when enough
  // stores do, so one store's class names never reach the report.
  const patterns = new Map<string, number>();
  for (const [p, count] of patternTally.shops) if (patternTally.passes(p, minStores)) patterns.set(p, count);

  const themes = rows(themeCounts, shopify.length);
  const families = themes.filter((t) => !NOT_A_FAMILY.has(t.label));
  const topFive = families.slice(0, 5).reduce((a, t) => a + t.count, 0);
  return {
    minStores,
    storesChecked: stores.length,
    shopifyStores: shopify.length,
    storesScanned: scanned.length,
    pagesScanned: pages,
    pagesByKind: rows(pagesByKind, scanned.length),
    storesWithSkippedPages: scanned.filter((s) => (s.skipped?.length ?? 0) > 0).length,
    themes,
    themeVersions: Object.fromEntries([...versions.entries()].map(([k, m]) => [k, rows(m, themeCounts.get(k) ?? 0)])),
    topFiveCoverage: { stores: topFive, share: shopify.length ? topFive / shopify.length : 0 },
    sixTypePrevalence: rows(prevalence, scanned.length),
    sixTypeShareOfAll: allNodes ? sixNodes / allNodes : 0,
    avgFailuresPerPage: pages ? allNodes / pages : 0,
    patterns: rows(patterns, scanned.length, 10),
    apps: rows(apps, [...apps.values()].reduce((a, b) => a + b, 0), 10),
    fixKinds: rows(kinds, sixNodes),
    v1Themes: families.slice(0, 5).map((t) => t.label),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const num = (x: number) => x.toLocaleString("en-US");
const cell = (x: string | number) => String(x).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function table(head: string[], body: (string | number)[][]): string {
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...body.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

export function renderReport(r: GapReport, date: string): string {
  const out: string[] = [];
  out.push("# Gap report", "");
  out.push(
    `Census of ${date}: ${num(r.storesChecked)} domains checked, ${num(r.shopifyStores)} Shopify stores found, ${num(r.storesScanned)} scanned across ${num(r.pagesScanned)} pages. Automated checks find only part of all barriers.`,
    "",
  );
  if (r.storesScanned === 0) {
    out.push("No scans yet. Run the census scan step, then write this report again.", "");
  } else {
    out.push(
      `The six v1 types make up ${pct(r.sixTypeShareOfAll)} of detected failures, with ${r.avgFailuresPerPage.toFixed(1)} failures per page on average (one per rule and element).`,
      "",
    );
  }
  out.push(`No store is named. Themes and patterns seen in fewer than ${r.minStores} stores are grouped as "Other" or left out.`, "");

  out.push("## Proposed v1 themes (D-08)", "", r.v1Themes.length ? r.v1Themes.map((t, i) => `${i + 1}. ${t}`).join("\n") : "Not enough data.", "");
  if (r.v1Themes.length) {
    out.push(`These ${r.v1Themes.length} themes cover ${pct(r.topFiveCoverage.share)} of Shopify stores found (${num(r.topFiveCoverage.stores)} of ${num(r.shopifyStores)}).`, "");
  }
  out.push(
    "## Themes by share of Shopify stores",
    "",
    table(["Theme", "Stores", "Share", "Versions"], r.themes.slice(0, 15).map((t) => [t.label, t.count, pct(t.share), (r.themeVersions[t.label] ?? []).slice(0, 3).map((v) => `${v.label} ${pct(v.share)}`).join(", ")])),
    "",
  );
  if (r.storesScanned === 0) return out.join("\n");

  out.push(
    "## Pages scanned",
    "",
    table(["Page", "Stores", "Share of scanned stores"], r.pagesByKind.map((p) => [p.label, p.count, pct(p.share)])),
    "",
    `${num(r.storesWithSkippedPages)} of ${num(r.storesScanned)} scanned stores had at least one page skipped (robots.txt, a redirect, an error or no link found).`,
    "",
  );
  out.push("## Stores with at least one failure of each type", "", table(["Failure type", "Stores", "Share"], r.sixTypePrevalence.map((t) => [t.label, t.count, pct(t.share)])), "");
  out.push(
    "## The 10 most common failure patterns",
    "",
    r.patterns.length
      ? table(["Pattern", "Stores", "Share of scanned stores"], r.patterns.map((p) => [`\`${p.label}\``, p.count, pct(p.share)]))
      : "No pattern reached the reporting floor.",
    "",
    "Each pattern comes from the first sample axe reports for a rule on a page.",
    "",
  );
  out.push(
    "## The 10 apps behind the most failures",
    "",
    r.apps.length ? table(["App", "Failing elements", "Share of app failures"], r.apps.map((a) => [a.label, a.count, pct(a.share)])) : "No app failures attributed.",
    "",
  );
  out.push(
    "## What would fix the six types, by failing element",
    "",
    table(["Fix", "Elements", "Share"], r.fixKinds.map((k) => [k.label, k.count, pct(k.share)])),
    "",
  );
  out.push(
    "Sources are guesses from where each element sits on the page (theme section, app block), so the theme patch and app rows are estimates. App attribution counts only apps whose markup we recognise; treat it as a lower bound.",
    "",
  );
  return out.join("\n");
}
