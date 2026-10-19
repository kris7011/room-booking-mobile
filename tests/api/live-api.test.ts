import { TEST_API_URL } from '../support/live-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import { ApiError, buildUrl, requestJson } from '../../src/api/http-client';
import { liveApi } from '../../src/api/live-api';
import { roomBookingApi } from '../../src/api/room-booking-api';
import { apiBaseUrl, isDemoMode } from '../../src/config/env';
import type { BookingResponse, SaveBookingRequest } from '../../src/models/booking';

// Responses below copy the shapes the .NET API produces (RoomEndpoints.cs,
// BookingEndpoints.cs). fetch is replaced, so no real HTTP request is made —
// these tests check the client against the contract, not a running backend.

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
});

function json(status: number, body: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

function problem(status: number, body: Record<string, unknown>): Response {
  return json(status, { status, ...body }, 'application/problem+json');
}

function stubFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return mock.method(globalThis, 'fetch', async (input: string | URL | Request, init: RequestInit = {}) =>
    respond(String(input), init),
  );
}

async function rejectsWith(promise: Promise<unknown>, check: (error: ApiError) => void) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
    check(error);
    return true;
  });
}

const rooms = [
  { id: 1, name: 'Focus Room', capacity: 4 },
  { id: 2, name: 'Collaboration Room', capacity: 8 },
];

const bookingRequest: SaveBookingRequest = {
  roomId: 1,
  title: 'Sprint planning',
  bookedBy: 'Kris',
  startUtc: '2031-03-12T08:00:00.000Z',
  endUtc: '2031-03-12T09:00:00.000Z',
};

describe('configuration', () => {
  test('EXPO_PUBLIC_API_URL selects the live API', () => {
    assert.equal(isDemoMode, false);
    assert.equal(roomBookingApi, liveApi);
  });

  test('the trailing slash is removed from the base URL', () => {
    assert.equal(apiBaseUrl, TEST_API_URL);
    assert.equal(buildUrl('/api/rooms'), `${TEST_API_URL}/api/rooms`);
  });

  test('buildUrl encodes values and skips undefined ones', () => {
    assert.equal(
      buildUrl('/x', { a: 'b c&d', skipped: undefined, n: 5 }),
      `${TEST_API_URL}/x?a=b%20c%26d&n=5`,
    );
  });
});

describe('GET /api/rooms', () => {
  test('sends a plain GET and returns the rooms', async () => {
    const fetchMock = stubFetch(() => json(200, rooms));

    assert.deepEqual(await liveApi.getRooms(), rooms);

    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, `${TEST_API_URL}/api/rooms`);
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.deepEqual(init.headers, { Accept: 'application/json' });
  });
});

describe('GET /api/rooms/available', () => {
  test('sends startUtc, endUtc and minCapacity as an encoded query', async () => {
    const fetchMock = stubFetch(() => json(200, [rooms[1]]));

    const result = await liveApi.getAvailableRooms({
      startUtc: '2031-03-12T08:00:00.000Z',
      endUtc: '2031-03-12T09:00:00.000Z',
      minCapacity: 5,
    });

    assert.deepEqual(result, [rooms[1]]);
    assert.equal(
      fetchMock.mock.calls[0].arguments[0],
      `${TEST_API_URL}/api/rooms/available?startUtc=2031-03-12T08%3A00%3A00.000Z&endUtc=2031-03-12T09%3A00%3A00.000Z&minCapacity=5`,
    );
  });

  test('leaves out minCapacity when it is not given (the API defaults to 1)', async () => {
    const fetchMock = stubFetch(() => json(200, rooms));
    await liveApi.getAvailableRooms({ startUtc: '2031-03-12T08:00:00.000Z', endUtc: '2031-03-12T09:00:00.000Z' });
    assert.doesNotMatch(String(fetchMock.mock.calls[0].arguments[0]), /minCapacity/);
  });

  test('an empty array means no free rooms, not an error', async () => {
    stubFetch(() => json(200, []));
    assert.deepEqual(
      await liveApi.getAvailableRooms({ startUtc: '2031-03-12T08:00:00.000Z', endUtc: '2031-03-12T09:00:00.000Z' }),
      [],
    );
  });

  test('a 400 validation problem keeps the per-field errors', async () => {
    stubFetch(() =>
      problem(400, {
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
        title: 'One or more validation errors occurred.',
        errors: { timeRange: ['Provide a valid startUtc and endUtc with endUtc after startUtc.'] },
      }),
    );

    await rejectsWith(
      liveApi.getAvailableRooms({ startUtc: '2031-03-12T09:00:00.000Z', endUtc: '2031-03-12T08:00:00.000Z' }),
      (error) => {
        assert.equal(error.kind, 'http');
        assert.equal(error.status, 400);
        assert.deepEqual(error.problem?.errors, {
          timeRange: ['Provide a valid startUtc and endUtc with endUtc after startUtc.'],
        });
      },
    );
  });
});

describe('POST /api/bookings', () => {
  test('sends the request as JSON and returns the created booking', async () => {
    const created: BookingResponse = {
      id: 42,
      roomId: 1,
      roomName: 'Focus Room',
      title: 'Sprint planning',
      bookedBy: 'Kris',
      startUtc: '2031-03-12T08:00:00+00:00',
      endUtc: '2031-03-12T09:00:00+00:00',
      createdUtc: '2031-03-01T10:00:00+00:00',
    };
    const fetchMock = stubFetch(() => json(201, created));

    assert.deepEqual(await liveApi.createBooking(bookingRequest), created);

    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, `${TEST_API_URL}/api/bookings`);
    assert.equal(init.method, 'POST');
    assert.deepEqual(init.headers, { Accept: 'application/json', 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(String(init.body)), bookingRequest);
  });

  test('409 booking_overlap is exposed via problem.code', async () => {
    stubFetch(() =>
      problem(409, {
        title: 'Meeting room is unavailable',
        detail: 'The meeting room is already booked during the selected period.',
        code: 'booking_overlap',
      }),
    );

    await rejectsWith(liveApi.createBooking(bookingRequest), (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.problem?.code, 'booking_overlap');
      assert.equal(error.message, 'The meeting room is already booked during the selected period.');
    });
  });

  test('404 meeting_room_not_found', async () => {
    stubFetch(() =>
      problem(404, { title: 'Meeting room not found', detail: 'Meeting room 99 does not exist.', code: 'meeting_room_not_found' }),
    );

    await rejectsWith(liveApi.createBooking({ ...bookingRequest, roomId: 99 }), (error) => {
      assert.equal(error.status, 404);
      assert.equal(error.problem?.code, 'meeting_room_not_found');
    });
  });
});

describe('transport failures', () => {
  test('a rejected fetch (server down, DNS, CORS) becomes a network error', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    await rejectsWith(liveApi.getRooms(), (error) => assert.equal(error.kind, 'network'));
  });

  test('a request that never answers is aborted after 10 seconds', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    const pending = liveApi.getRooms();
    mock.timers.tick(9_999);
    let settled = false;
    void pending.then(
      () => (settled = true),
      () => (settled = true),
    );
    await Promise.resolve();
    assert.equal(settled, false, 'must still be waiting just before the timeout');

    mock.timers.tick(1);
    await rejectsWith(pending, (error) => assert.equal(error.kind, 'timeout'));
  });

  test('a 500 with an HTML body is still an http error with the status', async () => {
    stubFetch(() => new Response('<html>Internal Server Error</html>', { status: 500 }));
    await rejectsWith(liveApi.getRooms(), (error) => {
      assert.equal(error.kind, 'http');
      assert.equal(error.status, 500);
      assert.equal(error.problem, undefined);
    });
  });

  test('a 200 that is not JSON is an invalid response', async () => {
    stubFetch(() => new Response('not json', { status: 200 }));
    await rejectsWith(liveApi.getRooms(), (error) => assert.equal(error.kind, 'invalid-response'));
  });

  test('an empty successful body resolves to undefined', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    assert.equal(await requestJson('/api/bookings/1', { method: 'DELETE' }), undefined);
  });
});
