import { defineConfig, devices } from "@playwright/test";

// Accessibility checks on HTML fixtures. No app server is needed: each test
// loads a fixture file and runs axe-core on it.
export default defineConfig({
  testDir: "./tests/a11y",
  fullyParallel: true,
  reporter: process.env.CI ? "list" : "line",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Set PW_CHROMIUM_PATH to use a preinstalled Chromium instead of
        // `npx playwright install chromium` (cloud sessions have one).
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
});
