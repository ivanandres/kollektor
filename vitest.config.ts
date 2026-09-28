import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The web app's `@/…` imports.
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) } },
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    // DB-backed tests share one database and truncate between tests.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
