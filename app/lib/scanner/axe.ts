// Runs axe-core on a page and keeps what the census and the scanner need:
// counts by rule, the six v1 types, a few sample nodes, and where each
// failure probably comes from (theme, app block, or content).
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import { FAILURE_TYPES, failureTypeForRule, type FailureType } from "../a11y/rules";

export type Source = "theme" | "app" | "unknown";

export interface RuleSummary {
  rule: string;
  impact: string | null;
  nodes: number;
  bySource: Record<Source, number>;
  samples: { target: string; html: string }[];
}

export interface PageScan {
  url: string;
  rules: RuleSummary[];
  sixTypes: Record<FailureType, number>;
  totalNodes: number;
}

// App blocks and app embeds render inside these wrappers.
// Section and block ids are anchored so theme classes such as
// "media-wrapper" or "card-wrapper" are not read as apps.
const APP_MARKERS = /shopify-app-block|shopify-block-[^\s>]*__app|#shopify-section-[^\s>]*__apps?(?![a-z0-9])|\[data-app\]|klaviyo|judgeme|jdgm|yotpo|loox|privy|omnisend|rebuy|recharge|afterpay|klarna|tidio|gorgias|acsb|userway/i;

export function sourceOf(target: string, html: string): Source {
  if (APP_MARKERS.test(target) || APP_MARKERS.test(html)) return "app";
  if (/shopify-section|header|footer|product|collection|cart|main/i.test(target)) return "theme";
  return "unknown";
}

export function emptySix(): Record<FailureType, number> {
  return Object.fromEntries(Object.keys(FAILURE_TYPES).map((k) => [k, 0])) as Record<FailureType, number>;
}

export async function scanPage(page: Page, url: string): Promise<PageScan> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const sixTypes = emptySix();
  let totalNodes = 0;
  const rules: RuleSummary[] = results.violations.map((v) => {
    const bySource: Record<Source, number> = { theme: 0, app: 0, unknown: 0 };
    for (const n of v.nodes) bySource[sourceOf(String(n.target.join(" ")), n.html)]++;
    const type = failureTypeForRule(v.id);
    if (type) sixTypes[type] += v.nodes.length;
    totalNodes += v.nodes.length;
    return {
      rule: v.id,
      impact: v.impact ?? null,
      nodes: v.nodes.length,
      bySource,
      samples: v.nodes.slice(0, 3).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 300) })),
    };
  });
  return { url, rules, sixTypes, totalNodes };
}
