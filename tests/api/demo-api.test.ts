import '../support/demo-mode';
import '../support/time-zone';

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import { demoApi } from '../../src/api/demo-api';
import { describeError } from '../../src/api/error-messages';
import { ApiError } from '../../src/api/http-client';
import { roomBookingApi } from '../../src/api/room-booking-api';
import { isDemoMode } from '../../src/config/env';
import type { SaveBookingRequest } from '../../src/models/booking';
import { atMinutes } from '../../src/utils/date-time';

// The demo API waits ~500 ms per call to make loading states visible. Fake
// timers let the tests skip that wait instead of sleeping for real.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

function settle<T>(promise: Promise<T>): Promise<T> {
  mock.timers.runAll();
  return promise;
}

// Demo bookings live in module memory for the whole file, so every test that
// books uses its own day to stay independent.
let nextFreeDay = new Date(2031, 0, 6);
function uniqueDay(): Date {
  const day = nextFreeDay;
  nextFreeDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return day;
}

/** Local "HH:MM" on `day` → UTC ISO string, like the app sends it. */
function at(day: Date, time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return atMinutes(day, hours * 60 + minutes).toISOString();
}

function searchFree(day: Date, from: string, to: string, minCapacity?: number) {
  return settle(roomBookingApi.getAvailableRooms({ startUtc: at(day, from), endUtc: at(day, to), minCapacity }));
}

function book(day: Date, roomId: number, from: string, to: string, overrides: Partial<SaveBookingRequest> = {}) {
  return settle(
    roomBookingApi.createBooking({
      roomId,
      title: 'Planning',
      bookedBy: 'Test',
      startUtc: at(day, from),
      endUtc: at(day, to),
      ...overrides,
    }),
  );
}

function names(rooms: { name: string }[]): string[] {
  return rooms.map((room) => room.name);
}

async function assertApiError(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.kind, 'http');
    assert.equal(error.status, status);
    assert.equal(error.problem?.code, code);
    return true;
  });
}

test('without EXPO_PUBLIC_API_URL the app uses the demo API', () => {
  assert.equal(isDemoMode, true);
  assert.equal(roomBookingApi, demoApi);
});

describe('getRooms', () => {
  test('returns the rooms the backend seeds, ordered by name', async () => {
    assert.deepEqual(await settle(roomBookingApi.getRooms()), [
      { id: 3, name: 'Board Room', capacity: 12 },
      { id: 2, name: 'Collaboration Room', capacity: 8 },
      { id: 1, name: 'Focus Room', capacity: 4 },
    ]);
  });
});

describe('room search', () => {
  const day = new Date(2031, 0, 1);

  test('without minCapacity every free room is returned, smallest first', async () => {
    assert.deepEqual(names(await searchFree(day, '15:00', '16:00')), ['Focus Room', 'Collaboration Room', 'Board Room']);
  });

  test('filters by capacity', async () => {
    assert.deepEqual(names(await searchFree(day, '15:00', '16:00', 5)), ['Collaboration Room', 'Board Room']);
    assert.deepEqual(names(await searchFree(day, '15:00', '16:00', 12)), ['Board Room']);
  });

  test('too many participants gives an empty list', async () => {
    assert.deepEqual(await searchFree(day, '15:00', '16:00', 13), []);
  });

  test('Board Room is busy 09:00–11:00 local time', async () => {
    assert.deepEqual(await searchFree(day, '10:00', '11:00', 10), []);
  });

  test('Collaboration Room is busy 13:00–14:00 local time', async () => {
    assert.deepEqual(names(await searchFree(day, '13:00', '14:00', 5)), ['Board Room']);
  });
});

describe('overlap rules (same as the API: start < otherEnd && end > otherStart)', () => {
  const day = new Date(2031, 0, 2);
  const boardRoomFree = async (from: string, to: string) => names(await searchFree(day, from, to, 10)).includes('Board Room');

  test('partial overlap at the start is busy', async () => {
    assert.equal(await boardRoomFree('08:30', '09:30'), false);
  });

  test('partial overlap at the end is busy', async () => {
    assert.equal(await boardRoomFree('10:30', '11:30'), false);
  });

  test('a range that contains the booking is busy', async () => {
    assert.equal(await boardRoomFree('08:00', '12:00'), false);
  });

  test('a range inside the booking is busy', async () => {
    assert.equal(await boardRoomFree('09:30', '10:00'), false);
  });

  test('ending exactly when the booking starts is free', async () => {
    assert.equal(await boardRoomFree('08:00', '09:00'), true);
  });

  test('starting exactly when the booking ends is free', async () => {
    assert.equal(await boardRoomFree('11:00', '12:00'), true);
  });
});

describe('demo bookings', () => {
  test('returns a BookingResponse with trimmed text and the requested times', async () => {
    const day = uniqueDay();
    const booking = await book(day, 1, '15:00', '16:00', { title: '  Sprint review ', bookedBy: ' Kris  ' });

    assert.equal(booking.roomId, 1);
    assert.equal(booking.roomName, 'Focus Room');
    assert.equal(booking.title, 'Sprint review');
    assert.equal(booking.bookedBy, 'Kris');
    assert.equal(booking.startUtc, at(day, '15:00'));
    assert.equal(booking.endUtc, at(day, '16:00'));
    assert.ok(Number.isInteger(booking.id) && booking.id > 0);
    assert.ok(!Number.isNaN(Date.parse(booking.createdUtc)));
  });

  test('every booking gets a new id', async () => {
    const day = uniqueDay();
    const first = await book(day, 1, '08:00', '09:00');
    const second = await book(day, 1, '09:00', '10:00');
    assert.notEqual(first.id, second.id);
  });

  test('a booked room disappears from the search, other rooms stay free', async () => {
    const day = uniqueDay();
    await book(day, 2, '15:00', '16:00');
    assert.deepEqual(names(await searchFree(day, '15:00', '16:00')), ['Focus Room', 'Board Room']);
    assert.deepEqual(names(await searchFree(day, '16:00', '17:00')), ['Focus Room', 'Collaboration Room', 'Board Room']);
  });

  test('a booking only blocks its own day', async () => {
    const day = uniqueDay();
    await book(day, 1, '15:00', '16:00');
    const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    assert.ok(names(await searchFree(nextDay, '15:00', '16:00')).includes('Focus Room'));
  });
});

describe('overlapping bookings are rejected with 409', () => {
  test('the exact same slot', async () => {
    const day = uniqueDay();
    await book(day, 1, '15:00', '16:00');
    await assertApiError(book(day, 1, '15:00', '16:00'), 409, 'booking_overlap');
  });

  test('a partially overlapping slot', async () => {
    const day = uniqueDay();
    await book(day, 1, '15:00', '16:00');
    await assertApiError(book(day, 1, '15:30', '16:30'), 409, 'booking_overlap');
    await assertApiError(book(day, 1, '14:30', '15:01'), 409, 'booking_overlap');
  });

  test('a slot that overlaps a recurring busy block', async () => {
    await assertApiError(book(uniqueDay(), 3, '10:30', '11:30'), 409, 'booking_overlap');
  });

  test('back-to-back bookings are allowed', async () => {
    const day = uniqueDay();
    await book(day, 1, '15:00', '16:00');
    await book(day, 1, '16:00', '17:00');
    await book(day, 1, '14:00', '15:00');
  });

  test('the same slot in another room is allowed', async () => {
    const day = uniqueDay();
    await book(day, 1, '15:00', '16:00');
    const other = await book(day, 2, '15:00', '16:00');
    assert.equal(other.roomName, 'Collaboration Room');
  });

  test('the user sees a Danish explanation', async () => {
    const day = uniqueDay();
    await book(day, 1, '15:00', '16:00');
    await assert.rejects(book(day, 1, '15:00', '16:00'), (error: unknown) => {
      assert.match(describeError(error), /allerede booket/);
      return true;
    });
  });
});

test('booking an unknown room fails with 404 meeting_room_not_found', async () => {
  await assertApiError(book(uniqueDay(), 99, '15:00', '16:00'), 404, 'meeting_room_not_found');
});
