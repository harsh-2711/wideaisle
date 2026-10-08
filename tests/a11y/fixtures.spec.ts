import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FAILURE_TYPES, SIX_AXE_RULES, failureTypeForRule, type FailureType } from "../../app/lib/a11y/rules";

const fixture = (name: string) => pathToFileURL(path.join(import.meta.dirname, "fixtures", `${name}.html`)).href;

async function sixTypeViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withRules(SIX_AXE_RULES).analyze();
  return results.violations.map((v) => failureTypeForRule(v.id)).filter(Boolean);
}

test("a clean store page has none of the six failure types", async ({ page }) => {
  await page.goto(fixture("clean"));
  expect(await sixTypeViolations(page)).toEqual([]);
});

for (const type of Object.keys(FAILURE_TYPES) as FailureType[]) {
  test(`axe detects ${type}`, async ({ page }) => {
    await page.goto(fixture(type));
    expect(await sixTypeViolations(page)).toContain(type);
  });
}
