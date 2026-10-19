import { test as base } from '@playwright/test';

import { BookingApi } from './api';
import { API_URL } from './environment';
import { HomePage } from './home-page';
import { FIXED_NOW } from './test-data';

interface Fixtures {
  /** Direct access to the E2E API, outside the browser. */
  api: BookingApi;
  /** The app, opened in a browser whose clock is frozen at FIXED_NOW. */
  app: HomePage;
  /** Runs for every test: starts it with no bookings in the run's database. */
  emptyDatabase: void;
}

export const test = base.extend<Fixtures>({
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

  app: async ({ page }, use) => {
    // Date.now() and new Date() return FIXED_NOW; timers keep running normally.
    await page.clock.setFixedTime(FIXED_NOW);
    await use(new HomePage(page));
  },
});

export { expect } from '@playwright/test';
