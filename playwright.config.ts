import { defineConfig, devices } from "@playwright/test";

const PORT = 3201;

/**
 * End to end checks run against a throwaway embedded database (.data/e2e) seeded with the demo data.
 * Uses the installed Microsoft Edge so no browser download is needed.
 */
export default defineConfig({
  testDir: "./e2e",
  // Screenshot helper for visual review. Run with SHOTS=1.
  testIgnore: process.env.SHOTS ? [] : ["**/shots.spec.ts"],
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, channel: "msedge", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", channel: "msedge" } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PGLITE_DIR: ".data/e2e", DEMO_MODE: "true", NEXT_PUBLIC_DEMO_MODE: "true", AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret", CRON_SECRET: "e2e" },
  },
});
