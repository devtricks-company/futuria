import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Each test file gets its own throwaway database (MONGODB_TEST_URI, else local MongoDB).
    setupFiles: ['./test/setup-env.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
