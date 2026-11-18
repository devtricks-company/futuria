import { defineConfig, devices } from '@playwright/test';
import { e2eMongoUri } from './e2e/db';

/*
 * Sara's journey through the real web app and API, with no external services:
 * - the built API (`pnpm build` first) in fixture AI mode, inline pipeline and dev auth, on a
 *   throwaway `futuria_test_web_e2e` database (MONGODB_TEST_URI or local MongoDB);
 * - the built web app (`next start`) pointing at it.
 * Ports 4100/3100 leave `pnpm dev` (4000/3000) alone.
 */
const API_PORT = 4100;
const WEB_PORT = 3100;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: CI ? 2 : undefined,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // Run from apps/web so the API doesn't pick up apps/api/.env (real keys); everything it
      // needs is set here.
      command: 'node ../api/dist/main.js',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        MONGODB_URI: e2eMongoUri(),
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        AUTH_MODE: 'dev',
        AI_MODE: 'fixture',
        PIPELINE_MODE: 'inline',
      },
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
