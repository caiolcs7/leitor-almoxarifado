import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/teste-subpasta/',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      'npm run build:e2e && npm run preview -- --outDir dist-test --base=/teste-subpasta/ --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/teste-subpasta/',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
