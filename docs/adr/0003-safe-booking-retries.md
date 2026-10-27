# ADR 0003: Safe booking retries with an Idempotency-Key per booking operation

- **Status:** Proposed (Phase 5D, in review; needs backend PR #18)
- **Code:** `src/bookings/booking-submission.ts`, `src/components/BookingArea.tsx`,
  `src/components/BookingForm.tsx`, `src/api/http-client.ts` (`idempotencyHeaders`),
  `src/api/live-api.ts`, `src/api/organizations-api.ts`

## Context

A booking request can time out (10 s) or lose its connection after the API
has saved the booking. The form used to show "Bookingen blev ikke oprettet"
for every failure, so the user retried and got `409 booking_overlap` for
their own booking. The API now answers a repeated `Idempotency-Key` with the
booking it already made (backend ADR 0005).

## Decision

- Each booking operation gets a random v4 UUID (`newRandomId`: `expo-crypto`
  on Android/iOS, `crypto.randomUUID` on web), sent as `Idempotency-Key`.
- `attemptFor` reuses the pending key only for **exactly the same request**
  (room, title, name, start and end instant); any change is a deliberate new
  operation with a new key.
- `isOutcomeUncertain` decides whether the server may have saved it: timeout,
  network failure, `5xx`, an unreadable success or an unexpected error are
  uncertain; any `4xx`, a missing token or a missing API address are certain.
- `BookingArea` (not the form) owns the submission, so closing the form or
  searching again keeps the key. An uncertain outcome shows a Danish warning
  ("Vi ved ikke, om bookingen blev oprettet") with **Prøv igen**, which sends
  the stored request unchanged; the draft stays; the upcoming-bookings list
  reloads. The key is dropped after a booking, a refusal, or a new operation.
- A new organisation remounts `BookingArea` and so drops the key: keys are
  scoped per organisation on the server anyway.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Retry automatically in `http-client` | Hides a slow, possibly offline phone from the user, and every POST would need to be safe to repeat. |
| Persist the pending key in SecureStore/AsyncStorage | Survives an app kill, but adds storage, migration and per-user clean-up for a rare case; the overlap rule still prevents a second booking of the same slot. |
| Keep the key in the form | Lost when the form closes or a new search starts. |
| Show "failed" and let the user check the list | Wrong when the booking exists; the requirement is not to claim failure. |

## Consequences

- Positive: a lost answer is retried safely; the user sees one booking.
- Positive: logic is framework-free and covered by Node tests; the web E2E
  drops the browser's answer after the real API committed.
- Negative: the key lives in memory only; after an app kill the retry is a
  new request (against the same slot it gets `409 booking_overlap`).
- Negative: against an API without backend PR #18, the header is ignored
  (native) or blocked by the Development CORS policy (web build).
