import { test as base } from '@playwright/test';

import { BookingApi } from './api';
import { API_URL } from './environment';
import { HomePage } from './home-page';
import { FIXED_NOW } from './test-data';

interface Options {
  /**
   * 'frozen' (default): Date.now() always returns `startTime`.
   * 'running': the clock starts at `startTime` and runs; the test can move it
   * on with page.clock.fastForward() and friends, which also fires timers.
   */
  clockMode: 'frozen' | 'running';
  startTime: Date;
}

interface Fixtures {
  /** Direct access to the E2E API, outside the browser. */
  api: BookingApi;
  /** The app, opened in a browser whose clock starts at `startTime`. */
  app: HomePage;
  /** Runs for every test: starts it with no bookings in the run's database. */
  emptyDatabase: void;
}

export const test = base.extend<Fixtures & Options>({
  clockMode: ['frozen', { option: true }],
  startTime: [FIXED_NOW, { option: true }],

  api: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: API_URL });
    await use(new BookingApi(request));
    await request.dispose();
  },

  emptyDatabase: [
    async ({ api }, use) => {
      // The seeded rooms stay; only bookings from earlier tests go. Tests can
      // therefore reuse the same fixed time slots and run in any order.
      await api.deleteAllBookings();
      await use();
    },
    { auto: true },
  ],

  app: async ({ page, clockMode, startTime }, use) => {
    if (clockMode === 'frozen') {
      // Date.now() and new Date() return startTime; timers keep running normally.
      await page.clock.setFixedTime(startTime);
    } else {
      await page.clock.install({ time: startTime });
    }
    await use(new HomePage(page));
  },
});

export { expect } from '@playwright/test';
