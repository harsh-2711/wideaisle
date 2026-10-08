import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";
import { SIX_AXE_RULES, failureTypeForRule } from "../../app/lib/a11y/rules";
import { applyFixes, fixTheme } from "../../app/lib/fixers/engine";
import { loadTheme, renderTheme } from "./render";

const MINI = path.join(import.meta.dirname, "themes", "mini");

async function sixTypes(page: import("@playwright/test").Page, html: string) {
  await page.setContent(html);
  const results = await new AxeBuilder({ page }).withRules(SIX_AXE_RULES).analyze();
  return results.violations.flatMap((v) => v.nodes.map(() => failureTypeForRule(v.id)));
}

test("the mini theme fails all six types before the fixers run", async ({ page }) => {
  const found = new Set(await sixTypes(page, await renderTheme(loadTheme(MINI))));
  expect([...found].sort()).toEqual(["empty-button", "empty-link", "low-contrast", "missing-alt", "missing-label", "missing-lang"]);
});

test("after the fixers, the mini theme has none of the six types", async ({ page }) => {
  const theme = loadTheme(MINI);
  const report = fixTheme(theme);
  expect(report.review).toEqual([]);
  const after = await sixTypes(page, await renderTheme(applyFixes(theme, report)));
  expect(after).toEqual([]);
});
