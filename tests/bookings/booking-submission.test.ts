import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { describeError } from '../../src/api/error-messages';
import { ApiError } from '../../src/api/http-client';
import type { CreateBookingOptions } from '../../src/api/room-booking-api';
import {
  IDLE_SUBMISSION,
  attemptFor,
  isOutcomeUncertain,
  pendingAttempt,
  sameBookingRequest,
  sendBooking,
  settle,
  type BookingAttempt,
  type BookingSubmission,
} from '../../src/bookings/booking-submission';
import type { BookingResponse, SaveBookingRequest } from '../../src/models/booking';

// The retry rules of the booking form, without React: which key a send
// carries, which failures leave the outcome open, and what the form shows.

const REQUEST: SaveBookingRequest = {
  roomId: 2,
  title: 'Sprint planning',
  bookedBy: 'Kris',
  startUtc: '2031-03-12T08:00:00.000Z',
  endUtc: '2031-03-12T09:00:00.000Z',
};

const BOOKING: BookingResponse = {
  id: 42,
  roomId: 2,
  roomName: 'Collaboration Room',
  title: 'Sprint planning',
  bookedBy: 'Kris',
  startUtc: REQUEST.startUtc,
  endUtc: REQUEST.endUtc,
  createdUtc: '2031-03-01T10:00:00.000Z',
};

function keys(...values: string[]) {
  const queue = [...values];
  return () => queue.shift() ?? assert.fail('no more keys');
}

function problem(status: number, code?: string, errors?: Record<string, string[]>): ApiError {
  return new ApiError('http', `HTTP ${status}`, status, { status, code, errors });
}

/**
 * A server that saves a booking the first time it sees a key and answers
 * repeats with it, like the API. `lose` drops the answer to that call
 * (counted from 1) after the booking was saved.
 */
function idempotentServer(options: { lose?: number[]; failBeforeSaving?: number[] } = {}) {
  const saved = new Map<string, BookingResponse>();
  const sent: { request: SaveBookingRequest; key: string | undefined }[] = [];
  let nextId = 100;
  return {
    sent,
    saved,
    api: {
      async createBooking(request: SaveBookingRequest, createOptions?: CreateBookingOptions) {
        sent.push({ request, key: createOptions?.idempotencyKey });
        const call = sent.length;
        if (options.failBeforeSaving?.includes(call)) throw new ApiError('network', 'offline');
        const key = createOptions?.idempotencyKey ?? `no-key-${call}`;
        const booking = saved.get(key) ?? { ...BOOKING, id: nextId++ };
        saved.set(key, booking);
        if (options.lose?.includes(call)) throw new ApiError('timeout', 'timed out');
        return booking;
      },
    },
  };
}

describe('attemptFor: which key a booking is sent with', () => {
  test('a first booking gets a new key', () => {
    assert.deepEqual(attemptFor(REQUEST, null, keys('k1')), { request: REQUEST, idempotencyKey: 'k1' });
  });

  test('exactly the same booking again keeps the pending key', () => {
    const pending: BookingAttempt = { request: REQUEST, idempotencyKey: 'k1' };
    assert.equal(attemptFor({ ...REQUEST }, pending, keys()), pending);
  });

  test('the same instant written differently is the same booking', () => {
    const pending: BookingAttempt = { request: REQUEST, idempotencyKey: 'k1' };
    const sameInstant = { ...REQUEST, startUtc: '2031-03-12T10:00:00+02:00', endUtc: '2031-03-12T09:00:00Z' };
    assert.equal(attemptFor(sameInstant, pending, keys()).idempotencyKey, 'k1');
  });

  for (const [what, change] of [
    ['room', { roomId: 3 }],
    ['title', { title: 'Retro' }],
    ['name', { bookedBy: 'Mia' }],
    ['start', { startUtc: '2031-03-12T08:30:00.000Z' }],
    ['end', { endUtc: '2031-03-12T09:30:00.000Z' }],
  ] as const) {
    test(`another ${what} is a deliberate new booking with a new key`, () => {
      const pending: BookingAttempt = { request: REQUEST, idempotencyKey: 'k1' };
      const next = attemptFor({ ...REQUEST, ...change }, pending, keys('k2'));
      assert.equal(next.idempotencyKey, 'k2');
      assert.equal(sameBookingRequest(REQUEST, next.request), false);
    });
  }

  test('the default key is a random v4 UUID, new every time', () => {
    const first = attemptFor(REQUEST, null).idempotencyKey;
    const second = attemptFor({ ...REQUEST, title: 'Other' }, null).idempotencyKey;
    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(first, second);
  });
});

describe('isOutcomeUncertain: may the server have saved it?', () => {
  const uncertain: [string, unknown][] = [
    ['a timeout', new ApiError('timeout', 'timed out')],
    ['a dropped connection', new ApiError('network', 'fetch failed')],
    ['an unreadable success', new ApiError('invalid-response', 'not JSON', 201)],
    ['500', problem(500)],
    ['502 from a proxy', problem(502)],
    ['503', problem(503)],
    ['an unexpected error', new Error('boom')],
  ];
  for (const [what, error] of uncertain) {
    test(`yes after ${what}`, () => assert.equal(isOutcomeUncertain(error), true));
  }

  const certain: [string, unknown][] = [
    ['400 validation', problem(400, undefined, { title: ['required'] })],
    ['403 user_disabled', problem(403, 'user_disabled')],
    ['404 organization_not_found', problem(404, 'organization_not_found')],
    ['409 booking_overlap', problem(409, 'booking_overlap')],
    ['410 created_booking_deleted', problem(410, 'created_booking_deleted')],
    ['422 idempotency_key_reused', problem(422, 'idempotency_key_reused')],
    ['no access token', new ApiError('auth', 'no token')],
    ['no API address', new ApiError('not-configured', 'not set')],
  ];
  for (const [what, error] of certain) {
    test(`no after ${what}`, () => assert.equal(isOutcomeUncertain(error), false));
  }
});

describe('sendBooking', () => {
  const attempt: BookingAttempt = { request: REQUEST, idempotencyKey: 'k1' };

  test('sends the request with its Idempotency-Key and returns the booking', async () => {
    const server = idempotentServer();
    assert.deepEqual(await sendBooking(server.api, attempt), { status: 'booked', booking: { ...BOOKING, id: 100 } });
    assert.deepEqual(server.sent, [{ request: REQUEST, key: 'k1' }]);
  });

  test('a lost answer is uncertain, explained in Danish, and never called a failure', async () => {
    const outcome = await sendBooking(idempotentServer({ lose: [1] }).api, attempt);
    assert.equal(outcome.status, 'uncertain');
    assert.ok(outcome.status === 'uncertain');
    assert.match(outcome.message, /Serveren svarede ikke i tide\./);
    assert.match(outcome.message, /kan alligevel være oprettet/);
    assert.match(outcome.message, /præcis den samme booking igen/);
    assert.doesNotMatch(outcome.message, /ikke oprettet/);
  });

  test('a dropped connection and a server error are explained too', async () => {
    const dropped = await sendBooking({ createBooking: () => Promise.reject(new ApiError('network', 'x')) }, attempt);
    const failed = await sendBooking({ createBooking: () => Promise.reject(problem(502)) }, attempt);
    assert.ok(dropped.status === 'uncertain' && dropped.message.startsWith('Forbindelsen til serveren blev afbrudt.'));
    assert.ok(failed.status === 'uncertain' && failed.message.startsWith('Serveren svarede med en fejl (502).'));
  });

  test('a refusal is a definite failure with the Danish message', async () => {
    const outcome = await sendBooking({ createBooking: () => Promise.reject(problem(409, 'booking_overlap')) }, attempt);
    assert.deepEqual(outcome, { status: 'failed', message: describeError(problem(409, 'booking_overlap')) });
    assert.match(describeError(problem(409, 'booking_overlap')), /allerede booket/);
  });

  test('the new problem codes have Danish messages', () => {
    assert.match(describeError(problem(410, 'created_booking_deleted')), /^Bookingen blev oprettet, men er siden blevet slettet\./);
    assert.match(describeError(problem(422, 'idempotency_key_reused')), /^Bookingen er allerede sendt med andre oplysninger\./);
  });

  test('a start the server says has passed is its own outcome', async () => {
    const passed = problem(400, undefined, { startUtc: ['The start time must be later than the current time.'] });
    assert.deepEqual(await sendBooking({ createBooking: () => Promise.reject(passed) }, attempt), { status: 'start-passed' });
  });
});

describe('settle: what the form shows next', () => {
  const attempt: BookingAttempt = { request: REQUEST, idempotencyKey: 'k1' };

  test('an uncertain outcome keeps the attempt and its key', () => {
    const next = settle(attempt, { status: 'uncertain', message: 'm' });
    assert.deepEqual(next, { status: 'uncertain', attempt, message: 'm' });
    assert.equal(pendingAttempt(next), attempt);
  });

  test('a booking or a refusal ends the operation and drops the key', () => {
    for (const outcome of [
      { status: 'booked', booking: BOOKING },
      { status: 'start-passed' },
      { status: 'failed', message: 'm' },
    ] as const) {
      assert.equal(pendingAttempt(settle(attempt, outcome)), null);
    }
    assert.deepEqual(settle(attempt, { status: 'failed', message: 'm' }), { status: 'failed', roomId: 2, message: 'm' });
    assert.equal(settle(attempt, { status: 'booked', booking: BOOKING }), IDLE_SUBMISSION);
  });

  test('only a sending or uncertain submission has a pending attempt', () => {
    const states: BookingSubmission[] = [
      IDLE_SUBMISSION,
      { status: 'failed', roomId: 2, message: 'm' },
    ];
    for (const state of states) assert.equal(pendingAttempt(state), null);
    assert.equal(pendingAttempt({ status: 'sending', attempt }), attempt);
  });
});

describe('the whole retry flow against an idempotent server', () => {
  /** What the form does: confirm (or retry) and settle, as BookingArea does. */
  async function confirm(
    server: ReturnType<typeof idempotentServer>,
    submission: BookingSubmission,
    request: SaveBookingRequest,
    newKey: () => string,
  ) {
    const attempt = attemptFor(request, pendingAttempt(submission), newKey);
    const outcome = await sendBooking(server.api, attempt);
    return { outcome, submission: settle(attempt, outcome) };
  }

  test('answer lost after saving, then retried: one booking, the same key, reported as booked', async () => {
    const server = idempotentServer({ lose: [1] });
    const newKey = keys('k1');

    const first = await confirm(server, IDLE_SUBMISSION, REQUEST, newKey);
    assert.equal(first.outcome.status, 'uncertain');

    const retry = await confirm(server, first.submission, { ...REQUEST }, newKey);
    assert.deepEqual(retry.outcome, { status: 'booked', booking: { ...BOOKING, id: 100 } });
    assert.equal(retry.submission, IDLE_SUBMISSION);

    assert.deepEqual(server.sent.map((call) => call.key), ['k1', 'k1']);
    assert.equal(server.saved.size, 1);
  });

  test('offline before anything was saved, then retried: the retry creates it once', async () => {
    const server = idempotentServer({ failBeforeSaving: [1] });
    const newKey = keys('k1');

    const first = await confirm(server, IDLE_SUBMISSION, REQUEST, newKey);
    assert.equal(first.outcome.status, 'uncertain');
    const retry = await confirm(server, first.submission, REQUEST, newKey);

    assert.equal(retry.outcome.status, 'booked');
    assert.deepEqual(server.sent.map((call) => call.key), ['k1', 'k1']);
    assert.equal(server.saved.size, 1);
  });

  test('several lost answers in a row still end in one booking', async () => {
    const server = idempotentServer({ lose: [1, 2, 3] });
    const newKey = keys('k1');
    let state: BookingSubmission = IDLE_SUBMISSION;

    for (let attempt = 0; attempt < 3; attempt++) {
      ({ submission: state } = await confirm(server, state, REQUEST, newKey));
      assert.equal(state.status, 'uncertain');
    }
    const last = await confirm(server, state, REQUEST, newKey);

    assert.equal(last.outcome.status, 'booked');
    assert.equal(new Set(server.sent.map((call) => call.key)).size, 1);
    assert.equal(server.saved.size, 1);
  });

  test('after an uncertain outcome, a changed booking is a new operation with a new key', async () => {
    const server = idempotentServer({ lose: [1] });
    const newKey = keys('k1', 'k2');

    const first = await confirm(server, IDLE_SUBMISSION, REQUEST, newKey);
    await confirm(server, first.submission, { ...REQUEST, roomId: 3 }, newKey);

    assert.deepEqual(server.sent.map((call) => call.key), ['k1', 'k2']);
  });

  test('after a booking, the same details again are a new booking with a new key', async () => {
    const server = idempotentServer();
    const newKey = keys('k1', 'k2');

    const first = await confirm(server, IDLE_SUBMISSION, REQUEST, newKey);
    await confirm(server, first.submission, REQUEST, newKey);

    assert.deepEqual(server.sent.map((call) => call.key), ['k1', 'k2']);
  });

  test('after a refusal the key is dropped too', async () => {
    const newKey = keys('k1', 'k2');
    const refusing = { createBooking: () => Promise.reject(problem(409, 'booking_overlap')) };

    const attempt = attemptFor(REQUEST, null, newKey);
    const failed = settle(attempt, await sendBooking(refusing, attempt));

    assert.equal(attemptFor(REQUEST, pendingAttempt(failed), newKey).idempotencyKey, 'k2');
  });
});
