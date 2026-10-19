import type { BookingResponse } from '../../src/models/booking';
import { isApiCall } from '../support/api';
import { startBackend } from '../support/backend';
import { SECOND_API_PORT, WEB_URL } from '../support/environment';
import { expect, test } from '../support/fixtures';
import type { HomePage } from '../support/home-page';
import { DEFAULT_SLOT, ROOMS } from '../support/test-data';

/** Books Focus Room for the default slot through the UI. */
async function bookFocusRoom(app: HomePage): Promise<BookingResponse> {
  await app.open();
  await app.search();
  await app.openBookingForm(ROOMS.focus);
  await app.fillBookingForm('  Sprint planning  ', 'Kris');
  const response = await app.confirmBooking();
  expect(response.status()).toBe(201);
  return (await response.json()) as BookingResponse;
}

test.describe('Booking a room', () => {
  test('checks the form in the browser before anything is sent', async ({ app, api, page }) => {
    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    const bookingRequests = app.recordBookingRequests();

    await app.confirmButton.click();
    await expect(page.getByText('Skriv en titel på mødet.', { exact: true })).toBeVisible();
    await expect(page.getByText('Skriv hvem der booker.', { exact: true })).toBeVisible();

    // Only spaces is still empty.
    await app.fillBookingForm('   ', 'Kris');
    await app.confirmButton.click();
    await expect(page.getByText('Skriv en titel på mødet.', { exact: true })).toBeVisible();
    await expect(page.getByText('Skriv hvem der booker.', { exact: true })).toHaveCount(0);

    expect(bookingRequests).toEqual([]);
    expect(await api.listBookings()).toEqual([]);
  });

  test('creates a booking, stores it in SQLite and stops offering the room', async ({ app, api, page }) => {
    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.fillBookingForm('  Sprint planning  ', 'Kris');
    // After a booking the app searches again; wait for that refresh too.
    const refreshed = page.waitForResponse(isApiCall('GET', '/api/rooms/available'));
    const response = await app.confirmBooking();

    expect(response.status()).toBe(201);
    expect(response.headers()['access-control-allow-origin']).toBe(WEB_URL);
    const booking = (await response.json()) as BookingResponse;
    expect(booking).toMatchObject({
      roomId: ROOMS.focus.id,
      roomName: ROOMS.focus.name,
      title: 'Sprint planning',
      bookedBy: 'Kris',
    });
    expect(new Date(booking.startUtc).toISOString()).toBe(DEFAULT_SLOT.startUtc);
    expect(new Date(booking.endUtc).toISOString()).toBe(DEFAULT_SLOT.endUtc);

    await expect(app.successMessage).toContainText(
      `Sprint planning i Focus Room, ${DEFAULT_SLOT.label}. Booking nr. ${booking.id}.`,
    );
    await refreshed;
    await expect(app.resultCards).toHaveText([/Collaboration Room/, /Board Room/]);

    // The API returns exactly what it sent the app.
    const stored = await api.getBooking(booking.id);
    expect(stored.status()).toBe(200);
    expect(await stored.json()).toEqual(booking);

    // A fresh page load still sees the room as taken.
    await app.open();
    await app.search();
    await expect(app.resultCards).toHaveText([/Collaboration Room/, /Board Room/]);
  });

  test('keeps the booking in the database file for a new API process', async ({ app, playwright }) => {
    test.slow(); // Starts a second API process.
    const booking = await bookFocusRoom(app);

    // A new process has nothing in memory, so it can only know the booking
    // from the SQLite file. This is what a restart of the API looks like.
    const secondApi = await startBackend(SECOND_API_PORT);
    const request = await playwright.request.newContext({ baseURL: secondApi.url });
    try {
      const stored = await request.get(`/api/bookings/${booking.id}`);
      expect(stored.status()).toBe(200);
      expect(await stored.json()).toEqual(booking);

      const overlapping = await request.post('/api/bookings', {
        data: {
          roomId: ROOMS.focus.id,
          title: 'Samme tid',
          bookedBy: 'E2E',
          startUtc: DEFAULT_SLOT.startUtc,
          endUtc: DEFAULT_SLOT.endUtc,
        },
      });
      expect(overlapping.status()).toBe(409);
    } finally {
      await request.dispose();
      await secondApi.stop();
    }
  });

  test('shows a conflict when someone else books the room first (HTTP 409)', async ({ app, api }) => {
    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.collaboration);
    await app.fillBookingForm('Kommer for sent', 'Kris');

    // While the form is open, a colleague books the same room for the same hour.
    const rival = await api.createBooking({
      roomId: ROOMS.collaboration.id,
      title: 'Kundemøde',
      bookedBy: 'En kollega',
      startUtc: DEFAULT_SLOT.startUtc,
      endUtc: DEFAULT_SLOT.endUtc,
    });

    const response = await app.confirmBooking();

    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'booking_overlap' });
    await expect(app.alert).toContainText('Bookingen blev ikke oprettet');
    await expect(app.alert).toContainText(
      'Lokalet er allerede booket i det valgte tidsrum. Søg igen for at se ledige lokaler.',
    );
    await expect(app.successMessage).toHaveCount(0);
    expect(await api.listBookings()).toEqual([rival]);

    // Searching again no longer offers the room.
    await app.search();
    await expect(app.resultCards).toHaveText([/Focus Room/, /Board Room/]);
  });
});
