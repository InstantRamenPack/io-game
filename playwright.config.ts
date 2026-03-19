import { defineConfig } from "@playwright/test";

function parseIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(
      `[playwright] invalid ${name} value "${rawValue}". Expected a positive integer.`,
    );
  }

  return parsedValue;
}

const serverPort = parseIntegerEnv("PLAYWRIGHT_SERVER_PORT", 3410);
const clientPort = parseIntegerEnv("PLAYWRIGHT_CLIENT_PORT", 4410);
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${clientPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "output/playwright/test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command: `GOOGLE_CLIENT_ID= PORT=${serverPort} VITE_PORT=${clientPort} VITE_BACKEND_TARGET=http://127.0.0.1:${serverPort} bun run dev`,
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
});
