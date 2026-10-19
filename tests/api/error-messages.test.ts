import { TEST_API_URL } from '../support/live-mode';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { describeError } from '../../src/api/error-messages';
import { ApiError } from '../../src/api/http-client';

describe('describeError', () => {
  test('anything that is not an ApiError gets a generic message', () => {
    assert.equal(describeError(new Error('boom')), 'Der opstod en uventet fejl. Prøv igen.');
    assert.equal(describeError('boom'), 'Der opstod en uventet fejl. Prøv igen.');
  });

  test('network errors name the API address and the usual causes', () => {
    const message = describeError(new ApiError('network', 'fetch failed'));
    assert.ok(message.includes(TEST_API_URL));
    assert.match(message, /backend kører/);
    assert.match(message, /CORS/);
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
});
