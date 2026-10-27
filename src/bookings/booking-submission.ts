// Sending a booking so that a lost answer can be retried safely.
//
// Every booking operation gets a random Idempotency-Key. If the answer is
// lost (timeout, dropped connection, server error), the server may already
// have saved the booking, so the app keeps the request and its key and offers
// to send exactly the same again: the API then answers with the booking it
// already made instead of a second one (backend ADR 0005). The key is only
// dropped once the outcome is certain, or when the user starts a different
// booking.
//
// No React and no Expo imports, so the whole flow runs in the Node tests.
import { describeError, isStartNotInFutureError } from '../api/error-messages';
import { ApiError } from '../api/http-client';
import type { RoomBookingApi } from '../api/room-booking-api';
import type { BookingResponse, SaveBookingRequest } from '../models/booking';
import { newRandomId } from '../utils/random-id';

/** One booking operation: the exact request and the key every send of it carries. */
export interface BookingAttempt {
  readonly request: SaveBookingRequest;
  readonly idempotencyKey: string;
}

/**
 * What the booking form shows. `sending` and `uncertain` keep the attempt,
 * so a retry reuses its key; the other states have none.
 */
export type BookingSubmission =
  | { status: 'idle' }
  | { status: 'sending'; attempt: BookingAttempt }
  /** No answer: the booking may or may not exist. Retry sends the same attempt. */
  | { status: 'uncertain'; attempt: BookingAttempt; message: string }
  /** The API answered and nothing was booked. */
  | { status: 'failed'; roomId: number; message: string };

export const IDLE_SUBMISSION: BookingSubmission = { status: 'idle' };

export type BookingOutcome =
  | { status: 'booked'; booking: BookingResponse }
  | { status: 'uncertain'; message: string }
  /** The server says the start has passed; nothing was booked. */
  | { status: 'start-passed' }
  | { status: 'failed'; message: string };

/** The attempt whose key must be reused, if any. */
export function pendingAttempt(submission: BookingSubmission): BookingAttempt | null {
  return submission.status === 'sending' || submission.status === 'uncertain' ? submission.attempt : null;
}

export function sameBookingRequest(a: SaveBookingRequest, b: SaveBookingRequest): boolean {
  return (
    a.roomId === b.roomId &&
    a.title === b.title &&
    a.bookedBy === b.bookedBy &&
    Date.parse(a.startUtc) === Date.parse(b.startUtc) &&
    Date.parse(a.endUtc) === Date.parse(b.endUtc)
  );
}

/**
 * The attempt for confirming `request`: the pending one again when it is for
 * exactly this request (a retry, same key), otherwise a new operation with a
 * new key. Changing the room, time, title or name is a different booking.
 */
export function attemptFor(
  request: SaveBookingRequest,
  pending: BookingAttempt | null,
  newKey: () => string = newRandomId,
): BookingAttempt {
  if (pending && sameBookingRequest(pending.request, request)) return pending;
  return { request, idempotencyKey: newKey() };
}

/**
 * True when the server may have saved the booking although the app got no
 * usable answer: the request timed out or the connection failed (possibly
 * after it was sent), the server failed (5xx, possibly after its commit), or
 * a successful answer could not be read. A 4xx answer, a token that could
 * not be obtained and a missing API address are certain: nothing was saved.
 */
export function isOutcomeUncertain(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  switch (error.kind) {
    case 'timeout':
    case 'network':
    case 'invalid-response':
      return true;
    case 'http':
      return error.status === undefined || error.status >= 500;
    case 'auth':
    case 'not-configured':
      return false;
  }
}

export const UNCERTAIN_BOOKING_TITLE = 'Vi ved ikke, om bookingen blev oprettet';

/** Danish: why the outcome is unknown, and that retrying is safe. */
export function describeUncertainBooking(error: unknown): string {
  const reason =
    error instanceof ApiError && error.kind === 'timeout'
      ? 'Serveren svarede ikke i tide.'
      : error instanceof ApiError && error.kind === 'http'
        ? `Serveren svarede med en fejl (${error.status ?? 'ukendt'}).`
        : 'Forbindelsen til serveren blev afbrudt.';
  return (
    `${reason} Bookingen kan alligevel være oprettet. ` +
    'Tryk "Prøv igen": appen sender præcis den samme booking igen, så den ikke bliver oprettet to gange. ' +
    'Titel og navn er bevaret.'
  );
}

/** Sends one attempt and sorts the result into what the form must show. */
export async function sendBooking(
  api: Pick<RoomBookingApi, 'createBooking'>,
  attempt: BookingAttempt,
  describe: (error: unknown) => string = describeError,
): Promise<BookingOutcome> {
  try {
    const booking = await api.createBooking(attempt.request, { idempotencyKey: attempt.idempotencyKey });
    return { status: 'booked', booking };
  } catch (error) {
    if (isStartNotInFutureError(error)) return { status: 'start-passed' };
    if (isOutcomeUncertain(error)) return { status: 'uncertain', message: describeUncertainBooking(error) };
    return { status: 'failed', message: describe(error) };
  }
}

/**
 * The submission after `outcome` of `attempt`. A booked or refused attempt
 * ends the operation (its key is dropped); an uncertain one keeps it.
 */
export function settle(attempt: BookingAttempt, outcome: BookingOutcome): BookingSubmission {
  switch (outcome.status) {
    case 'uncertain':
      return { status: 'uncertain', attempt, message: outcome.message };
    case 'failed':
      return { status: 'failed', roomId: attempt.request.roomId, message: outcome.message };
    case 'booked':
    case 'start-passed':
      return IDLE_SUBMISSION;
  }
}
