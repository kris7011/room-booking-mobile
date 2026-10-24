import type { Request } from '@playwright/test';

import { API_URL } from '../support/environment';
import { expect, test } from '../support/fixtures';
import { ROOMS } from '../support/test-data';

// Microsoft login lives in the Android/iOS app only; it is not implemented in
// the browser. On web the account panel says so, no login is offered,
// and searching and booking work exactly as before, without any token.
// The login flow itself needs a real phone: see docs/entra-login.md and
// docs/device-testing.md.
test.describe('Account panel on web', () => {
  test('explains that login is only in the mobile app and offers no login button', async ({ app, page }) => {
    await app.open();

    await expect(page.getByTestId('account-panel')).toHaveText(
      'Microsoft-login findes kun i Android- og iOS-appen. Web-udgaven kører uden login.',
    );
    await expect(page.getByRole('button', { name: 'Log ind med Microsoft' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Log ud' })).toHaveCount(0);
  });

  test('search and booking work without login and send no Authorization header', async ({ app, page }) => {
    const apiRequests: Request[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith(`${API_URL}/api/`)) apiRequests.push(request);
    });

    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.fillBookingForm('Uden login', 'Kris');
    expect((await app.confirmBooking()).status()).toBe(201);

    // GET /api/rooms, GET /api/rooms/available, POST /api/bookings at least.
    expect(apiRequests.length).toBeGreaterThanOrEqual(3);
    for (const request of apiRequests) {
      expect(await request.headerValue('authorization'), request.url()).toBeNull();
    }
    // The app never asks the API who the user is when nobody can sign in.
    expect(apiRequests.map((request) => new URL(request.url()).pathname)).not.toContain('/api/me');
  });
});
