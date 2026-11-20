/*
 * Build the web app for the Playwright tests: like `next build`, but with Clerk switched off
 * even when .env.local has Clerk keys (the e2e tests use the API's dev identity).
 *
 *   pnpm build                                # everything (API, packages, web)
 *   pnpm --filter @futuria/web build:e2e      # then rebuild the web app without Clerk
 *   pnpm --filter @futuria/web test:e2e
 *
 * Run `pnpm --filter @futuria/web build` afterwards to get a Clerk-enabled build back.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['exec', 'next', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  // No analytics from test runs, even if .env.local has a PostHog key.
  env: { ...process.env, NEXT_PUBLIC_CLERK_DISABLED: '1', NEXT_PUBLIC_POSTHOG_KEY: '' },
});
process.exit(result.status ?? 1);
