import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

loadEnvConfig(process.cwd());

const port = Number(process.env.PLAYWRIGHT_PORT ?? '3001');
const baseURL = `http://127.0.0.1:${port}`;
const authFile = 'playwright/.auth/user.json';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      testIgnore: [/.*\.setup\.ts/, /.*coordinate\.spec\.ts/],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-auth',
      testMatch: /.*coordinate\.spec\.ts/,
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: process.env.CI
      ? `PLAYWRIGHT_E2E=1 npm run build -- --webpack && PLAYWRIGHT_E2E=1 npm run start -- -p ${port}`
      : `PLAYWRIGHT_E2E=1 npm run dev -- --webpack -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
