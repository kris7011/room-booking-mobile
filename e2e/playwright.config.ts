import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

import {
  API_PORT,
  API_URL,
  BACKEND_DIR,
  BACKEND_PROJECT,
  OUTPUT_DIR,
  WEB_PORT,
  WEB_URL,
  backendArguments,
  backendEnvironment,
  prepareRunDirectory,
} from './support/environment';
import { TIME_ZONE } from './support/test-data';

// npm run test:e2e
//
// Starts the real .NET API on a new SQLite database and a static export of
// the web app, runs the tests in one Chrome window, and stops both servers
// again. See the "End-to-end tests" section in README.md.

if (!existsSync(BACKEND_PROJECT)) {
  throw new Error(
    `The meeting-room-booking API was not found at ${BACKEND_DIR}. Clone ` +
      'https://github.com/kris7011/meeting-room-booking next to this repository, ' +
      'or set E2E_BACKEND_DIR to its folder.',
  );
}

// The config is loaded again in each worker; only the first load (in the
// runner, before any server starts) sets up the run directory.
if (!process.env.E2E_RUN_PREPARED) {
  prepareRunDirectory();
  process.env.E2E_RUN_PREPARED = '1';
}

const isCI = !!process.env.CI;

// Locally the installed Google Chrome is reused, so nothing is downloaded.
// E2E_BROWSER_CHANNEL=bundled uses Playwright's own Chromium instead
// (`npx playwright install chromium`), which is what CI does.
const channel = process.env.E2E_BROWSER_CHANNEL === 'bundled' ? undefined : (process.env.E2E_BROWSER_CHANNEL ?? 'chrome');

export default defineConfig({
  testDir: './specs',
  outputDir: join(OUTPUT_DIR, 'test-results'),
  globalSetup: './global-setup.ts',

  // One browser, one test at a time: low memory use, and the tests share
  // one database.
  workers: 1,
  fullyParallel: false,
  // A failure should be investigated, not retried until it passes.
  retries: 0,
  forbidOnly: isCI,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // In CI, 'github' also annotates failures on the pull request.
  reporter: [
    ...(isCI ? [['github'] as const] : []),
    ['list'],
    ['html', { outputFolder: join(OUTPUT_DIR, 'report'), open: 'never' }],
  ],

  use: {
    baseURL: WEB_URL,
    channel,
    timezoneId: TIME_ZONE,
    locale: 'da-DK',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chrome' }],

  // Started in this order before the first test and stopped after the last.
  // reuseExistingServer is off: if a port is taken, the run stops instead of
  // testing against a server (and database) it did not start.
  webServer: [
    {
      name: 'API',
      command: `dotnet ${backendArguments({ build: true })
        .map((argument) => (argument.includes(' ') ? `"${argument}"` : argument))
        .join(' ')}`,
      url: `${API_URL}/health`,
      env: backendEnvironment(API_PORT),
      reuseExistingServer: false,
      // Includes restoring and building the API on the first run.
      timeout: 240_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'Web',
      command: `node e2e/scripts/serve-web.mjs --port ${WEB_PORT} --api-url ${API_URL} --out-dir "${join(OUTPUT_DIR, 'web')}"`,
      cwd: join(__dirname, '..'),
      url: WEB_URL,
      reuseExistingServer: false,
      // Includes exporting the web bundle with a single Metro worker.
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
