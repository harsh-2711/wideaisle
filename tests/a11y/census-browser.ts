// The census specs use the browser the census itself launches
// (launchCensusBrowser), not Playwright's default one, so they run with the
// same switches and the same refusing proxy as a real scan (T-027).
import { test as base } from "@playwright/test";
import type { Browser } from "playwright";
import { launchCensusBrowser } from "../../scripts/census/census";

export const test = base.extend<object, { censusBrowser: Browser }>({
  censusBrowser: [
    // Playwright reads fixture needs from this pattern; this one needs none.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const census = await launchCensusBrowser(process.env.PW_CHROMIUM_PATH);
      await use(census.browser);
      await census.close();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
