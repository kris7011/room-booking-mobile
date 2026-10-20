import type { SaveBookingRequest } from '../../src/models/booking';
import { expectProblem } from '../support/api';
import { API_URL } from '../support/environment';
import { expect, test } from '../support/fixtures';
import type { HomePage } from '../support/home-page';
import { DEFAULT_SLOT, ROOMS, at } from '../support/test-data';

const validBooking: SaveBookingRequest = {
  roomId: ROOMS.focus.id,
  title: 'Gyldig booking',
  bookedBy: 'E2E',
  startUtc: DEFAULT_SLOT.startUtc,
  endUtc: DEFAULT_SLOT.endUtc,
};

test.describe('API error responses', () => {
  test('GET /api/rooms/available rejects an invalid period or capacity with 400', async ({ api }) => {
    const reversed = await expectProblem(
      await api.getAvailableRooms({ startUtc: at('09:00'), endUtc: at('08:00') }),
      400,
    );
    expect(Object.keys(reversed.errors ?? {})).toEqual(['timeRange']);

    const noCapacity = await expectProblem(
      await api.getAvailableRooms({ startUtc: at('08:00'), endUtc: at('09:00'), minCapacity: 0 }),
      400,
    );
    expect(noCapacity.errors?.minCapacity).toEqual(['Capacity must be a positive number.']);
  });

  test('POST /api/bookings rejects invalid input with 400 and field errors', async ({ api }) => {
    const blank = await expectProblem(await api.postBooking({ ...validBooking, title: '   ', bookedBy: '' }), 400);
    expect(blank.errors).toEqual({
      title: ['A booking title is required.'],
      bookedBy: ['The name of the person booking the room is required.'],
    });

    const reversed = await expectProblem(
      await api.postBooking({ ...validBooking, startUtc: at('09:00'), endUtc: at('08:00') }),
      400,
    );
    expect(reversed.errors).toEqual({ endUtc: ['The end time must be later than the start time.'] });

    const tooLong = await expectProblem(await api.postBooking({ ...validBooking, title: 'x'.repeat(201) }), 400);
    expect(tooLong.errors).toEqual({ title: ['The booking title cannot exceed 200 characters.'] });

    expect(await api.listBookings()).toEqual([]);
  });

  test('POST and PUT /api/bookings reject a start that is not after the server time with 400 on startUtc', async ({ api }) => {
    // The API runs on this machine's real clock (the browser clock is not involved).
    const startNotInFuture = { startUtc: ['The start time must be later than the current time.'] };
    const hour = 60 * 60 * 1000;
    const inThePast = { startUtc: '2020-01-06T08:00:00.000Z', endUtc: '2020-01-06T09:00:00.000Z' };
    const justStarted = new Date(Date.now() - 1000);

    const past = await expectProblem(await api.postBooking({ ...validBooking, ...inThePast }), 400);
    expect(past.errors).toEqual(startNotInFuture);

    const started = await expectProblem(
      await api.postBooking({
        ...validBooking,
        startUtc: justStarted.toISOString(),
        endUtc: new Date(justStarted.getTime() + hour).toISOString(),
      }),
      400,
    );
    expect(started.errors).toEqual(startNotInFuture);
    expect(await api.listBookings()).toEqual([]);

    // An existing booking cannot be moved into the past, and stays as it was.
    const booking = await api.createBooking(validBooking);
    const moved = await expectProblem(await api.putBooking(booking.id, { ...validBooking, ...inThePast }), 400);
    expect(moved.errors).toEqual(startNotInFuture);
    expect(await (await api.getBooking(booking.id)).json()).toEqual(booking);
  });

  test('POST /api/bookings rejects overlaps with 409 and allows back-to-back bookings', async ({ api }) => {
    await api.createBooking(validBooking);

    const overlapping = await expectProblem(
      await api.postBooking({ ...validBooking, startUtc: at('08:30'), endUtc: at('09:30') }),
      409,
    );
    expect(overlapping.code).toBe('booking_overlap');

    const surrounding = await api.postBooking({ ...validBooking, startUtc: at('07:00'), endUtc: at('10:00') });
    expect(surrounding.status()).toBe(409);

    const backToBack = await api.postBooking({ ...validBooking, startUtc: at('09:00'), endUtc: at('10:00') });
    expect(backToBack.status()).toBe(201);
  });

  test('answers 404 for an unknown room or booking', async ({ api }) => {
    const unknownRoom = await expectProblem(await api.postBooking({ ...validBooking, roomId: 999 }), 404);
    expect(unknownRoom).toMatchObject({ code: 'meeting_room_not_found', detail: 'Meeting room 999 does not exist.' });

    const unknownBooking = await expectProblem(await api.getBooking(999_999), 404);
    expect(unknownBooking.code).toBe('booking_not_found');
  });
});

test.describe('API error messages in the app', () => {
  // The form never sends invalid data and only offers rooms that exist, so a
  // user cannot cause a 400 or 404 directly. These tests change the outgoing
  // POST on its way to the API, like an outdated app version or a room that
  // was removed after the search would. The API and its answer are real.

  async function submitBookingChangedTo(app: HomePage, change: Partial<SaveBookingRequest>) {
    await app.page.route(`${API_URL}/api/bookings`, async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      await route.continue({ postData: JSON.stringify({ ...request.postDataJSON(), ...change }) });
    });
    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.fillBookingForm('Planlægning', 'Kris');
    return app.confirmBooking();
  }

  test('shows the field errors from a 400 response', async ({ app, api }) => {
    const response = await submitBookingChangedTo(app, { endUtc: DEFAULT_SLOT.startUtc });

    expect(response.status()).toBe(400);
    await expect(app.alert).toContainText('Bookingen blev ikke oprettet');
    await expect(app.alert).toContainText('Ugyldige oplysninger: The end time must be later than the start time.');
    expect(await api.listBookings()).toEqual([]);
  });

  test('says the room no longer exists on a 404 response', async ({ app, api }) => {
    const response = await submitBookingChangedTo(app, { roomId: 999 });

    expect(response.status()).toBe(404);
    await expect(app.alert).toContainText('Mødelokalet findes ikke længere.');
    expect(await api.listBookings()).toEqual([]);
  });
});
