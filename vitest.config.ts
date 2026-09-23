import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    // DB-backed tests share one database and truncate between tests.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
