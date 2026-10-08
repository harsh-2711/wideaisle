// Turns census output into the M2 gap report (T-021): theme share, how
// common each of the six failure types is, the most common failure
// patterns, the apps behind the most failures, and what kind of change
// would fix them.
import { FAILURE_TYPES, failureTypeForRule, type FailureType } from "../a11y/rules";

export interface StoreLine {
  domain: string;
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
  error?: string;
}

export interface Row {
  label: string;
  count: number;
  share: number;
}

export type FixKind = "theme patch" | "content edit" | "app change" | "unclear";

export interface GapReport {
  storesChecked: number;
  shopifyStores: number;
  storesScanned: number;
  pagesScanned: number;
  themes: Row[];
  themeVersions: Record<string, Row[]>;
  sixTypePrevalence: Row[]; // share of scanned stores with at least one
  sixTypeShareOfAll: number; // six-type nodes / all violation nodes
  avgNodesPerPage: number;
  patterns: Row[];
  apps: Row[];
  fixKinds: Row[];
  v1Themes: string[];
}

function rows(counts: Map<string, number>, total: number, top = Infinity): Row[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([label, count]) => ({ label, count, share: total ? count / total : 0 }));
}

function bump(m: Map<string, number>, key: string, by = 1) {
  m.set(key, (m.get(key) ?? 0) + by);
}

export function themeFamily(theme: StoreLine["theme"]): string {
  if (!theme) return "Unknown";
  return (theme.schemaName || theme.name || "Unknown").trim();
}

// A failure pattern: the rule plus the element's tag and its first class,
// with Liquid-generated ids and numbers stripped, so the same template
// across stores groups together.
export function patternOf(rule: string, html: string): string {
  const tag = /^<([a-z0-9-]+)/i.exec(html.trim())?.[1]?.toLowerCase() ?? "?";
  const cls = /class\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]?.split(/\s+/).find((c) => c && !/\d{3,}/.test(c)) ?? "";
  return `${rule}: <${tag}${cls ? ` class="${cls}"` : ""}>`;
}

// Which kind of change fixes a failure. Alt text on product images is
// content (set in the admin); failures inside app blocks need the app
// changed; the rest of the six types live in theme code or settings.
export function fixKind(rule: string, source: "theme" | "app" | "unknown", html: string): FixKind {
  if (source === "app") return "app change";
  const type = failureTypeForRule(rule);
  if (type === "missing-alt" && /cdn\.shopify\.com\/s\/files|\/cdn\/shop\/(products|files)|product|media/i.test(html)) return "content edit";
  if (type) return "theme patch";
  return "unclear";
}

export function buildReport(stores: StoreLine[], scans: ScanLine[]): GapReport {
  const shopify = stores.filter((s) => s.isShopify);
  const themeCounts = new Map<string, number>();
  const versions = new Map<string, Map<string, number>>();
  for (const s of shopify) {
    const fam = themeFamily(s.theme);
    bump(themeCounts, fam);
    if (!versions.has(fam)) versions.set(fam, new Map());
    bump(versions.get(fam)!, s.theme?.version ? s.theme.version.split(".")[0] + ".x" : "unknown");
  }
  const scanned = scans.filter((s) => !s.error && s.pages.length);
  const prevalence = new Map<string, number>();
  const patterns = new Map<string, number>();
  const apps = new Map<string, number>();
  const kinds = new Map<string, number>();
  let sixNodes = 0;
  let allNodes = 0;
  let pages = 0;
  for (const store of scanned) {
    const hasType = new Set<FailureType>();
    for (const page of store.pages) {
      pages++;
      allNodes += page.totalNodes;
      for (const [t, n] of Object.entries(page.sixTypes) as [FailureType, number][]) {
        sixNodes += n;
        if (n > 0) hasType.add(t);
      }
      for (const r of page.rules) {
        const sample = r.samples[0]?.html ?? "";
        bump(patterns, patternOf(r.rule, sample), r.nodes);
        for (const src of ["theme", "app", "unknown"] as const) {
          const n = r.bySource[src] ?? 0;
          if (!n || !failureTypeForRule(r.rule)) continue;
          bump(kinds, fixKind(r.rule, src, sample), n);
        }
        if (r.bySource.app > 0) {
          const named = store.apps.find((a) => r.samples.some((s) => new RegExp(a.split(/[ .]/)[0], "i").test(s.target + s.html)));
          bump(apps, named ?? "Unidentified app", r.bySource.app);
        }
      }
    }
    for (const t of hasType) bump(prevalence, FAILURE_TYPES[t].label);
  }
  const themes = rows(themeCounts, shopify.length);
  return {
    storesChecked: stores.length,
    shopifyStores: shopify.length,
    storesScanned: scanned.length,
    pagesScanned: pages,
    themes,
    themeVersions: Object.fromEntries([...versions.entries()].map(([k, m]) => [k, rows(m, themeCounts.get(k) ?? 0)])),
    sixTypePrevalence: rows(prevalence, scanned.length),
    sixTypeShareOfAll: allNodes ? sixNodes / allNodes : 0,
    avgNodesPerPage: pages ? allNodes / pages : 0,
    patterns: rows(patterns, allNodes, 10),
    apps: rows(apps, [...apps.values()].reduce((a, b) => a + b, 0), 10),
    fixKinds: rows(kinds, sixNodes),
    v1Themes: themes.filter((t) => t.label !== "Unknown").slice(0, 5).map((t) => t.label),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function table(head: string[], body: (string | number)[][]): string {
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

export function renderReport(r: GapReport, date: string): string {
  const out: string[] = [];
  out.push("# Gap report", "");
  out.push(
    `Census of ${date}: ${r.storesChecked.toLocaleString("en-US")} domains checked, ${r.shopifyStores.toLocaleString("en-US")} Shopify stores found, ${r.storesScanned.toLocaleString("en-US")} scanned across ${r.pagesScanned.toLocaleString("en-US")} pages. The six v1 types make up ${pct(r.sixTypeShareOfAll)} of detected failures, with ${r.avgNodesPerPage.toFixed(1)} failing elements per page on average. Automated checks find only part of all barriers.`,
    "",
  );
  out.push("## Proposed v1 themes (D-08)", "", r.v1Themes.length ? r.v1Themes.map((t, i) => `${i + 1}. ${t}`).join("\n") : "Not enough data.", "");
  out.push("## Themes by share of Shopify stores", "", table(["Theme", "Stores", "Share", "Versions"], r.themes.slice(0, 15).map((t) => [t.label, t.count, pct(t.share), (r.themeVersions[t.label] ?? []).slice(0, 3).map((v) => `${v.label} ${pct(v.share)}`).join(", ")])), "");
  out.push("## Stores with at least one failure of each type", "", table(["Failure type", "Stores", "Share"], r.sixTypePrevalence.map((t) => [t.label, t.count, pct(t.share)])), "");
  out.push("## The 10 most common failure patterns", "", table(["Pattern", "Elements", "Share of all"], r.patterns.map((p) => [`\`${p.label.replace(/\|/g, "\\|")}\``, p.count, pct(p.share)])), "");
  out.push("## The 10 apps behind the most failures", "", r.apps.length ? table(["App", "Failing elements", "Share of app failures"], r.apps.map((a) => [a.label, a.count, pct(a.share)])) : "No app failures attributed.", "");
  out.push("## What would fix the six types", "", table(["Fix", "Elements", "Share"], r.fixKinds.map((k) => [k.label, k.count, pct(k.share)])), "");
  out.push("Sources are guesses from where each element sits on the page (theme section, app block). Treat app attribution as a lower bound.", "");
  return out.join("\n");
}
