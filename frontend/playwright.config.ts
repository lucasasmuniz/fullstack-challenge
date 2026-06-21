import { defineConfig, devices } from "@playwright/test";

/**
 * E2E de browser (bônus). Os testes de espectador (anônimo) exercitam o tempo real sem login —
 * exigem a stack de pé (Kong/games via `docker:up` ou `docker:e2e`). O webServer sobe o Next em
 * produção; aponte `E2E_BASE_URL` para outro host se necessário.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
