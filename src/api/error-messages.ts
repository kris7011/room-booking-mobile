import { describeAuthError } from '../auth/auth-errors';
import { apiBaseUrl } from '../config/env';
import { ApiError } from './http-client';

/**
 * The API's 400 for a start time that is not after the server's current time
 * (a validation problem on startUtc). The booking form handles it as "the
 * meeting has started" rather than as a generic error.
 */
export function isStartNotInFutureError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.status === 400 &&
    (error.problem?.errors?.startUtc?.length ?? 0) > 0
  );
}

// Turns any thrown value into a message a user can act on.
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Der opstod en uventet fejl. Prøv igen.';
  }

  switch (error.kind) {
    case 'network':
      // Only a browser blocks a response by CORS; Android and iOS have no
      // CORS. EXPO_OS is the platform Metro bundled for, inlined at build time
      // (https://docs.expo.dev/guides/tree-shaking/); read on every call, so
      // the Node tests can set it.
      return process.env.EXPO_OS === 'web'
        ? `Kunne ikke få forbindelse til API'et (${apiBaseUrl}). ` +
            "Tjek at backend kører, at adressen passer til din enhed, og at API'et tillader CORS fra denne side."
        : `Kunne ikke få forbindelse til API'et (${apiBaseUrl}). Tjek at backend kører, og at adressen passer til din enhed.`;
    case 'timeout':
      return `API'et (${apiBaseUrl}) svarede ikke inden for 10 sekunder.`;
    case 'invalid-response':
      return "API'et returnerede et svar, appen ikke kunne læse.";
    case 'not-configured':
      return 'EXPO_PUBLIC_API_URL er ikke sat.';
    case 'auth':
      // The access token could not be renewed: offline, or the session expired.
      return describeAuthError(error.cause);
    case 'http':
      return describeHttpError(error);
  }
}

/**
 * The API's problem codes that any organisation request can return, in
 * Danish. The API's own title and detail are English and meant for
 * developers. Access can be lost while the app is open (removed, demoted or
 * disabled on another device), so searching and booking get these too.
 * Codes only the administration screens meet are in organization-messages.ts.
 */
const PROBLEM_MESSAGES: Readonly<Record<string, string>> = {
  booking_overlap: 'Lokalet er allerede booket i det valgte tidsrum. Søg igen for at se ledige lokaler.',
  meeting_room_not_found: 'Mødelokalet findes ikke længere.',
  booking_not_found: 'Bookingen findes ikke længere.',
  booking_permission_denied: 'Du kan kun ændre og slette dine egne bookinger.',
  organization_not_found: 'Organisationen findes ikke, eller du er ikke medlem af den længere.',
  organization_permission_denied: 'Din rolle i organisationen giver ikke adgang til dette.',
  user_not_registered: 'Du er ikke registreret i Room Booking endnu. Log ud og ind igen.',
  user_disabled: 'Din Room Booking-konto er deaktiveret.',
  // A repeated booking whose Idempotency-Key the API already knows (backend ADR 0005).
  created_booking_deleted: 'Bookingen blev oprettet, men er siden blevet slettet. Book igen, hvis du stadig har brug for lokalet.',
  idempotency_key_reused: 'Bookingen er allerede sendt med andre oplysninger. Start en ny booking.',
};

function describeHttpError(error: ApiError): string {
  const code = error.problem?.code;

  if (code && PROBLEM_MESSAGES[code]) {
    return PROBLEM_MESSAGES[code];
  }

  if (isStartNotInFutureError(error)) {
    return 'Mødets starttidspunkt er passeret ifølge serveren. Vælg et senere tidspunkt.';
  }

  // Validation problems carry per-field messages from the server.
  const fieldErrors = Object.values(error.problem?.errors ?? {}).flat();
  if (error.status === 400 && fieldErrors.length > 0) {
    return `Ugyldige oplysninger: ${fieldErrors.join(' ')}`;
  }

  if (error.status === 401) {
    return "API'et kræver login, eller din session er udløbet. Log ind med Microsoft og prøv igen.";
  }
  if (error.status === 403) {
    return error.problem?.detail ?? 'Din konto har ikke adgang til denne handling.';
  }

  if (error.status !== undefined && error.status >= 500) {
    return `Serverfejl (${error.status}). Prøv igen om lidt.`;
  }

  return error.problem?.detail ?? error.problem?.title ?? `Forespørgslen fejlede (HTTP ${error.status}).`;
}
