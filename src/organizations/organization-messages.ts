// Danish texts for the organisation features: role names and what the
// API's problem codes mean for the user. Codes that searching and booking
// can meet too (lost access, bookings) are described by describeError.
import { describeError } from '../api/error-messages';
import { ApiError } from '../api/http-client';

const MESSAGES: Readonly<Record<string, string>> = {
  idempotency_key_reused: 'Oprettelsen kunne ikke gentages sikkert. Prøv igen.',
  organization_creation_limit: 'Du har oprettet mange organisationer på kort tid. Prøv igen i morgen.',
  legacy_organization_read_only: 'Standardorganisationens navn kan ikke ændres.',
  room_name_taken: 'Der findes allerede et aktivt lokale med det navn.',
  room_archived: 'Lokalet er arkiveret. Gendan det, før du ændrer det.',
  room_has_upcoming_bookings: 'Lokalet har kommende bookinger. Flyt eller slet dem, før lokalet arkiveres.',
  meeting_room_not_found: 'Mødelokalet findes ikke i denne organisation.',
  member_not_found: 'Personen er ikke medlem af organisationen længere.',
  last_owner: 'Organisationen skal have mindst én ejer. Gør en anden til ejer først.',
  invitation_not_found: 'Invitationen findes ikke. Tjek at hele koden eller linket er kopieret.',
  invitation_expired: 'Invitationen er udløbet. Bed om en ny invitation.',
  invitation_no_longer_valid: 'Invitationen er trukket tilbage eller allerede brugt. Bed om en ny invitation.',
  invitation_email_mismatch:
    'Invitationen er sendt til en anden e-mailadresse end den, du er logget ind med. Log ind med den rigtige konto.',
  verified_email_required:
    'Din Microsoft-konto sender ikke en bekræftet e-mailadresse, så invitationen kan ikke matches med dig.',
  already_member: 'Du er allerede medlem af organisationen.',
};

/** A message for any error from the organisation endpoints. */
export function describeOrganizationError(error: unknown): string {
  const code = error instanceof ApiError ? error.problem?.code : undefined;
  if (code && MESSAGES[code]) return MESSAGES[code];
  return describeError(error);
}

/**
 * Why the only Owner is offered neither a new role nor leaving, and how to
 * hand over ownership first. `memberCount` includes the Owner.
 */
export function describeSoleOwner(memberCount: number): string {
  return memberCount > 1
    ? 'Du er den eneste ejer, så du kan ikke ændre din egen rolle eller forlade organisationen. ' +
        'Gør først et andet medlem til ejer ved at vælge »Ejer« ud for vedkommende.'
    : 'Du er den eneste ejer og det eneste medlem. Inviter en anden og gør vedkommende til ejer, ' +
        'før du kan ændre din egen rolle eller forlade organisationen.';
}

/** The API's problem code, if the error has one. */
export function problemCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.problem?.code : undefined;
}
