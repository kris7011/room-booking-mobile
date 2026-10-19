import { apiBaseUrl } from '../config/env';
import { ApiError } from './http-client';

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
