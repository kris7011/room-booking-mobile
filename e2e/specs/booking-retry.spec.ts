import type { Route } from '@playwright/test';

import { API_URL } from '../support/environment';
import { expect, test } from '../support/fixtures';
import { ROOMS } from '../support/test-data';

// A booking whose answer never reaches the app. The browser's request is
// intercepted: the test either lets it reach the real API (which saves the
// booking) and then drops the answer, or drops it before it is sent. Either
// way the app cannot know the outcome and must offer a safe retry with the
// same Idempotency-Key (backend ADR 0005).

const UNCERTAIN = 'Vi ved ikke, om bookingen blev oprettet';

const isBookingPost = (url: URL) => url.href === `${API_URL}/api/bookings`;

test.describe('Retrying a booking whose answer was lost', () => {
  test('saved by the API, answer lost: the retry shows the same booking and stores no second one', async ({ app, api, page }) => {
    const keys: (string | undefined)[] = [];
    let firstStatus: number | undefined;

    await page.route(isBookingPost, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      keys.push(route.request().headers()['idempotency-key']);
      if (keys.length > 1) return route.fallback();
      // Reaches the API, which saves the booking; the app never sees the answer.
      firstStatus = (await route.fetch()).status();
      await route.abort('connectionreset');
    });

    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.fillBookingForm('Sprint planning', 'Kris');
    await app.confirmButton.click();

    await expect(page.getByText(UNCERTAIN, { exact: true })).toBeVisible();
    await expect(page.getByText(/Bookingen kan alligevel være oprettet/)).toBeVisible();
    // Not presented as failed, and nothing typed is lost.
    await expect(page.getByText('Bookingen blev ikke oprettet', { exact: true })).toHaveCount(0);
    await expect(app.titleInput).toHaveValue('Sprint planning');
    await expect(app.bookedByInput).toHaveValue('Kris');
    expect(firstStatus).toBe(201);
    expect(await api.listBookings()).toHaveLength(1);

    await page.getByRole('button', { name: 'Prøv igen', exact: true }).click();

    await expect(app.successMessage).toContainText('Sprint planning i Focus Room');
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(keys[1]).toBe(keys[0]);

    const stored = await api.listBookings();
    expect(stored).toHaveLength(1);
    await expect(app.successMessage).toContainText(`Booking nr. ${stored[0].id}.`);
  });

  test('lost before it reached the API: the retry creates the booking once', async ({ app, api, page }) => {
    const keys: (string | undefined)[] = [];

    await page.route(isBookingPost, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      keys.push(route.request().headers()['idempotency-key']);
      if (keys.length > 1) return route.fallback();
      await route.abort('internetdisconnected');
    });

    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.fillBookingForm('Retro', 'Mia');
    await app.confirmButton.click();

    await expect(page.getByText(UNCERTAIN, { exact: true })).toBeVisible();
    expect(await api.listBookings()).toEqual([]);

    await page.getByRole('button', { name: 'Prøv igen', exact: true }).click();

    await expect(app.successMessage).toContainText('Retro i Focus Room');
    expect(keys[1]).toBe(keys[0]);
    expect(await api.listBookings()).toHaveLength(1);
  });

  test('a new booking after a successful one gets a new key', async ({ app, page }) => {
    const keys: (string | undefined)[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url() === `${API_URL}/api/bookings`) {
        keys.push(request.headers()['idempotency-key']);
      }
    });

    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.fillBookingForm('First', 'Kris');
    expect((await app.confirmBooking()).status()).toBe(201);

    await app.search();
    await app.openBookingForm(ROOMS.collaboration);
    await app.fillBookingForm('Second', 'Kris');
    expect((await app.confirmBooking()).status()).toBe(201);

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).not.toBe(keys[0]);
  });
});
