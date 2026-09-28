import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: real API + real web against their own Postgres database.
 * Each test signs up a fresh user, so tests don't depend on each other or on seed data.
 *   pnpm --filter @kollektor/web e2e
 */
const DB =
  process.env.E2E_DATABASE_URL ?? 'postgresql://kollektor:kollektor@localhost:5432/kollektor_test';
const API_PORT = 3101;
const WEB_PORT = 3100;
const WEB = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB,
    locale: 'es-AR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @kollektor/api start',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL: DB,
        BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
        BETTER_AUTH_URL: `http://localhost:${API_PORT}`,
        WEB_ORIGIN: WEB,
      },
    },
    {
      // A production build: closer to what users get, and no dev compile pauses mid-test.
      command: `pnpm exec next build && pnpm exec next start --port ${WEB_PORT}`,
      url: `${WEB}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        API_URL: `http://localhost:${API_PORT}`,
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
