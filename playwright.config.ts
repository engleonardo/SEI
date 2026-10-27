import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  reporter: 'list',
  use: {
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
});
