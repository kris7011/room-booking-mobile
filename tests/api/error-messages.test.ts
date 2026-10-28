import { TEST_API_URL } from '../support/live-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { describeError, isStartNotInFutureError } from '../../src/api/error-messages';
import { ApiError } from '../../src/api/http-client';

describe('describeError', () => {
  test('anything that is not an ApiError gets a generic message', () => {
    assert.equal(describeError(new Error('boom')), 'Der opstod en uventet fejl. Prøv igen.');
    assert.equal(describeError('boom'), 'Der opstod en uventet fejl. Prøv igen.');
  });

  describe('network errors', () => {
    // Metro inlines process.env.EXPO_OS with the platform it bundles for.
    const bundledFor = process.env.EXPO_OS;
    afterEach(() => {
      if (bundledFor === undefined) delete process.env.EXPO_OS;
      else process.env.EXPO_OS = bundledFor;
    });

    test('in the web build: the API address, the usual causes and CORS', () => {
      process.env.EXPO_OS = 'web';
      assert.equal(
        describeError(new ApiError('network', 'fetch failed')),
        `Kunne ikke få forbindelse til API'et (${TEST_API_URL}). ` +
          "Tjek at backend kører, at adressen passer til din enhed, og at API'et tillader CORS fra denne side.",
      );
    });

    for (const platform of ['android', 'ios']) {
      test(`on ${platform}: no CORS hint, which only applies to a browser`, () => {
        // Phase 5E: the Samsung showed "og – på web – at API'et tillader CORS".
        process.env.EXPO_OS = platform;
        assert.equal(
          describeError(new ApiError('network', 'fetch failed')),
          `Kunne ikke få forbindelse til API'et (${TEST_API_URL}). Tjek at backend kører, og at adressen passer til din enhed.`,
        );
      });
    }
  });

  test('timeout', () => {
    assert.match(describeError(new ApiError('timeout', 'x')), /svarede ikke inden for 10 sekunder/);
  });

  test('invalid response', () => {
    assert.match(describeError(new ApiError('invalid-response', 'x')), /ikke kunne læse/);
  });

  test('not configured', () => {
    assert.equal(describeError(new ApiError('not-configured', 'x')), 'EXPO_PUBLIC_API_URL er ikke sat.');
  });

  test('409 booking_overlap', () => {
    const error = new ApiError('http', 'x', 409, { status: 409, code: 'booking_overlap' });
    assert.match(describeError(error), /allerede booket i det valgte tidsrum/);
  });

  test('404 meeting_room_not_found', () => {
    const error = new ApiError('http', 'x', 404, { status: 404, code: 'meeting_room_not_found' });
    assert.equal(describeError(error), 'Mødelokalet findes ikke længere.');
  });

  test('400 lists every field message from the server', () => {
    const error = new ApiError('http', 'x', 400, {
      status: 400,
      title: 'One or more validation errors occurred.',
      errors: { title: ['A booking title is required.'], bookedBy: ['Booked by cannot exceed 120 characters.'] },
    });
    assert.equal(
      describeError(error),
      'Ugyldige oplysninger: A booking title is required. Booked by cannot exceed 120 characters.',
    );
  });

  test('400 on startUtc (start not after the server time) is explained in Danish', () => {
    const error = new ApiError('http', 'x', 400, {
      status: 400,
      title: 'One or more validation errors occurred.',
      errors: { startUtc: ['The start time must be later than the current time.'] },
    });
    assert.ok(isStartNotInFutureError(error));
    assert.equal(
      describeError(error),
      'Mødets starttidspunkt er passeret ifølge serveren. Vælg et senere tidspunkt.',
    );
  });

  test('only a 400 with a startUtc field error counts as "start has passed"', () => {
    const titleOnly = new ApiError('http', 'x', 400, { errors: { title: ['A booking title is required.'] } });
    const conflict = new ApiError('http', 'x', 409, { code: 'booking_overlap', errors: { startUtc: ['x'] } });
    assert.equal(isStartNotInFutureError(titleOnly), false);
    assert.equal(isStartNotInFutureError(conflict), false);
    assert.equal(isStartNotInFutureError(new ApiError('network', 'x')), false);
    assert.equal(isStartNotInFutureError(new Error('x')), false);
  });

  test('400 without field errors falls back to detail, then title', () => {
    assert.equal(describeError(new ApiError('http', 'x', 400, { detail: 'Bad dates.', title: 'Bad' })), 'Bad dates.');
    assert.equal(describeError(new ApiError('http', 'x', 400, { title: 'Bad' })), 'Bad');
  });

  test('5xx is reported as a server error', () => {
    assert.equal(describeError(new ApiError('http', 'x', 500)), 'Serverfejl (500). Prøv igen om lidt.');
    assert.equal(describeError(new ApiError('http', 'x', 503, { title: 'Down' })), 'Serverfejl (503). Prøv igen om lidt.');
  });

  test('other statuses without a problem body show the status code', () => {
    assert.equal(describeError(new ApiError('http', 'x', 418)), 'Forespørgslen fejlede (HTTP 418).');
  });

  // Searching and booking use describeError. When access is lost while the
  // app is open (removed, demoted or disabled on another device), the API's
  // answer is one of these problems, which carry an English detail for
  // developers (ApiProblems.cs and BookingEndpoints.cs in the API).
  describe('lost access while searching or booking is explained in Danish, not with the API\'s English detail', () => {
    const cases = [
      { status: 404, code: 'organization_not_found', detail: 'The organisation does not exist, or you are not a member of it.', danish: /ikke medlem af den længere/ },
      { status: 403, code: 'organization_permission_denied', detail: 'Your role in this organisation does not allow this.', danish: /Din rolle/ },
      { status: 403, code: 'user_disabled', detail: 'This user account has been disabled.', danish: /deaktiveret/ },
      { status: 403, code: 'user_not_registered', detail: 'Register with POST /api/me/registration before using this endpoint.', danish: /ikke registreret/ },
      { status: 404, code: 'booking_not_found', detail: 'Booking 7 does not exist.', danish: /Bookingen findes ikke længere/ },
      {
        status: 403,
        code: 'booking_permission_denied',
        detail: 'Members can only change and delete bookings they made themselves. Ask an Owner or Admin.',
        danish: /egne bookinger/,
      },
    ];

    for (const { status, code, detail, danish } of cases) {
      test(`${status} ${code}`, () => {
        const message = describeError(new ApiError('http', detail, status, { status, title: 'x', detail, code }));
        assert.match(message, danish);
        assert.ok(!message.includes(detail), `the API's English detail was shown: ${message}`);
      });
    }
  });
});
