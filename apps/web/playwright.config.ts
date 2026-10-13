import { defineConfig } from '@playwright/test';
import { FAKE_AVALON_PORT, FAKE_LINK_SECRET } from './e2e/fake-avalon';

// End-to-end tests: real browsers against a real server with in-memory storage.
// Locally this uses the installed Edge; CI installs Chromium.
const PORT = Number(process.env.E2E_PORT ?? 3041);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.CI ? undefined : 'msedge',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: process.env.CI ? `pnpm exec next start -p ${PORT}` : `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AVALON_URL: `http://localhost:${FAKE_AVALON_PORT}`,
      JACKDAW_LINK_SECRET: FAKE_LINK_SECRET,
    },
  },
});
