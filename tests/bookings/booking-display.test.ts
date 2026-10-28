import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { HIDDEN_BOOKING_HEADING, bookingListText } from '../../src/bookings/booking-display';
import type { OrganizationBooking } from '../../src/models/organization';

const BOOKING: OrganizationBooking = {
  id: 7,
  roomId: 2,
  roomName: 'Collaboration Room',
  title: 'Sprint planning',
  bookedBy: 'Mia Member',
  startUtc: '2031-01-01T09:00:00.000Z',
  endUtc: '2031-01-01T10:00:00.000Z',
  createdUtc: '2030-12-01T09:00:00.000Z',
  createdByCurrentUser: false,
  canModify: false,
  detailsHidden: false,
};

describe('bookingListText', () => {
  test('a booking the user may see shows its title and who booked it', () => {
    assert.deepEqual(bookingListText(BOOKING), { heading: 'Sprint planning', bookedBy: 'Booket af Mia Member' });
  });

  test("the user's own booking is marked", () => {
    assert.deepEqual(bookingListText({ ...BOOKING, createdByCurrentUser: true }).bookedBy, 'Booket af Mia Member (dig)');
  });

  test('a booking the API hid from a Member says only that the room is taken', () => {
    const hidden = { ...BOOKING, title: null, bookedBy: null, detailsHidden: true };
    assert.deepEqual(bookingListText(hidden), { heading: HIDDEN_BOOKING_HEADING, bookedBy: null });
  });

  test('a null title is never shown as text, even without the flag', () => {
    const { detailsHidden: _omitted, ...withoutFlag } = BOOKING;
    assert.deepEqual(bookingListText({ ...withoutFlag, title: null, bookedBy: null }), { heading: HIDDEN_BOOKING_HEADING, bookedBy: null });
  });

  test('an API older than the privacy rule (no flag) still shows the title', () => {
    const { detailsHidden: _omitted, ...withoutFlag } = BOOKING;
    assert.equal(bookingListText(withoutFlag).heading, 'Sprint planning');
  });
});
