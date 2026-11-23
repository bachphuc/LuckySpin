import { defineConfig, devices } from "@playwright/test";

const PORT = 3460;
const BASE_URL = `http://localhost:${PORT}`;

// Uses the locally installed Google Chrome by default (no browser download needed).
// Set PW_BUNDLED=1 to use Playwright's own Chromium instead (`npx playwright install chromium`).
const browser = process.env.PW_BUNDLED ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "off",
    ...browser,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...browser }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], ...browser }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // Next dev against a throwaway in-memory MongoDB.
    command: `node scripts/dev-memory.mjs --port ${PORT}`,
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_APP_URL: BASE_URL, RATE_LIMIT_DISABLED: "1" },
  },
});
