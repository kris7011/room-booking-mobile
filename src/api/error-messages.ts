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
      return (
        `Kunne ikke få forbindelse til API'et (${apiBaseUrl}). ` +
        'Tjek at backend kører, at adressen passer til din enhed, ' +
        'og – på web – at API\'et tillader CORS fra denne side.'
      );
    case 'timeout':
      return `API'et (${apiBaseUrl}) svarede ikke inden for 10 sekunder.`;
    case 'invalid-response':
      return "API'et returnerede et svar, appen ikke kunne læse.";
    case 'not-configured':
      return 'EXPO_PUBLIC_API_URL er ikke sat.';
    case 'http':
      return describeHttpError(error);
  }
}

function describeHttpError(error: ApiError): string {
  const code = error.problem?.code;

  if (code === 'booking_overlap') {
    return 'Lokalet er allerede booket i det valgte tidsrum. Søg igen for at se ledige lokaler.';
  }
  if (code === 'meeting_room_not_found') {
    return 'Mødelokalet findes ikke længere.';
  }

  if (isStartNotInFutureError(error)) {
    return 'Mødets starttidspunkt er passeret ifølge serveren. Vælg et senere tidspunkt.';
  }

  // Validation problems carry per-field messages from the server.
  const fieldErrors = Object.values(error.problem?.errors ?? {}).flat();
  if (error.status === 400 && fieldErrors.length > 0) {
    return `Ugyldige oplysninger: ${fieldErrors.join(' ')}`;
  }

  if (error.status !== undefined && error.status >= 500) {
    return `Serverfejl (${error.status}). Prøv igen om lidt.`;
  }

  return error.problem?.detail ?? error.problem?.title ?? `Forespørgslen fejlede (HTTP ${error.status}).`;
}
